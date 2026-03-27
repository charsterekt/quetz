# Quetz TUI v2 — Implementation Specification

> **Status:** Draft — 2026-03-25
> **Design reference:** `quetz.pen` (5 screen states)
> **Target version:** 0.6.0

---

## 1. Goals

- Replace Ink v5 with Rezi (`@rezi-ui/core`) for a flicker-free TUI
- Implement the design in `quetz.pen` exactly: block-pixel logo, animated snake, split right panel, session detail view, victory/failure cards
- Preserve `QuetzBus` event architecture unchanged — `loop.ts`, `agent.ts`, `events.ts` are untouched
- Remove `ink`, `react`, `@types/react`, `ink-testing-library`; add `@rezi-ui/core`, `@rezi-ui/node`, `@rezi-ui/jsx`

## 2. Non-Goals

- No changes to loop, agent, beads, git, or github modules
- No new TUI features beyond what's in the design
- No mouse input
- No accessibility layer

---

## 3. Framework Decision

**Rezi (`@rezi-ui/core` v0.1.0-alpha.60), pinned.** No React runtime.

Ink v5 erases N lines and rewrites the full component tree on every state change. Rezi routes rendering through a native C engine (Zireael) that maintains a framebuffer, diffs it, and emits only changed ANSI cell sequences. Same-state renders produce zero output.

```bash
npm install @rezi-ui/core @rezi-ui/node @rezi-ui/jsx
```

Pin to exact versions — no `^` or `~`. Pre-alpha breaks semver.

**Rejected alternatives:** Ink v6 (still line-level diff, React 19 required), react-blessed (abandoned 2021), terminal-kit (no TS), react-curse (182 stars, solo maintainer), terminosaurus (node-pty overhead), custom ANSI renderer (second project).

---

## 4. Design System

### 4.1 Colors

All hex values taken directly from `quetz.pen`. Two distinct greens: `#0DBC79` is logo-only; `#10B981` is all other brand elements.

| Token | Hex | Usage |
|---|---|---|
| `bg` | `#0A0A0A` | Canvas / full-screen background |
| `surface` | `#0F0F0F` | Header, footer, panel title bars |
| `surface2` | `#0D0D0D` | Session detail info bar |
| `border` | `#2a2a2a` | Dividers, panel borders, scrollbar separators |
| `logo` | `#0DBC79` | Block-pixel QUETZ logo only |
| `brand` | `#10B981` | Snake head, ✓ icons, ▶ cursor, success states |
| `accent` | `#F59E0B` | Issue counter, PR polling phase, victory card border, `bg:` status |
| `cyan` | `#06B6D4` | Tool call lines, panel headers, PICKUP log entries, `[ viewing session ]` |
| `agent` | `#A855F7` | Agent title bar text (all text on that row) |
| `error` | `#EF4444` | Failure states, ✗ icons, failure card border |
| `text` | `#FAFAFA` | Primary agent output text |
| `dim` | `#6B7280` | Secondary labels, unselected session rows, dots, keybinding hints |
| `muted` | `#4B5563` | Subtitle text, bash output lines, breadcrumb, dim separators |
| `scrollbar-track` | `#141414` | Scrollbar background |
| `scrollbar-thumb` | `#3F3F3F` | Scrollbar thumb |
| `failure-dark` | `#3F1515` | Failure card dividers + ASCII art tail |

### 4.2 Typography

- **Primary monospace:** JetBrains Mono — all tool lines, log entries, UI chrome
- **Secondary:** IBM Plex Mono — header subtitle, card subtitles, agent prose text in session detail, `run quetz again…` lines
- All spacing in character cells. Pixel sizes are design reference only.

### 4.3 Chalk Mapping

```typescript
// src/ui/theme.ts
import chalk from 'chalk';

export const c = {
  logo:    chalk.hex('#0DBC79'),
  brand:   chalk.hex('#10B981'),
  accent:  chalk.hex('#F59E0B'),
  cyan:    chalk.hex('#06B6D4'),
  agent:   chalk.hex('#A855F7'),
  error:   chalk.hex('#EF4444'),
  text:    chalk.hex('#FAFAFA'),
  dim:     chalk.hex('#6B7280'),
  muted:   chalk.hex('#4B5563'),
  border:  chalk.hex('#2a2a2a'),
  failDark: chalk.hex('#3F1515'),
  sbTrack: chalk.hex('#141414'),
  sbThumb: chalk.hex('#3F3F3F'),
};
```

---

## 5. Layout Architecture

### 5.1 Zone Map (Screens 1 & 2)

```
┌──────────────────────────────────────────────────────────┐  row 0
│  HEADER  (~17 rows): block-pixel logo + snake + counter  │
├────────────────────────────────────┬─────────────────────┤  row ~17
│  AGENT TITLE BAR  (2 rows)         │                     │
├────────────────────────────────────┤  SESSIONS PANEL     │
│                                    │  220px / ~11 rows   │
│  AGENT PANEL (scrollable)          ├─────────────────────┤
│  fill width, fill height           │  ──── 1px divider   │
│                                    │  QUETZ LOG (scroll) │
│   content │ 6px scrollbar          │  fill height        │
│                                    │  content │ 6px sb   │
├────────────────────────────────────┴─────────────────────┤  row n-1
│  FOOTER  (2 rows)                                        │
└──────────────────────────────────────────────────────────┘  row n
```

### 5.2 Zone Map (Screen 5 — Session Detail)

```
┌──────────────────────────────────────────────────────────┐  row 0
│  HEADER  (~17 rows): logo + [ viewing session ] + bg:    │
├──────────────────────────────────────────────────────────┤
│  INFO BAR  (3 rows): ← esc / sessions / title   meta    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  SESSION LOG (scrollable, full width)                    │
│  content (padding 32px)           │ 6px scrollbar        │
│                                                          │
├──────────────────────────────────────────────────────────┤  row n-1
│  FOOTER  (2 rows)                                        │
└──────────────────────────────────────────────────────────┘  row n
```

### 5.3 Dimensions

```typescript
interface Layout {
  termRows: number;   // process.stdout.rows
  termCols: number;   // process.stdout.columns

  // Header: 16 logo lines + 1 subtitle = 17 content rows + padding
  headerRows: number;   // 17 (logo) + 2 (padding) = ~19 rows at typical font

  footerRows: 2;
  agentTitleRows: 2;
  infoBarRows: 3;       // Screen 5 only

  bodyRows: number;     // termRows - headerRows - footerRows

  // Right column (screens 1 & 2 only)
  rightCols: number;    // 380/1440 ≈ 26% → max(36, Math.round(termCols * 0.26))
  agentCols: number;    // termCols - rightCols - 1  (1 for right border)

  // Right column split
  sessionsRows: number; // 220/900 ≈ 24% → Math.round(bodyRows * 0.24)
  logRows: number;      // bodyRows - sessionsRows - agentTitleRows

  // Scrollbar
  scrollbarCols: 1;     // always 1 character wide
}
```

### 5.4 Victory & Failure Screens (Screens 3 & 4)

Header and footer present. Body replaced with a horizontally + vertically centered card. Card width: `Math.round(termCols * 0.49)` (700/1440 in design). Right panel hidden.

---

## 6. Screen State Machine

