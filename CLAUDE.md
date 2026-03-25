# CLAUDE.md — Project Instructions for Claude Code

## Project: CodeGrab Overlay

A desktop overlay app with Cluely-style glassmorphism UI that captures code from screen and copies to clipboard.

## Read Order (MANDATORY)

Before writing ANY code, read these files in order:

1. `MASTER_PROMPT.md` — Vision, architecture, principles
2. `skills/glassmorphism-overlay/SKILL.md` — Technical reference for Electron transparent windows + CSS glassmorphism
3. `TASK.md` — Step-by-step build plan with checkboxes

## Key Constraints

- **NO React, Vue, or UI frameworks** — vanilla TypeScript + CSS only
- **NO icon libraries** — use inline SVG for the 2-3 icons needed
- **NO syntax highlighting libraries** — build a simple regex-based highlighter
- **NO API calls in the critical path** — Tesseract.js runs locally
- **Target macOS first**, Windows second, Linux stretch goal
- **Every UI element must be translucent** — if you write `background: #xxx` without alpha, you broke the design

## CSS Rules (from SKILL.md)

The glassmorphism effect requires:
```css
backdrop-filter: blur(20px);
-webkit-backdrop-filter: blur(20px);
background: rgba(255, 255, 255, 0.06);
border: 1px solid rgba(255, 255, 255, 0.12);
border-radius: 16px;
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
```

Plus a `::before` pseudo-element for the top-edge light highlight:
```css
.element::before {
  content: '';
  position: absolute;
  top: 0; left: 10%; right: 10%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent);
}
```

## Electron Window Config (from SKILL.md)

The overlay window MUST have ALL of these:
```typescript
{
  transparent: true,
  frame: false,
  alwaysOnTop: true,
  skipTaskbar: true,
  hasShadow: false,
  focusable: false,
  type: 'panel',  // macOS only
}
```

Plus: `win.setIgnoreMouseEvents(true, { forward: true })` for click-through.

## Testing

After each phase, verify:
1. **Phase 1**: App launches invisibly, desktop clicks pass through, hotkey logs to console
2. **Phase 2**: Glass bubbles render with blur, animations are smooth, hover enables interaction
3. **Phase 3**: Hotkey → screen capture → OCR → clipboard → glass bubble shows result
4. **Phase 4**: Edge cases handled, <50MB RAM idle, builds for macOS/Windows

## File Naming

- TypeScript files: `kebab-case.ts`
- CSS files: `kebab-case.css`
- Components: `PascalCase.ts` (class name matches file name)
- Exports: named exports, no default exports
