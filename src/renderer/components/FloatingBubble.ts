/**
 * FloatingBubble — small draggable pill that floats on screen.
 *
 * Collapsed: shows the CG logo + status dot (tiny, unobtrusive).
 * Hover/expand: reveals Grab and Re-grab buttons.
 * Draggable to any screen edge. Saves position across sessions.
 *
 * Dispatches:
 *   'codegrab:extract' — user clicked Grab or Re-grab
 */

export type BubbleStatus = 'idle' | 'extracting' | 'success' | 'error';

export class FloatingBubble {
  private el: HTMLElement;
  private dot: HTMLElement;
  private expanded = false;
  private collapseTimer: ReturnType<typeof setTimeout> | null = null;
  private isDragging = false;
  private dragOffset = { x: 0, y: 0 };
  private hasDragged = false;

  constructor() {
    this.el = this.buildDOM();
    this.dot = this.el.querySelector('.fb__dot')!;
    this.attachListeners();
    this.restorePosition();
  }

  private buildDOM(): HTMLElement {
    const bubble = document.createElement('div');
    bubble.className = 'fb';
    bubble.innerHTML = `
      <div class="fb__pill">
        <div class="fb__logo">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
        </div>
        <div class="fb__dot"></div>
        <div class="fb__actions">
          <button class="fb__btn" data-action="grab" title="Grab text (⌘⇧X)">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
          </button>
          <button class="fb__btn" data-action="regrab" title="Re-grab (refresh)">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
    return bubble;
  }

  private attachListeners(): void {
    // Hover → make interactive + expand
    this.el.addEventListener('mouseenter', () => {
      window.electronAPI?.setIgnoreMouseEvents(false);
      if (this.collapseTimer) {
        clearTimeout(this.collapseTimer);
        this.collapseTimer = null;
      }
      this.expand();
    });

    this.el.addEventListener('mouseleave', () => {
      this.collapseTimer = setTimeout(() => {
        this.collapse();
        window.electronAPI?.setIgnoreMouseEvents(true, { forward: true });
      }, 500);
    });

    // Action buttons
    this.el.addEventListener('click', (e) => {
      if (this.hasDragged) {
        this.hasDragged = false;
        return;
      }
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (btn) {
        const action = btn.dataset.action;
        if (action === 'grab' || action === 'regrab') {
          this.el.dispatchEvent(new CustomEvent('codegrab:extract', { bubbles: true }));
        }
      }
    });

    // Drag support — drag the whole pill
    const pill = this.el.querySelector('.fb__pill') as HTMLElement;
    pill.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('[data-action]')) return;
      this.isDragging = true;
      this.hasDragged = false;
      this.el.style.transition = 'none';
      const rect = this.el.getBoundingClientRect();
      this.dragOffset.x = e.clientX - rect.left;
      this.dragOffset.y = e.clientY - rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      this.hasDragged = true;
      let x = e.clientX - this.dragOffset.x;
      let y = e.clientY - this.dragOffset.y;
      const w = this.el.offsetWidth;
      const h = this.el.offsetHeight;
      const sw = window.innerWidth;
      const sh = window.innerHeight;

      // Clamp within viewport
      x = Math.max(4, Math.min(x, sw - w - 4));
      y = Math.max(4, Math.min(y, sh - h - 4));

      // Snap to edges within 16px
      const SNAP = 16;
      if (x < SNAP) x = 6;
      if (y < SNAP) y = 6;
      if (x > sw - w - SNAP) x = sw - w - 6;
      if (y > sh - h - SNAP) y = sh - h - 6;

      this.el.style.left = `${x}px`;
      this.el.style.top = `${y}px`;
      this.el.style.right = 'auto';
      this.el.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.el.style.transition = '';
      this.savePosition();
      if (!this.expanded) {
        window.electronAPI?.setIgnoreMouseEvents(true, { forward: true });
      }
    });
  }

  private expand(): void {
    if (this.expanded) return;
    this.expanded = true;
    this.el.classList.add('fb--expanded');
  }

  private collapse(): void {
    if (!this.expanded) return;
    this.expanded = false;
    this.el.classList.remove('fb--expanded');
  }

  setStatus(status: BubbleStatus): void {
    this.dot.className = 'fb__dot';
    if (status === 'extracting') this.dot.classList.add('fb__dot--busy');
    else if (status === 'error') this.dot.classList.add('fb__dot--error');
    else if (status === 'success') this.dot.classList.add('fb__dot--success');
  }

  private savePosition(): void {
    const rect = this.el.getBoundingClientRect();
    localStorage.setItem('cg:fb-pos', JSON.stringify({ x: rect.left, y: rect.top }));
  }

  private restorePosition(): void {
    const saved = localStorage.getItem('cg:fb-pos');
    if (saved) {
      try {
        const { x, y } = JSON.parse(saved);
        this.el.style.left = `${x}px`;
        this.el.style.top = `${y}px`;
        this.el.style.right = 'auto';
        this.el.style.bottom = 'auto';
      } catch { /* use default position */ }
    }
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.el);
  }

  getElement(): HTMLElement {
    return this.el;
  }
}
