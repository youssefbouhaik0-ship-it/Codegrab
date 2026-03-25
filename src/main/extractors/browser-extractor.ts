import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);

/** Browser apps we know how to extract from via AppleScript */
const CHROMIUM_BROWSERS = ['Google Chrome', 'Arc', 'Brave Browser', 'Microsoft Edge', 'Chromium', 'Vivaldi'];
const WEBKIT_BROWSERS = ['Safari'];

const CODE_SELECTOR_JS = `
(function() {
  var selectors = 'pre, code, .highlight, .code-block, [class*="code"], [class*="highlight"], [class*="CodeMirror"], [class*="monaco"], .cm-content, .view-lines';
  var els = document.querySelectorAll(selectors);
  var blocks = [];
  for (var i = 0; i < els.length; i++) {
    var text = els[i].innerText || els[i].textContent || '';
    text = text.trim();
    if (text.length > 10 && text.split('\\n').length >= 2) {
      blocks.push(text);
    }
  }
  if (blocks.length === 0) return '';
  return blocks.join('\\n---CODEBLOCK---\\n');
})()
`.trim().replace(/\n/g, ' ');

export function isBrowser(appName: string): boolean {
  return CHROMIUM_BROWSERS.includes(appName) || WEBKIT_BROWSERS.includes(appName);
}

export async function extractFromBrowser(appName: string): Promise<string | null> {
  try {
    if (CHROMIUM_BROWSERS.includes(appName)) {
      return await extractChromium(appName);
    }
    if (WEBKIT_BROWSERS.includes(appName)) {
      return await extractSafari();
    }
    return null;
  } catch (err) {
    console.warn(`[CodeGrab] Browser extraction failed for ${appName}:`, err);
    return null;
  }
}

async function extractChromium(appName: string): Promise<string | null> {
  const script = `
tell application "${appName}"
  if (count of windows) is 0 then return ""
  set tabTitle to title of active tab of window 1
  set result to execute active tab of window 1 javascript "${escapeAppleScript(CODE_SELECTOR_JS)}"
  return tabTitle & "\\n---TITLE_END---\\n" & result
end tell
  `.trim();

  const { stdout } = await exec('osascript', ['-e', script], { timeout: 8000 });
  return parseExtractedResult(stdout.trim());
}

async function extractSafari(): Promise<string | null> {
  const script = `
tell application "Safari"
  if (count of windows) is 0 then return ""
  set tabTitle to name of current tab of window 1
  set result to do JavaScript "${escapeAppleScript(CODE_SELECTOR_JS)}" in current tab of window 1
  return tabTitle & "\\n---TITLE_END---\\n" & result
end tell
  `.trim();

  const { stdout } = await exec('osascript', ['-e', script], { timeout: 8000 });
  return parseExtractedResult(stdout.trim());
}

function parseExtractedResult(raw: string): string | null {
  if (!raw || raw === 'missing value') return null;
  // Strip the title prefix — context-router handles that separately
  const titleEnd = raw.indexOf('\n---TITLE_END---\n');
  const content = titleEnd >= 0 ? raw.slice(titleEnd + '\n---TITLE_END---\n'.length) : raw;
  if (!content.trim()) return null;
  // Take the longest code block if multiple were found
  const blocks = content.split('\n---CODEBLOCK---\n').filter(b => b.trim().length > 0);
  if (blocks.length === 0) return null;
  return blocks.sort((a, b) => b.length - a.length)[0];
}

function escapeAppleScript(js: string): string {
  return js.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Get the title of the active browser tab */
export async function getBrowserTabTitle(appName: string): Promise<string> {
  try {
    let script: string;
    if (CHROMIUM_BROWSERS.includes(appName)) {
      script = `tell application "${appName}" to return title of active tab of window 1`;
    } else if (WEBKIT_BROWSERS.includes(appName)) {
      script = `tell application "Safari" to return name of current tab of window 1`;
    } else {
      return '';
    }
    const { stdout } = await exec('osascript', ['-e', script], { timeout: 3000 });
    return stdout.trim();
  } catch {
    return '';
  }
}