```typescript
type ScreenMode = 'running' | 'polling' | 'session_detail' | 'victory' | 'failure';

interface AppState {
  mode: ScreenMode;

  // Header
  issueCount: { current: number; total: number };
  snakeFrame: number;          // 0–3, cycles every 150ms
  phase: QuetzPhase;

  // Agent panel (screens 1 & 2)
  agentIssueId: string;
  agentModel: string;
  agentLines: AgentLine[];
  agentScrollOffset: number;
  agentAutoScroll: boolean;
  sessionComplete: SessionCompleteState | null;  // non-null → Screen 2 summary

  // Sessions panel (right top)
  completedSessions: CompletedSession[];
  selectedSessionIdx: number;
  sessionsScrollOffset: number;

  // Quetz log panel (right bottom)
  logLines: LogLine[];
  logScrollOffset: number;

  // Footer
  issueId: string;
  prNumber: number | null;
  elapsed: string;

  // Session detail (Screen 5)
  viewingSession: CompletedSession | null;
  sessionLogScrollOffset: number;

  // Overlays
  victoryData: VictoryData | null;
  failureData: FailureData | null;
}

interface AgentLine {
  type: 'text' | 'tool';
  content: string;
  toolName?: string;  // 'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'
}

interface LogLine {
  icon: string;     // '▶' '→' '·' '✓' '🔍' '⏳'
  color: string;    // hex
  text: string;
}

interface CompletedSession {
  id: string;           // "bd-a1b2"
  title: string;        // "add auth middleware"
  prNumber?: number;    // 38
  duration: string;     // "14m 06s"
  outcome: 'merged' | 'failed';
  lines: SessionLine[]; // full log for Session Detail view
}

// SessionLine types:
//   'prose'          — agent text output, IBM Plex Mono, #FAFAFA
//   'tool'           — ▸ ToolName   args, JetBrains Mono, #06B6D4
//   'bash-output'    — indented shell output, JetBrains Mono, #4B5563
//   'success-output' — ✓ PASS / test counts, JetBrains Mono, #10B981
//   'pr-line'        — gh pr create / bd close final lines, JetBrains Mono 11px, #10B981
//   'spacer'         — empty frame, height in px (10px or 16px between groups)
//   'divider'        — separator line, JetBrains Mono 10px, #2a2a2a
//   'summary'        — ✓ session ... | merged, JetBrains Mono 11px bold, #F59E0B
interface SessionLine {
  type: 'prose' | 'tool' | 'bash-output' | 'success-output' | 'pr-line' | 'spacer' | 'divider' | 'summary';
  content?: string;
  toolName?: string;
  height?: number;  // spacer only
}
```

---

## 7. Screen Specifications

### 7.1 Header (all screens)

**Background:** `#0F0F0F`. **Border:** bottom 1px `#2a2a2a`. **Height:** ~160px (screens 1–2), ~144px (screens 3–5). **Padding:** 24px horizontal. `space-between`.

#### Block-pixel QUETZ logo

Stored as a constant in `src/ui/logo.ts`. All 16 lines color `#0DBC79`, JetBrains Mono, font-size 6, `lineHeight: 1`. Rendered as consecutive text rows with zero gap.

```typescript
// src/ui/logo.ts
export const LOGO_LINES = [
  '████████████████████████░░',
  '████████████████████████░░',
  '████████░░      ████████░░                                                              ████████░░',
  '████████░░      ████████░░                                                              ████████░░',
  '████████░░      ████████░░  ████████░░      ████████░░  ████████████████████████░░  ████████████████████░░  ████████████████████████░░',
  '████████░░      ████████░░  ████████░░      ████████░░  ████████████████████████░░  ████████████████████░░  ████████████████████████░░',
  '████████░░      ████████░░  ████████░░      ████████░░  ████████░░      ████████░░      ████████░░                      ████████░░',
  '████████░░      ████████░░  ████████░░      ████████░░  ████████░░      ████████░░      ████████░░                      ████████░░',
  '████████░░      ████████░░  ████████░░      ████████░░  ████████████████████████░░      ████████░░                  ████████░░',
  '████████░░      ████████░░  ████████░░      ████████░░  ████████████████████████░░      ████████░░                  ████████░░',
  '████████████████████████░░  ████████░░      ████████░░  ████████░░                      ████████░░              ████████░░',
  '████████████████████████░░  ████████░░      ████████░░  ████████░░                      ████████░░              ████████░░',
  '████████████████████████░░  ████████████████████████░░  ████████████████████████░░      ████████████████░░  ████████████████████████░░',
  '████████████████████████░░  ████████████████████████░░  ████████████████████████░░      ████████████████░░  ████████████████████████░░',
  '        ████████░░',
  '        ████████░░',
];
export const LOGO_SUBTITLE = '  the feathered serpent dev loop v0.1.0';
// subtitle color: #4B5563, IBM Plex Mono 10px
```

Left column has top padding 18px (screens 1–2) or 14px + left 12px (screens 3–5).

#### Right column — snake + counter (screens 1–4)

Stacked vertically, right-aligned, `gap: 6`:

**Row 1 — snake bar (horizontal flex, no gap):**
- Head: `~*~*~*~>` — `#10B981`, JetBrains Mono 12px
- Dots: `·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·` — `#6B7280`, JetBrains Mono 12px

**Row 2 — counter:** `3/14` — `#F59E0B`, JetBrains Mono 13px, bold 700

Snake animation: cycle prefix every 150ms, 4 frames:
```
frame 0: ~*~*~*~>
frame 1: *~*~*~>~
frame 2: ~*~*~>~*
frame 3: *~*~>~*~
```

Dots: one `·` per remaining issue, double-space-separated: `·  ·  ·  ·`

**State variants:**

| Screen | Snake | Dots | Counter |
|---|---|---|---|
| 1 running | `~*~*~*~>` brand, animated | dim, `total−current` dots | `3/14` accent bold |
| 2 polling | same | same | `3/14` accent bold |
| 3 victory | `~*~*~*~*~*~*~*~*~*~*~*~*~*~>` brand, no dots | none | `14/14  [done]` accent bold |
| 4 failure | `~*~*~*~>` brand + ` ✗` error bold | `  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·` color `#2a2a2a` | `3/14  [failed]` error bold |

#### Right column — session context (screen 5 only)

No snake. Vertical stack, right-aligned, `gap: 6`:

**Row 1:** `[ viewing session ]` — `#06B6D4`, JetBrains Mono 12px

**Row 2 (horizontal flex, gap 6):**
- Dot: 6×6px square, `cornerRadius: 3`, fill `#F59E0B`
- Text: `bg: mock-002  |  agent running  |  8m 22s` — `#F59E0B`, JetBrains Mono 11px

(Shows current background loop status while user browses session history.)

---

### 7.2 Agent Title Bar (Screens 1 & 2)

**Height:** 40px. **Background:** `#0F0F0F`. **Border:** bottom 1px `#2a2a2a`. **Padding:** 24px horizontal. Vertically centered.

All text: `#A855F7`, JetBrains Mono 13px.

| Phase | Text |
|---|---|
| agent running | `agent: mock-001  \|  claude haiku  [running]` |
| session complete | `agent: mock-001  \|  session complete` |

---

### 7.3 Agent Panel — Live (Screen 1)

**Width:** `agentCols`. **Height:** `bodyRows - agentTitleRows`. **Background:** `#0A0A0A`. **Right border:** 1px `#2a2a2a`.

Horizontal layout: log area (fill) + scrollbar (6px, no gap).

**Log area** — padding 20px top/bottom, 24px left/right. Vertical stack, `gap: 4`.

Line types — all JetBrains Mono 12px:

| Type | Color | Format |
|---|---|---|
| `text` | `#FAFAFA` | `I will work through this step-by-step.` |
| `tool` | `#06B6D4` | `▸ Bash   cd /c/dev/quetz && bd update mock-001 --claim` |
| `tool` | `#06B6D4` | `▸ Read   CLAUDE.md` |

