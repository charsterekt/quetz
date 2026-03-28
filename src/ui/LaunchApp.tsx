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

const SURFACE_BG = '#161616';
const FOCUS_NONE = { indicator: 'none' as const };

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

  return Math.max(50, Math.min(Math.floor((termCols - 14) / 2), 58));
}

function labelText(label: string) {
  return ui.text(label, { style: { fg: fg(c.text), bold: true } });
}

function launchButton(
  id: string,
  label: string,
  selected: boolean,
  tone: 'success' | 'warning',
  onPress: () => void,
) {
  return ui.button({
    id,
    label,
    px: 1,
    dsVariant: 'outline',
    dsTone: selected ? tone : 'default',
    focusConfig: FOCUS_NONE,
    style: selected ? { bold: true } : { fg: fg(c.dim) },
    onPress,
  });
}

function launchGroupRow(
  groupId: string,
  selectedValue: string,
  tone: 'success' | 'warning',
  options: ReadonlyArray<{ value: string; label: string }>,
  onSelect: (value: string) => void,
) {
  return ui.row(
    { gap: 1 },
    options.map(option =>
      launchButton(
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
    const panelGap = stacked ? 2 : 4;
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
        px: 1,
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
            focusConfig: FOCUS_NONE,
            onChange: value => app.update(prev => ({ ...prev, model: value })),
          }),
          labelText('effort'),
          stacked
            ? ui.column(
                { gap: 1 },
                effortOptions.map(option =>
                  launchButton(
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
            rows: 4,
            placeholder: 'enter additional instructions...',
            focusConfig: FOCUS_NONE,
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
        px: 1,
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
            focusConfig: FOCUS_NONE,
            style: { bg: bg(SURFACE_BG), fg: fg(c.text), dim: state.beadsMode !== 'epic' },
            onInput: value => app.update(prev => ({ ...prev, epicId: value })),
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
              ui.column({ width: 'full', gap: 1 }, [
                ui.row({ width: 'full', justify: 'between', items: 'center' }, [
                  ui.text('[!] simulate', {
                    style: { fg: fg(state.simulate ? c.accent : c.text), bold: true },
                  }),
                  ui.button({
                    id: 'launch-simulate',
                    label: state.simulate ? 'on' : 'off',
                    px: 1,
                    dsVariant: 'outline',
                    dsTone: state.simulate ? 'warning' : 'default',
                    focusConfig: FOCUS_NONE,
                    onPress: () => app.update(prev => ({ ...prev, simulate: !prev.simulate })),
                  }),
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
          ui.row({ items: 'end', gap: 1 }, [
            ui.text(String(state.issueCounts.live), {
              style: { fg: fg(state.simulate ? c.accent : c.brand), bold: true },
            }),
            ui.text('total_issues', { style: { fg: fg(c.muted) } }),
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
            panelRow,
            ui.row({ width: 'full', justify: 'center' }, [
              ui.button({
                id: 'launch-start',
                label: '$ quetz start',
                px: 4,
                dsVariant: 'solid',
                dsTone: 'success',
                focusConfig: FOCUS_NONE,
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
