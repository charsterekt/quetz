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
const SUCCESS_BG = '#285943';
const WARNING_BG = '#664923';
const DANGER_BG = '#612F24';
const SUCCESS_FG = '#0DBC79';
const WARNING_FG = '#FF8400';
const DANGER_FG = '#FF5C33';
const CHIP_SELECTED_FG = '#FAFAFA';
const HERO_SUBTITLE = '// the feathered serpent dev loop';
const CUSTOM_PROMPT_ROWS = 6;
const SINGLE_PANEL_MIN_WIDTH = 60;
const TWO_PANEL_MIN_COLS = (SINGLE_PANEL_MIN_WIDTH * 2) + 6; // 2 panels + gap + side padding
const LAUNCH_MIN_COLS = 175;
const LAUNCH_MIN_ROWS = 55;

const TEXTAREA_FOCUS = {
  indicator: 'none' as const,
};

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

export interface LaunchIssueCountInput {
  beadsMode: LaunchBeadsMode;
  epicId: string;
  simulate: boolean;
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
  resolveIssueCount?: (input: LaunchIssueCountInput) => number;
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

  return Math.max(SINGLE_PANEL_MIN_WIDTH, Math.min(Math.floor((termCols - 14) / 2), 84));
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
  focused: boolean,
  tone: LaunchTone,
  onPress: () => void,
) {
  const selectedFg = toneForeground(tone);
  const highlighted = selected || focused;

  return ui.box(
    {
      border: 'single',
      borderStyle: { fg: fg(highlighted ? selectedFg : c.border), bold: highlighted },
      style: { bg: bg(PANEL_BG) },
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
        style: { fg: fg(selected ? selectedFg : c.dim), bold: selected },
        onPress,
      }),
    ],
  );
}

function launchGroupRow(
  groupId: string,
  focusedId: string | null,
  selectedValue: string,
  tone: LaunchTone,
  options: ReadonlyArray<{ value: string; label: string }>,
  onSelect: (value: string) => void,
) {
  return ui.focusZone(
    { id: `zone-${groupId}`, navigation: 'linear' },
    [
      ui.row(
        { gap: 1, wrap: true },
        options.map(option => {
          const optionId = `${groupId}-${sanitizeIdSegment(option.value)}`;
          return launchChip(
            optionId,
            option.label,
            selectedValue === option.value,
            isFocusedId(focusedId, optionId),
            tone,
            () => onSelect(option.value),
          );
        }),
      ),
    ],
  );
}

