import { FloatingBubble } from './components/FloatingBubble.js';

// ── Mount the floating bubble ────────────────────────────────────────────────
const bubble = new FloatingBubble();
bubble.mount(document.body);

// ── Handle grab requests from the bubble ─────────────────────────────────────
document.addEventListener('codegrab:extract', async () => {
  bubble.setStatus('extracting');
  try {
    // Snapshot the frontmost app BEFORE extraction starts.
    // The overlay is non-focusable, so this should still return the correct app.
    const appContext = await window.electronAPI.getFrontmostApp();

    const result = await window.electronAPI.extractCode(appContext);

    if ('error' in result) {
      bubble.setStatus('error');
      setTimeout(() => bubble.setStatus('idle'), 3000);
      return;
    }

    // Copy to clipboard
    await window.electronAPI.setClipboard(result.code);
    bubble.setStatus('success');
    // Show the popover with results (without stealing focus)
    window.electronAPI.showPopoverInactive();
    setTimeout(() => bubble.setStatus('idle'), 4000);
  } catch {
    bubble.setStatus('error');
    setTimeout(() => bubble.setStatus('idle'), 3000);
  }
});

// ── Hotkey from main triggers grab ───────────────────────────────────────────
window.electronAPI.onToggleGrab(() => {
  const evt = new CustomEvent('codegrab:extract', { bubbles: true });
  document.dispatchEvent(evt);
});
