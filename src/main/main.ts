import { app } from 'electron';
import { setupTray, destroyTray, showPopover } from './tray.js';
import { registerHotkeys, unregisterHotkeys } from './hotkey.js';
import { setupIpcHandlers, checkScreenRecordingPermission } from './ipc-handlers.js';
import { initOCR, terminateOCR } from './extractors/screenshot-extractor.js';
import { loadConfig, saveConfig, showOnboardingWindow } from './onboarding.js';

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

    // Register hotkey
    registerHotkeys(popover);

    // Gate: show onboarding only if BOTH permission is missing AND user hasn't
    // been through onboarding yet. hasSeenOnboarding is saved the moment the
    // user clicks "Set Up Permissions" — before they open System Settings —
    // so it survives the macOS Sequoia auto-relaunch that happens when Screen
    // Recording is toggled. This prevents the loop where permission check
    // returns false (Sequoia desktopCapturer bug) after a valid grant.
    const config = loadConfig();
    const screenGranted = await checkScreenRecordingPermission();
    if (!screenGranted && !config.hasSeenOnboarding) {
      showOnboardingWindow();
    } else if (screenGranted) {
      saveConfig({ hasSeenOnboarding: true }); // keep in sync
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
    await terminateOCR();
  });
}

// Hide dock icon on macOS (menu bar app only)
if (process.platform === 'darwin') {
  app.dock?.hide();
}

