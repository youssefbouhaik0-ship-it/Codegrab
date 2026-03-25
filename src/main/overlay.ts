import { BrowserWindow, screen, app } from 'electron';
import path from 'path';

let overlayWindow: BrowserWindow | null = null;

/**
 * Create a full-screen transparent overlay for the floating bubble.
 * Click-through everywhere except the bubble itself.
 * Per electron-overlay-setup skill: transparent, frameless, always-on-top,
 * focusable: false, type: 'panel'.
 */
export function createOverlayWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: false,           // Don't steal focus from user's active app
    type: 'panel',              // macOS: NSPanel — floats above other windows
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Clicks pass through transparent areas to apps below
  win.setIgnoreMouseEvents(true, { forward: true });

  // Visible on all workspaces including fullscreen apps
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Keep floating above everything
  win.setAlwaysOnTop(true, 'floating');

  // Exclude from screen capture so it doesn't appear in OCR screenshots
  win.setContentProtection(true);

  const htmlPath = path.join(app.getAppPath(), 'src', 'renderer', 'overlay.html');
  win.loadFile(htmlPath);

  overlayWindow = win;
  return win;
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow;
}

export function destroyOverlay(): void {
  overlayWindow?.destroy();
  overlayWindow = null;
}
