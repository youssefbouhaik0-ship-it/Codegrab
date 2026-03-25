export interface CodeDisplayOptions {
  code: string;
  language: string;
  lineCount: number;
  source?: 'browser' | 'accessibility' | 'ocr';
  appName?: string;
  windowTitle?: string;
  analysis?: {
    cleaned_code: string;
    language: string;
    simple_explanation: string;
    placement_warning: string | null;
    missing_context: string[];
  };
}

// ── Lightweight regex-based syntax highlighter ──────────────────────────────

const KEYWORDS: Record<string, string[]> = {
  python: [
    'False','None','True','and','as','assert','async','await',
    'break','class','continue','def','del','elif','else','except',
    'finally','for','from','global','if','import','in','is',
    'lambda','nonlocal','not','or','pass','raise','return','try',
    'while','with','yield',
  ],
  javascript: [
    'async','await','break','case','catch','class','const','continue',
    'debugger','default','delete','do','else','export','extends',
    'false','finally','for','function','if','import','in','instanceof',
    'let','new','null','of','return','static','super','switch','this',
    'throw','true','try','typeof','undefined','var','void','while','with','yield',
  ],
  typescript: [
    'async','await','break','case','catch','class','const','continue',
    'declare','default','delete','do','else','enum','export','extends',
    'false','finally','for','function','if','implements','import','in',
    'instanceof','interface','let','namespace','new','null','of','readonly',
    'return','static','super','switch','this','throw','true','try','type',
    'typeof','undefined','var','void','while','with','yield',
    'any','string','number','boolean','never','unknown','object',
  ],
  java: [
    'abstract','assert','boolean','break','byte','case','catch','char',
    'class','const','continue','default','do','double','else','enum',
    'extends','false','final','finally','float','for','if','implements',
    'import','instanceof','int','interface','long','native','new','null',
    'package','private','protected','public','return','short','static',
    'super','switch','synchronized','this','throw','throws','true','try',
    'void','volatile','while',
  ],
  cpp: [
    'auto','bool','break','case','catch','char','class','const',
    'continue','default','delete','do','double','else','enum','explicit',
    'extern','false','float','for','friend','goto','if','inline','int',
    'long','namespace','new','nullptr','operator','private','protected',
    'public','return','short','signed','sizeof','static','struct',
    'switch','template','this','throw','true','try','typedef','typename',
    'union','unsigned','using','virtual','void','volatile','while',
  ],
  go: [
    'break','case','chan','const','continue','default','defer','else',
    'fallthrough','for','func','go','goto','if','import','interface',
    'map','package','range','return','select','struct','switch','type','var',
    'true','false','nil',
  ],
  rust: [
    'as','async','await','break','const','continue','crate','dyn','else',
    'enum','extern','false','fn','for','if','impl','in','let','loop',
    'match','mod','move','mut','pub','ref','return','self','Self',
    'static','struct','super','trait','true','type','union','unsafe',
    'use','where','while',
  ],
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function syntaxHighlight(raw: string, lang: string): string {
  const kws = KEYWORDS[lang] ?? [];
  const kwPattern = kws.length
    ? `|\\b(${kws.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`
    : '';

  const pattern = new RegExp(
    `(\\/\\/[^\\n]*|#[^\\n]*)` +
    `|(\\/\\*[\\s\\S]*?\\*\\/)` +
    `|("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`)` +
    `|\\b(\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b` +
    kwPattern,
    'g',
  );

  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(raw)) !== null) {
    result += esc(raw.slice(lastIndex, match.index));
    const [full, lineComment, blockComment, str, num, keyword] = match;

    if (lineComment !== undefined || blockComment !== undefined) {
      result += `<span class="hl-comment">${esc(full)}</span>`;
    } else if (str !== undefined) {
      result += `<span class="hl-string">${esc(full)}</span>`;
    } else if (num !== undefined) {
      result += `<span class="hl-number">${esc(full)}</span>`;
    } else if (keyword !== undefined) {
      result += `<span class="hl-keyword">${esc(full)}</span>`;
    } else {
      result += esc(full);
    }
    lastIndex = match.index + full.length;
  }

  result += esc(raw.slice(lastIndex));
  return result;
}

// ── CodeDisplay ─────────────────────────────────────────────────────────────

export class CodeDisplay {
  private el: HTMLElement;
  private preEl: HTMLPreElement;
  private titleEl: HTMLElement;
  private metaEl: HTMLElement;
  private sourceEl: HTMLElement;
  private explanationEl: HTMLElement;
  private warningEl: HTMLElement;
  private contextEl: HTMLElement;
  private latestCode = '';

  constructor(options: CodeDisplayOptions) {
    this.el = document.createElement('div');
    this.el.className = 'code-panel';

    this.titleEl = document.createElement('div');
    this.titleEl.className = 'code-panel__title';

    this.metaEl = document.createElement('div');
    this.metaEl.className = 'code-panel__meta';

    this.sourceEl = document.createElement('span');
    this.sourceEl.className = 'code-panel__source-badge';

    this.preEl = document.createElement('pre');
    this.preEl.className = 'glass-code';

    this.explanationEl = document.createElement('div');
    this.explanationEl.className = 'code-panel__explanation';

    this.warningEl = document.createElement('div');
    this.warningEl.className = 'code-panel__warning';

    this.contextEl = document.createElement('div');
    this.contextEl.className = 'code-panel__context-pills';

    // Build structure
    const header = document.createElement('div');
    header.className = 'code-panel__header';

    const titleWrap = document.createElement('div');
    titleWrap.appendChild(this.titleEl);
    titleWrap.appendChild(this.metaEl);
    header.appendChild(titleWrap);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'code-panel__close';
    closeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    closeBtn.addEventListener('click', () => this.hide());
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'code-panel__body';
    body.appendChild(this.preEl);
    body.appendChild(this.explanationEl);
    body.appendChild(this.warningEl);
    body.appendChild(this.contextEl);

    const footer = document.createElement('div');
    footer.className = 'code-panel__footer';
    footer.appendChild(this.sourceEl);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'code-panel__copy';
    copyBtn.textContent = 'Copy to clipboard';
    copyBtn.addEventListener('click', () => {
      window.electronAPI?.setClipboard(this.latestCode);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy to clipboard'; }, 1500);
    });
    footer.appendChild(copyBtn);

    this.el.appendChild(header);
    this.el.appendChild(body);
    this.el.appendChild(footer);

    this.applyOptions(options);
  }

  private applyOptions(options: CodeDisplayOptions): void {
    this.latestCode = options.code;

    const langLabel = options.language !== 'text' ? options.language : 'plain text';
    this.titleEl.textContent =
      `${options.lineCount} line${options.lineCount !== 1 ? 's' : ''} of ${langLabel}`;

    if (options.windowTitle || options.appName) {
      const parts = [options.windowTitle, options.appName].filter(Boolean);
      this.metaEl.textContent = parts.join(' — ');
      this.metaEl.style.display = '';
    } else {
      this.metaEl.style.display = 'none';
    }

    if (options.source) {
      const labels: Record<string, string> = {
        browser: 'DOM',
        accessibility: 'A11Y',
        ocr: 'OCR',
      };
      this.sourceEl.textContent = labels[options.source] || options.source;
      this.sourceEl.style.display = '';
    } else {
      this.sourceEl.style.display = 'none';
    }

    this.preEl.innerHTML = syntaxHighlight(options.code, options.language);

    // ── Analysis insights ───────────────────────────────────────────────
    if (options.analysis) {
      const { simple_explanation, placement_warning, missing_context } = options.analysis;

      if (simple_explanation) {
        this.explanationEl.textContent = simple_explanation;
        this.explanationEl.style.display = '';
      } else {
        this.explanationEl.style.display = 'none';
      }

      if (placement_warning) {
        this.warningEl.innerHTML = `<span class="code-panel__warning-icon">⚠️</span> ${this.escHtml(placement_warning)}`;
        this.warningEl.style.display = '';
      } else {
        this.warningEl.style.display = 'none';
      }

      if (missing_context && missing_context.length > 0) {
        this.contextEl.innerHTML =
          '<span class="code-panel__context-label">Missing:</span> ' +
          missing_context
            .map((item) => `<span class="code-panel__context-pill">${this.escHtml(item)}</span>`)
            .join('');
        this.contextEl.style.display = '';
      } else {
        this.contextEl.style.display = 'none';
      }
    } else {
      this.explanationEl.style.display = 'none';
      this.warningEl.style.display = 'none';
      this.contextEl.style.display = 'none';
    }
  }

  private escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  update(options: CodeDisplayOptions): void {
    this.applyOptions(options);
  }

  show(container: HTMLElement): void {
    container.appendChild(this.el);
    void this.el.offsetHeight;
  }

  hide(): void {
    if (!this.el.parentNode) return;
    this.el.classList.add('code-panel--exiting');
    const onEnd = () => {
      this.el.removeEventListener('animationend', onEnd);
      this.el.parentNode?.removeChild(this.el);
    };
    this.el.addEventListener('animationend', onEnd);
  }

  getElement(): HTMLElement {
    return this.el;
  }
}
