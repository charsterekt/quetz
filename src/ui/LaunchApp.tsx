import { ui, rgb } from '@rezi-ui/core';
import { createNodeApp } from '@rezi-ui/node';

import { AGENT_EFFORT_LEVELS, getProviderDescriptor, type AgentEffortLevel, type AgentProvider } from '../provider.js';
import { LOGO_LINES, LOGO_TAGLINE } from './logo.js';
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
const SUCCESS_BG = '#222924';
const WARNING_BG = '#291C0F';
const DANGER_BG = '#24100B';
const SUCCESS_FG = '#0DBC79';
const WARNING_FG = '#FF8400';
const DANGER_FG = '#FF5C33';
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

type LaunchTone = 'success' | 'warning' | 'danger';

function panelWidth(termCols: number, stacked: boolean): number {
  if (stacked) {
    return Math.max(48, Math.min(termCols - 8, 76));
  }

  return Math.max(50, Math.min(Math.floor((termCols - 18) / 2), 60));
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
      style: { bg: bg(selected ? toneBackground(tone) : c.bg) },
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
        style: { fg: fg(selected ? selectedFg : c.dim), bold: selected },
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
    const panelGap = stacked ? 2 : 3;
    const contentWidth = stacked ? width : (width * 2) + panelGap;
    const logoWidth = Math.max(...LOGO_LINES.map(line => line.length));

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
        px: 2,
        py: 1,
        width,
      },
      [
        ui.column({ width: 'full', gap: 1 }, [
          ui.text('// model_configuration', { style: { fg: fg(c.muted) } }),
          labelText('provider'),
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
          labelText('model'),
          ui.select({
            id: 'launch-model',
            value: state.model,
            options: buildModelOptions(state.provider, state.model),
            dsVariant: 'outline',
            dsSize: 'sm',
            focusConfig: FIELD_FOCUS,
            onChange: value => app.update(prev => ({ ...prev, model: value })),
          }),
          labelText('effort'),
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
                app.update(prev => ({ ...prev, effort: value })),
              ),
          labelText('custom_prompt'),
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
      ],
    );

    const rightPanel = ui.box(
      {
        border: 'single',
        borderStyle: { fg: fg(c.border) },
        px: 2,
        py: 1,
        width,
      },
      [
        ui.column({ width: 'full', gap: 1 }, [
          ui.text('// run_mode', { style: { fg: fg(c.muted) } }),
          labelText('mode'),
          launchGroupRow('launch-run-mode', state.runMode, 'success', runModeOptions, value => {
            if (value !== 'pr' && value !== 'commit' && value !== 'amend') return;
            app.update(prev => ({ ...prev, runMode: value as LaunchRunMode }));
          }),
          labelText('beads_mode'),
          launchGroupRow('launch-beads-mode', state.beadsMode, 'success', beadsOptions, value => {
            if (value !== 'all' && value !== 'epic') return;
            app.update(prev => ({ ...prev, beadsMode: value as LaunchBeadsMode }));
          }),
          labelText('epic_id'),
          ui.input({
            id: 'launch-epic-id',
            value: state.epicId,
            disabled: state.beadsMode !== 'epic',
            placeholder: 'enter_epic_id...',
            focusable: state.beadsMode === 'epic',
            focusConfig: FIELD_FOCUS,
            style: { bg: bg(SURFACE_BG), fg: fg(c.text), dim: state.beadsMode !== 'epic' },
            onInput: value => app.update(prev => ({ ...prev, epicId: value })),
          }),
          ui.box(
            {
              border: 'single',
              borderStyle: { fg: fg(state.simulate ? DANGER_FG : c.border) },
              style: { bg: bg(state.simulate ? DANGER_BG : c.bg) },
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
                  launchChip(
                    'launch-simulate',
                    state.simulate ? '●' : '○',
                    state.simulate,
                    'danger',
                    () => app.update(prev => ({ ...prev, simulate: !prev.simulate })),
                  ),
                ]),
                ui.text(
                  state.simulate
                    ? 'dry_run - mock issues and restricted tools'
                    : 'live_run - repo issues and real changes',
                  { style: { fg: fg(c.dim) } },
                ),
              ]),
            ],
          ),
          ui.row({ items: 'end', gap: 1 }, [
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
      LOGO_LINES.map((line, index) =>
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
        py: 1,
      },
      [
        ui.column({ width: 'full', height: 'full', justify: 'center', items: 'center' }, [
          ui.column({ width: contentWidth, gap: 2 }, [
            ui.row({ width: 'full', justify: 'center' }, [logoBlock]),
            ui.row({ width: 'full', justify: 'center' }, [
              ui.text(heroSubtitle(), { style: { fg: fg(c.dim) } }),
            ]),
            ui.row({ width: 'full', justify: 'center' }, [
              ui.text(`v${version}`, { style: { fg: fg(c.muted) } }),
            ]),
            ui.row({ width: 'full', justify: 'center' }, [
              ui.text('─'.repeat(Math.max(24, contentWidth - 2)), { style: { fg: fg(c.border) } }),
            ]),
            panelRow,
            ui.row({ width: 'full', justify: 'center' }, [
              ui.box(
                {
                  border: 'single',
                  borderStyle: { fg: fg(SUCCESS_FG) },
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
