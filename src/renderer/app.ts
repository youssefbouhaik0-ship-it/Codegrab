import { CodeDisplay } from './components/CodeDisplay.js';
import { StatusToast } from './components/StatusToast.js';

// ── Zone containers ──────────────────────────────────────────────────────────
const toastZone    = document.getElementById('toast-container')!;
const codeZone     = document.getElementById('code-display')!;
const emptyState   = document.getElementById('empty-state')!;
const grabBtn      = document.getElementById('grab-btn')!;
const closeBtn     = document.getElementById('close-btn')!;

// ── Components ───────────────────────────────────────────────────────────────
let outputDisplay: CodeDisplay | null = null;
let isExtracting = false;

// ── Smart extraction ────────────────────────────────────────────────────────

async function extractCode(): Promise<void> {
  if (isExtracting) return;
  isExtracting = true;

  // Snapshot the frontmost app BEFORE we steal focus or hide anything.
  // This ensures we detect Chrome/Safari/etc., not Finder or CodeGrab.
  const appContext = await window.electronAPI.getFrontmostApp();

  grabBtn.classList.add('tray-popover__grab-btn--busy');

  try {
    // Hide the popover so it doesn't appear in the screenshot
    window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
    document.querySelector('.tray-popover')?.classList.add('tray-popover--hidden');

    // Wait for the popover to be hidden and the underlying window to paint
    await new Promise((resolve) => setTimeout(resolve, 400));

    const result = await window.electronAPI.extractCode(appContext);

    // Show the popover back with results
    document.querySelector('.tray-popover')?.classList.remove('tray-popover--hidden');
    window.electronAPI.setIgnoreMouseEvents(false);

    if ('error' in result) {
      const errToast = new StatusToast('error', result.error as string);
      errToast.show(toastZone);
      window.electronAPI.showPopoverInactive();
      return;
    }

    // Copy to clipboard
    await window.electronAPI.setClipboard(result.code);

    // Hide empty state
    emptyState.style.display = 'none';

    // Show or update the code panel
    if (outputDisplay) {
      outputDisplay.update(result);
    } else {
      outputDisplay = new CodeDisplay(result);
      outputDisplay.show(codeZone);
    }

    // Show popover with results (without stealing focus)
    window.electronAPI.showPopoverInactive();

    // Success feedback
    const successToast = new StatusToast('success',
      `${result.lineCount} lines of ${result.language} copied`);
    successToast.show(toastZone);
  } catch (err) {
    document.querySelector('.tray-popover')?.classList.remove('tray-popover--hidden');
    window.electronAPI.setIgnoreMouseEvents(false);
    const msg = err instanceof Error ? err.message : 'Extraction failed';
    const errToast = new StatusToast('error', msg);
    errToast.show(toastZone);
    window.electronAPI.showPopoverInactive();
  } finally {
    isExtracting = false;
    grabBtn.classList.remove('tray-popover__grab-btn--busy');
  }
}

// ── Event wiring ─────────────────────────────────────────────────────────────

// Grab button click (in popover header)
grabBtn.addEventListener('click', () => extractCode());

// Close button — hide popover
closeBtn.addEventListener('click', () => {
  window.electronAPI.hidePopover();
});

// Escape key — hide popover
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.electronAPI.hidePopover();
  }
});

// Hotkey from main (⌘⇧X)
window.electronAPI.onToggleGrab(() => extractCode());

// Hotkey conflict warning
window.electronAPI.onHotkeyConflict((msg) => {
  const t = new StatusToast('error', msg);
  t.show(toastZone);
});
