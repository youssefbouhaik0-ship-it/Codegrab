export interface CodeGrabResult {
  code: string;
  language: string;
  lineCount: number;
}

export interface AIAnalysisResult {
  cleaned_code: string;
  language: string;
  simple_explanation: string;
  placement_warning: string | null;
  missing_context: string[];
}

export interface ExtractionResult extends CodeGrabResult {
  source: 'browser' | 'accessibility' | 'ocr';
  appName: string;
  windowTitle: string;
  analysis?: AIAnalysisResult;
}

export interface GrabError {
  message: string;
  type: 'permission' | 'ocr' | 'empty' | 'clipboard' | 'unknown';
}

export type ToastVariant = 'success' | 'error' | 'loading';

/**
 * API surface exposed to the renderer via contextBridge.
 * Keep in sync with src/main/preload.ts and src/renderer/env.d.ts.
 */
export interface ElectronAPI {
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void;

  // Smart extraction (replaces live capture)
  extractCode: (appContext?: { name: string; windowTitle: string }) => Promise<ExtractionResult | { error: string }>;
  getFrontmostApp: () => Promise<{ name: string; windowTitle: string }>;

  // Clipboard
  getClipboard: () => Promise<string>;
  setClipboard: (text: string) => Promise<void>;

  // Login item
  setLoginItem: (openAtLogin: boolean) => Promise<void>;
  getLoginItem: () => Promise<boolean>;

  // Accessibility
  checkAccessibility: () => Promise<boolean>;
  requestAccessibility: () => Promise<void>;

  // Popover control
  showPopover: () => void;
  showPopoverInactive: () => void;
  hidePopover: () => void;
  closeOnboarding: () => void;

  // Events from main
  onToggleGrab: (callback: () => void) => () => void;
  onToggleControlBar: (callback: () => void) => () => void;
  onHotkeyConflict: (callback: (msg: string) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
