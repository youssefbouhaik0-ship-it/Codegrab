import { app, BrowserWindow, ipcMain, clipboard } from 'electron';
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
}