function launchSection(title: string, children: any[]) {
  return ui.column({ width: 'full', gap: 1 }, [labelText(title), ...children]);
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

export function mountLaunchApp({ version, initialSelection, issueCounts, resolveIssueCount }: MountLaunchOptions): LaunchAppHandle {
  const app = createNodeApp<LaunchState>({
    initialState: normalizeInitialState(initialSelection, issueCounts),
  });
  let viewportCols = process.stdout.columns ?? 120;
  let viewportRows = process.stdout.rows ?? 40;

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

  const cleanupEvents = app.onEvent(ev => {
    if (ev.kind !== 'engine' || ev.event.kind !== 'resize') {
      return;
    }

    if ('cols' in ev.event && typeof ev.event.cols === 'number') {
      viewportCols = ev.event.cols;
    }
    if ('rows' in ev.event && typeof ev.event.rows === 'number') {
      viewportRows = ev.event.rows;
    }
    app.update(prev => ({ ...prev }));
  });

  app.view((state: LaunchState) => {
    const termCols = viewportCols;
    const termRows = viewportRows;
    const forceContentScroll = termRows < 42;
    const stacked = termCols < TWO_PANEL_MIN_COLS;
    const width = panelWidth(termCols, stacked);
    const panelGap = stacked ? 1 : 2;
    const baseContentWidth = stacked ? width : (width * 2) + panelGap;
    const hideLogo = termRows < 35;
    const logoLines = hideLogo ? [] : LOGO_LINES;
    const logoWidth = logoLines.length ? Math.max(...logoLines.map(line => line.length)) : 0;
    const contentWidth = Math.min(termCols - 4, Math.max(baseContentWidth, logoWidth));
    const issueCount = resolveIssueCount
      ? resolveIssueCount({
          beadsMode: state.beadsMode,
          epicId: state.epicId,
          simulate: state.simulate,
        })
      : (state.simulate ? state.issueCounts.simulate : state.issueCounts.live);
    const modelChoices = buildModelChoices(state.provider, state.model);
    const simulateActive = state.simulate;
    const launchSizeWarnings = [
      ...(termCols < LAUNCH_MIN_COLS
        ? [`warning: terminal width ${termCols} < ${LAUNCH_MIN_COLS}`]
        : []),
      ...(termRows < LAUNCH_MIN_ROWS
        ? [`warning: terminal height ${termRows} < ${LAUNCH_MIN_ROWS}`]
        : []),
    ];

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
        ui.column({ width: 'full', gap: 1, justify: 'start' }, [
          ui.text('// model_configuration', { style: { fg: fg(c.dim) } }),
          launchSection('provider', [
            launchGroupRow('launch-provider', state.focusedId, state.provider, 'success', providerOptions, value => {
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
            ui.box(
              {
                border: 'single',
                borderStyle: {
                  fg: fg(isFocusedId(state.focusedId, 'launch-model') ? SUCCESS_FG : c.border),
                },
                style: { bg: bg(SURFACE_BG) },
                px: 1,
                py: 0,
                width: 'full',
              },
              [
                ui.select({
                  id: 'launch-model',
                  value: state.model,
                  options: modelChoices,
                  onChange: (value: string) => app.update(prev => ({ ...prev, model: value })),
                  dsSize: 'md',
                }),
              ]
            ),
          ]),
          launchSection('thinking', [
            launchGroupRow('launch-effort', state.focusedId, state.effort, 'warning', effortOptions, value =>
              app.update(prev => ({ ...prev, effort: value as AgentEffortLevel }))
            ),
          ]),
          launchSection('custom_prompt', [
            ui.textarea({
              id: 'launch-custom-prompt',
              accessibleLabel: 'Custom prompt',
              value: state.customPrompt,
              placeholder: 'enter additional instructions...',
              style: { fg: fg(c.text) },
              onInput: value => app.update(prev => ({ ...prev, customPrompt: value })),
              rows: CUSTOM_PROMPT_ROWS,
              wordWrap: true,
              focusConfig: TEXTAREA_FOCUS,
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
        ui.column({ width: 'full', gap: 1, justify: 'start' }, [
          ui.text('// run_mode', { style: { fg: fg(c.dim) } }),
          launchSection('mode', [
            launchGroupRow('launch-run-mode', state.focusedId, state.runMode, 'success', runModeOptions, value => {
              if (value !== 'pr' && value !== 'commit' && value !== 'amend') return;
              app.update(prev => ({ ...prev, runMode: value as LaunchRunMode }));
            }),
          ]),
          launchSection('beads_mode', [
            launchGroupRow('launch-beads-mode', state.focusedId, state.beadsMode, 'success', beadsOptions, value => {
              if (value !== 'all' && value !== 'epic') return;
              app.update(prev => ({ ...prev, beadsMode: value as LaunchBeadsMode }));
            }),
            ui.textarea({
              id: 'launch-epic-id',
              accessibleLabel: 'Epic ID',
              value: state.epicId,
              disabled: state.beadsMode !== 'epic',
              placeholder: 'enter_epic_id...',
              focusable: state.beadsMode === 'epic',
              style: { fg: fg(c.text), dim: state.beadsMode !== 'epic' },
              onInput: value => app.update(prev => ({ ...prev, epicId: value })),
              rows: 3,
              wordWrap: false,
              focusConfig: TEXTAREA_FOCUS,
            }),
          ]),
          ui.box(
            {
              border: 'single',
              borderStyle: {
                fg: fg(
                  isFocusedId(state.focusedId, 'launch-simulate')
                    ? WARNING_FG
                    : (simulateActive ? DANGER_FG : c.border)
                ),
              },
              style: { bg: bg(PANEL_BG) },
              px: 2,
              py: 1,
              width: 'full',
            },
            [
              ui.column({ width: 'full', gap: 1 }, [
                ui.row({ width: 'full', justify: 'between', items: 'center' }, [
                  ui.row({ gap: 1 }, [
                    ui.text(simulateActive ? '[!]' : '[ ]', {
                      style: { fg: fg(simulateActive ? DANGER_FG : c.dim), bold: simulateActive },
                    }),
                    ui.text('simulate', {
                      style: { fg: fg(simulateActive ? DANGER_FG : c.dim), bold: simulateActive },
                    }),
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
          ui.row({ items: 'center', gap: 2, pt: 1, pl: 1 }, [
            ui.text(String(issueCount), {
              style: { fg: fg(WARNING_FG), bold: true },
            }),
            ui.text('total_issues', { style: { fg: fg(c.dim) } }),
          ]),
        ]),
      ],
    );

    const panelRow = stacked
      ? ui.column({ gap: 1, items: 'center' }, [leftPanel, rightPanel])
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

    const headerBlock = logoLines.length
      ? ui.column({ width: 'full', items: 'center', pt: 1 }, [logoBlock])
      : null;

    const mainContent = ui.column({ width: contentWidth, gap: 1 }, [
      ui.column({ width: 'full', gap: 0, items: 'center' }, [
        ui.text(HERO_SUBTITLE, { style: { fg: fg(c.dim) } }),
        ...launchSizeWarnings.map((warning, index) =>
          ui.text(warning, {
            key: `launch-size-warning-${index}`,
            style: { fg: fg(DANGER_FG), bold: true },
          }),
        ),
        ui.text(`v${version}`, { style: { fg: fg(c.muted) } }),
      ]),
      ui.row({ width: 'full', justify: 'center' }, [
        ui.text('-'.repeat(Math.max(24, contentWidth)), { style: { fg: fg(c.border) } }),
      ]),
      panelRow,
    ]);

    const footerBlock = ui.column({ width: 'full', gap: 1, items: 'center', pb: 1 }, [
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
              dsVariant: 'ghost',
              focusConfig: BUTTON_FOCUS,
              style: { fg: fg(c.bg), bg: bg(SUCCESS_FG), bold: true },
              onPress: () => settle(toSelection(state)),
            }),
          ],
        ),
      ]),
      ui.row({ width: 'full', justify: 'center' }, [
        ui.text('esc ctrl+c quit  |  ←→ navigate  |  tab switch  |  ↵ select', {
          style: { fg: fg(c.muted) },
        }),
      ]),
    ]);

    if (forceContentScroll) {
      return ui.column(
        {
          width: 'full',
          height: 'full',
          style: { bg: bg(c.bg) },
          overflow: 'scroll',
        },
        [
          ...(headerBlock ? [headerBlock] : []),
          ui.column({ width: 'full', items: 'center', gap: 1, pt: 1, pb: 1 }, [
            mainContent,
            footerBlock,
          ]),
        ],
      );
    }

    return ui.column(
      {
        width: 'full',
        height: 'full',
        style: { bg: bg(c.bg) },
      },
      [
        ...(headerBlock ? [headerBlock] : []),
        ui.column({
          width: 'full',
          flex: 1,
          items: 'center',
          justify: 'center',
        }, [
          mainContent,
        ]),
        footerBlock,
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
      cleanupEvents();
      try {
        await ready;
      } catch {
        return;
      }
      await app.stop();
    },
  };
}