Tool format: `▸ {Name}   {args}` — tool name padded to 5 chars, then 3 spaces. Examples:
```
▸ Bash   cd /c/dev/quetz && bd update mock-001 --claim
▸ Read   CLAUDE.md
▸ Write  src/middleware/auth.ts
▸ Edit   src/app.ts
▸ Glob   src/**/*.ts
▸ Grep   QuetzBus src/
```

**Scrollbar** — 6px wide column:
```typescript
// Rezi component
<ui.col width={6} height="fill" style={{ background: c.sbTrack }}>
  <ui.frame
    width={6}
    height={thumbHeight}   // Math.max(4, Math.round(visibleRatio * totalHeight))
    style={{ background: c.sbThumb }}
    marginTop={thumbOffset} // Math.round(scrollOffset * visibleRatio)
  />
</ui.col>
```

**Scroll:** auto-scroll to bottom by default. `↑` → disable auto-scroll, scroll up 3 lines. `↓` → scroll down 3 lines; re-enable at bottom. Buffer: 500 lines max.

---

### 7.4 Agent Panel — PR Polling (Screen 2)

Same panel structure and scrollbar. Content replaced with session summary. `gap: 4`.

```
──── agent session complete ────                     #4B5563  JetBrains Mono 12px
✓  pr #42 found: feat: add rate limiting (mock-001) #10B981  JetBrains Mono 12px
⏳ waiting for merge...  ◐  (2m 30s elapsed)         #F59E0B  JetBrains Mono 12px
```

Spinner chars: `◐ ◓ ◑ ◒` — cycle every 300ms during `pr_polling` phase only.

---

### 7.5 Sessions Panel (right column, top — Screens 1 & 2)

**Width:** `rightCols`. **Height:** `sessionsRows` (~220px).

**Title bar** — height 32px, `#0F0F0F` bg, border-bottom 1px `#2a2a2a`, padding 16px horizontal, `space-between`:
```
completed sessions    ↑↓ enter esc
#06B6D4 12px          #6B7280 11px
```

**Session list** — vertical stack, `gap: 2`, padding 8px top/bottom, 16px left/right.

Each row: height 24px, horizontal flex, `gap: 8`, `alignItems: center`.

```
▶  bd-a1b2  improve error handling  ✓    ← selected: all #10B981
   bd-c3d4  add rate limiting  ✓         ← normal:   all #6B7280
```

- Icon: `▶` (selected, `#10B981`) or ` ` space (normal, `#6B7280`). JetBrains Mono 12px.
- Text: `{issueId}  {title}  ✓` — same color as icon. JetBrains Mono 12px.
- Failed outcome: `✗` in `#EF4444`.

**Empty state:** `no completed sessions yet` in `#6B7280`.

**Scrolls** if list overflows height. No visible scrollbar on sessions panel.

**Keyboard:** `↑↓` navigate, `enter` open Session Detail (Screen 5), `esc` deselect.

---

### 7.6 Quetz Log Panel (right column, bottom — Screens 1 & 2)

**Width:** `rightCols`. **Height:** `logRows` (fill remaining).

**Title bar** — height 32px, `#0F0F0F` bg, border-bottom 1px `#2a2a2a`, padding 16px horizontal:
```
quetz log
#06B6D4  JetBrains Mono 13px
```

**Log content area** — horizontal layout: entries (fill) + scrollbar (6px).

Entries column — padding 12px top/bottom, 16px left/right, vertical stack, `gap: 6`. JetBrains Mono 12px:

| Icon | Color | Example text |
|---|---|---|
| `▶` | `#10B981` | `▶ START 3 issues` |
| `→` | `#06B6D4` | `→ PICKUP mock-001  add rate limiting  [P1 feature]` |
| `·` | `#6B7280` | `· AGENT running` |
| `✓` | `#10B981` | `✓ AGENT done  (14m 22s)` |
| `✓` | `#10B981` | `✓ PR #42 found` |
| `🔍` | `#6B7280` | `🔍 PR search...` |
| `⏳` | `#F59E0B` | `⏳ MERGE polling...` |

**Scrollbar** — same 6px design as agent panel (`#141414` track, `#3F3F3F` thumb, 60px thumb height in design).

**Scroll:** `[` up, `]` down. Auto-scroll to bottom on new entries.

---

### 7.7 Footer (Screens 1 & 2)

**Height:** 40px. **Background:** `#0F0F0F`. **Border:** top 1px `#2a2a2a`. **Padding:** 24px horizontal. `space-between`. `alignItems: center`.

**Screen 1 (agent running):**

Left — `#10B981`, JetBrains Mono 12px:
```
◆ issue 1/3  |  mock-001  |  agent running  |  pr: ---  |  0m 13s
```

Right — `#4B5563`, JetBrains Mono 11px:
```
q quit  ↑↓ agent  [ ] log  ◆ v0.1.0
```

**Screen 2 (PR polling):**

Left — `#F59E0B`, JetBrains Mono 12px:
```
◆ issue 1/3  |  mock-001  |  waiting for merge  |  pr: #42  |  2m 30s
```

**Phase → label → left color:**

| Phase | Label | Color |
|---|---|---|
| `agent_running` | `agent running` | `#10B981` |
| `pr_detecting` | `pr detecting` | `#10B981` |
| `pr_polling` | `waiting for merge` | `#F59E0B` |
| `git_reset` | `git reset` | `#10B981` |
| `assembling` | `assembling` | `#10B981` |
| `completed` | `done` | `#10B981` |
| `error` | `failed` | `#EF4444` |

`pr: ---` when no PR (`#4B5563`). `pr: #42` when found (`#FAFAFA`).

---

### 7.8 Session Detail (Screen 5)

Triggered when user presses `enter` on a session in the sessions panel.

#### Header (Screen 5 variant)

Same logo. Right column shows `[ viewing session ]` + `bg:` status (§7.1). No snake animation.

#### Info Bar

**Height:** 48px. **Background:** `#0D0D0D`. **Border:** bottom 1px `#2a2a2a`. **Padding:** 24px horizontal. `space-between`, `alignItems: center`.

Left — breadcrumb (horizontal flex, no gap):
```
← esc          #4B5563  JetBrains Mono 12px
  /            #2a2a2a  JetBrains Mono 12px
completed sessions  #4B5563  JetBrains Mono 12px
  /            #2a2a2a  JetBrains Mono 12px
bd-a1b2  —  add auth middleware  #06B6D4  JetBrains Mono 13px bold 700
```

Right — metadata (horizontal flex, `gap: 16`):
```
pr #38     #6B7280  JetBrains Mono 12px
✓ merged   #10B981  JetBrains Mono 12px bold
14m 06s    #4B5563  JetBrains Mono 12px
```

#### Session Log Content

Horizontal layout: log column (fill) + scrollbar (6px).

Log column — padding 20px top/bottom, 32px left/right. Vertical stack, `gap: 3`. JetBrains Mono 12px unless noted.

Line types in session detail:

