export type ToastVariant = 'success' | 'error' | 'loading';

export class StatusToast {
  private el: HTMLElement;
  private container: HTMLElement | null = null;
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(variant: ToastVariant, message: string, detail?: string) {
    this.el = this.buildDOM(variant, message, detail);
  }

  private buildDOM(variant: ToastVariant, message: string, detail?: string): HTMLElement {
    const toast = document.createElement('div');
    toast.className = `glass-toast glass-toast--${variant} glass-toast--entering`;

    // Icon slot
    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'glass-toast__icon';
    iconWrapper.innerHTML = this.getIcon(variant);
    toast.appendChild(iconWrapper);

    // Body
    const body = document.createElement('div');
    body.className = 'glass-toast__body';

    const title = document.createElement('p');
    title.className = 'glass-toast__title';
    title.textContent = message;
    body.appendChild(title);

    if (detail) {
      const detailEl = document.createElement('p');
      detailEl.className = 'glass-toast__detail';
      detailEl.textContent = detail;
      body.appendChild(detailEl);
    }

    toast.appendChild(body);
    return toast;
  }

  private getIcon(variant: ToastVariant): string {
    switch (variant) {
      case 'success':
        // Checkmark circle — inline SVG, no icon library
        return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="9" cy="9" r="8" stroke="#7af5ca" stroke-width="1.5"/>
          <path d="M5.5 9L7.5 11L12.5 6.5" stroke="#7af5ca" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
      case 'error':
        // X circle
        return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="9" cy="9" r="8" stroke="#ff6b6b" stroke-width="1.5"/>
          <path d="M6.5 6.5L11.5 11.5M11.5 6.5L6.5 11.5" stroke="#ff6b6b" stroke-width="1.5" stroke-linecap="round"/>
        </svg>`;
      case 'loading':
        // CSS spinner div (not SVG)
        return `<div class="glass-spinner"></div>`;
    }
  }

  show(container: HTMLElement): void {
    this.container = container;
    container.appendChild(this.el);
    // Trigger reflow
    void this.el.offsetHeight;

    // Auto-dismiss: success/error after 3s, loading stays until replaced
    if (this.el.classList.contains('glass-toast--success') ||
        this.el.classList.contains('glass-toast--error')) {
      this.autoDismiss(3000);
    }
  }

  hide(): void {
    if (!this.el.parentNode) return;
    if (this.dismissTimer !== null) clearTimeout(this.dismissTimer);

    this.el.classList.remove('glass-toast--entering');
    this.el.classList.add('glass-toast--exiting');

    const onEnd = () => {
      this.el.removeEventListener('animationend', onEnd);
      this.el.parentNode?.removeChild(this.el);
    };
    this.el.addEventListener('animationend', onEnd);
  }

  autoDismiss(ms: number): void {
    if (this.dismissTimer !== null) clearTimeout(this.dismissTimer);
    this.dismissTimer = setTimeout(() => this.hide(), ms);
  }

  replace(variant: ToastVariant, message: string, detail?: string): void {
    const next = new StatusToast(variant, message, detail);
    if (this.container) {
      this.hide();
      setTimeout(() => {
        if (this.container) next.show(this.container);
      }, 100);
    }
  }
}
