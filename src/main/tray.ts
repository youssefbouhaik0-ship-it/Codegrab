import { Tray, BrowserWindow, nativeImage, screen, app, Menu } from 'electron';
import path from 'path';

let tray: Tray | null = null;
let popoverWindow: BrowserWindow | null = null;

/** Create a visible 22×22 tray icon using raw RGBA bitmap */
function createTrayIcon(): Electron.NativeImage {
  const size = 22;
  const buf = Buffer.alloc(size * size * 4, 0); // All transparent

  // Draw < bracket and > bracket as pixel lines (black on transparent)
  // macOS template images: black pixels rendered in whatever color fits the theme
  const setPixel = (x: number, y: number) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (y * size + x) * 4;
    buf[idx] = 0;     // R
    buf[idx + 1] = 0; // G
    buf[idx + 2] = 0; // B
    buf[idx + 3] = 255; // A
  };

  // Draw a thick line using Bresenham's algorithm with thickness
  const drawThickLine = (x0: number, y0: number, x1: number, y1: number) => {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let cx = x0, cy = y0;

    while (true) {
      // 2px thickness
      setPixel(cx, cy);
      setPixel(cx + 1, cy);
      setPixel(cx, cy + 1);
      setPixel(cx + 1, cy + 1);

      if (cx === x1 && cy === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
    }
  };

  // < bracket: top-left (8,6) → tip (3,10) → bottom-left (8,14)
  drawThickLine(8, 6, 3, 10);
  drawThickLine(3, 10, 8, 14);

  // > bracket: top-right (13,6) → tip (18,10) → bottom-right (13,14)
  drawThickLine(13, 6, 18, 10);
  drawThickLine(18, 10, 13, 14);

  const img = nativeImage.createFromBitmap(buf, { width: size, height: size });
  img.setTemplateImage(true);
  return img;
}

/** Create the popover window (only shown after grab results) */
function createPopoverWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 400,
    height: 520,
    show: false,
    frame: false,
    resizable: false,
    movable: true,             // Draggable — user can reposition anywhere
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    hasShadow: true,
    fullscreenable: false,
    roundedCorners: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // app.getAppPath() works in both dev (project root) and packaged (inside .asar)
  const htmlPath = path.join(app.getAppPath(), 'src', 'renderer', 'index.html');
  win.loadFile(htmlPath);

  // Keep on top of all windows including fullscreen
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Don't auto-hide on blur — user controls when to dismiss via close button or Escape.
  // This prevents the popover from vanishing while the user is reading results.

  // Track user-initiated moves so we don't reposition after they've placed it
  win.on('moved', () => {
    userMovedPopover = true;
  });

  return win;
}

/** Position the popover directly below the tray icon */
function positionPopover(win: BrowserWindow, trayBounds: Electron.Rectangle): void {
  const display = screen.getDisplayMatching(trayBounds);
  const winBounds = win.getBounds();

  const x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
  const y = trayBounds.y + trayBounds.height + 4;

  const clampedX = Math.max(
    display.workArea.x,
    Math.min(x, display.workArea.x + display.workArea.width - winBounds.width),
  );

  win.setPosition(clampedX, y, false);
}

/** Initialise the tray icon and popover. Returns the popover BrowserWindow. */
export function setupTray(): BrowserWindow {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('CodeGrab · ⌘⇧X to grab text');

  // Click → native dropdown menu (like Grammarly) — never breaks fullscreen
  const buildMenu = () => Menu.buildFromTemplate([
    {
      label: 'Grab Text   ⌘⇧X',
      click: () => {
        if (popoverWindow) {
          // Trigger grab SILENTLY — don't show popover yet, don't steal focus
          popoverWindow.webContents.send('toggle-grab');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Open CodeGrab',
      click: () => showPopover(),
    },
    { type: 'separator' },
    {
      label: 'Quit CodeGrab',
      click: () => app.quit(),
    },
  ]);

  // Both left-click and right-click show the same native menu
  tray.on('click', () => {
    tray?.popUpContextMenu(buildMenu());
  });

  tray.on('right-click', () => {
    tray?.popUpContextMenu(buildMenu());
  });

  popoverWindow = createPopoverWindow();

  // Show briefly on first launch so macOS registers the app as having a real
  // window — required for Screen Recording permission to appear in System Settings.
  // Auto-hides after 800ms so it doesn't interrupt the user.
  popoverWindow.webContents.once('did-finish-load', () => {
    if (!popoverWindow) return;
    const bounds = tray!.getBounds();
    positionPopover(popoverWindow, bounds);
    popoverWindow.showInactive();
    setTimeout(() => popoverWindow?.hide(), 800);
  });

  return popoverWindow;
}

/** Show the popover floating on top (like Grammarly) — with focus for button clicks */
export function showPopover(): void {
  if (!popoverWindow || !tray) return;
  if (!userMovedPopover) {
    const bounds = tray.getBounds();
    positionPopover(popoverWindow, bounds);
  }
  popoverWindow.show();
  popoverWindow.focus();
}

/** Track whether the user has manually moved the popover */
let userMovedPopover = false;

/** Show the popover WITHOUT stealing focus (for showing results after grab) */
export function showPopoverInactive(): void {
  if (!popoverWindow || !tray) return;
  // Only auto-position if user hasn't dragged it somewhere else
  if (!userMovedPopover) {
    const bounds = tray.getBounds();
    positionPopover(popoverWindow, bounds);
  }
  popoverWindow.showInactive();
}

/** Get the popover window (for IPC etc.) */
export function getPopoverWindow(): BrowserWindow | null {
  return popoverWindow;
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
  popoverWindow?.destroy();
  popoverWindow = null;
}
