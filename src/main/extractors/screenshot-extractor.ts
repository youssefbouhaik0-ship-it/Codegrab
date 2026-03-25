import { desktopCapturer, nativeImage } from 'electron';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TesseractWorker = any;
let ocrWorker: TesseractWorker | null = null;

// Code-relevant characters — tells Tesseract to prefer these over random Unicode
const CODE_WHITELIST =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' +
  ' .,;:!?\'\"()-_=+*/<>[]{}@#$%^&|\\~`\n\t';

async function getWorker(): Promise<TesseractWorker> {
  if (!ocrWorker) {
    const tesseract = await import('tesseract.js');
    const createWorker = tesseract.createWorker ?? tesseract.default?.createWorker;
    if (!createWorker) throw new Error('tesseract.js createWorker not found');
    ocrWorker = await createWorker('eng');

    // Tune for code text (monospace, single block, structured)
    await ocrWorker.setParameters({
      tessedit_pageseg_mode: '6',       // PSM.SINGLE_BLOCK — treat as one block of text
      preserve_interword_spaces: '1',   // Keep spacing (important for indentation)
      tessedit_char_whitelist: CODE_WHITELIST, // Prefer code characters
    });
  }
  return ocrWorker;
}

/** Pre-warm the OCR worker. Retries once on failure. */
export async function initOCR(): Promise<void> {
  try {
    await getWorker();
    console.log('[CodeGrab] OCR worker ready');
  } catch (err) {
    console.warn('[CodeGrab] OCR init failed, retrying once…', err);
    ocrWorker = null;
    try {
      await getWorker();
      console.log('[CodeGrab] OCR worker ready (retry succeeded)');
    } catch (retryErr) {
      console.error('[CodeGrab] OCR init failed on retry:', retryErr);
    }
  }
}

/**
 * One-shot OCR: capture the frontmost window or primary screen.
 * Always captures both 'window' and 'screen' sources so fullscreen apps work.
 */
export async function extractFromScreenshot(targetWindowName?: string): Promise<string | null> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 3840, height: 2160 }, // 4K for maximum OCR accuracy
      fetchWindowIcons: false,
    });

    let source: Electron.DesktopCapturerSource | undefined;

    if (targetWindowName) {
      const target = targetWindowName.toLowerCase();
      source = sources.find(
        (s) => s.id.startsWith('window:') && s.name.toLowerCase().includes(target),
      );
    }

    // Fullscreen fallback → primary screen
    if (!source) {
      source = sources.find((s) => s.id.startsWith('screen:'));
    }
    if (!source) {
      source = sources[0];
    }
    if (!source) return null;

    const thumbnail = source.thumbnail;
    if (thumbnail.isEmpty()) return null;

    const enhanced = enhanceForOcr(thumbnail);

    const worker = await getWorker();
    const { data } = await worker.recognize(enhanced);
    const rawText = data.text as string;

    if (!rawText.trim()) return null;
    return rawText;
  } catch (err) {
    console.warn('[CodeGrab] Screenshot extraction failed:', err);
    ocrWorker = null;
    return null;
  }
}

// ── Image preprocessing pipeline ────────────────────────────────────────────

/**
 * Enhance a screenshot for OCR accuracy.
 *
 * Tesseract works best on high-contrast black-on-white text at ~300 DPI.
 * This pipeline:
 *   1. Upscales small images (2x, capped at 4K width)
 *   2. Converts to grayscale
 *   3. Detects dark backgrounds and inverts to black-on-white
 *   4. Applies contrast stretch (histogram normalization)
 *   5. Applies a simple unsharp-mask sharpening pass
 *
 * Returns a PNG data URL ready for Tesseract.
 */