| Type | Color | Font | Format |
|---|---|---|---|
| Agent prose | `#FAFAFA` | IBM Plex Mono 12px | `I'll work through this step-by-step. Let me start by claiming...` |
| Tool call | `#06B6D4` | JetBrains Mono 12px | `▸ Bash   bd update bd-a1b2 --claim` |
| Bash output | `#4B5563` | JetBrains Mono 12px | `  Switched to a new branch 'feat/bd-a1b2-add-auth-middleware'` |
| Success output | `#10B981` | JetBrains Mono 12px | `  ✓ PASS  src/middleware/auth.test.ts` |
| PR/close line | `#10B981` | JetBrains Mono 11px | `▸ Bash   gh pr create --title "feat: add auth middleware (bd-a1b2)" --label automerge` |
| Paragraph spacer | — | — | 10px empty frame (between topic groups) |
| Session end divider | `#2a2a2a` | JetBrains Mono 10px | `──────────────────────────── session complete ────────────────────────────` |
| Session summary | `#F59E0B` bold 700 | JetBrains Mono 11px | `✓ session bd-a1b2   \|   14m 06s   \|   pr #38   \|   merged` |

**Full example log content (from design):**

```
I'll work through this step-by-step. Let me start by claiming the issue and reviewing the codebase.
▸ Bash   bd update bd-a1b2 --claim
▸ Bash   bd show bd-a1b2 --json
▸ Read   CLAUDE.md
▸ Read   src/
[10px spacer]
This requires JWT-based auth middleware. I'll implement it with token validation and proper test coverage.
▸ Bash   git checkout -b feat/bd-a1b2-add-auth-middleware
  Switched to a new branch 'feat/bd-a1b2-add-auth-middleware'
▸ Write  src/middleware/auth.ts
▸ Write  src/middleware/auth.test.ts
▸ Edit   src/app.ts
[10px spacer]
▸ Bash   npm test -- --testPathPattern=auth
  ✓ PASS  src/middleware/auth.test.ts
  Tests: 4 passed, 4 total  (12.3s)
[10px spacer]
▸ Bash   git add -A && git commit -m "feat: add auth middleware (bd-a1b2)"
  [feat/bd-a1b2] a2f3c1d  feat: add auth middleware (bd-a1b2)
▸ Bash   git push origin feat/bd-a1b2-add-auth-middleware
  → to https://github.com/dk/aegis (refs/heads/feat/bd-a1b2-add-auth-middleware)
[10px spacer]
▸ Bash   gh pr create --title "feat: add auth middleware (bd-a1b2)" --label automerge
  → pr #38 opened: https://github.com/dk/aegis/pull/38
  → automerge label applied. waiting for CI checks to pass.
[10px spacer]
▸ Bash   bd close bd-a1b2 --reason "Completed — PR raised"
  → issue bd-a1b2 closed.
[16px spacer]
◆ all steps complete. PR #38 opened with automerge label. session closing.
[12px spacer]
──────────────────────────── session complete ────────────────────────────
✓ session bd-a1b2   |   14m 06s   |   pr #38   |   merged
[20px spacer]
```

**Scrollbar** — same 6px design (`#141414` track, `#3F3F3F` thumb). Thumb height 48px in design. Scroll: `↑↓` arrows.

#### Footer (Screen 5)

**Padding:** 32px horizontal (wider than the 24px on other screens).

Left — `#4B5563`, JetBrains Mono 11px:
```
← esc  back to main  |  session: bd-a1b2
```

Right — `#F59E0B`, JetBrains Mono 11px:
```
bg: mock-002 running  |  8m 22s  |  ◆ v0.1.0
```

---

### 7.9 Victory Screen (Screen 3)

Header present (snake fully extended, no dots, counter `14/14  [done]`). Body: centered card, right panel hidden.

**Card:** width `~49% termCols`, padding 48px, border 1px `#F59E0B`.

Card content (vertical stack, all JetBrains Mono unless noted):

```
[ all issues resolved ]                      #F59E0B bold 700  22px
the feathered serpent completes its journey  #6B7280  IBM Plex Mono 12px
[24px spacer]
      ~*~*~*~*~*~*~*~*~*~*~*~*~*~>          #10B981  13px
     (  Q U E T Z  v 0 . 1 . 0  )           #FAFAFA  bold 700  13px
      ~*~*~*~*~*~*~*~*~*~*~*~*~*~>          #06B6D4  13px
              |||||                          #4B5563  13px
            ~~|||||~~                        #4B5563  13px
              ~~~~~                          #06B6D4  13px
[24px spacer]
[1px divider #2a2a2a]
[20px spacer]
issues_completed              14             key #6B7280  val #10B981 bold  (height 28px, space-between)
total_time                3h 42m             key #6B7280  val #10B981 bold
prs_merged                    14             key #6B7280  val #10B981 bold
session_date          2026-03-22             key #6B7280  val #6B7280
[20px spacer]
[1px divider #2a2a2a]
[24px spacer]
the serpent rests.                           #10B981  bold 700  15px
run quetz again to continue a new session    #4B5563  IBM Plex Mono 11px
```

**Footer:**
- Left: `◆ all done  |  exit code 0` — `#10B981`, 12px
- Right: `q quit  ◆ v0.1.0` — `#4B5563`, 11px

**Payload:**
```typescript
interface VictoryData {
  issuesCompleted: number;
  totalTime: string;    // "3h 42m"
  prsMerged: number;
  sessionDate: string;  // "YYYY-MM-DD"
}
```

---

### 7.10 Failure Screen (Screen 4)

Header present (snake + ` ✗` + near-invisible dots, counter `3/14  [failed]` in error). Body: centered card.

**Card:** width `~49% termCols`, padding 48px, border 1px `#EF4444`.

```
[ build failed ]                                        #EF4444  bold 700  22px
ci checks failed on pr #42 — the serpent was stopped   #6B7280  IBM Plex Mono 12px
[24px spacer]
      ~*~*~*~> ✗          ~*~*~*~>: #10B981  /  ✗: #EF4444 bold  13px
     (  q u e t z  r e t r e a t s  )                  #4B5563  13px
              |                                         #4B5563  13px
           ~~|||~~                                      #3F1515  13px
              ~~~                                       #3F1515  13px
[24px spacer]
[1px divider #3F1515]
[20px spacer]
failed_checks            run_tests, coverage            key #6B7280  val #EF4444 bold  (height 28px, space-between)
pr_number                                 #42            key #6B7280  val #EF4444 bold
issue_id                            mock-001            key #6B7280  val #6B7280
time_elapsed                         24m 22s            key #6B7280  val #6B7280
[20px spacer]
[1px divider #3F1515]
[24px spacer]
the serpent retreats.                                   #EF4444  bold 700  15px
fix the issue and run quetz again.                      #4B5563  IBM Plex Mono 11px
```

**Footer:**
- Left: `● ci failed  |  pr: #42  |  issue: mock-001  |  exit code 1` — `#EF4444`, 12px
- Right: `q quit  ◆ v0.1.0` — `#4B5563`, 11px

**Payload:**
```typescript
interface FailureData {
  reason: string;          // "ci checks failed"
  prNumber?: number;
  issueId: string;
  elapsed: string;
  failedChecks?: string;   // comma-separated; row omitted when absent
}
```

---

## 8. Keyboard Input

`process.stdin` raw mode.

| Key | Action |
|---|---|
| `q` / Ctrl+C | Quit |
| `↑` | Scroll agent panel up 3 lines; disable auto-scroll |
| `↓` | Scroll agent panel down 3 lines; re-enable at bottom |
| `[` | Scroll quetz log panel up |
| `]` | Scroll quetz log panel down |
| `↑↓` (sessions focused) | Navigate sessions list |
| `Enter` (sessions focused) | Open Session Detail (Screen 5) |
| `Esc` (Screen 5) | Return to Screen 1/2 |
| `↑↓` (Screen 5) | Scroll session log |

Sessions panel gains focus when `↑↓` pressed and list has entries. Selected row highlighted in `#10B981`.

---

## 9. Animation Timers

