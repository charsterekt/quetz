import React, { useMemo } from 'react';
import { ink } from './ink-imports.js';
import { colors } from './theme.js';
import { useEventLog } from './hooks.js';
import type { QuetzBus, QuetzEventName } from '../events.js';

const QUETZ_EVENTS: QuetzEventName[] = [
  'loop:start', 'loop:issue_pickup', 'loop:phase', 'loop:pr_found',
  'loop:merged', 'loop:commit_landed', 'loop:amend_complete',
  'loop:victory', 'loop:failure', 'loop:warning', 'loop:dry_issues',
];

function formatEvent(event: QuetzEventName, payload: any): string {
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

interface QuetzPanelProps {
  bus: QuetzBus;
}

export const QuetzPanel: React.FC<QuetzPanelProps> = ({ bus }) => {
  const { Box, Text } = ink();
  const formatter = useMemo(() => formatEvent, []);
  const lines = useEventLog(bus, QUETZ_EVENTS, formatter, 200);

  return (
    <Box flexDirection="column" flexGrow={1} minWidth={25} borderStyle="single" borderColor={colors.border} paddingX={1}>
      <Text bold color={colors.brand}>Quetz Log</Text>
      <Box flexDirection="column" flexGrow={1}>
        {lines.slice(-15).map((line, i) => {
          const isError = line.startsWith('FAILURE') || line.startsWith('ERROR');
          const isSuccess = line.startsWith('MERGED') || line.startsWith('VICTORY') || line.startsWith('COMMIT');
          const isWarn = line.startsWith('WARN');
          const color = isError ? colors.error : isSuccess ? colors.success : isWarn ? colors.warning : undefined;
          return <Text key={i} color={color} wrap="truncate">{line}</Text>;
        })}
      </Box>
    </Box>
  );
};
