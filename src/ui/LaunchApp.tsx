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
const FOCUS_FG = c.cyan;
const HERO_SUBTITLE = '// autonomous_code_agent';

const BUTTON_FOCUS = {
  indicator: 'underline' as const,
  style: { fg: fg('#FAFAFA'), bold: true },
  contentStyle: { bold: true, underline: true },
};

const CHIP_FOCUS = {
  indicator: 'underline' as const,
  style: { fg: fg('#FAFAFA'), bold: true },
  contentStyle: { bold: true, underline: true },
};

const INLINE_INPUT_FOCUS = {
  indicator: 'none' as const,
};

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
  effort: AgentEffortLevel;
  customPrompt: string;
  beadsMode: LaunchBeadsMode;
  epicId: string;
  simulate: boolean;
  runMode: LaunchRunMode;
  issueCounts: LaunchIssueCounts;
  focusedId: string | null;
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

function canonicalizeLaunchModel(provider: AgentProvider, model: string): string {
  const value = model.trim().toLowerCase();

  if (provider === 'claude') {
    if (value.includes('haiku')) return 'haiku';
    if (value.includes('opus')) return 'opus';
    if (value.includes('sonnet')) return 'sonnet';
    return model;
  }

  if (value.includes('codex')) return 'gpt-5-codex';
  if (value.includes('gpt-5.1')) return 'gpt-5.1';
  if (value.includes('gpt-5')) return 'gpt-5';
  return model;
}

function displayModelLabel(provider: AgentProvider, model: string): string {
  const canonical = canonicalizeLaunchModel(provider, model);

  switch (canonical) {
    case 'gpt-5-codex':
      return 'codex';
    default:
      return canonical;
  }
}

function sanitizeIdSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function buildModelChoices(provider: AgentProvider, currentModel: string) {
  const descriptor = getProviderDescriptor(provider);
  const choices = descriptor.knownModels.map(value => ({
    value,
    label: displayModelLabel(provider, value),
  }));

  if (currentModel && !descriptor.knownModels.includes(currentModel)) {
    choices.unshift({
      value: currentModel,
      label: `${displayModelLabel(provider, currentModel)}*`,
    });
  }

  return choices;
}

function normalizeInitialState(initialSelection: LaunchSelection, issueCounts: LaunchIssueCounts): LaunchState {
  const provider = initialSelection.provider;
  const descriptor = getProviderDescriptor(provider);
  const model = canonicalizeLaunchModel(provider, initialSelection.model ?? descriptor.defaultModel);

  return {
    provider,
    model,
    effort: initialSelection.effort ?? 'medium',
    customPrompt: initialSelection.customPrompt ?? '',
    beadsMode: initialSelection.beadsMode,
    epicId: initialSelection.epicId ?? '',
    simulate: initialSelection.simulate,
    runMode: initialSelection.amend ? 'amend' : (initialSelection.localCommits ? 'commit' : 'pr'),
    issueCounts,
    focusedId: null,
  };
}

