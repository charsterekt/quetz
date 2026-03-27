import { defineWidget, ui, rgb, useInterval } from '@rezi-ui/core';
import { c, hexToRgb } from '../theme.js';
import { Scrollbar } from './Scrollbar.js';
import type { AgentLine, SessionCompleteState } from '../state.js';
import type { QuetzPhase } from '../../events.js';

function fg(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r, g, b);
}

const SPINNER_FRAMES = ['o', 'O', '0', 'O'];
const HEADER_BG = rgb(15, 15, 15);
const CONTENT_BG = rgb(10, 10, 10);
const TITLE_BAR_ROWS = 2;

function toolLine(line: AgentLine): string {
  const name = (line.toolName ?? '').padEnd(5).slice(0, 5);
  return `> ${name}   ${line.content}`;
}

function formatModel(model: string): string {
  if (!model) return 'claude sonnet';
  return model.startsWith('claude ') ? model : `claude ${model}`;
}

function clampText(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  if (text.length <= maxWidth) return text;
  if (maxWidth === 1) return '.';
  return `${text.slice(0, maxWidth - 1)}.`;
}

interface AgentPanelProps {
  width: number;
  height: number;
  phase: QuetzPhase;
  issueId: string;
  model: string;
  effort: string;
  lines: AgentLine[];
  scrollOffset: number;
  autoScroll: boolean;
  sessionComplete: SessionCompleteState | null;
  key?: string;
}

export const AgentPanel = defineWidget<AgentPanelProps>((props, ctx) => {
  const { width, height, phase, issueId, model, effort, lines, scrollOffset, autoScroll, sessionComplete } = props;
  const [spinnerIdx, setSpinnerIdx] = ctx.useState(0);

  useInterval(ctx, () => {
    if (phase === 'pr_polling') {
      setSpinnerIdx((i: number) => (i + 1) % SPINNER_FRAMES.length);
    }
  }, 300);

  const runningHeaderText = model && effort
    ? `agent: ${issueId}  |  ${formatModel(model)}  |  effort: ${effort}  [running]`
    : `agent: ${issueId}  |  preparing agent...`;
  const agentHeaderText = sessionComplete
    ? clampText(`agent: ${issueId}  |  session complete`, Math.max(1, width - 4))
    : clampText(runningHeaderText, Math.max(1, width - 4));
  const visibleRows = Math.max(1, height - TITLE_BAR_ROWS);
  const contentWidth = Math.max(1, width - 6);

  let content: ReturnType<typeof ui.column>;

  if (sessionComplete) {
    const prText = sessionComplete.prNumber
      ? `PR #${sessionComplete.prNumber} found`
      : 'session complete';
    const spin = SPINNER_FRAMES[spinnerIdx];

    content = ui.column({ flex: 1, height: 'full', py: 1, px: 2, gap: 0, style: { bg: CONTENT_BG } }, [
      ui.text(clampText('---- agent session complete ----', contentWidth), { style: { fg: fg(c.muted) } }),
      ui.text(clampText(prText, contentWidth), { style: { fg: fg(c.brand) } }),
      ui.text(clampText(`waiting for merge...  ${spin}  (${sessionComplete.elapsed})`, contentWidth), { style: { fg: fg(c.accent) } }),
    ]);
  } else {
    const visibleLines = autoScroll
      ? lines.slice(-visibleRows)
      : lines.slice(scrollOffset, scrollOffset + visibleRows);

    const lineNodes = visibleLines.map((line, i) =>
      ui.text(clampText(line.type === 'tool' ? toolLine(line) : line.content, contentWidth), {
        key: String(i),
        style: { fg: line.type === 'tool' ? fg(c.cyan) : fg(c.text) },
      })
    );

    content = ui.column(
      { flex: 1, height: 'full', overflow: 'hidden', py: 1, px: 2, gap: 0, style: { bg: CONTENT_BG } },
      lineNodes.length > 0 ? lineNodes : [ui.text('', {})]
    );
  }

  return ui.column({ width, height: 'full', style: { bg: CONTENT_BG } }, [
    ui.box(
      {
        border: 'single',
        borderTop: false,
        borderLeft: false,
        borderRight: false,
        borderBottom: true,
        borderStyle: { fg: fg(c.border) },
        style: { bg: HEADER_BG },
        px: 2,
        width: 'full',
      },
      [ui.text(agentHeaderText, { style: { fg: fg(c.agent) } })]
    ),
    ui.row({ flex: 1, height: 'full', width: 'full' }, [
      content,
      Scrollbar({
        totalLines: lines.length,
        visibleLines: visibleRows,
        scrollOffset: autoScroll ? Math.max(0, lines.length - visibleRows) : scrollOffset,
        height: visibleRows,
      }),
    ]),
  ]);
});
