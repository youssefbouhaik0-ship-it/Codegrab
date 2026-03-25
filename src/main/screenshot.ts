import { desktopCapturer, nativeImage } from 'electron';
import { cleanCode } from '../shared/code-cleanup.js';
import type { CodeGrabResult } from '../shared/types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TesseractWorker = any;
let ocrWorker: TesseractWorker | null = null;

async function getWorker(): Promise<TesseractWorker> {
  if (!ocrWorker) {
    const tesseract = await import('tesseract.js');
    const createWorker = tesseract.createWorker ?? tesseract.default?.createWorker;
    if (!createWorker) throw new Error('tesseract.js createWorker not found');
    ocrWorker = await createWorker('eng');
  }
  return ocrWorker;
}

/** Initialise the Tesseract WASM worker. Retries once on failure. */
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
      throw retryErr;
    }
  }
}

/** Returns the desktopCapturer source ID for the primary display. */
export async function getScreenSourceId(): Promise<string | null> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 },
    });
    return sources[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Enhance a JPEG/PNG dataURL for better OCR accuracy.
 * - Upscales small images
 * - Converts to grayscale
 * - Detects dark backgrounds and inverts to black-on-white
 * - Applies contrast stretch
 * - Sharpens for crisper character boundaries
 * Returns enhanced dataURL.
 */
function enhanceForOcr(dataUrl: string): string {
  let img = nativeImage.createFromDataURL(dataUrl);
  const size = img.getSize();

  // Step 1: Upscale small images
  if (size.width < 1280 || size.height < 720) {
    img = img.resize({
      width: Math.max(size.width * 2, 1280),
      quality: 'best',
    });
  }

  // Step 2: Pixel-level preprocessing
  const bitmap = img.toBitmap();
  const { width, height } = img.getSize();
  const pixels = Buffer.from(bitmap);

  // Grayscale conversion
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = Math.round(
      pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114,
    );
    pixels[i] = gray;
    pixels[i + 1] = gray;
    pixels[i + 2] = gray;
  }

  // Detect dark background via edge sampling
  let bgSum = 0;
  let bgCount = 0;
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 40))) {
    bgSum += pixels[x * 4];
    bgSum += pixels[((height - 1) * width + x) * 4];
    bgCount += 2;
  }
  if (bgSum / bgCount < 128) {
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 255 - pixels[i];
      pixels[i + 1] = 255 - pixels[i + 1];
      pixels[i + 2] = 255 - pixels[i + 2];
    }
  }

  // Contrast stretch
  let minVal = 255, maxVal = 0;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < pixels.length; i += 4) histogram[pixels[i]]++;
  const total = width * height;
  let cum = 0;
  for (let v = 0; v < 256; v++) {
    cum += histogram[v];
    if (cum >= total * 0.02 && minVal === 255) minVal = v;
    if (cum >= total * 0.98) { maxVal = v; break; }
  }
  const range = maxVal - minVal || 1;
  for (let i = 0; i < pixels.length; i += 4) {
    const c = Math.max(0, Math.min(255, Math.round(((pixels[i] - minVal) / range) * 255)));
    pixels[i] = c; pixels[i + 1] = c; pixels[i + 2] = c;
  }

  // Sharpen (3x3 Laplacian)
  const out = Buffer.from(pixels);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const sharp = pixels[idx] * 5
        - pixels[((y - 1) * width + x) * 4]
        - pixels[((y + 1) * width + x) * 4]
        - pixels[(y * width + x - 1) * 4]
        - pixels[(y * width + x + 1) * 4];
      const c = Math.max(0, Math.min(255, Math.round(sharp)));
      out[idx] = c; out[idx + 1] = c; out[idx + 2] = c;
    }
  }

  const result = nativeImage.createFromBitmap(out, { width, height });
  return result.toDataURL();
}

/** OCR a single frame (base64 dataURL). Returns cleaned CodeGrabResult. */
export async function ocrFrame(dataUrl: string): Promise<CodeGrabResult> {
  const enhanced = enhanceForOcr(dataUrl);
  const worker = await getWorker();

  let rawText: string;
  try {
    const { data } = await worker.recognize(enhanced);
    rawText = data.text as string;
  } catch (err) {
    ocrWorker = null;
    throw new Error(`OCR failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!rawText.trim()) {
    throw new Error('No text detected in frame');
  }

  const result = cleanCode(rawText);

  if (!result.code.trim()) {
    throw new Error('No code detected in frame');
  }

  return result;
}

export async function terminateOCR(): Promise<void> {
  if (ocrWorker) {
    try { await ocrWorker.terminate(); } catch { /* ignore on quit */ }
    ocrWorker = null;
  }
}
