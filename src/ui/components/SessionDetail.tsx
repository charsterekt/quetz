import { Column, Row, Text } from '@rezi-ui/jsx';
import type { VNode } from '@rezi-ui/core';
import chalk from 'chalk';
import type { CompletedSession, SessionTranscriptLine } from '../session-history.js';

const c = {
  brand:   chalk.hex('#10B981'),
  accent:  chalk.hex('#F59E0B'),
  cyan:    chalk.hex('#06B6D4'),
  dim:     chalk.hex('#6B7280'),
  muted:   chalk.hex('#4B5563'),
  text:    chalk.hex('#FAFAFA'),
  border:  chalk.hex('#2a2a2a'),
  error:   chalk.hex('#EF4444'),
  sbThumb: chalk.hex('#3F3F3F'),
  sbTrack: chalk.hex('#141414'),
};

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function formatDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function renderScrollbar(total: number, visible: number, offset: number): string[] {
  if (total <= visible) return Array(visible).fill(' ');
  const thumbSize = Math.max(3, Math.round((visible / total) * visible));
  const maxOffset = total - visible;
  const thumbPos = maxOffset > 0
    ? Math.round((offset / maxOffset) * (visible - thumbSize))
    : 0;
  return Array.from({ length: visible }, (_, i) =>
    (i >= thumbPos && i < thumbPos + thumbSize)
      ? c.sbThumb('█')
      : c.sbTrack('░')
  );
}

type DisplayLine =
  | { kind: 'prose'; text: string }
  | { kind: 'tool'; name: string; args: string }
  | { kind: 'error'; text: string }
  | { kind: 'summary'; text: string }
  | { kind: 'empty' };

function toDisplayLine(line: SessionTranscriptLine): DisplayLine {
  if (line.type === 'tool') {
    const match = line.text.match(/^\[([^\]]+)\]\s*(.*)$/s);
    const name = match?.[1] ?? line.toolName ?? '';
    const args = (match?.[2] ?? '').replace(/\n/g, ' ').slice(0, 200);
    return { kind: 'tool', name, args };
  }
  if (line.type === 'stderr') {
    return { kind: 'error', text: line.text };
  }
  if (!line.text.trim()) return { kind: 'empty' };
  return { kind: 'prose', text: line.text };
}

function buildDisplayLines(session: CompletedSession): DisplayLine[] {
  const duration = formatDuration(session.finishedAt - session.startedAt);
  const isSuccess = session.outcome !== 'failed';
  const prNum = (session as any).prNumber as number | undefined;
  const prStr = prNum != null ? `pr #${prNum}` : '—';
  const summaryLine: DisplayLine = {
    kind: 'summary',
    text: `✓ session ${session.issueId}  |  ${duration}  |  ${prStr}  |  ${isSuccess ? 'merged' : 'failed'}`,
  };
  return [...session.lines.map(toDisplayLine), summaryLine];
}

const DETAIL_OVERHEAD_ROWS = 7;

export interface SessionDetailProps {
  session: CompletedSession;
  scrollOffset: number;
  termCols: number;
  termRows: number;
  version?: string;
}

export function SessionDetail(props: SessionDetailProps): VNode {
  const { session, scrollOffset, termRows } = props;

  const duration = formatDuration(session.finishedAt - session.startedAt);
  const date = formatDate(session.finishedAt);
  const isSuccess = session.outcome !== 'failed';
  const outcomeIcon = isSuccess ? '✓' : '✗';
  const prNum = (session as any).prNumber as number | undefined;
  const prStr = prNum != null ? `pr #${prNum}` : '—';

  const allDisplayLines = buildDisplayLines(session);
  const logRows = Math.max(1, termRows - DETAIL_OVERHEAD_ROWS);
  const totalLines = allDisplayLines.length;
  const maxOffset = Math.max(0, totalLines - logRows);
  const effectiveOffset = Math.min(scrollOffset, maxOffset);
  const visibleLines = allDisplayLines.slice(effectiveOffset, effectiveOffset + logRows);
  while (visibleLines.length < logRows) visibleLines.push({ kind: 'empty' });

  const scrollbarChars = renderScrollbar(totalLines, logRows, effectiveOffset);

  const breadcrumb = `← sessions  /  ${session.issueId}`;
  const metaRight = `${outcomeIcon} ${session.issueId}  |  ${prStr}  |  ${duration}  |  ${date}`;

  return (
    <Column flex={1}>
      <Row justify="between" px={1}>
        <Text>{c.dim(breadcrumb)}</Text>
        <Text>{c.dim(metaRight)}</Text>
      </Row>
      <Row flex={1}>
        <Column flex={1} px={3} py={1}>
          {visibleLines.map((line, i) => {
            if (line.kind === 'empty') return <Text key={String(i)}>{' '}</Text>;
            if (line.kind === 'tool') {
              return (
                <Text key={String(i)} textOverflow="ellipsis">
                  {c.cyan(`▸ ${line.name.padEnd(8)}  ${line.args}`)}
                </Text>
              );
            }
            if (line.kind === 'error') {
              return (
                <Text key={String(i)} textOverflow="ellipsis">
                  {c.error(`  ${line.text}`)}
                </Text>
              );
            }
            if (line.kind === 'summary') {
              return (
                <Text key={String(i)} textOverflow="ellipsis">
                  {c.accent(line.text)}
                </Text>
              );
            }
            return (
              <Text key={String(i)} textOverflow="ellipsis">
                {c.text(line.text)}
              </Text>
            );
          })}
        </Column>
        <Column width={1}>
          {scrollbarChars.map((char, i) => (
            <Text key={String(i)}>{char}</Text>
          ))}
        </Column>
      </Row>
    </Column>
  );
}

export function sessionDetailMaxOffset(totalLines: number, termRows: number): number {
  const logRows = Math.max(1, termRows - DETAIL_OVERHEAD_ROWS);
  return Math.max(0, totalLines - logRows);
}
