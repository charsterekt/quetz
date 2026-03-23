import React, { useState, useEffect, useRef } from 'react';
import { ink } from './ink-imports.js';
import { colors } from './theme.js';
import type { QuetzBus, QuetzEventName } from '../events.js';

export const QUETZ_EVENTS: QuetzEventName[] = [
  'loop:start', 'loop:issue_pickup', 'loop:phase', 'loop:pr_found',
  'loop:merged', 'loop:commit_landed', 'loop:amend_complete',
  'loop:victory', 'loop:failure', 'loop:warning', 'loop:dry_issues',
];


export function formatQuetzEvent(event: QuetzEventName, payload: any): string {
  switch (event) {
    case 'loop:start':
      return `START ${payload.total} issues`;
    case 'loop:issue_pickup':
      return `PICKUP ${payload.id} "${payload.title}" [P${payload.priority} ${payload.type}]`;
    case 'loop:phase': {
      const labels: Record<string, string> = {
        git_reset: 'GIT reset',
        agent_running: 'AGENT running',
        pr_detecting: 'PR detecting',
        pr_polling: 'PR polling',
        completed: 'DONE',
        error: 'ERROR',
      };
      return labels[payload.phase] || payload.phase;
    }
    case 'loop:pr_found':
      return `PR #${payload.number} "${payload.title}"`;
    case 'loop:merged':
      return `MERGED! ${payload.remaining} remaining`;
    case 'loop:commit_landed':
      return `COMMIT ${payload.issueId}${payload.hash ? ' ' + payload.hash.slice(0, 7) : ''}`;
    case 'loop:amend_complete':
      return `AMEND ${payload.issueId} (#${payload.iteration})`;
    case 'loop:victory':
      return `VICTORY ${payload.issuesCompleted} issues, ${payload.totalTime}`;
    case 'loop:failure':
      return `FAILURE ${payload.reason}`;
    case 'loop:warning':
      return `WARN ${payload.message}`;
    case 'loop:dry_issues':
      return `DRY RUN ${payload.issues.length} issues`;
    default:
      return '';
  }
}

function getLineStyle(text: string): { color?: string; icon: string } {
  if (text.startsWith('FAILURE') || text.startsWith('ERROR')) return { color: colors.error, icon: '✗' };
  if (text.startsWith('MERGED') || text.startsWith('VICTORY') || text.startsWith('COMMIT')) return { color: colors.success, icon: '✓' };
  if (text.startsWith('WARN')) return { color: colors.warning, icon: '⚠' };
  if (text.startsWith('PICKUP') || text.startsWith('PR')) return { color: colors.issue, icon: '→' };
  if (text.startsWith('START') || text.startsWith('DRY')) return { color: colors.brand, icon: '▶' };
  return { icon: '·' };
}

function renderScrollbar(total: number, visible: number, offset: number): string[] {
  if (total <= visible) return Array(visible).fill(' ');
  const thumbSize = Math.max(1, Math.round((visible / total) * visible));
  const maxS = total - visible;
  const thumbPos = maxS > 0
    ? Math.round(((maxS - offset) / maxS) * (visible - thumbSize))
    : visible - thumbSize;
  return Array.from({ length: visible }, (_, i) =>
    (i >= thumbPos && i < thumbPos + thumbSize) ? '█' : '░'
  );
}

interface QuetzPanelProps {
  bus: QuetzBus;
  lines: string[];
  /** Explicit outer width in columns — prevents layout flicker on long lines */
  width: number;
  visibleHeight: number;
}

export const QuetzPanel: React.FC<QuetzPanelProps> = ({ bus, lines, width, visibleHeight }) => {
  const { Box, Text } = ink();
  const [scrollOffset, setScrollOffset] = useState(0);
  const autoScrollRef = useRef(true);

  const visibleH = visibleHeight;
  const maxScroll = Math.max(0, lines.length - visibleH);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    if (autoScrollRef.current) setScrollOffset(0);
  }, [lines.length]);

  // Scroll handler exposed via bus
  useEffect(() => {
    const onScroll = (dir: 'up' | 'down') => {
      if (dir === 'up') {
        autoScrollRef.current = false;
        setScrollOffset(prev => Math.min(prev + 3, maxScroll));
      } else {
        setScrollOffset(prev => {
          const next = Math.max(0, prev - 3);
          if (next === 0) autoScrollRef.current = true;
          return next;
        });
      }
    };
    (bus as any)._quetzScroll = onScroll;
    return () => { delete (bus as any)._quetzScroll; };
  }, [bus, maxScroll]);

  const visibleLines = (() => {
    const start = scrollOffset > 0
      ? Math.max(0, lines.length - scrollOffset - visibleH)
      : Math.max(0, lines.length - visibleH);
    const end = scrollOffset > 0 ? lines.length - scrollOffset : lines.length;
    return lines.slice(start, end);
  })();

  // Pad to exactly visibleH rows so panel height never changes
  const paddedLines = [...visibleLines];
  while (paddedLines.length < visibleH) paddedLines.push('');

  const scrollbar = renderScrollbar(lines.length, visibleH, scrollOffset);

  return (
    <Box flexDirection="column" width={width} borderStyle="single" borderColor={colors.border} paddingX={1}>
      <Text bold color={colors.quetzHeader}>Quetz Log</Text>
      <Text color={colors.divider} wrap="truncate">{'─'.repeat(width)}</Text>
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" flexGrow={1} minWidth={0}>
          {paddedLines.map((line, i) => {
            if (!line) return <Text key={i}> </Text>;
            const { color, icon } = getLineStyle(line);
            return (
              <Text key={i} wrap="truncate">
                <Text color={color || colors.dim}>{icon} </Text>
                <Text color={color}>{line}</Text>
              </Text>
            );
          })}
        </Box>
        <Box flexDirection="column" width={1}>
          {scrollbar.map((c, i) => (
            <Text key={i} color={c === '█' ? colors.quetzHeader : colors.scrollTrack}>{c}</Text>
          ))}
        </Box>
      </Box>
    </Box>
  );
};
