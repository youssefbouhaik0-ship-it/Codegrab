export class Onboarding {
  private el: HTMLElement;
  private launchOnStartup = false;

  constructor() {
    this.el = this.buildDOM();
  }

  private buildDOM(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'onboarding';

    wrapper.innerHTML = `
      <div class="onboarding__card">
        <div class="onboarding__logo">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
        </div>
        <h1 class="onboarding__title">Welcome to CodeGrab</h1>
        <p class="onboarding__subtitle">Instantly grab code from any window. No screen recording.</p>

        <div class="onboarding__steps">
          <div class="onboarding__step">
            <div class="onboarding__step-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
            </div>
            <div class="onboarding__step-text">
              <div class="onboarding__step-title">Open any window with code</div>
              <div class="onboarding__step-desc">Browser, editor, terminal — we detect it automatically</div>
            </div>
          </div>

          <div class="onboarding__step">
            <div class="onboarding__step-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
            </div>
            <div class="onboarding__step-text">
              <div class="onboarding__step-title">We read it instantly</div>
              <div class="onboarding__step-desc">Smart extraction reads code directly — no screen recording needed</div>
            </div>
          </div>

          <div class="onboarding__step">
            <div class="onboarding__step-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                <polyline points="9 14 11 16 15 12"></polyline>
              </svg>
            </div>
            <div class="onboarding__step-text">
              <div class="onboarding__step-title">Copied to your clipboard</div>
              <div class="onboarding__step-desc">Clean, formatted code ready to paste anywhere</div>
            </div>
          </div>
        </div>

        <div class="onboarding__toggle">
          <span class="onboarding__toggle-label">Launch on startup</span>
          <button class="onboarding__switch" data-role="startup-toggle">
            <div class="onboarding__switch-knob"></div>
          </button>
        </div>

        <button class="onboarding__cta" data-role="get-started">Get Started</button>
      </div>
    `;

    // Startup toggle
    const toggle = wrapper.querySelector('[data-role="startup-toggle"]') as HTMLButtonElement;
    toggle.addEventListener('click', () => {
      this.launchOnStartup = !this.launchOnStartup;
      toggle.classList.toggle('onboarding__switch--active', this.launchOnStartup);
      window.electronAPI?.setLoginItem(this.launchOnStartup);
    });

    // Get Started
    const cta = wrapper.querySelector('[data-role="get-started"]') as HTMLButtonElement;
    cta.addEventListener('click', () => {
      localStorage.setItem('cg:onboarded', 'true');
      this.dismiss();
    });

    return wrapper;
  }

  private dismiss(): void {
    this.el.classList.add('onboarding--exiting');
    const onEnd = () => {
      this.el.removeEventListener('animationend', onEnd);
      this.el.parentNode?.removeChild(this.el);
      this.el.dispatchEvent(new CustomEvent('codegrab:onboarded', { bubbles: true }));
    };
    this.el.addEventListener('animationend', onEnd);
    // Also fire the event in case animation doesn't trigger
    setTimeout(() => {
      if (this.el.parentNode) {
        this.el.parentNode.removeChild(this.el);
      }
      document.dispatchEvent(new CustomEvent('codegrab:onboarded'));
    }, 500);
  }

  show(container: HTMLElement): void {
    // Onboarding needs mouse interaction — disable click-through
    window.electronAPI?.setIgnoreMouseEvents(false);
    container.appendChild(this.el);
  }

  static isCompleted(): boolean {
    return localStorage.getItem('cg:onboarded') === 'true';
  }
}
