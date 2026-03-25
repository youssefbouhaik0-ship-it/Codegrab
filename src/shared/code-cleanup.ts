import type { CodeGrabResult } from './types.js';

// --- Language detection ---

const LANGUAGE_PATTERNS: Array<{ lang: string; patterns: RegExp[] }> = [
  {
    lang: 'python',
    patterns: [
      /\bdef\s+\w+\s*\(/,
      /\bimport\s+\w+/,
      /\belif\s+/,
      /\bprint\s*\(/,
      /:\s*\n\s{4}/,
    ],
  },
  {
    lang: 'typescript',
    patterns: [
      /\binterface\s+\w+/,
      /:\s*(string|number|boolean|void|any|unknown)\b/,
      /\bconst\s+\w+\s*:\s*\w+/,
      /\b(async|await)\b/,
      /=>/,
    ],
  },
  {
    lang: 'javascript',
    patterns: [
      /\b(const|let|var)\s+\w+\s*=/,
      /\bfunction\s+\w+\s*\(/,
      /\b(require|module\.exports)\b/,
      /=>/,
    ],
  },
  {
    lang: 'java',
    patterns: [
      /\bpublic\s+(class|static|void)\b/,
      /\bSystem\.out\./,
      /@Override\b/,
      /\bprivate\s+\w+\s+\w+\s*;/,
    ],
  },
  {
    lang: 'cpp',
    patterns: [
      /#include\s*[<"]/,
      /\bstd::/,
      /\bint\s+main\s*\(/,
      /->/,
      /::/,
    ],
  },
  {
    lang: 'go',
    patterns: [
      /\bpackage\s+\w+/,
      /\bfunc\s+\w+\s*\(/,
      /\bfmt\./,
      /:=/,
    ],
  },
  {
    lang: 'rust',
    patterns: [
      /\bfn\s+\w+\s*\(/,
      /\blet\s+mut\b/,
      /\bpub\s+fn\b/,
      /\bimpl\s+\w+/,
    ],
  },
  {
    lang: 'css',
    patterns: [
      /\.\w+\s*\{/,
      /#\w+\s*\{/,
      /:\s*(flex|block|grid|none|absolute|relative)\s*;/,
      /\bmargin\s*:/,
    ],
  },
];

function detectLanguage(text: string): string {
  const scores: Record<string, number> = {};

  for (const { lang, patterns } of LANGUAGE_PATTERNS) {
    scores[lang] = patterns.filter((p) => p.test(text)).length;
  }

  const best = Object.entries(scores).sort(([, a], [, b]) => b - a)[0];
  return best && best[1] > 0 ? best[0] : 'text';
}

// --- OCR artifact correction ---

const OCR_SUBSTITUTIONS: Array<[RegExp, string]> = [
  // Common OCR character confusions
  [/(?<=[a-z])\b0\b(?=[a-z])/gi, 'o'],   // 0 → o between letters
  [/\bl\b(?=\d)/g, '1'],                   // l → 1 before digit
  [/(?<=\d)l\b/g, '1'],                    // l → 1 after digit
  [/\|(?=\s*[a-zA-Z_])/g, 'l'],           // | → l before identifier
  [/(?<=\s)\|(?=\s)/g, 'l'],              // isolated | → l

  // Unicode → ASCII normalization
  [/[""]/g, '"'],                          // curly quotes → straight
  [/['']/g, "'"],                          // curly apostrophes → straight
  [/—/g, '--'],                            // em dash → double hyphen
  [/–/g, '-'],                             // en dash → hyphen
  [/…/g, '...'],                           // ellipsis → three dots

  // Symbols OCR confuses with letters (seen in user screenshots)
  [/©/g, 'c'],                             // © → c
  [/®/g, 'R'],                             // ® → R
  [/§/g, 'S'],                             // § → S
  [/¢/g, 'c'],                             // ¢ → c
  [/£(?=\d)/g, 'E'],                       // £ before digit → E (likely E3, E5 etc.)
  [/£/g, 'f'],                             // £ → f (OCR confuses £/f)
  [/¥/g, 'Y'],                             // ¥ → Y
  [/×/g, 'x'],                             // × → x
  [/÷/g, '/'],                             // ÷ → /

  // Clean up non-breaking spaces and zero-width chars
  [/\u00A0/g, ' '],                        // NBSP → space
  [/[\u200B\u200C\u200D\uFEFF]/g, ''],    // zero-width chars → remove
];

function fixOcrArtifacts(text: string): string {
  let result = text;
  for (const [pattern, replacement] of OCR_SUBSTITUTIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Filter out garbage lines that are clearly not code.
 * Removes lines that are obviously browser chrome, UI labels, or OCR noise.
 */
function filterGarbageLines(lines: string[]): string[] {
  return lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed === '') return true; // keep blank lines for structure

    // Skip very short lines that are all symbols/noise
    if (trimmed.length <= 2 && !/^[{}()\[\];]$/.test(trimmed)) {
      // Allow single braces/brackets, filter random chars
      if (/^[^a-zA-Z0-9{}()\[\];:=+\-*/]/.test(trimmed)) return false;
    }

    // Skip lines that are >60% non-ASCII (likely OCR garbage from UI elements)
    const nonAscii = trimmed.replace(/[\x20-\x7E]/g, '').length;
    if (trimmed.length > 5 && nonAscii / trimmed.length > 0.6) return false;

    // Skip obvious browser chrome patterns
    if (/^(https?:\/\/|www\.)/.test(trimmed)) return false;
    if (/^\d+%\s*(complete|loaded|done)/i.test(trimmed)) return false;

    return true;
  });
}

// --- IDE line-number region extraction ---

/**
 * Detect IDE-style line numbers and extract ONLY the code region they bound.
 * 
 * The OCR output often contains garbage from browser chrome, tabs, and other
 * UI elements above and below the actual code. Line numbers (1, 2, 3…) in the
 * left margin let us identify exactly where the code starts and ends.
 * 
 * Strategy:
 * 1. Find all lines that start with a number (e.g., "  1 from openai…")
 * 2. Find the longest run of roughly consecutive numbers
 * 3. Keep only those lines, strip the line numbers
 * 4. Discard everything outside that region
 */
function stripLineNumbers(lines: string[]): string[] {
  // Pattern: optional whitespace, 1-5 digits, optional separator, then content
  const lineNumPattern = /^(\s*(\d{1,5})\s*[|:.│┃]?\s)(.*)/;

  // Tag each line with its detected number (if any)
  const tagged = lines.map((line) => {
    const match = line.match(lineNumPattern);
    if (!match) return { line, num: -1, content: line };
    return { line, num: parseInt(match[2], 10), content: match[3] };
  });

  // Find runs of roughly consecutive numbered lines
  // (numbers should increase, gaps of 1-2 are OK — OCR can miss a line)
  let bestRunStart = -1;
  let bestRunEnd = -1;
  let bestRunLen = 0;

  let currentStart = -1;
  let lastNum = -1;

  for (let i = 0; i < tagged.length; i++) {
    const { num } = tagged[i];
    if (num < 0) continue; // skip non-numbered lines

    if (lastNum < 0 || (num > lastNum && num - lastNum <= 3)) {
      // Continue or start a run
      if (currentStart < 0) currentStart = i;
      lastNum = num;

      const runLen = i - currentStart + 1;
      if (runLen > bestRunLen) {
        bestRunStart = currentStart;
        bestRunEnd = i;
        bestRunLen = runLen;
      }
    } else {
      // Break — start a new run
      currentStart = i;
      lastNum = num;
    }
  }

  // Need at least 3 numbered lines to be confident it's real code
  if (bestRunLen < 3) {
    // Fall back to simple stripping if most lines have numbers
    const nonEmpty = lines.filter((l) => l.trim() !== '');
    const matchCount = nonEmpty.filter((l) => /^\s*\d{1,5}\s*[|:.│┃]?\s/.test(l)).length;
    if (nonEmpty.length >= 2 && matchCount / nonEmpty.length >= 0.6) {
      return lines.map((l) => {
        const m = l.match(/^(\s*\d{1,5}\s*[|:.│┃]?\s)/);
        return m ? l.slice(m[1].length) : l;
      });
    }
    return lines;
  }

  // Extract only the code region, stripping line numbers
  const result: string[] = [];
  for (let i = bestRunStart; i <= bestRunEnd; i++) {
    result.push(tagged[i].content);
  }
  return result;
}

// --- Line cleanup ---

function cleanLines(lines: string[]): string[] {
  return lines
    .map((line) => {
      // Remove trailing whitespace
      let cleaned = line.trimEnd();
      // Remove non-printable characters except tab
      cleaned = cleaned.replace(/[^\x09\x20-\x7E\u00A0-\uFFFF]/g, '');
      return cleaned;
    })
    .filter((line, i, arr) => {
      // Collapse more than 2 consecutive empty lines into 1
      if (line === '') {
        const prev = arr[i - 1];
        const prevPrev = arr[i - 2];
        if (prev === '' && prevPrev === '') return false;
      }
      return true;
    });
}

// --- Indentation normalization ---

function normalizeIndentation(lines: string[]): string[] {
  // Detect if tabs or spaces are used, normalize
  const spaceCounts = lines
    .filter((l) => l.match(/^ +/))
    .map((l) => l.match(/^ +/)![0].length);

  if (spaceCounts.length === 0) return lines;

  // Find the minimum non-zero indentation unit
  const minIndent = spaceCounts.reduce((min, n) => (n > 0 && n < min ? n : min), 8);
  const unit = minIndent <= 2 ? 2 : minIndent <= 4 ? 4 : minIndent;

  // If indentation unit is already standard (2 or 4), leave it
  if (unit === 2 || unit === 4) return lines;

  // Normalize to 2-space indentation
  return lines.map((line) => {
    const match = line.match(/^( +)(.*)/);
    if (!match) return line;
    const spaces = match[1].length;
    const normalized = Math.round(spaces / unit) * 2;
    return ' '.repeat(normalized) + match[2];
  });
}

// --- Main export ---

export function cleanCode(rawOcrText: string): CodeGrabResult {
  // Fix OCR artifacts
  let text = fixOcrArtifacts(rawOcrText);

  // Split into lines and clean
  let lines = text.split(/\r?\n/);
  lines = cleanLines(lines);
  lines = filterGarbageLines(lines);
  lines = stripLineNumbers(lines);
  lines = normalizeIndentation(lines);

  // Remove leading/trailing empty lines
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

  const code = lines.join('\n');
  const language = detectLanguage(code);
  const lineCount = lines.filter((l) => l.trim() !== '').length;

  return { code, language, lineCount };
}