| Animation | Interval | Active when |
|---|---|---|
| Snake head | 150ms | Screens 1–4 |
| Merge spinner `◐◓◑◒` | 300ms | `pr_polling` phase only |
| Elapsed timer | 1000ms | `issueId` is set |

Rezi's C framebuffer diff means timer ticks that produce no visual change write zero bytes.

---

## 10. Module Architecture

### Files

```
src/ui/
├── App.tsx                  # Root component: routes ScreenMode → correct screen
├── theme.ts                 # All hex color constants (§4.3)
├── state.ts                 # AppState type + createAppState(bus) signal bridge
├── logo.ts                  # LOGO_LINES constant + LOGO_SUBTITLE (§7.1)
├── snake.ts                 # SNAKE_FRAMES, buildDots(remaining), snakeForState()
└── components/
    ├── Header.tsx            # Logo, right column (snake or session context)
    ├── AgentPanel.tsx        # Screens 1 & 2: agent output + session-complete view
    ├── SessionsPanel.tsx     # Right column top: completed sessions list
    ├── LogPanel.tsx          # Right column bottom: quetz log
    ├── Footer.tsx            # Screens 1 & 2 footer
    ├── SessionDetail.tsx     # Screen 5: full session log view
    ├── VictoryCard.tsx       # Screen 3
    └── FailureCard.tsx       # Screen 4
```

**Removed:** `App.tsx`, `AgentPanel.tsx`, `QuetzPanel.tsx`, `StatusBar.tsx`, `Logo.tsx`, `HistoryPanel.tsx`, `SessionDetailPanel.tsx`, `hooks.ts`, `viewport.ts`, `ink-imports.ts`, `session-history.ts`

### Entry point

```typescript
// Before:
import { ink } from './ui/ink-imports.js';
const { render } = await ink();
render(<App bus={bus} />);

// After:
import { mount } from '@rezi-ui/node';
import { App } from './ui/App.js';
const app = mount(<App bus={bus} version={version} onQuit={onQuit} />);
// app.unmount() on exit
```

### Rezi primitive mapping

| Ink | Rezi |
|---|---|
| `<Box flexDirection="column">` | `<ui.col>` |
| `<Box flexDirection="row">` | `<ui.row>` |
| `<Text color="green">` | `<ui.text style={{ color: c.brand }}>` |
| `<Text dimColor>` | `<ui.text style={{ color: c.dim }}>` |
| `<Text wrap="truncate">` | `<ui.text truncate>` |
| Agent output lines | `<ui.list>` virtual list |
| `useInput` | `useKey` from `@rezi-ui/core` |
| `process.stdout.rows/columns` | `useSize` from `@rezi-ui/core` |

---

## 11. Rezi Component Patterns

### State bridge

```typescript
// src/ui/state.ts
import { createSignal } from '@rezi-ui/core';

export function createAppState(bus: QuetzBus) {
  const [mode, setMode] = createSignal<ScreenMode>('running');
  const [phase, setPhase] = createSignal<QuetzPhase>('idle');
  const [issueId, setIssueId] = createSignal('');
  const [issueCount, setIssueCount] = createSignal({ current: 0, total: 0 });
  const [agentLines, setAgentLines] = createSignal<AgentLine[]>([]);
  const [logLines, setLogLines] = createSignal<LogLine[]>([]);
  const [completedSessions, setCompletedSessions] = createSignal<CompletedSession[]>([]);
  const [viewingSession, setViewingSession] = createSignal<CompletedSession | null>(null);
  const [victoryData, setVictoryData] = createSignal<VictoryData | null>(null);
  const [failureData, setFailureData] = createSignal<FailureData | null>(null);

  bus.on('loop:phase', p => setPhase(p.phase));
  bus.on('loop:issue_pickup', p => { setIssueId(p.id); /* update count */ });
  bus.on('agent:text', p => setAgentLines(prev => [...prev.slice(-499), { type: 'text', content: p.text }]));
  bus.on('agent:tool', p => setAgentLines(prev => [...prev.slice(-499), { type: 'tool', content: p.args, toolName: p.name }]));
  bus.on('loop:victory', p => { setMode('victory'); setVictoryData(p); });
  bus.on('loop:failure', p => { setMode('failure'); setFailureData(p); });

  return { mode, phase, issueId, issueCount, agentLines, logLines,
           completedSessions, viewingSession, victoryData, failureData };
}
```

### Header component

```tsx
// src/ui/components/Header.tsx
/** @jsxImportSource @rezi-ui/jsx */
import { ui, useSequence } from '@rezi-ui/core';
import { LOGO_LINES, LOGO_SUBTITLE } from '../logo.js';
import { c } from '../theme.js';

const SNAKE_FRAMES = ['~*~*~*~>', '*~*~*~>~', '~*~*~>~*', '*~*~>~*~'];

export function Header({ issueCount, phase, mode, bgStatus }) {
  const frame = useSequence(SNAKE_FRAMES, { interval: 150, paused: mode !== 'running' && mode !== 'polling' });

  return (
    <ui.row justifyContent="space-between" style={{ background: '#0F0F0F', borderBottom: `1px solid ${c.border}` }}
            paddingX={24}>
      <ui.col paddingTop={18}>  {/* 14px for screens 3-5 */}
        {LOGO_LINES.map((line, i) => (
          <ui.text key={i} style={{ color: c.logo, fontFamily: 'JetBrains Mono', fontSize: 6, lineHeight: 1 }}>
            {line}
          </ui.text>
        ))}
        <ui.text style={{ color: c.muted, fontFamily: 'IBM Plex Mono', fontSize: 10 }}>
          {LOGO_SUBTITLE}
        </ui.text>
      </ui.col>

      {mode === 'session_detail' ? (
        <ui.col alignItems="end" gap={6}>
          <ui.text style={{ color: c.cyan, fontFamily: 'JetBrains Mono', fontSize: 12 }}>
            [ viewing session ]
          </ui.text>
          <ui.row gap={6} alignItems="center">
            <ui.frame width={6} height={6} cornerRadius={3} style={{ background: c.accent }} />
            <ui.text style={{ color: c.accent, fontFamily: 'JetBrains Mono', fontSize: 11 }}>
              {bgStatus}
            </ui.text>
          </ui.row>
        </ui.col>
      ) : (
        <ui.col alignItems="end" gap={6}>
          <ui.row alignItems="center">
            <ui.text style={{ color: snakeColor(mode), fontFamily: 'JetBrains Mono', fontSize: 12 }}>
              {snakeHead(mode, frame)}
            </ui.text>
            {mode === 'failure' && (
              <ui.text style={{ color: c.error, fontWeight: 'bold', fontFamily: 'JetBrains Mono', fontSize: 12 }}>
                {' ✗'}
              </ui.text>
            )}
            <ui.text style={{ color: dotsColor(mode), fontFamily: 'JetBrains Mono', fontSize: 12 }}>
              {buildDots(issueCount, mode)}
            </ui.text>
          </ui.row>
          <ui.text style={{ color: counterColor(mode), fontWeight: 'bold', fontFamily: 'JetBrains Mono', fontSize: 13 }}>
            {counterText(issueCount, mode)}
          </ui.text>
        </ui.col>
      )}
    </ui.row>
  );
}
```

### Scrollbar pattern

Used in agent panel, quetz log panel, and session detail log. Extracted as a reusable helper:

