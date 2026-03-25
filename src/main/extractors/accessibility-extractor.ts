import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);

/** Apps we can read via macOS Accessibility API (AXUIElement) */
const EDITOR_APPS = ['Code', 'Xcode', 'TextEdit', 'Sublime Text', 'Atom', 'Nova'];
const TERMINAL_APPS = ['Terminal', 'iTerm2', 'Warp', 'Alacritty', 'kitty', 'Hyper'];

export function isEditor(appName: string): boolean {
  return EDITOR_APPS.includes(appName) || TERMINAL_APPS.includes(appName);
}

/**
 * Extract text from the focused text area of an editor/terminal using JXA + Accessibility API.
 * Requires Accessibility permission (same as Grammarly, Rectangle, etc.).
 */
export async function extractFromEditor(appName: string): Promise<string | null> {
  try {
    // JXA script that uses the Accessibility framework to read focused text
    const jxaScript = `
ObjC.import('Cocoa');

function run() {
  var app = Application("System Events");
  var proc = app.processes.whose({frontmost: true})[0];

  // Try to get the focused UI element's value
  try {
    var focused = proc.focusedUiElement;
    if (!focused) return "";

    // Try AXValue (works for text areas, editors)
    try {
      var val = focused.value();
      if (val && typeof val === "string" && val.trim().length > 0) {
        return val;
      }
    } catch(e) {}

    // Try AXSelectedText (selected text in editors)
    try {
      var selected = focused.selectedText();
      if (selected && typeof selected === "string" && selected.trim().length > 0) {
        return selected;
      }
    } catch(e) {}

    // Walk up to find a text area parent
    try {
      var parent = focused;
      for (var i = 0; i < 5; i++) {
        parent = parent.uiElements[0];
        try {
          var pval = parent.value();
          if (pval && typeof pval === "string" && pval.trim().length > 10) {
            return pval;
          }
        } catch(e) {}
      }
    } catch(e) {}
  } catch(e) {}

  // Fallback: try to get all text areas in the frontmost window
  try {
    var wins = proc.windows();
    if (wins.length > 0) {
      var textAreas = wins[0].textAreas();
      for (var j = 0; j < textAreas.length; j++) {
        try {
          var taVal = textAreas[j].value();
          if (taVal && typeof taVal === "string" && taVal.trim().length > 10) {
            return taVal;
          }
        } catch(e) {}
      }
    }
  } catch(e) {}

  return "";
}
    `.trim();

    const { stdout } = await exec('osascript', ['-l', 'JavaScript', '-e', jxaScript], {
      timeout: 5000,
    });

    const text = stdout.trim();
    if (!text || text.length < 5) return null;
    return text;
  } catch (err) {
    console.warn(`[CodeGrab] Accessibility extraction failed for ${appName}:`, err);
    return null;
  }
}

/** Check if Accessibility permission is granted */
export async function checkAccessibilityPermission(): Promise<boolean> {
  try {
    const script = `
ObjC.import('ApplicationServices');
var trusted = $.AXIsProcessTrusted();
trusted;
    `.trim();
    const { stdout } = await exec('osascript', ['-l', 'JavaScript', '-e', script], {
      timeout: 3000,
    });
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

/** Prompt user to grant Accessibility permission */
export async function requestAccessibilityPermission(): Promise<void> {
  try {
    const script = `
ObjC.import('ApplicationServices');
var options = $.CFDictionaryCreateMutable($.kCFAllocatorDefault, 1, $.kCFTypeDictionaryKeyCallBacks, $.kCFTypeDictionaryValueCallBacks);
$.CFDictionarySetValue(options, $.kAXTrustedCheckOptionPrompt, $.kCFBooleanTrue);
$.AXIsProcessTrustedWithOptions(options);
    `.trim();
    await exec('osascript', ['-l', 'JavaScript', '-e', script], { timeout: 5000 });
  } catch {
    // Prompt may have shown even if script errors
  }
}