function toSelection(state: LaunchState): LaunchSelection {
  const customPrompt = state.customPrompt.trim();
  const epicId = state.epicId.trim();

  return {
    provider: state.provider,
    model: state.model || undefined,
    effort: state.effort,
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

function isFocusedId(focusedId: string | null, id: string): boolean {
  return focusedId === id;
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
        focusConfig: CHIP_FOCUS,
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
    { gap: 1, wrap: true },
    options.map(option =>
      launchChip(
        `${groupId}-${sanitizeIdSegment(option.value)}`,
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

function fieldShell(children: any[], focused: boolean, disabled = false) {
  return ui.box(
    {
      border: 'single',
      borderStyle: { fg: fg(focused ? FOCUS_FG : c.border), bold: focused },
      style: { bg: bg(SURFACE_BG), dim: disabled },
      px: 1,
      py: 1,
      width: 'full',
    },
    children,
  );
}

function simulateToggle(active: boolean, onChange: (checked: boolean) => void) {
  return ui.checkbox({
    id: 'launch-simulate',
    checked: active,
    dsTone: 'warning',
    dsSize: 'lg',
    focusConfig: BUTTON_FOCUS,
    onChange,
  });
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

  const cleanupFocus = app.onFocusChange(info => {
    app.update(prev => (
      prev.focusedId === info.id
        ? prev
        : { ...prev, focusedId: info.id }
    ));
  });

  app.view((state: LaunchState) => {
    const termCols = process.stdout.columns ?? 120;
    const stacked = termCols < 112;
    const width = panelWidth(termCols, stacked);
    const panelGap = stacked ? 2 : 3;
    const baseContentWidth = stacked ? width : (width * 2) + panelGap;
    const logoLines: readonly string[] = LOGO_LINES;
    const logoWidth = Math.max(...logoLines.map(line => line.length));
    const contentWidth = Math.min(termCols - 4, Math.max(baseContentWidth, logoWidth));
    const issueCount = state.simulate ? state.issueCounts.simulate : state.issueCounts.live;
    const modelChoices = buildModelChoices(state.provider, state.model);

    const providerOptions = [
      { value: 'claude', label: 'claude' },
      { value: 'codex', label: 'codex' },
    ];
    const effortOptions: ReadonlyArray<{ value: AgentEffortLevel; label: string }> = [
      { value: 'low', label: 'low' },
      { value: 'medium', label: 'medium' },
      { value: 'high', label: 'high' },
      { value: 'max', label: 'max*' },
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
                const currentModel = canonicalizeLaunchModel(provider, prev.model);
                const nextModel = descriptor.knownModels.includes(currentModel)
                  ? currentModel
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
            launchGroupRow('launch-model', state.model, 'success', modelChoices, value =>
              app.update(prev => ({ ...prev, model: value }))
            ),
          ]),
          launchSection('thinking', [
            launchGroupRow('launch-effort', state.effort, 'warning', effortOptions, value =>
              app.update(prev => ({ ...prev, effort: value as AgentEffortLevel }))
            ),
          ]),
          launchSection('custom_prompt', [
            fieldShell(
              [
                ui.input({
                  id: 'launch-custom-prompt',
                  accessibleLabel: 'Custom prompt',
                  value: state.customPrompt,
                  placeholder: 'enter additional instructions...',
                  focusConfig: INLINE_INPUT_FOCUS,
                  style: { fg: fg(c.text) },
                  onInput: value => app.update(prev => ({ ...prev, customPrompt: value })),
                }),
              ],
              isFocusedId(state.focusedId, 'launch-custom-prompt'),
            ),
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
            fieldShell(
              [
                ui.input({
                  id: 'launch-epic-id',
                  accessibleLabel: 'Epic ID',
                  value: state.epicId,
                  disabled: state.beadsMode !== 'epic',
                  placeholder: 'enter_epic_id...',
                  focusable: state.beadsMode === 'epic',
                  focusConfig: INLINE_INPUT_FOCUS,
                  style: { fg: fg(c.text), dim: state.beadsMode !== 'epic' },
                  onInput: value => app.update(prev => ({ ...prev, epicId: value })),
                }),
              ],
              isFocusedId(state.focusedId, 'launch-epic-id'),
              state.beadsMode !== 'epic',
            ),
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
                  simulateToggle(state.simulate, checked =>
                    app.update(prev => ({ ...prev, simulate: checked }))
                  ),
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
          ui.row({ items: 'center', gap: 2 }, [
            ui.box(
              {
                border: 'single',
                borderStyle: { fg: fg(WARNING_FG) },
                style: { bg: bg(PANEL_BG) },
                px: 3,
                py: 1,
              },
              [
                ui.text(String(issueCount), {
                  variant: 'heading',
                  style: { fg: fg(WARNING_FG), bold: true },
                }),
              ],
            ),
            ui.text('total_issues', { style: { fg: fg(c.dim) } }),
          ]),
        ]),
      ],
    );

    const panelRow = stacked
      ? ui.column({ gap: 2, items: 'center' }, [leftPanel, rightPanel])
      : ui.row({ gap: panelGap, items: 'stretch', justify: 'center' }, [leftPanel, rightPanel]);

    const logoBlock = ui.column(
      { width: logoWidth, gap: 0 },
      logoLines.map((line, index) =>
        ui.text(line, {
          key: String(index),
          style: { fg: fg(c.logo) },
        }),
      ),
    );

    const topBlock = ui.column({ width: contentWidth, gap: 1 }, [
      ui.row({ width: 'full', justify: 'center' }, [logoBlock]),
      ui.column({ width: 'full', gap: 1, items: 'center' }, [
        ui.text(HERO_SUBTITLE, { style: { fg: fg(c.dim) } }),
        ui.text(`v${version}`, { style: { fg: fg(c.muted) } }),
      ]),
      ui.row({ width: 'full', justify: 'center' }, [
        ui.text('-'.repeat(Math.max(24, contentWidth)), { style: { fg: fg(c.border) } }),
      ]),
      panelRow,
    ]);

    const bottomBlock = ui.column({ width: contentWidth, gap: 1, items: 'center' }, [
      ui.row({ width: 'full', justify: 'center' }, [
        ui.box(
          {
            border: 'none',
            style: { bg: bg(SUCCESS_FG) },
            px: 5,
            py: 1,
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
        ui.text('q quit  |  tab navigate  |  enter/space select', {
          style: { fg: fg(c.muted) },
        }),
      ]),
    ]);

    return ui.box(
      {
        border: 'none',
        width: 'full',
        height: 'full',
        style: { bg: bg(c.bg) },
        px: 0,
        py: 1,
      },
      [
        ui.column({ width: 'full', height: 'full', justify: 'between', items: 'center' }, [
          topBlock,
          bottomBlock,
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
      cleanupFocus();
      try {
        await ready;
      } catch {
        return;
      }
      await app.stop();
    },
  };
}
