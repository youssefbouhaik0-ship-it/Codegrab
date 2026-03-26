import { execFile } from 'child_process';
import { promisify } from 'util';
import { cleanCode } from '../../shared/code-cleanup.js';
import { analyzeOcrCode } from '../../shared/ai-analyze.js';
import type { CodeGrabResult, AIAnalysisResult } from '../../shared/types.js';
import { extractFromScreenshot } from './screenshot-extractor.js';
import { getPopoverWindow } from '../tray.js';

const exec = promisify(execFile);

export interface ExtractionResult extends CodeGrabResult {
  source: 'ocr';
  appName: string;
  windowTitle: string;
  analysis?: AIAnalysisResult;
}

/** Detect the frontmost application name — uses NSWorkspace, no permissions required */
export async function getFrontmostApp(): Promise<{ name: string; windowTitle: string }> {
  try {
    const script = `
ObjC.import('AppKit');
var app = $.NSWorkspace.sharedWorkspace.frontmostApplication;
app.localizedName.js;
    `.trim();

    const { stdout } = await exec('osascript', ['-l', 'JavaScript', '-e', script], { timeout: 3000 });
    return {
      name: stdout.trim() || 'Unknown',
      windowTitle: '',
    };
  } catch {
    return { name: 'Unknown', windowTitle: '' };
  }
}

/**
 * Extract text from the frontmost app using OCR screenshot.
 * Single path — no AppleScript, no Automation dialogs, Screen Recording only.
 */
export async function extractCode(
  preSnapshotApp?: { name: string; windowTitle: string },
): Promise<ExtractionResult> {
  const app = preSnapshotApp ?? await getFrontmostApp();
  console.log(`[CodeGrab] Grabbing from: ${app.name}`);

  // Hide the popover so it doesn't appear in the screenshot
  const popover = getPopoverWindow();
  popover?.hide();
  await new Promise((r) => setTimeout(r, 150));

  const rawText = await extractFromScreenshot(app.name);

  popover?.showInactive();

  const source: ExtractionResult['source'] = 'ocr';

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
