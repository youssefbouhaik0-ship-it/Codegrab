import { globalShortcut, BrowserWindow } from 'electron';

export function registerHotkeys(popover: BrowserWindow, overlay: BrowserWindow): void {
  const grabHandler = () => {
    // Only send to overlay — it handles extraction and shows popover with results.
    // Sending to both causes extraction to run twice simultaneously.
    overlay.webContents.send('toggle-grab');
  };

  // ⌘⇧X — primary hotkey
  let registered = false;
  try {
    registered = globalShortcut.register('CommandOrControl+Shift+X', grabHandler);
  } catch {
    registered = false;
  }

  if (!registered) {
    console.warn('[CodeGrab] Failed to register hotkey ⌘⇧X — key may be in use');
    popover.webContents.send(
      'hotkey-conflict',
      'Hotkey ⌘⇧X is already taken by another app. Try clicking "Grab" from the menu bar icon instead.',
    );
  }
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll();
}