```tsx
interface ScrollbarProps {
  totalLines: number;
  visibleLines: number;
  scrollOffset: number;
  height: number;  // panel height in rows, passed from parent via useSize
}

function Scrollbar({ totalLines, visibleLines, scrollOffset, height }: ScrollbarProps) {
  if (totalLines <= visibleLines) {
    // content fits — render blank track, no thumb
    return <ui.col width={1} height="fill" style={{ background: c.sbTrack }} />;
  }
  const thumbRatio = visibleLines / totalLines;
  const thumbHeight = Math.max(1, Math.round(thumbRatio * height));
  const thumbTop = Math.round(
    (scrollOffset / (totalLines - visibleLines)) * (height - thumbHeight)
  );
  return (
    <ui.col width={1} height="fill" style={{ background: c.sbTrack }}>
      <ui.frame width={1} height={thumbTop} />
      <ui.frame width={1} height={thumbHeight} style={{ background: c.sbThumb }} />
    </ui.col>
  );
}
```

### Agent panel with scrollbar

```tsx
// src/ui/components/AgentPanel.tsx
export function AgentPanel({ lines, scrollOffset, autoScroll, sessionComplete }) {
  return (
    <ui.col width="fill" height="fill" style={{ borderRight: `1px solid ${c.border}` }}>
      {/* Title bar */}
      <ui.row height={40} alignItems="center" paddingX={24}
              style={{ background: '#0F0F0F', borderBottom: `1px solid ${c.border}` }}>
        <ui.text style={{ color: c.agent, fontFamily: 'JetBrains Mono', fontSize: 13 }}>
          {agentHeaderText}
        </ui.text>
      </ui.row>

      {/* Content + scrollbar */}
      <ui.row height="fill">
        <ui.col width="fill" height="fill" paddingX={24} paddingY={20} gap={4}>
          <ui.list items={visibleLines} renderItem={(line) => <AgentLine line={line} />} />
        </ui.col>
        <Scrollbar totalLines={lines.length} visibleLines={visibleRows} scrollOffset={scrollOffset} />
      </ui.row>
    </ui.col>
  );
}
```

### Session detail component

```tsx
// src/ui/components/SessionDetail.tsx
export function SessionDetail({ session, scrollOffset, bgStatus }) {
  return (
    <ui.col height="fill" style={{ background: c.bg }}>
      <Header mode="session_detail" bgStatus={bgStatus} ... />

      {/* Info bar */}
      <ui.row height={48} alignItems="center" justifyContent="space-between"
              paddingX={24} style={{ background: '#0D0D0D', borderBottom: `1px solid ${c.border}` }}>
        <ui.row alignItems="center">
          <ui.text style={{ color: c.muted, fontFamily: 'JetBrains Mono', fontSize: 12 }}>{'← esc'}</ui.text>
          <ui.text style={{ color: c.border, fontFamily: 'JetBrains Mono', fontSize: 12 }}>{'  /  '}</ui.text>
          <ui.text style={{ color: c.muted, fontFamily: 'JetBrains Mono', fontSize: 12 }}>{'completed sessions'}</ui.text>
          <ui.text style={{ color: c.border, fontFamily: 'JetBrains Mono', fontSize: 12 }}>{'  /  '}</ui.text>
          <ui.text style={{ color: c.cyan, fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 'bold' }}>
            {`${session.id}  —  ${session.title}`}
          </ui.text>
        </ui.row>
        <ui.row gap={16} alignItems="center">
          <ui.text style={{ color: c.dim, fontFamily: 'JetBrains Mono', fontSize: 12 }}>{`pr #${session.prNumber}`}</ui.text>
          <ui.text style={{ color: c.brand, fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 'bold' }}>{'✓ merged'}</ui.text>
          <ui.text style={{ color: c.muted, fontFamily: 'JetBrains Mono', fontSize: 12 }}>{session.duration}</ui.text>
        </ui.row>
      </ui.row>

      {/* Log + scrollbar */}
      <ui.row height="fill">
        <ui.col width="fill" paddingX={32} paddingY={20} gap={3}>
          <ui.list items={visibleLogLines} renderItem={(line) => <SessionLogLine line={line} />} />
        </ui.col>
        <Scrollbar totalLines={session.lines.length} visibleLines={visibleRows} scrollOffset={scrollOffset} />
      </ui.row>

      {/* Footer */}
      <ui.row height={40} alignItems="center" justifyContent="space-between"
              paddingX={32} style={{ background: '#0F0F0F', borderTop: `1px solid ${c.border}` }}>
        <ui.text style={{ color: c.muted, fontFamily: 'JetBrains Mono', fontSize: 11 }}>
          {`← esc  back to main  |  session: ${session.id}`}
        </ui.text>
        <ui.text style={{ color: c.accent, fontFamily: 'JetBrains Mono', fontSize: 11 }}>
          {bgStatus ? `bg: ${bgStatus}  |  ◆ v0.1.0` : '◆ v0.1.0'}
        </ui.text>
      </ui.row>
    </ui.col>
  );
}
```

### App.tsx — root router

```tsx
// src/ui/App.tsx
/** @jsxImportSource @rezi-ui/jsx */
import { ui, useKey, useSize } from '@rezi-ui/core';

export function App({ bus, version, onQuit }) {
  const state = createAppState(bus);
  const { cols } = useSize();
  const rightCols = Math.max(36, Math.round(cols * 0.26));

  useKey('q', onQuit);
  useKey('ctrl+c', onQuit);

  return () => {
    const mode = state.mode();

    if (mode === 'victory') {
      return <VictoryCard data={state.victoryData()} version={version} onQuit={onQuit} />;
    }
    if (mode === 'failure') {
      return <FailureCard data={state.failureData()} version={version} />;
    }
    if (mode === 'session_detail') {
      return (
        <SessionDetail
          session={state.viewingSession()}
          scrollOffset={state.sessionLogScrollOffset()}
          bgStatus={state.bgStatus()}
          onEsc={() => { state.setViewingSession(null); state.setMode('running'); }}
        />
      );
    }

    // Screens 1 & 2: running / polling
    return (
      <ui.col height="fill" style={{ background: c.bg }}>
        <Header
          mode={mode}
          issueCount={state.issueCount()}
          phase={state.phase()}
        />
        <ui.row height="fill">
          <AgentPanel
            phase={state.phase()}
            issueId={state.agentIssueId()}
            model={state.agentModel()}
            lines={state.agentLines()}
            scrollOffset={state.agentScrollOffset()}
            autoScroll={state.agentAutoScroll()}
            sessionComplete={state.sessionComplete()}
          />
          <ui.col width={rightCols} height="fill">
            <SessionsPanel
              sessions={state.completedSessions()}
              selectedIdx={state.selectedSessionIdx()}
              onSelect={idx => state.setSelectedSessionIdx(idx)}
              onOpen={session => { state.setViewingSession(session); state.setMode('session_detail'); }}
            />
            <ui.frame height={1} width="fill" style={{ background: c.border }} />
            <LogPanel
              lines={state.logLines()}
              scrollOffset={state.logScrollOffset()}
            />
          </ui.col>
        </ui.row>
        <Footer
          phase={state.phase()}
          issueId={state.issueId()}
          issueCount={state.issueCount()}
          prNumber={state.prNumber()}
          elapsed={state.elapsed()}
          version={version}
        />
      </ui.col>
    );
  };
}
```

### Footer.tsx

```tsx
// src/ui/components/Footer.tsx
const PHASE_LABELS: Record<QuetzPhase, string> = {
  agent_running:    'agent running',
  pr_detecting:     'pr detecting',
  pr_polling:       'waiting for merge',
  git_reset:        'git reset',
  assembling:       'assembling',
  completed:        'done',
  error:            'failed',
  idle:             '',
};

