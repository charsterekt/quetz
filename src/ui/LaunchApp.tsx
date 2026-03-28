import { ui, rgb } from '@rezi-ui/core';
import { createNodeApp } from '@rezi-ui/node';

import { AGENT_EFFORT_LEVELS, getProviderDescriptor, type AgentEffortLevel, type AgentProvider } from '../provider.js';
import { c, hexToRgb } from './theme.js';
import { LOGO_LINES, LOGO_TAGLINE } from './logo.js';

function fg(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r, g, b);
}

function bg(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r, g, b);
}

export type LaunchBeadsMode = 'all' | 'epic';
export type LaunchRunMode = 'pr' | 'commit' | 'amend';

export interface LaunchSelection {
  provider: AgentProvider;
  model?: string;
  effort?: AgentEffortLevel;
  simulate: boolean;
  localCommits: boolean;
  amend: boolean;
  customPrompt?: string;
  beadsMode: LaunchBeadsMode;
  epicId?: string;
}

export interface LaunchIssueCounts {
  live: number;
  simulate: number;
}

interface LaunchState {
  provider: AgentProvider;
  model: string;
  effort: string;
  customPrompt: string;
  beadsMode: LaunchBeadsMode;
  epicId: string;
  simulate: boolean;
  runMode: LaunchRunMode;
  issueCounts: LaunchIssueCounts;
}

export interface MountLaunchOptions {
  version: string;
  initialSelection: LaunchSelection;
  issueCounts: LaunchIssueCounts;
}

export interface LaunchAppHandle {
  ready: Promise<void>;
  result: Promise<LaunchSelection | null>;
  unmount: () => Promise<void>;
}

function buildModelOptions(provider: AgentProvider, model: string) {
  const descriptor = getProviderDescriptor(provider);
  const options = descriptor.knownModels.map(value => ({ value, label: value }));

  if (model && !descriptor.knownModels.includes(model)) {
    options.unshift({ value: model, label: `${model} (custom)` });
  }

  return options;
}

function normalizeInitialState(initialSelection: LaunchSelection, issueCounts: LaunchIssueCounts): LaunchState {
  const provider = initialSelection.provider;
  const descriptor = getProviderDescriptor(provider);

  return {
    provider,
    model: initialSelection.model ?? descriptor.defaultModel,
    effort: initialSelection.effort ?? '',
    customPrompt: initialSelection.customPrompt ?? '',
    beadsMode: initialSelection.beadsMode,
    epicId: initialSelection.epicId ?? '',
    simulate: initialSelection.simulate,
    runMode: initialSelection.amend ? 'amend' : (initialSelection.localCommits ? 'commit' : 'pr'),
    issueCounts,
  };
}

function toSelection(state: LaunchState): LaunchSelection {
  const customPrompt = state.customPrompt.trim();
  const epicId = state.epicId.trim();

  return {
    provider: state.provider,
    model: state.model || undefined,
    effort: state.effort ? state.effort as AgentEffortLevel : undefined,
    simulate: state.simulate,
    localCommits: state.runMode === 'commit',
    amend: state.runMode === 'amend',
    customPrompt: customPrompt || undefined,
    beadsMode: state.beadsMode,
    epicId: epicId || undefined,
  };
}

function heroSubtitle(): string {
  return `// ${LOGO_TAGLINE}`;
}

function panelWidth(termCols: number, stacked: boolean): number {
  if (stacked) {
    return Math.max(46, Math.min(termCols - 8, 78));
  }

  return Math.max(48, Math.min(Math.floor((termCols - 14) / 2), 58));
}

