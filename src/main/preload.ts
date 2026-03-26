import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Click-through toggle ───────────────────────────────────────────────────
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options);
  },

  // ── Smart extraction ───────────────────────────────────────────────────────
  extractCode: (appContext?: { name: string; windowTitle: string }): Promise<unknown> =>
    ipcRenderer.invoke('extract-code', appContext),

  getFrontmostApp: (): Promise<{ name: string; windowTitle: string }> =>
    ipcRenderer.invoke('get-frontmost-app'),

  // ── Clipboard ──────────────────────────────────────────────────────────────
  getClipboard: (): Promise<string> =>
    ipcRenderer.invoke('get-clipboard'),

  setClipboard: (text: string): Promise<void> =>
    ipcRenderer.invoke('set-clipboard', text),

  // ── Login item (startup) ──────────────────────────────────────────────────
  setLoginItem: (openAtLogin: boolean): Promise<void> =>
    ipcRenderer.invoke('set-login-item', openAtLogin),

  getLoginItem: (): Promise<boolean> =>
    ipcRenderer.invoke('get-login-item'),

  // ── Accessibility ─────────────────────────────────────────────────────────
  checkAccessibility: (): Promise<boolean> =>
    ipcRenderer.invoke('check-accessibility'),

  requestAccessibility: (): Promise<void> =>
    ipcRenderer.invoke('request-accessibility'),

  // ── Popover control ───────────────────────────────────────────────────────
  showPopover: () => {
    ipcRenderer.send('show-popover');
  },

  showPopoverInactive: () => {
    ipcRenderer.send('show-popover-inactive');
  },

  hidePopover: () => {
    ipcRenderer.send('hide-popover');
  },

  // ── Onboarding control ────────────────────────────────────────────────────
  closeOnboarding: () => {
    ipcRenderer.send('close-onboarding');
  },

  markOnboardingSeen: () => {
    ipcRenderer.send('mark-onboarding-seen');
  },

  // ── Screen Recording permission ─────────────────────────────────────────
  checkScreenRecording: (): Promise<boolean> =>
    ipcRenderer.invoke('check-screen-recording'),

  openScreenRecordingSettings: () => {
    ipcRenderer.send('open-screen-recording-settings');
  },

  // ── Relaunch app ────────────────────────────────────────────────────────
  relaunchApp: () => {
    ipcRenderer.send('relaunch-app');
  },

  // ── Events from main → renderer ───────────────────────────────────────────
  onToggleGrab: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('toggle-grab', handler);
    return () => ipcRenderer.removeListener('toggle-grab', handler);
  },

  onHotkeyConflict: (callback: (msg: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, msg: string) => callback(msg);
    ipcRenderer.on('hotkey-conflict', handler);
    return () => ipcRenderer.removeListener('hotkey-conflict', handler);
  },
});
