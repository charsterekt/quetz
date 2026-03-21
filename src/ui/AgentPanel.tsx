import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ink } from './ink-imports.js';
import { colors } from './theme.js';
import type { QuetzBus } from '../events.js';

const MAX_LINES = 500;

interface AgentPanelProps {
  bus: QuetzBus;
}

export const AgentPanel: React.FC<AgentPanelProps> = ({ bus }) => {
  const { Box, Text } = ink();
  const [lines, setLines] = useState<Array<{ text: string; dim: boolean }>>([]);
  const [scrollOffset, setScrollOffset] = useState(0);
  const autoScrollRef = useRef(true);

  const addLine = useCallback((text: string, dim: boolean) => {
    setLines(prev => {
      const next = [...prev, { text, dim }];
      return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
    });
    if (autoScrollRef.current) setScrollOffset(0);
  }, []);

  useEffect(() => {
    const onText = (p: { text: string }) => {
      const trimmed = p.text.replace(/\n$/, '');
      if (trimmed) addLine(trimmed, false);
    };
    const onTool = (p: { index: number; name: string; summary: string }) => {
      addLine(`[${p.name}] ${p.summary}`, true);
    };

    bus.on('agent:text', onText);
    bus.on('agent:tool_done', onTool);
    return () => {
      bus.off('agent:text', onText);
      bus.off('agent:tool_done', onTool);
    };
  }, [bus, addLine]);

  // Scroll handler exposed via parent (App handles keyboard)
  useEffect(() => {
    const onScroll = (dir: 'up' | 'down') => {
      if (dir === 'up') {
        autoScrollRef.current = false;
        setScrollOffset(prev => Math.min(prev + 3, Math.max(0, lines.length - 5)));
      } else {
        setScrollOffset(prev => {
          const next = Math.max(0, prev - 3);
          if (next === 0) autoScrollRef.current = true;
          return next;
        });
      }
    };
    (bus as any)._agentScroll = onScroll;
    return () => { delete (bus as any)._agentScroll; };
  }, [bus, lines.length]);

  const visibleLines = scrollOffset > 0
    ? lines.slice(-(scrollOffset + 20), -scrollOffset)
    : lines.slice(-20);

  return (
    <Box flexDirection="column" flexGrow={3} borderStyle="single" borderColor={colors.border} paddingX={1}>
      <Text bold color={colors.brand}>Agent Output</Text>
      <Box flexDirection="column" flexGrow={1}>
        {visibleLines.map((line, i) => (
          <Text key={i} dimColor={line.dim} wrap="truncate">{line.text}</Text>
        ))}
      </Box>
      {scrollOffset > 0 && (
        <Text dimColor>-- scrolled {scrollOffset} lines up --</Text>
      )}
    </Box>
  );
};
