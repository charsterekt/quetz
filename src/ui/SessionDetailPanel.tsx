import React from 'react';
import { ink } from './ink-imports.js';
import { colors, getToolStyle } from './theme.js';
import type { CompletedSession, SessionTranscriptLine } from './session-history.js';


interface SessionDetailPanelProps {
  session: CompletedSession;
  width: number;
  visibleHeight: number;
  scrollOffset: number;
}

function renderScrollbar(total: number, visible: number, offset: number): string[] {
  if (total <= visible) return Array(visible).fill(' ');
  const thumbSize = Math.max(1, Math.round((visible / total) * visible));
  const maxScroll = total - visible;
  const thumbPos = maxScroll > 0
    ? Math.round(((maxScroll - offset) / maxScroll) * (visible - thumbSize))
    : visible - thumbSize;

  return Array.from({ length: visible }, (_, index) =>
    (index >= thumbPos && index < thumbPos + thumbSize) ? '█' : '░'
  );
}

function TranscriptLine({ line, index }: { line: SessionTranscriptLine; index: number }) {
  const { Text } = ink();

  if (line.type === 'tool') {
    const match = line.text.match(/^\[([^\]]+)\]\s*(.*)$/s);
    const name = match?.[1] ?? line.toolName ?? '';
    const summary = match?.[2] ?? line.text;
    const { icon, color } = getToolStyle(name);
    return (
      <Text key={index} wrap="truncate">
        <Text color={color}>{icon} {name.padEnd(7)}</Text>
        <Text dimColor>{summary}</Text>
      </Text>
    );
  }

  if (line.type === 'stderr') {
    return (
      <Text key={index} color={colors.error} wrap="truncate">
        ! {line.text}
      </Text>
    );
  }

  if (line.type === 'first-text') {
    return (
      <Text key={index} wrap="truncate">
        <Text color={colors.brand}>· </Text>
        <Text>{line.text}</Text>
      </Text>
    );
  }

  return (
    <Text key={index} color={colors.dim} wrap="truncate">
      {'  '}{line.text}
    </Text>
  );
}

export const SessionDetailPanel: React.FC<SessionDetailPanelProps> = ({ session, width, visibleHeight, scrollOffset }) => {
  const { Box, Text } = ink();
  const statusColor = session.outcome === 'failed' ? colors.error : colors.success;
  const maxScroll = Math.max(0, session.lines.length - visibleHeight);
  const effectiveOffset = Math.min(scrollOffset, maxScroll);
  const start = effectiveOffset > 0
    ? Math.max(0, session.lines.length - effectiveOffset - visibleHeight)
    : Math.max(0, session.lines.length - visibleHeight);
  const end = effectiveOffset > 0 ? session.lines.length - effectiveOffset : session.lines.length;
  const visibleLines = session.lines.slice(start, end);
  const paddedLines = [...visibleLines];
  while (paddedLines.length < visibleHeight) paddedLines.push({ text: '', type: 'text' });
  const scrollbar = renderScrollbar(session.lines.length, visibleHeight, effectiveOffset);

  return (
    <Box flexDirection="column" width={width} borderStyle="single" borderColor={colors.border} paddingX={1}>
      <Text bold color={colors.quetzHeader}>Run Detail</Text>
      <Text color={colors.divider} wrap="truncate">{'─'.repeat(width)}</Text>
      <Text wrap="truncate">
        <Text color={colors.issue}>{session.issueId}</Text>
        <Text> </Text>
        <Text>{session.title}</Text>
      </Text>
      <Text wrap="truncate">
        <Text color={statusColor}>{session.outcomeLabel}</Text>
        <Text dimColor> · P{session.priority} {session.issueType}</Text>
        {session.model && <Text dimColor> · {session.model}</Text>}
      </Text>
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" flexGrow={1} minWidth={0}>
          {paddedLines.map((line, index) => {
            if (!line.text) return <Text key={index}> </Text>;
            return <TranscriptLine key={index} line={line} index={index} />;
          })}
        </Box>
        <Box flexDirection="column" width={1}>
          {scrollbar.map((char, index) => (
            <Text key={index} color={char === '█' ? colors.scrollThumb : colors.scrollTrack}>{char}</Text>
          ))}
        </Box>
      </Box>
    </Box>
  );
};