export function Footer({ phase, issueId, issueCount, prNumber, elapsed, version }) {
  const leftColor =
    phase === 'error'     ? c.error  :
    phase === 'pr_polling' ? c.accent : c.brand;

  const prStr   = prNumber ? `pr: #${prNumber}` : 'pr: ---';
  const left    = `◆ issue ${issueCount.current}/${issueCount.total}  |  ${issueId}  |  ${PHASE_LABELS[phase] ?? phase}  |  ${prStr}  |  ${elapsed}`;
  const right   = `q quit  ↑↓ agent  [ ] log  ◆ v${version}`;

  return (
    <ui.row height={40} alignItems="center" justifyContent="space-between"
            paddingX={24} style={{ background: '#0F0F0F', borderTop: `1px solid ${c.border}` }}>
      <ui.text style={{ color: leftColor, fontFamily: 'JetBrains Mono', fontSize: 12 }}>
        {left}
      </ui.text>
      <ui.text style={{ color: c.muted, fontFamily: 'JetBrains Mono', fontSize: 11 }}>
        {right}
      </ui.text>
    </ui.row>
  );
}
```

### snake.ts — helper functions

```typescript
// src/ui/snake.ts
import { c } from './theme.js';

export const SNAKE_FRAMES = ['~*~*~*~>', '*~*~*~>~', '~*~*~>~*', '*~*~>~*~'];
export const SNAKE_VICTORY = '~*~*~*~*~*~*~*~*~*~*~*~*~*~>';

export function snakeHead(mode: ScreenMode, frame: string): string {
  if (mode === 'victory') return SNAKE_VICTORY;
  return frame;  // 'failure' and running modes both use the animated frame
}

export function dotsColor(mode: ScreenMode): string {
  if (mode === 'failure') return '#2a2a2a';  // near-invisible
  return c.dim;
}

export function counterColor(mode: ScreenMode): string {
  if (mode === 'failure') return c.error;
  return c.accent;
}

export function counterText(count: { current: number; total: number }, mode: ScreenMode): string {
  if (mode === 'victory') return `${count.total}/${count.total}  [done]`;
  if (mode === 'failure') return `${count.current}/${count.total}  [failed]`;
  return `${count.current}/${count.total}`;
}

export function buildDots(count: { current: number; total: number }, mode: ScreenMode): string {
  if (mode === 'victory') return '';
  const remaining = count.total - count.current;
  if (remaining <= 0) return '';
  return ' ' + Array(remaining).fill('·').join('  ');  // leading space, double-space between dots
}
```

### AgentLine renderer

```tsx
// Inside AgentPanel.tsx
function AgentLine({ line }: { line: AgentLine }) {
  if (line.type === 'tool') {
    const name = (line.toolName ?? 'Tool').padEnd(5);
    return (
      <ui.text style={{ color: c.cyan, fontFamily: 'JetBrains Mono', fontSize: 12 }}>
        {`▸ ${name}   ${line.content}`}
      </ui.text>
    );
  }
  return (
    <ui.text style={{ color: c.text, fontFamily: 'JetBrains Mono', fontSize: 12 }}>
      {line.content}
    </ui.text>
  );
}
```

### SessionLogLine renderer

```tsx
// Inside SessionDetail.tsx
function SessionLogLine({ line }: { line: SessionLine }) {
  switch (line.type) {
    case 'spacer':
      return <ui.frame height={line.height ?? 10} width="fill" />;

    case 'divider':
      return (
        <ui.text style={{ color: c.border, fontFamily: 'JetBrains Mono', fontSize: 10 }}>
          {line.content}
        </ui.text>
      );

    case 'summary':
      return (
        <ui.text style={{ color: c.accent, fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 'bold' }}>
          {line.content}
        </ui.text>
      );

    case 'tool':
      return (
        <ui.text style={{ color: c.cyan, fontFamily: 'JetBrains Mono', fontSize: 12 }}>
          {`▸ ${(line.toolName ?? 'Tool').padEnd(5)}   ${line.content}`}
        </ui.text>
      );

    case 'bash-output':
      return (
        <ui.text style={{ color: c.muted, fontFamily: 'JetBrains Mono', fontSize: 12 }}>
          {line.content}
        </ui.text>
      );

    case 'success-output':
      return (
        <ui.text style={{ color: c.brand, fontFamily: 'JetBrains Mono', fontSize: 12 }}>
          {line.content}
        </ui.text>
      );

    case 'pr-line':
      return (
        <ui.text style={{ color: c.brand, fontFamily: 'JetBrains Mono', fontSize: 11 }}>
          {line.content}
        </ui.text>
      );

    case 'prose':
    default:
      return (
        <ui.text style={{ color: c.text, fontFamily: 'IBM Plex Mono', fontSize: 12 }}>
          {line.content}
        </ui.text>
      );
  }
}
```

---

## 12. Issue Decomposition (Beads Epic)

### Issue 1: Rezi foundation + project migration
**Scope:** `package.json`, `tsconfig.json`, `src/ui/App.tsx`, `src/ui/theme.ts`, `src/ui/state.ts`

Tasks:
- Add `@rezi-ui/core @rezi-ui/node @rezi-ui/jsx` (exact version `0.1.0-alpha.60`)
- Remove `ink react @types/react ink-testing-library` from `package.json`
- Set `"jsxImportSource": "@rezi-ui/jsx"` in `tsconfig.json`
- Delete `src/ui/ink-imports.ts`
- Write `App.tsx`: root component that reads `mode` signal, renders `<Header />` + correct body component
- Write `state.ts`: `AppState` type + `createAppState(bus)` wiring all `QuetzBus` events to signals (see §11)
- Write `theme.ts`: all 13 `c.*` constants from §4.3
- Update `cli.ts`/`loop.ts`: replace `render(<App .../>)` with `mount(<App .../>)`

Acceptance:
- `npm run build` clean, zero Ink/React imports
- `npx quetz run --simulate` launches, shows blank layout zones, exits cleanly on `q`
- Terminal resize triggers re-render via `useSize`

---

### Issue 2: Block-pixel QUETZ logo + animated snake header
**Scope:** `src/ui/logo.ts`, `src/ui/snake.ts`, `src/ui/components/Header.tsx`

Tasks:
- Write `logo.ts` with `LOGO_LINES` (16 strings, exact content from §7.1) and `LOGO_SUBTITLE`
- Write `snake.ts`:
  ```typescript
  export const SNAKE_FRAMES = ['~*~*~*~>', '*~*~*~>~', '~*~*~>~*', '*~*~>~*~'];
  export function buildDots(remaining: number): string {
    return Array(remaining).fill('·').join('  ');  // double-space between dots
  }
  export function snakeForState(mode: ScreenMode, frame: string): string {
    if (mode === 'victory') return '~*~*~*~*~*~*~*~*~*~*~*~*~*~>';
    if (mode === 'failure') return '~*~*~*~>';
    return frame;
  }
  ```
- Write `Header.tsx` (full component in §11) — logo left, right column switches on `mode`
- `session_detail` mode: `[ viewing session ]` cyan + `bg:` dot+text amber
- Normal modes: animated snake + counter
- Counter text/color per §7.1 table

Acceptance:
- Logo renders in `#0DBC79` on startup, all 16 lines visible
- Snake animates every 150ms; zero logo repaint during animation (Rezi cell diff)
- Counter `3/14` in `#F59E0B` bold, right-aligned
- Victory: full-length snake, counter `14/14  [done]`
- Failure: `~*~*~*~> ✗`, dots near-invisible `#2a2a2a`, counter `3/14  [failed]` in `#EF4444`
- Session detail: snake replaced by `[ viewing session ]` + `bg:` status

