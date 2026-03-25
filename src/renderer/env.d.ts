// Renderer-side type declarations for the contextBridge API.
// Keep in sync with src/main/preload.ts and src/shared/types.ts.

interface AIAnalysisResult {
  cleaned_code: string;
  language: string;
  simple_explanation: string;
  placement_warning: string | null;
  missing_context: string[];
}

interface ExtractionResult {
  code: string;
  language: string;
  lineCount: number;
  source: 'browser' | 'accessibility' | 'ocr';
  appName: string;
  windowTitle: string;
  analysis?: AIAnalysisResult;
}

interface ElectronAPI {
  // Click-through toggle
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void;

  // Smart extraction
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
  onHotkeyConflict: (callback: (msg: string) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
