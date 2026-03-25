import { execFile } from 'child_process';
import { promisify } from 'util';
import { cleanCode } from '../../shared/code-cleanup.js';
import { analyzeOcrCode } from '../../shared/ai-analyze.js';
import type { CodeGrabResult, AIAnalysisResult } from '../../shared/types.js';
import { isBrowser, extractFromBrowser, getBrowserTabTitle } from './browser-extractor.js';
import { isEditor, extractFromEditor } from './accessibility-extractor.js';
import { extractFromScreenshot } from './screenshot-extractor.js';
import { getOverlayWindow } from '../overlay.js';

const exec = promisify(execFile);

export interface ExtractionResult extends CodeGrabResult {
  source: 'browser' | 'accessibility' | 'ocr';
  appName: string;
  windowTitle: string;
  analysis?: AIAnalysisResult;
}

/** Detect the frontmost application name */
export async function getFrontmostApp(): Promise<{ name: string; windowTitle: string }> {
  try {
    const script = `
tell application "System Events"
  set frontApp to first process whose frontmost is true
  set appName to name of frontApp
  set winTitle to ""
  try
    set winTitle to name of front window of frontApp
  end try
  return appName & "\\n" & winTitle
end tell
    `.trim();

    const { stdout } = await exec('osascript', ['-e', script], { timeout: 3000 });
    const parts = stdout.trim().split('\n');
    return {
      name: parts[0] || 'Unknown',
      windowTitle: parts[1] || '',
    };
  } catch {
    return { name: 'Unknown', windowTitle: '' };
  }
}

/**
 * Smart extraction — routes to the best extractor based on the frontmost app.
 *
 * Layer 1: AppleScript DOM extraction for browsers (no screenshot needed)
 * Layer 2: Accessibility API for editors/terminals
 * Layer 3: One-shot OCR screenshot as fallback
 */
/**
 * @param preSnapshotApp — if provided, skips getFrontmostApp() and uses this instead.
 *   This is critical: the renderer snapshots the frontmost app BEFORE the popover
 *   steals focus, then passes it here so we extract from the correct app.
 */
export async function extractCode(
  preSnapshotApp?: { name: string; windowTitle: string },
): Promise<ExtractionResult> {
  const app = preSnapshotApp ?? await getFrontmostApp();
  console.log(`[CodeGrab] Frontmost app: ${app.name} — "${app.windowTitle}"`);

  let rawText: string | null = null;
  let source: ExtractionResult['source'] = 'ocr';

  // Layer 1: Browser — read DOM directly via AppleScript
  if (isBrowser(app.name)) {
    console.log('[CodeGrab] Layer 1: Trying browser DOM extraction…');
    rawText = await extractFromBrowser(app.name);
    if (rawText) {
      source = 'browser';
      const tabTitle = await getBrowserTabTitle(app.name);
      if (tabTitle) app.windowTitle = tabTitle;
    }
  }

  // Layer 2: Editor/Terminal — read via Accessibility API
  if (!rawText && isEditor(app.name)) {
    console.log('[CodeGrab] Layer 2: Trying accessibility extraction…');
    rawText = await extractFromEditor(app.name);
    if (rawText) source = 'accessibility';
  }

  // Layer 3: One-shot screenshot + OCR (fallback for any app)
  // Hide the overlay bubble so it doesn't appear in the screenshot
  if (!rawText) {
    console.log('[CodeGrab] Layer 3: Falling back to one-shot OCR…');
    const overlay = getOverlayWindow();
    overlay?.hide();
    await new Promise((r) => setTimeout(r, 100)); // let compositor update
    rawText = await extractFromScreenshot(app.windowTitle || app.name);
    overlay?.showInactive();
    if (rawText) source = 'ocr';
  }

  if (!rawText || !rawText.trim()) {
    throw new Error(`No text found in ${app.name}. Try selecting a window with visible text.`);
  }

  // Clean and detect language
  const result = cleanCode(rawText);

  if (!result.code.trim()) {
    throw new Error(`No usable text detected in ${app.name} content.`);
  }

  // Run AI mentor analysis
  const analysis = analyzeOcrCode(rawText);

  console.log(`[CodeGrab] Extracted ${result.lineCount} lines of ${result.language} via ${source}`);

  return {
    ...result,
    source,
    appName: app.name,
    windowTitle: app.windowTitle,
    analysis,
  };
}
