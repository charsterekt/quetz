// Web status dashboard generator with dark/light mode support (mock-003)
// Writes a self-contained HTML file to disk; the user can open it in a browser.

import * as fs from 'fs';
import * as path from 'path';

export interface DashboardState {
  issueId: string;
  issueTitle: string;
  iteration: number;
  total: number;
  phase: 'startup' | 'agent' | 'polling' | 'commit' | 'celebration' | 'victory';
  elapsed: string;
  prNumber?: number;
  prUrl?: string;
  startedAt: string;
  updatedAt: string;
}

export function generateDashboardHtml(state: DashboardState): string {
  const phaseLabel: Record<DashboardState['phase'], string> = {
    startup:     'Starting up',
    agent:       'Agent running',
    polling:     state.prNumber ? `Polling PR #${state.prNumber}` : 'Searching for PR',
    commit:      'Committing',
    celebration: 'Merged ✓',
    victory:     'Done ✓',
  };

  const phaseClass: Record<DashboardState['phase'], string> = {
    startup:     'phase--neutral',
    agent:       'phase--active',
    polling:     'phase--waiting',
    commit:      'phase--active',
    celebration: 'phase--success',
    victory:     'phase--success',
  };

  const prLink = state.prNumber && state.prUrl
    ? `<a href="${escapeHtml(state.prUrl)}" target="_blank" rel="noopener">PR #${state.prNumber}</a>`
    : state.prNumber
      ? `PR #${state.prNumber}`
      : '—';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="10" />
  <title>Quetz — ${escapeHtml(state.issueId)}</title>
  <style>
    /* ── CSS custom properties: light theme (default) ── */
    :root {
      --color-bg:           #ffffff;
      --color-surface:      #f5f5f5;
      --color-border:       #e0e0e0;
      --color-text:         #1a1a1a;
      --color-text-muted:   #6b7280;
      --color-brand:        #16a34a;
      --color-brand-bg:     #dcfce7;
      --color-active:       #b45309;
      --color-active-bg:    #fef3c7;
      --color-waiting:      #1d4ed8;
      --color-waiting-bg:   #dbeafe;
      --color-success:      #15803d;
      --color-success-bg:   #dcfce7;
      --color-neutral:      #374151;
      --color-neutral-bg:   #f3f4f6;
      --color-link:         #2563eb;
      --toggle-icon:        "☀️";
    }

    /* ── Dark theme ── */
    [data-theme="dark"] {
      --color-bg:           #0f0f0f;
      --color-surface:      #1a1a1a;
      --color-border:       #2d2d2d;
      --color-text:         #f0f0f0;
      --color-text-muted:   #9ca3af;
      --color-brand:        #4ade80;
      --color-brand-bg:     #052e16;
      --color-active:       #fbbf24;
      --color-active-bg:    #1c1400;
      --color-waiting:      #60a5fa;
      --color-waiting-bg:   #0c1a3a;
      --color-success:      #4ade80;
      --color-success-bg:   #052e16;
      --color-neutral:      #d1d5db;
      --color-neutral-bg:   #1f2937;
      --color-link:         #60a5fa;
      --toggle-icon:        "🌙";
    }

    /* ── System preference: dark ── */
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme]) {
        --color-bg:           #0f0f0f;
        --color-surface:      #1a1a1a;
        --color-border:       #2d2d2d;
        --color-text:         #f0f0f0;
        --color-text-muted:   #9ca3af;
        --color-brand:        #4ade80;
        --color-brand-bg:     #052e16;
        --color-active:       #fbbf24;
        --color-active-bg:    #1c1400;
        --color-waiting:      #60a5fa;
        --color-waiting-bg:   #0c1a3a;
        --color-success:      #4ade80;
        --color-success-bg:   #052e16;
        --color-neutral:      #d1d5db;
        --color-neutral-bg:   #1f2937;
        --color-link:         #60a5fa;
        --toggle-icon:        "🌙";
      }
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 14px;
      background: var(--color-bg);
      color: var(--color-text);
      min-height: 100vh;
      padding: 24px;
      transition: background 0.2s, color 0.2s;
    }

    a { color: var(--color-link); }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
    }

    .brand {
      font-size: 20px;
      font-weight: 700;
      color: var(--color-brand);
      letter-spacing: 0.05em;
    }

    .toggle-btn {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 14px;
      color: var(--color-text);
      transition: background 0.15s;
    }
    .toggle-btn:hover { background: var(--color-border); }

    .card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 10px;
      padding: 20px 24px;
      margin-bottom: 16px;
    }

    .card-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--color-text-muted);
      margin-bottom: 10px;
    }

    .issue-id {
      font-size: 18px;
      font-weight: 700;
      color: var(--color-brand);
    }

    .issue-title {
      font-size: 16px;
      color: var(--color-text);
      margin-top: 4px;
    }

    .meta-row {
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
    }

    .meta-item { display: flex; flex-direction: column; gap: 4px; }
    .meta-label { font-size: 11px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
    .meta-value { font-size: 15px; font-weight: 600; }

    .phase-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .phase--active   { background: var(--color-active-bg);  color: var(--color-active);  }
    .phase--waiting  { background: var(--color-waiting-bg); color: var(--color-waiting); }
    .phase--success  { background: var(--color-success-bg); color: var(--color-success); }
    .phase--neutral  { background: var(--color-neutral-bg); color: var(--color-neutral); }

    .footer {
      margin-top: 24px;
      font-size: 12px;
      color: var(--color-text-muted);
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="brand">▐ QUETZ ▌</span>
    <button class="toggle-btn" id="theme-toggle" aria-label="Toggle dark/light mode">
      Toggle theme
    </button>
  </div>

  <div class="card">
    <div class="card-title">Current issue</div>
    <div class="issue-id">${escapeHtml(state.issueId)}</div>
    <div class="issue-title">${escapeHtml(state.issueTitle)}</div>
  </div>

  <div class="card">
    <div class="card-title">Status</div>
    <div class="meta-row">
      <div class="meta-item">
        <span class="meta-label">Phase</span>
        <span class="phase-badge ${phaseClass[state.phase]}">${escapeHtml(phaseLabel[state.phase])}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Progress</span>
        <span class="meta-value">${state.iteration} / ${state.total}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Elapsed</span>
        <span class="meta-value">${escapeHtml(state.elapsed)}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Pull Request</span>
        <span class="meta-value">${prLink}</span>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Timeline</div>
    <div class="meta-row">
      <div class="meta-item">
        <span class="meta-label">Started</span>
        <span class="meta-value">${escapeHtml(state.startedAt)}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Updated</span>
        <span class="meta-value">${escapeHtml(state.updatedAt)}</span>
      </div>
    </div>
  </div>

  <div class="footer">Auto-refreshes every 10 seconds · Quetz v0.1.0</div>

  <script>
    (function () {
      var STORAGE_KEY = 'quetz-theme';
      var root = document.documentElement;
      var btn  = document.getElementById('theme-toggle');

      // Resolve effective theme: stored preference > system preference > light
      function resolveTheme() {
        var stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'dark' || stored === 'light') return stored;
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
        return 'light';
      }

      function applyTheme(theme) {
        if (theme === 'dark') {
          root.setAttribute('data-theme', 'dark');
        } else {
          root.removeAttribute('data-theme');
        }
        btn.textContent = theme === 'dark' ? '☀️  Light mode' : '🌙  Dark mode';
      }

      function toggleTheme() {
        var current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        var next = current === 'dark' ? 'light' : 'dark';
        localStorage.setItem(STORAGE_KEY, next);
        applyTheme(next);
      }

      // Initialise
      applyTheme(resolveTheme());
      btn.addEventListener('click', toggleTheme);

      // React to system preference changes (only when no stored preference)
      if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
          if (!localStorage.getItem(STORAGE_KEY)) {
            applyTheme(e.matches ? 'dark' : 'light');
          }
        });
      }
    })();
  </script>
</body>
</html>
`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function writeDashboard(outputPath: string, state: DashboardState): void {
  fs.writeFileSync(outputPath, generateDashboardHtml(state), 'utf8');
}

export function getDashboardPath(cwd: string = process.cwd()): string {
  return path.join(cwd, '.quetz-dashboard.html');
}
