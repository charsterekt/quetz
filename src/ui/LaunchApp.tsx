import { ui, rgb } from '@rezi-ui/core';
import { createNodeApp } from '@rezi-ui/node';

import { getProviderDescriptor, type AgentEffortLevel, type AgentProvider } from '../provider.js';
import { LOGO_LINES } from './logo.js';
import { c, hexToRgb } from './theme.js';

function fg(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r, g, b);
}

function bg(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r, g, b);
}

const SURFACE_BG = '#1A1A1A';
const PANEL_BG = '#0F0F0F';
const SUCCESS_BG = '#16261D';
const WARNING_BG = '#261B11';
const DANGER_BG = '#241512';
const SUCCESS_FG = '#0DBC79';
const WARNING_FG = '#FF8400';
const DANGER_FG = '#FF5C33';
const HERO_SUBTITLE = '// autonomous_code_agent';
const HERO_LOGO_LINES = [
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
const BUTTON_FOCUS = {
  indicator: 'underline' as const,
  style: { fg: fg('#FAFAFA'), bold: true },
  contentStyle: { bold: true, underline: true },
};
const FIELD_FOCUS = {
  indicator: 'ring' as const,
  ringVariant: 'single' as const,
  style: { fg: fg(SUCCESS_FG), bold: true },
  contentStyle: { bold: true },
};

export type LaunchBeadsMode = 'all' | 'epic';
export type LaunchRunMode = 'pr' | 'commit' | 'amend';
type LaunchEffortValue = AgentEffortLevel | 'off';

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
  effort: LaunchEffortValue;
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

function formatModelLabel(provider: AgentProvider, model: string): string {
  if (provider === 'claude') {
    switch (model) {
      case 'haiku':
        return 'claude-haiku-4-20250514';
      case 'sonnet':
        return 'claude-sonnet-4-20250514';
      case 'opus':
        return 'claude-opus-4-20250514';
      default:
        return model;
    }
  }

  return model;
}

function paddedLabel(label: string, targetWidth: number): string {
  return label.padEnd(Math.max(label.length, targetWidth), ' ');
}

function buildModelOptions(provider: AgentProvider, model: string, targetWidth: number) {
  const descriptor = getProviderDescriptor(provider);
  const options = descriptor.knownModels.map(value => ({
    value,
    label: paddedLabel(formatModelLabel(provider, value), targetWidth),
  }));

  if (model && !descriptor.knownModels.includes(model)) {
    options.unshift({ value: model, label: paddedLabel(`${model} (custom)`, targetWidth) });
  }

  return options;
}

function normalizeInitialState(initialSelection: LaunchSelection, issueCounts: LaunchIssueCounts): LaunchState {
  const provider = initialSelection.provider;
  const descriptor = getProviderDescriptor(provider);

  return {
    provider,
    model: initialSelection.model ?? descriptor.defaultModel,
    effort: initialSelection.effort ?? 'medium',
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
    effort: state.effort === 'off' ? undefined : state.effort,
    simulate: state.simulate,
    localCommits: state.runMode === 'commit',
    amend: state.runMode === 'amend',
    customPrompt: customPrompt || undefined,
    beadsMode: state.beadsMode,
    epicId: epicId || undefined,
  };
}

type LaunchTone = 'success' | 'warning' | 'danger';

function panelWidth(termCols: number, stacked: boolean): number {
  if (stacked) {
    return Math.max(58, Math.min(termCols - 8, 90));
  }

  return Math.max(60, Math.min(Math.floor((termCols - 14) / 2), 84));
}

function labelText(label: string) {
  return ui.text(label, { style: { fg: fg(c.muted) } });
}

function toneForeground(tone: LaunchTone): string {
  switch (tone) {
    case 'success':
      return SUCCESS_FG;
    case 'warning':
      return WARNING_FG;
    case 'danger':
      return DANGER_FG;
  }
}

function toneBackground(tone: LaunchTone): string {
  switch (tone) {
    case 'success':
      return SUCCESS_BG;
    case 'warning':
      return WARNING_BG;
    case 'danger':
      return DANGER_BG;
  }
}

function launchChip(
  id: string,
  label: string,
  selected: boolean,
  tone: LaunchTone,
  onPress: () => void,
) {
  const selectedFg = toneForeground(tone);

  return ui.box(
    {
      border: 'single',
      borderStyle: { fg: fg(selected ? selectedFg : c.border) },
      style: { bg: bg(selected ? toneBackground(tone) : PANEL_BG) },
      px: 1,
      py: 0,
    },
    [
      ui.button({
        id,
        label,
        px: 0,
        dsVariant: 'ghost',
        focusConfig: BUTTON_FOCUS,
        style: { fg: fg(selected ? selectedFg : c.dim) },
        onPress,
      }),
    ],
  );
}

function launchGroupRow(
  groupId: string,
  selectedValue: string,
  tone: LaunchTone,
  options: ReadonlyArray<{ value: string; label: string }>,
  onSelect: (value: string) => void,
) {
  return ui.row(
    { gap: 1 },
    options.map(option =>
      launchChip(
        `${groupId}-${option.value}`,
        option.label,
        selectedValue === option.value,
        tone,
        () => onSelect(option.value),
      ),
    ),
  );
}

function launchSection(title: string, children: any[]) {
  return ui.column({ width: 'full', gap: 1 }, [labelText(title), ...children]);
}

function simulateToggle(active: boolean, onPress: () => void) {
  return ui.box(
    {
      border: 'single',
      borderStyle: { fg: fg(c.border) },
      style: { bg: bg(SURFACE_BG) },
      px: 1,
      py: 0,
    },
    [
      ui.button({
        id: 'launch-simulate',
        label: active ? '●' : '○',
        px: 0,
        dsVariant: 'ghost',
        focusConfig: BUTTON_FOCUS,
        style: { fg: fg(c.dim) },
        onPress,
      }),
    ],
  );
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
    esc: () => settle(null),
    'ctrl+c': () => settle(null),
  });

  app.view((state: LaunchState) => {
    const termCols = process.stdout.columns ?? 120;
    const stacked = termCols < 112;
    const width = panelWidth(termCols, stacked);
    const panelGap = stacked ? 2 : 3;
    const baseContentWidth = stacked ? width : (width * 2) + panelGap;
    const heroLogoWidth = Math.max(...HERO_LOGO_LINES.map(line => line.length));
    const logoLines: readonly string[] = termCols >= heroLogoWidth + 4 ? HERO_LOGO_LINES : LOGO_LINES;
    const logoWidth = Math.max(...logoLines.map(line => line.length));
    const contentWidth = Math.min(termCols - 4, Math.max(baseContentWidth, logoWidth));
    const modelLabelWidth = Math.max(30, width - 12);

    const providerOptions = [
      { value: 'claude', label: 'claude' },
      { value: 'codex', label: 'codex' },
    ];
    const effortOptions: ReadonlyArray<{ value: LaunchEffortValue; label: string }> = [
      { value: 'off', label: 'off' },
      { value: 'low', label: 'low' },
      { value: 'medium', label: 'medium' },
      { value: 'high', label: 'high' },
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
        style: { bg: bg(PANEL_BG) },
        px: 2,
        py: 1,
        width,
      },
      [
        ui.column({ width: 'full', gap: 2 }, [
          ui.text('// model_configuration', { style: { fg: fg(c.dim) } }),
          launchSection('provider', [
            launchGroupRow('launch-provider', state.provider, 'success', providerOptions, value => {
              if (value !== 'claude' && value !== 'codex') return;
              app.update(prev => {
                const provider = value as AgentProvider;
                const descriptor = getProviderDescriptor(provider);
                const nextModel = descriptor.knownModels.includes(prev.model)
                  ? prev.model
                  : descriptor.defaultModel;
                return {
                  ...prev,
                  provider,
                  model: nextModel,
                };
              });
            }),
          ]),
          launchSection('model', [
            ui.select({
              id: 'launch-model',
              value: state.model,
              options: buildModelOptions(state.provider, state.model, modelLabelWidth),
              dsVariant: 'outline',
              dsSize: 'sm',
              focusConfig: FIELD_FOCUS,
              onChange: value => app.update(prev => ({ ...prev, model: value })),
            }),
          ]),
          launchSection('thinking', [
            stacked
              ? ui.column(
                  { gap: 1 },
                  effortOptions.map(option =>
                    launchChip(
                      `launch-effort-${option.label}`,
                      option.label,
                      state.effort === option.value,
                      'warning',
                      () => app.update(prev => ({ ...prev, effort: option.value })),
                    ),
                  ),
                )
              : launchGroupRow('launch-effort', state.effort, 'warning', effortOptions, value =>
                  app.update(prev => ({ ...prev, effort: value as LaunchEffortValue })),
                ),
          ]),
          launchSection('custom_prompt', [
            ui.textarea({
              id: 'launch-custom-prompt',
              value: state.customPrompt,
              rows: 3,
              placeholder: 'enter additional instructions...',
              focusConfig: FIELD_FOCUS,
              style: { bg: bg(SURFACE_BG), fg: fg(c.text) },
              onInput: value => app.update(prev => ({ ...prev, customPrompt: value })),
            }),
          ]),
        ]),
      ],
    );

    const rightPanel = ui.box(
      {
        border: 'single',
        borderStyle: { fg: fg(c.border) },
        style: { bg: bg(PANEL_BG) },
        px: 2,
        py: 1,
        width,
      },
      [
        ui.column({ width: 'full', gap: 2 }, [
          ui.text('// run_mode', { style: { fg: fg(c.dim) } }),
          launchSection('mode', [
            launchGroupRow('launch-run-mode', state.runMode, 'success', runModeOptions, value => {
              if (value !== 'pr' && value !== 'commit' && value !== 'amend') return;
              app.update(prev => ({ ...prev, runMode: value as LaunchRunMode }));
            }),
          ]),
          launchSection('beads_mode', [
            launchGroupRow('launch-beads-mode', state.beadsMode, 'success', beadsOptions, value => {
              if (value !== 'all' && value !== 'epic') return;
              app.update(prev => ({ ...prev, beadsMode: value as LaunchBeadsMode }));
            }),
            ui.input({
              id: 'launch-epic-id',
              value: state.epicId,
              disabled: state.beadsMode !== 'epic',
              placeholder: 'enter_epic_id...',
              focusable: state.beadsMode === 'epic',
              focusConfig: FIELD_FOCUS,
              dsSize: 'sm',
              style: { bg: bg(SURFACE_BG), fg: fg(c.text), dim: state.beadsMode !== 'epic' },
              onInput: value => app.update(prev => ({ ...prev, epicId: value })),
            }),
          ]),
          ui.box(
            {
              border: 'single',
              borderStyle: { fg: fg(DANGER_FG) },
              style: { bg: bg(DANGER_BG) },
              px: 2,
              py: 1,
              width: 'full',
            },
            [
              ui.column({ width: 'full', gap: 1 }, [
                ui.row({ width: 'full', justify: 'between', items: 'center' }, [
                  ui.row({ gap: 1 }, [
                    ui.text('[!]', { style: { fg: fg(DANGER_FG), bold: true } }),
                    ui.text('simulate', { style: { fg: fg(DANGER_FG), bold: true } }),
                  ]),
                  simulateToggle(state.simulate, () => app.update(prev => ({ ...prev, simulate: !prev.simulate }))),
                ]),
                ui.text(
                  state.simulate
                    ? 'dry_run - mock issues and restricted tools'
                    : 'dry_run - no changes will be made',
                  { style: { fg: fg(c.dim) } },
                ),
              ]),
            ],
          ),
          ui.row({ items: 'end', gap: 2 }, [
            ui.text(String(state.simulate ? state.issueCounts.simulate : state.issueCounts.live), {
              style: { fg: fg(WARNING_FG), bold: true },
            }),
            ui.text('total_issues', { style: { fg: fg(c.dim) } }),
          ]),
        ]),
      ],
    );

    const panelRow = stacked
      ? ui.column({ gap: 2, items: 'center' }, [leftPanel, rightPanel])
      : ui.row({ gap: panelGap, items: 'start', justify: 'center' }, [leftPanel, rightPanel]);

    const logoBlock = ui.column(
      { width: logoWidth, gap: 0 },
      logoLines.map((line, index) =>
        ui.text(line, {
          key: String(index),
          style: { fg: fg(c.logo) },
        }),
      ),
    );

    return ui.box(
      {
        border: 'none',
        width: 'full',
        height: 'full',
        style: { bg: bg(c.bg) },
        px: 0,
        py: 2,
      },
      [
        ui.column({ width: 'full', height: 'full', justify: 'start', items: 'center' }, [
          ui.column({ width: contentWidth, gap: 2 }, [
            ui.row({ width: 'full', justify: 'center' }, [logoBlock]),
            ui.column({ width: 'full', gap: 1, items: 'center' }, [
              ui.text(HERO_SUBTITLE, { style: { fg: fg(c.dim) } }),
              ui.text(`v${version}`, { style: { fg: fg(c.muted) } }),
            ]),
            ui.row({ width: 'full', justify: 'center' }, [
              ui.text('─'.repeat(Math.max(24, contentWidth)), { style: { fg: fg(c.border) } }),
            ]),
            panelRow,
            ui.row({ width: 'full', justify: 'center' }, [
              ui.box(
                {
                  border: 'none',
                  style: { bg: bg(SUCCESS_FG) },
                  px: 3,
                  py: 0,
                },
                [
                  ui.button({
                    id: 'launch-start',
                    label: '$ quetz start',
                    px: 0,
                    dsVariant: 'ghost',
                    focusConfig: BUTTON_FOCUS,
                    style: { fg: fg(c.bg), bold: true },
                    onPress: () => settle(toSelection(state)),
                  }),
                ],
              ),
            ]),
            ui.row({ width: 'full', justify: 'center' }, [
              ui.text('← esc quit  |  ↑↓ navigate  |  ↵ select', {
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
