import { app, BrowserWindow, ipcMain, clipboard, systemPreferences, shell, desktopCapturer } from 'electron';
import { extractCode, getFrontmostApp } from './extractors/context-router.js';
import { checkAccessibilityPermission, requestAccessibilityPermission } from './extractors/accessibility-extractor.js';
import { showPopover, showPopoverInactive, getPopoverWindow } from './tray.js';
import { closeOnboardingWindow } from './onboarding.js';

/**
 * Register all IPC handlers once. Called from main.ts.
 * Both popover and overlay windows share these handlers via ipcMain.
 */
export function setupIpcHandlers(): void {
  // ── Click-through toggle (per-window — uses event.sender) ──────────────────
  ipcMain.on('set-ignore-mouse-events', (event, ignore: boolean, options?: { forward: boolean }) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    w?.setIgnoreMouseEvents(ignore, options ?? {});
  });

  // ── Smart code extraction ──────────────────────────────────────────────────
  ipcMain.handle('extract-code', async (_event, appContext?: { name: string; windowTitle: string }) => {
    try {
      return await extractCode(appContext);
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Frontmost app info ────────────────────────────────────────────────────
  ipcMain.handle('get-frontmost-app', async () => {
    return await getFrontmostApp();
  });

  // ── Clipboard read/write ──────────────────────────────────────────────────
  ipcMain.handle('get-clipboard', () => {
    return clipboard.readText();
  });

  ipcMain.handle('set-clipboard', (_event, text: string) => {
    clipboard.writeText(text);
  });

  // ── Login item (launch on startup) ────────────────────────────────────────
  ipcMain.handle('set-login-item', (_event, openAtLogin: boolean) => {
    app.setLoginItemSettings({ openAtLogin });
  });

  ipcMain.handle('get-login-item', () => {
    return app.getLoginItemSettings().openAtLogin;
  });

  // ── Accessibility permission ──────────────────────────────────────────────
  ipcMain.handle('check-accessibility', async () => {
    return await checkAccessibilityPermission();
  });

  ipcMain.handle('request-accessibility', async () => {
    await requestAccessibilityPermission();
  });

  // ── Popover control ───────────────────────────────────────────────────────
  ipcMain.on('show-popover', () => {
    showPopover();
  });

  ipcMain.on('show-popover-inactive', () => {
    showPopoverInactive();
  });

  ipcMain.on('hide-popover', () => {
    const popover = getPopoverWindow();
    popover?.hide();
  });

  // ── Onboarding control ────────────────────────────────────────────────────
  ipcMain.on('close-onboarding', () => {
    closeOnboardingWindow();
  });

  // ── Screen Recording permission ─────────────────────────────────────────
  ipcMain.handle('check-screen-recording', async () => {
    // systemPreferences check works for packaged apps
    const status = systemPreferences.getMediaAccessStatus('screen');
    if (status === 'granted') return true;

    // In dev mode, the API may report 'not-determined' even when Electron Helper
    // has the permission. Try a real capture as a fallback test.
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1, height: 1 },
      });
      return sources.length > 0 && !sources[0].thumbnail.isEmpty();
    } catch {
      return false;
    }
  });

  ipcMain.on('open-screen-recording-settings', () => {
    // macOS 15 (Sequoia) uses a different URL — try new format first, fall back to old
    const url = parseInt(process.versions.electron) >= 33
      ? 'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_ScreenCapture'
      : 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
    shell.openExternal(url).catch(() => {
      // Final fallback: just open Privacy & Security
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security');
    });
  });

  // ── Relaunch app (needed after granting permissions) ────────────────────
  ipcMain.on('relaunch-app', () => {
    app.relaunch();
    app.quit();
  });
}
