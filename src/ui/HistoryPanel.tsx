import React from 'react';
import { ink } from './ink-imports.js';
import { colors } from './theme.js';
import type { CompletedSession } from './session-history.js';

interface HistoryPanelProps {
  sessions: CompletedSession[];
  selectedSessionId?: string;
  width: number;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({ sessions, selectedSessionId, width }) => {
  const { Box, Text } = ink();

  return (
    <Box flexDirection="column" width={width} borderStyle="single" borderColor={colors.border} paddingX={1}>
      <Text bold color={colors.quetzHeader}>Recent Runs</Text>
      <Text color={colors.divider} wrap="truncate">{'─'.repeat(width)}</Text>
      <Box flexDirection="column" flexGrow={1}>
        {sessions.length === 0 && (
          <>
            <Text dimColor>No completed runs yet.</Text>
            <Text dimColor>The current loop will appear here after it finishes.</Text>
          </>
        )}

        {sessions.map((session) => {
          const selected = session.issueId === selectedSessionId;
          const marker = selected ? '>' : ' ';
          const statusColor = session.outcome === 'failed' ? colors.error : colors.success;
          const model = session.model ? ` · ${session.model}` : '';

          return (
            <Text key={`${session.issueId}-${session.finishedAt}`} wrap="truncate">
              <Text color={selected ? colors.brandBold : colors.dim}>{marker} </Text>
              <Text color={colors.issue}>{session.issueId}</Text>
              <Text> </Text>
              <Text color={selected ? colors.text : colors.dim}>{session.title}</Text>
              <Text dimColor> </Text>
              <Text color={statusColor}>[{session.outcomeLabel}]</Text>
              <Text dimColor>{model}</Text>
            </Text>
          );
        })}
      </Box>
    </Box>
  );
};