---

### Issue 3: Agent panel — streaming output + PR polling view
**Scope:** `src/ui/components/AgentPanel.tsx`

Tasks:
- Agent title bar: 40px, `#0F0F0F`, border-bottom `#2a2a2a`, padding 24px, text `#A855F7` 13px (§7.2)
- Content area: horizontal flex — log column (fill) + `Scrollbar` (1 col)
- Log column: padding 24px horizontal, 20px vertical, `gap: 4`
- `<ui.list>` for scrollable 500-line buffer
- Line rendering per §7.3: `text` → `#FAFAFA`, `tool` → `#06B6D4` with `▸ {Name}   {args}` format
  - Tool name padded to 5 chars: `Bash `, `Read `, `Write`, `Edit `, `Glob `, `Grep `
- `Scrollbar` component (§11): `#141414` track, `#3F3F3F` thumb, 1 col wide
- Auto-scroll: enabled by default, `↑` disables, `↓` re-enables at bottom
- PR polling substate (§7.4): show 3-line summary at top, spinner `◐◓◑◒` via `useSequence({interval: 300})`

Acceptance:
- All line types render correct color and font
- Scrollbar thumb moves proportionally to scroll position
- Auto-scroll follows new lines; manual `↑` stops it; reaching bottom re-enables
- Phase `pr_polling` shows session-complete summary with animated spinner

---

### Issue 4: Sessions panel + quetz log panel (right column)
**Scope:** `src/ui/components/SessionsPanel.tsx`, `src/ui/components/LogPanel.tsx`

Tasks:

**SessionsPanel:**
- Title bar: 32px, `space-between`, `completed sessions` (`#06B6D4` 12px) + `↑↓ enter esc` (`#6B7280` 11px)
- List: `gap: 2`, padding 8px/16px, rows 24px tall, `gap: 8` between icon and text
- Selected row: `▶` + text both `#10B981` 12px
- Normal row: ` ` (space) + text both `#6B7280` 12px
- `✓` merged in brand, `✗` failed in error
- Empty state: `no completed sessions yet` in `#6B7280`
- `↑↓` navigate (no visible scrollbar)
- `enter` → set `viewingSession`, switch mode to `session_detail`

**LogPanel:**
- Title bar: 32px, `quetz log` `#06B6D4` 13px, padding 16px
- Content: horizontal — entries column (fill) + `Scrollbar` (1 col)
- Entries: padding 12px/16px, `gap: 6`, per-icon-color table from §7.6
- `Scrollbar`: `#141414`/`#3F3F3F`, thumb 60px initial
- Auto-scroll on new entries; `[`/`]` manual scroll

Acceptance:
- Both panels always visible side by side (right column, stacked)
- Sessions `↑↓` highlights selected row in brand
- Log scrollbar tracks entries; `[`/`]` scroll independently from agent panel
- `enter` on session navigates to Screen 5

---

### Issue 5: Session Detail screen (Screen 5)
**Scope:** `src/ui/components/SessionDetail.tsx`

Tasks:
- Full-width layout (no right panel) — see §7.8 and §11 for complete component
- Header variant: `session_detail` mode shows `[ viewing session ]` + `bg:` status (no snake)
- Info bar: 48px, `#0D0D0D`, breadcrumb left + metadata right; spec §7.8
- Log content: padding 32px horizontal (wider than other screens), 20px vertical, `gap: 3`
- Line type rendering per §7.8 table: agent prose IBM Plex Mono, tool lines JetBrains Mono, bash output `#4B5563`
- Paragraph spacers: 10px empty frames between topic groups
- End divider: `#2a2a2a` 10px font, then summary line `#F59E0B` bold 11px
- `Scrollbar`: 1 col, `#141414`/`#3F3F3F`, thumb 48px initial; `↑↓` scroll
- Footer: padding 32px (not 24px), left `#4B5563` 11px, right `#F59E0B` 11px
- `esc` key → clear `viewingSession`, return to previous mode

Acceptance:
- Agent prose lines render in IBM Plex Mono `#FAFAFA`
- Tool lines render JetBrains Mono `#06B6D4`
- Bash output lines indented, `#4B5563`
- Success output lines (✓ PASS, test counts) in `#10B981`
- End summary `✓ session bd-a1b2  |  14m 06s  |  pr #38  |  merged` in `#F59E0B` bold
- `esc` returns to main view; header right column reverts to snake+counter

---

### Issue 6: Victory overlay (Screen 3)
**Scope:** `src/ui/components/VictoryCard.tsx`

Tasks:
- Full-screen: header (snake frozen at full length) + centered card + footer
- Card: `~49% termCols` wide, 48px padding, border 1px `#F59E0B`
- Exact content from §7.9 — all strings, colors, fonts, spacer heights
- Stats from `loop:victory` payload; `total_time` as `Xh Ym`, `session_date` as `YYYY-MM-DD`
- Footer: `◆ all done  |  exit code 0` in `#10B981`; stays alive until `q` (exit 0)

Acceptance:
- Card centers at any terminal size
- All four stats rows render with correct key/value colors
- `the serpent rests.` in `#10B981` bold 15px

---

### Issue 7: Failure overlay (Screen 4)
**Scope:** `src/ui/components/FailureCard.tsx`

Tasks:
- Header: snake + ` ✗` + `#2a2a2a` dots; counter in `#EF4444`
- Card: `~49% termCols` wide, 48px padding, border 1px `#EF4444`
- Exact content from §7.10 — dividers in `#3F1515`, ASCII art tail in `#3F1515`
- `failed_checks` row omitted when not present in payload
- Footer: `● ci failed  |  pr: #42  |  issue: mock-001  |  exit code 1` in `#EF4444`; stays alive until `q` (exit 1)

Acceptance:
- Error theme: `#EF4444` border, `#EF4444` for `failed_checks`/`pr_number` values
- `#3F1515` for both dividers and ASCII tail art
- `failed_checks` row absent when payload field missing

---

### Issue 8: Footer / status bar
**Scope:** `src/ui/components/Footer.tsx`

Tasks:
- 40px, `#0F0F0F`, border-top `#2a2a2a`, padding 24px, `space-between`
- Left string assembled from phase, issueId, issueCount, prNumber, elapsed per §7.7
- Left color: `#10B981` (running) / `#F59E0B` (polling) / `#EF4444` (error)
- Right string: `q quit  ↑↓ agent  [ ] log  ◆ v0.1.0` in `#4B5563` 11px
- Elapsed ticks every 1s — only that segment changes in Rezi's cell diff
- Phase label map from §7.7 table

Acceptance:
- Exact format from §7.7
- Left color changes correctly across phases
- Elapsed updates every second with zero repaint of surrounding cells

---

## 13. Migration Path

Issue 1 is the switch-flip: removes Ink, mounts the Rezi shell. Issues 2–8 fill in components. No "Ink alongside Rezi" period — the rewrite is atomic at the framework level. Each issue must leave `npx quetz run --simulate` functional (incomplete zones show as blank). Add `@rezi-ui/testkit` snapshot test per component alongside each implementation issue.

---

## 14. Open Questions

1. **Narrow terminal:** Below 80 cols the right panel is too narrow. Proposal: hide right panel, show only agent + single-line log summary. Stretch goal for Issue 4.

2. **`bg:` status in header:** Screen 5 shows `bg: mock-002  |  agent running  |  8m 22s`. This requires the loop to emit background status events while session detail is open, or quetz to show the last known status. Clarify event contract before Issue 5.
