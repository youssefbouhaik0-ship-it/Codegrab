import { app } from 'electron';
import { setupTray, destroyTray, showPopover } from './tray.js';
import { createOverlayWindow, destroyOverlay } from './overlay.js';
import { registerHotkeys, unregisterHotkeys } from './hotkey.js';
import { setupIpcHandlers } from './ipc-handlers.js';
import { initOCR, terminateOCR } from './extractors/screenshot-extractor.js';
import { loadConfig, showOnboardingWindow } from './onboarding.js';

// ── Single-instance lock ─────────────────────────────────────────────────────
// Prevents duplicate tray icons and conflicting hotkey registrations when the
// app is launched a second time (e.g. double-clicking the .app).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Show the existing popover so the user knows the app is already running
    showPopover();
  });

  app.whenReady().then(async () => {
    // Register IPC handlers once (shared by all windows)
    setupIpcHandlers();

    // Create tray icon + popover window (menu bar app)
    const popover = setupTray();

    // Create fullscreen transparent overlay with floating bubble
    const overlay = createOverlayWindow();

    // Register hotkey
    registerHotkeys(popover, overlay);

    // Show onboarding if it's the first time
    const conf = loadConfig();
    if (!conf.hasSeenOnboarding) {
      showOnboardingWindow();
    }

    // Pre-warm OCR worker (Layer 3 fallback) — non-blocking
    initOCR().catch((err) => console.error('[CodeGrab] OCR pre-warm failed:', err));
  });

  app.on('window-all-closed', async () => {
    unregisterHotkeys();
    await terminateOCR();
    // macOS tray apps shouldn't quit when windows close
  });

  app.on('will-quit', async () => {
    destroyTray();
    destroyOverlay();
    await terminateOCR();
  });
}

// Hide dock icon on macOS (menu bar app only)
if (process.platform === 'darwin') {
  app.dock?.hide();
}
