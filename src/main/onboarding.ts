import { BrowserWindow, app } from 'electron';
import path from 'path';
import fs from 'fs';

const CONFIG_PATH = path.join(app.getPath('userData'), 'codegrab-config.json');

interface AppConfig {
  hasSeenOnboarding: boolean;
}

export function loadConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return JSON.parse(data) as AppConfig;
    }
  } catch (err) {
    console.warn('[CodeGrab] Failed to read config:', err);
  }
  return { hasSeenOnboarding: false };
}

export function saveConfig(config: Partial<AppConfig>): void {
  const current = loadConfig();
  const next = { ...current, ...config };
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf-8');
  } catch (err) {
    console.error('[CodeGrab] Failed to save config:', err);
  }
}

/**
 * Resolve a renderer HTML file path that works in both dev and packaged mode.
 *
 * In dev:      app.getAppPath() = project root, HTML at src/renderer/
 * In packaged: app.getAppPath() = path to app.asar, HTML at src/renderer/ inside asar
 *
 * NOTE: fs.existsSync does NOT work inside .asar archives, so we use
 * app.getAppPath() which always points to the right root.
 */
function resolveRendererPath(filename: string): string {
  return path.join(app.getAppPath(), 'src', 'renderer', filename);
}

let onboardingWindow: BrowserWindow | null = null;

export function showOnboardingWindow(): void {
  if (onboardingWindow) {
    onboardingWindow.focus();
    return;
  }

  onboardingWindow = new BrowserWindow({
    width: 600,
    height: 480,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    center: true,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    hasShadow: true,
    roundedCorners: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const htmlPath = resolveRendererPath('onboarding.html');
  console.log('[CodeGrab] Loading onboarding from:', htmlPath);

  onboardingWindow.webContents.on('did-fail-load', (_event, code, desc) => {
    console.error(`[CodeGrab] Onboarding page failed to load: ${code} ${desc}`);
  });

  // Show once the page has finished loading
  // Note: 'ready-to-show' can be unreliable with transparent frameless windows,
  // so we use 'did-finish-load' instead.
  onboardingWindow.webContents.once('did-finish-load', () => {
    console.log('[CodeGrab] Onboarding loaded, showing window');
    onboardingWindow?.show();
    onboardingWindow?.focus();
  });

  onboardingWindow.on('closed', () => {
    onboardingWindow = null;
  });

  onboardingWindow.loadFile(htmlPath).catch((err) => {
    console.error('[CodeGrab] Failed to load onboarding HTML:', err);
  });
}

export function closeOnboardingWindow(): void {
  saveConfig({ hasSeenOnboarding: true });
  if (onboardingWindow) {
    onboardingWindow.close();
  }
}