function enhanceForOcr(img: Electron.NativeImage): string {
  // Step 1: Upscale if needed (Tesseract likes large images)
  const size = img.getSize();
  let working = img;
  if (size.width < 3840) {
    working = working.resize({
      width: Math.min(size.width * 2, 3840),
      quality: 'best',
    });
  }

  // Get raw RGBA bitmap for pixel-level processing
  const bitmap = working.toBitmap();
  const { width, height } = working.getSize();
  const pixels = Buffer.from(bitmap); // mutable copy

  // Step 2: Convert to grayscale (in-place, keep RGBA layout)
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = Math.round(
      pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114,
    );
    pixels[i] = gray;
    pixels[i + 1] = gray;
    pixels[i + 2] = gray;
    // alpha stays unchanged
  }

  // Step 3: Detect dark vs light background
  // Sample the corners and edges to determine background luminance
  const sampleLuminance = (sx: number, sy: number): number => {
    const idx = (sy * width + sx) * 4;
    return pixels[idx]; // already grayscale, R=G=B
  };

  let bgSum = 0;
  let bgCount = 0;
  // Sample top/bottom edge pixels
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 40))) {
    bgSum += sampleLuminance(x, 0);
    bgSum += sampleLuminance(x, height - 1);
    bgCount += 2;
  }
  // Sample left/right edge pixels
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 40))) {
    bgSum += sampleLuminance(0, y);
    bgSum += sampleLuminance(width - 1, y);
    bgCount += 2;
  }
  const avgBg = bgSum / bgCount;
  const isDarkBackground = avgBg < 128;

  // Invert if dark background → Tesseract prefers black text on white
  if (isDarkBackground) {
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 255 - pixels[i];
      pixels[i + 1] = 255 - pixels[i + 1];
      pixels[i + 2] = 255 - pixels[i + 2];
    }
  }

  // Step 4: Contrast stretch (histogram normalization)
  // Find the 2nd and 98th percentile luminance values to avoid outlier skew
  let minVal = 255;
  let maxVal = 0;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < pixels.length; i += 4) {
    histogram[pixels[i]]++;
  }
  const totalPixels = width * height;
  const lowThresh = totalPixels * 0.02;
  const highThresh = totalPixels * 0.98;
  let cumulative = 0;
  for (let v = 0; v < 256; v++) {
    cumulative += histogram[v];
    if (cumulative >= lowThresh && minVal === 255) minVal = v;
    if (cumulative >= highThresh) { maxVal = v; break; }
  }

  const range = maxVal - minVal || 1;
  for (let i = 0; i < pixels.length; i += 4) {
    const stretched = Math.round(((pixels[i] - minVal) / range) * 255);
    const clamped = Math.max(0, Math.min(255, stretched));
    pixels[i] = clamped;
    pixels[i + 1] = clamped;
    pixels[i + 2] = clamped;
  }

  // Step 5: Simple unsharp mask (sharpen edges for crisper character boundaries)
  // Kernel: center = 5, neighbors = -1 (approximated 3x3 Laplacian sharpen)
  // Only process interior pixels; skip edges to avoid bounds checks
  const sharpened = Buffer.from(pixels); // copy for output
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const center = pixels[idx];
      const top = pixels[((y - 1) * width + x) * 4];
      const bottom = pixels[((y + 1) * width + x) * 4];
      const left = pixels[(y * width + (x - 1)) * 4];
      const right = pixels[(y * width + (x + 1)) * 4];

      const sharp = Math.round(center * 5 - top - bottom - left - right);
      const clamped = Math.max(0, Math.min(255, sharp));
      sharpened[idx] = clamped;
      sharpened[idx + 1] = clamped;
      sharpened[idx + 2] = clamped;
    }
  }

  // Reconstruct NativeImage from processed bitmap
  const result = nativeImage.createFromBitmap(sharpened, { width, height });
  return result.toDataURL();
}

export async function terminateOCR(): Promise<void> {
  if (ocrWorker) {
    try { await ocrWorker.terminate(); } catch { /* ignore on quit */ }
    ocrWorker = null;
  }
}
