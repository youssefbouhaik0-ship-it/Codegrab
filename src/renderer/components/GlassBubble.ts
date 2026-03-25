export interface GlassBubbleOptions {
  title?: string;
  content: HTMLElement | string;
  position?: 'bottom-right';
}

export class GlassBubble {
  protected el: HTMLElement;
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;
  private isHovered = false;

  constructor(options: GlassBubbleOptions) {
    this.el = this.buildDOM(options);
    this.attachHoverListeners();
  }

  private buildDOM(options: GlassBubbleOptions): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'glass-bubble glass-bubble--entering';

    if (options.title) {
      const title = document.createElement('div');
      title.className = 'glass-bubble__title';
      title.textContent = options.title;
      wrapper.appendChild(title);
    }

    if (typeof options.content === 'string') {
      const p = document.createElement('p');
      p.style.fontSize = '13px';
      p.style.color = 'var(--text-secondary)';
      p.style.lineHeight = '1.4';
      p.textContent = options.content;
      wrapper.appendChild(p);
    } else {
      wrapper.appendChild(options.content);
    }

    return wrapper;
  }

  private attachHoverListeners(): void {
    this.el.addEventListener('mouseenter', () => {
      this.isHovered = true;
      // Make the overlay window interactive when hovering a bubble
      window.electronAPI?.setIgnoreMouseEvents(false);
      // Pause auto-dismiss timer
      if (this.dismissTimer !== null) {
        clearTimeout(this.dismissTimer);
        this.dismissTimer = null;
      }
    });

    this.el.addEventListener('mouseleave', () => {
      this.isHovered = false;
      // Restore click-through on transparent areas
      window.electronAPI?.setIgnoreMouseEvents(true, { forward: true });
    });
  }

  show(container: HTMLElement): void {
    container.appendChild(this.el);
    // Trigger reflow so entering animation plays
    void this.el.offsetHeight;
  }

  hide(): void {
    if (!this.el.parentNode) return;

    this.el.classList.remove('glass-bubble--entering');
    this.el.classList.add('glass-bubble--exiting');

    const onEnd = () => {
      this.el.removeEventListener('animationend', onEnd);
      this.el.parentNode?.removeChild(this.el);
    };
    this.el.addEventListener('animationend', onEnd);

    // Restore click-through after removal
    if (this.isHovered) {
      window.electronAPI?.setIgnoreMouseEvents(true, { forward: true });
    }
  }

  autoDismiss(ms = 4000): void {
    if (this.dismissTimer !== null) clearTimeout(this.dismissTimer);
    this.dismissTimer = setTimeout(() => {
      if (!this.isHovered) {
        this.hide();
      } else {
        // User is hovering — check again when they leave
        const onLeave = () => {
          this.el.removeEventListener('mouseleave', onLeave);
          this.autoDismiss(1500);
        };
        this.el.addEventListener('mouseleave', onLeave);
      }
    }, ms);
  }

  getElement(): HTMLElement {
    return this.el;
  }
}
