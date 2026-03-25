import React from 'react';
import { ink } from '../ink-imports.js';
import chalk from 'chalk';
import type { CompletedSession } from '../session-history.js';
import { formatDuration } from './SessionDetail.js';

const c = {
  brand: chalk.hex('#10B981'),
  cyan:  chalk.hex('#06B6D4'),
  dim:   chalk.hex('#6B7280'),
  error: chalk.hex('#EF4444'),
};

export interface SessionsPanelProps {
  sessions: CompletedSession[];
  selectedIdx: number;
  onMove: (delta: number) => void;
  onEnter: (sessionId: string) => void;
  width: number;
  height: number;
}

export const SessionsPanel: React.FC<SessionsPanelProps> = ({
  sessions, selectedIdx, width, height,
}) => {
  const { Box, Text } = ink();

  // Title bar occupies 1 row; remaining rows for the list
  const listHeight = Math.max(0, height - 1);

  return (
    <Box flexDirection="column" width={width} height={height}>
      {/* Title bar: space-between layout */}
      <Box justifyContent="space-between" paddingX={2}>
        <Text>{c.cyan('completed sessions')}</Text>
        <Text>{c.dim('↑↓ enter esc')}</Text>
      </Box>

      {/* List area */}
      {sessions.length === 0 ? (
        <Box flexGrow={1} justifyContent="center" alignItems="center">
          <Text>{c.dim('no completed sessions yet')}</Text>
        </Box>
      ) : (
        <Box flexDirection="column" paddingX={2} flexGrow={1}>
          {sessions.slice(0, listHeight).map((session, i) => {
            const selected = i === selectedIdx;
            const cursor = selected ? '▶' : ' ';
            const outcomeIcon = session.outcome === 'failed' ? '✗' : '✓';
            const outcomeIconColored = session.outcome === 'failed' ? c.error(outcomeIcon) : c.brand(outcomeIcon);
            const duration = formatDuration(session.finishedAt - session.startedAt);
            const labelText = ` ${session.issueId}  ${duration}`;

            return (
              <Box key={session.issueId + session.startedAt} height={1}>
                <Text wrap="truncate">
                  {selected
                    ? `${c.brand(cursor)} ${outcomeIconColored}${c.brand(labelText)}`
                    : `${c.dim(cursor)} ${outcomeIconColored}${c.dim(labelText)}`}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