export function mountLaunchApp({ version, initialSelection, issueCounts }: MountLaunchOptions): LaunchAppHandle {
  const app = createNodeApp<LaunchState>({
    initialState: normalizeInitialState(initialSelection, issueCounts),
  });

  let resolveResult!: (value: LaunchSelection | null) => void;
  const result = new Promise<LaunchSelection | null>(resolve => {
    resolveResult = resolve;
  });
  let settled = false;

  const settle = (value: LaunchSelection | null) => {
    if (settled) return;
    settled = true;
    resolveResult(value);
  };

  app.keys({
    q: () => settle(null),
    'ctrl+c': () => settle(null),
  });

  app.view((state: LaunchState) => {
    const termCols = process.stdout.columns ?? 120;
    const stacked = termCols < 112;
    const width = panelWidth(termCols, stacked);
    const panelGap = stacked ? 1 : 4;
    const contentWidth = stacked ? width : (width * 2) + panelGap;
    const logoWidth = Math.max(...LOGO_LINES.map(line => line.length));
    const liveIssueCount = state.issueCounts.live;
    const issueCountLabel = 'total_issues';

    const providerOptions = [
      { value: 'claude', label: 'claude' },
      { value: 'codex', label: 'codex' },
    ];
    const effortOptions = [
      { value: '', label: 'default' },
      ...AGENT_EFFORT_LEVELS.map(value => ({ value, label: value })),
    ];
    const runModeOptions = [
      { value: 'pr', label: 'pr' },
      { value: 'commit', label: 'commit' },
      { value: 'amend', label: 'amend' },
    ];
    const beadsOptions = [
      { value: 'all', label: 'all' },
      { value: 'epic', label: 'epic' },
    ];

    const leftPanel = ui.box(
      {
        border: 'single',
        borderStyle: { fg: fg(c.border) },
        px: 1,
        py: 1,
        width,
      },
      [
        ui.column({ width: 'full', gap: 1 }, [
          ui.text('// model_configuration', { style: { fg: fg(c.muted) } }),
          ui.field({
            label: 'provider',
            children: ui.radioGroup({
              id: 'launch-provider',
              value: state.provider,
              options: providerOptions,
              direction: 'horizontal',
              onChange: value => {
                if (value !== 'claude' && value !== 'codex') return;
                app.update(prev => {
                  const descriptor = getProviderDescriptor(value);
                  const nextModel = descriptor.knownModels.includes(prev.model)
                    ? prev.model
                    : descriptor.defaultModel;
                  return {
                    ...prev,
                    provider: value,
                    model: nextModel,
                  };
                });
              },
            }),
          }),
          ui.field({
            label: 'model',
            children: ui.select({
              id: 'launch-model',
              value: state.model,
              options: buildModelOptions(state.provider, state.model),
              onChange: value => app.update(prev => ({ ...prev, model: value })),
            }),
          }),
          ui.field({
            label: 'effort',
            children: ui.radioGroup({
              id: 'launch-effort',
              value: state.effort,
              options: effortOptions,
              direction: stacked ? 'vertical' : 'horizontal',
              onChange: value => app.update(prev => ({ ...prev, effort: value })),
            }),
          }),
          ui.field({
            label: 'custom_prompt',
            children: ui.textarea({
              id: 'launch-custom-prompt',
              value: state.customPrompt,
              rows: 4,
              placeholder: 'enter additional instructions...',
              onInput: value => app.update(prev => ({ ...prev, customPrompt: value })),
            }),
          }),
        ]),
      ],
    );

    const rightPanel = ui.box(
      {
        border: 'single',
        borderStyle: { fg: fg(c.border) },
        px: 1,
        py: 1,
        width,
      },
      [
        ui.column({ width: 'full', gap: 1 }, [
          ui.text('// run_mode', { style: { fg: fg(c.muted) } }),
          ui.field({
            label: 'mode',
            children: ui.radioGroup({
              id: 'launch-run-mode',
              value: state.runMode,
              options: runModeOptions,
              direction: 'horizontal',
              onChange: value => {
                if (value !== 'pr' && value !== 'commit' && value !== 'amend') return;
                app.update(prev => ({ ...prev, runMode: value }));
              },
            }),
          }),
          ui.field({
            label: 'beads_mode',
            children: ui.radioGroup({
              id: 'launch-beads-mode',
              value: state.beadsMode,
              options: beadsOptions,
              direction: 'horizontal',
              onChange: value => {
                if (value !== 'all' && value !== 'epic') return;
                app.update(prev => ({ ...prev, beadsMode: value }));
              },
            }),
          }),
          ui.field({
            label: 'epic_id',
            children: ui.input({
              id: 'launch-epic-id',
              value: state.epicId,
              disabled: state.beadsMode !== 'epic',
              placeholder: 'enter_epic_id...',
              onInput: value => app.update(prev => ({ ...prev, epicId: value })),
            }),
          }),
          ui.box(
            {
              border: 'single',
              borderStyle: { fg: fg(state.simulate ? c.accent : c.border) },
              px: 1,
              py: 1,
              width: 'full',
            },
            [
              ui.column({ width: 'full', gap: 0 }, [
                ui.checkbox({
                  id: 'launch-simulate',
                  checked: state.simulate,
                  label: '[!] simulate',
                  onChange: checked => app.update(prev => ({ ...prev, simulate: checked })),
                }),
                ui.text(
                  state.simulate
                    ? 'dry_run — mock issues and restricted tools'
                    : 'live_run — real repo changes may be made',
                  { style: { fg: fg(c.dim) } },
                ),
              ]),
            ],
          ),
          ui.row({ items: 'end', gap: 1 }, [
            ui.text(String(liveIssueCount), {
              style: { fg: fg(state.simulate ? c.accent : c.brand), bold: true },
            }),
            ui.text(issueCountLabel, { style: { fg: fg(c.muted) } }),
          ]),
        ]),
      ],
    );

    const panelRow = stacked
      ? ui.column({ gap: 1, items: 'center' }, [leftPanel, rightPanel])
      : ui.row({ gap: panelGap, items: 'start', justify: 'center' }, [leftPanel, rightPanel]);

    const logoBlock = ui.column({ gap: 0 }, [
      ...LOGO_LINES.map((line, index) =>
        ui.text(line, {
          key: String(index),
          style: { fg: fg(c.logo) },
        }),
      ),
    ]);

    return ui.box(
      {
        width: 'full',
        height: 'full',
        style: { bg: bg(c.bg) },
        px: 0,
        py: 1,
      },
      [
        ui.column({ width: 'full', height: 'full', justify: 'center', items: 'center' }, [
          ui.column({ width: contentWidth, gap: 2 }, [
            ui.row({ width: 'full', justify: 'center' }, [
              ui.box({ width: logoWidth }, [logoBlock]),
            ]),
            ui.row({ width: 'full', justify: 'center' }, [
              ui.text(heroSubtitle(), { style: { fg: fg(c.dim) } }),
            ]),
            ui.row({ width: 'full', justify: 'center' }, [
              ui.text(`v${version}`, { style: { fg: fg(c.muted) } }),
            ]),
            panelRow,
            ui.row({ width: 'full', justify: 'center' }, [
              ui.button({
                id: 'launch-start',
                label: '$ quetz start',
                px: 4,
                style: { fg: fg(c.bg), bg: fg(c.brand), bold: true },
                pressedStyle: { fg: fg(c.bg), bg: fg(c.logo), bold: true },
                onPress: () => settle(toSelection(state)),
              }),
            ]),
            ui.row({ width: 'full', justify: 'center' }, [
              ui.text('q quit  |  tab navigate  |  arrows adjust  |  enter select', {
                style: { fg: fg(c.muted) },
              }),
            ]),
          ]),
        ]),
      ],
    );
  });

  const ready = app.start();
  let unmounted = false;

  return {
    ready,
    result,
    unmount: async () => {
      if (unmounted) return;
      unmounted = true;
      try {
        await ready;
      } catch {
        return;
      }
      await app.stop();
    },
  };
}
