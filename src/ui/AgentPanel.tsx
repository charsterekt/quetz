import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ink } from './ink-imports.js';
import { colors, getToolStyle } from './theme.js';
import { useAgentHeaderState } from './hooks.js';
import type { QuetzBus, QuetzEvent } from '../events.js';

const MAX_LINES = 500;
// Rows consumed outside panel content:
// title-bar(3) + status-bar(3) + footer(1) + panel-border(2) + panel-header(1) + panel-divider(1) = 11

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

type LineType = 'tool' | 'first-text' | 'text';
interface AgentLine { text: string; type: LineType; toolName?: string; }

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

interface AgentPanelProps {
  bus: QuetzBus;
  /** Explicit outer width in columns — prevents layout flicker on long lines */
  width: number;
  visibleHeight: number;
}

export const AgentPanel: React.FC<AgentPanelProps> = ({ bus, width, visibleHeight }) => {
  const { Box, Text } = ink();
  const headerState = useAgentHeaderState(bus);
  const [lines, setLines] = useState<AgentLine[]>([]);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const autoScrollRef = useRef(true);
  const textBufferRef = useRef('');
  const isFirstTextRef = useRef(true); // true → next text line starts a new run
  const isRunning = headerState.phase === 'agent_running';

  // Spinner animation — only when agent is running
  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => setSpinnerFrame(f => (f + 1) % SPINNER_FRAMES.length), 150);
    return () => clearInterval(timer);
  }, [isRunning]);

  const addLine = useCallback((line: AgentLine) => {
    setLines(prev => {
      const next = [...prev, line];
      return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
    });
    if (autoScrollRef.current) setScrollOffset(0);
  }, []);

  useEffect(() => {
    const resetPanel = () => {
      setLines([]);
      setScrollOffset(0);
      setSpinnerFrame(0);
      autoScrollRef.current = true;
      textBufferRef.current = '';
      isFirstTextRef.current = true;
    };

    const flushBuffer = (keepRef = false) => {
      if (textBufferRef.current.trim()) {
        const type: LineType = isFirstTextRef.current ? 'first-text' : 'text';
        if (!keepRef) isFirstTextRef.current = false;
        addLine({ text: textBufferRef.current, type });
        textBufferRef.current = '';
      }
    };

    const onText = (p: { text: string }) => {
      textBufferRef.current += p.text;
      const parts = textBufferRef.current.split('\n');
      textBufferRef.current = parts.pop() ?? '';
      for (const part of parts) {
        if (!part) continue;
        const type: LineType = isFirstTextRef.current ? 'first-text' : 'text';
        isFirstTextRef.current = false;
        addLine({ text: part, type });
      }
    };

    const onTool = (p: { index: number; name: string; summary: string }) => {
      flushBuffer();
      isFirstTextRef.current = true; // next text is first after this tool
      addLine({ text: `[${p.name}] ${p.summary}`, type: 'tool', toolName: p.name });
    };

    const onPickup = (p: QuetzEvent['loop:issue_pickup']) => {
      resetPanel();
    };

    const onPhase = (p: QuetzEvent['loop:phase']) => {
      if (p.phase === 'agent_running') {
        isFirstTextRef.current = true;
      }
    };

    bus.on('agent:text', onText);
    bus.on('agent:tool_done', onTool);
    bus.on('loop:issue_pickup', onPickup);
    bus.on('loop:phase', onPhase);
    return () => {
      bus.off('agent:text', onText);
      bus.off('agent:tool_done', onTool);
      bus.off('loop:issue_pickup', onPickup);
      bus.off('loop:phase', onPhase);
    };
  }, [bus, addLine]);

  const visibleH = visibleHeight;
  const maxScroll = Math.max(0, lines.length - visibleH);

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
    (bus as any)._agentScroll = onScroll;
    return () => { delete (bus as any)._agentScroll; };
  }, [bus, maxScroll]);

  const visibleLines = (() => {
    const start = scrollOffset > 0
      ? Math.max(0, lines.length - scrollOffset - visibleH)
      : Math.max(0, lines.length - visibleH);
    const end = scrollOffset > 0 ? lines.length - scrollOffset : lines.length;
    return lines.slice(start, end);
  })();

  // Pad to exactly visibleH rows so panel height never changes
  const paddedLines: AgentLine[] = [...visibleLines];
  while (paddedLines.length < visibleH) paddedLines.push({ text: '', type: 'text' });

  // Spinner only animates on the last visible 'first-text' line while running
  const lastFirstIdx = paddedLines.reduce((acc, line, i) =>
    line.type === 'first-text' ? i : acc, -1);

  const scrollbar = renderScrollbar(lines.length, visibleH, scrollOffset);

  const headerParts = [headerState.issueId];
  if (headerState.agentModel) headerParts.push(headerState.agentModel);
  if (headerState.agentModel) headerParts.push(`think: ${headerState.agentThinkingLevel || 'medium'}`);
  const headerLabel = headerState.issueId
    ? `Agent: ${headerParts.join(' | ')}`
    : 'Agent Output';

  return (
    <Box flexDirection="column" width={width} borderStyle="single" borderColor={colors.border} paddingX={1}>
      <Text bold color={colors.agentHeader} wrap="truncate">{headerLabel}</Text>
      <Text color={colors.divider} wrap="truncate">{'─'.repeat(width)}</Text>
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" flexGrow={1} minWidth={0}>
          {paddedLines.map((line, i) => {
            if (!line.text) return <Text key={i}> </Text>;

            if (line.type === 'tool') {
              const match = line.text.match(/^\[([^\]]+)\]\s*(.*)/s);
              const name = match?.[1] ?? '';
              const arg = match?.[2] ?? '';
              const { icon, color } = getToolStyle(name);
              return (
                <Text key={i} wrap="truncate">
                  <Text color={color}>{icon} {name.padEnd(7)}</Text>
                  <Text dimColor>{arg}</Text>
                </Text>
              );
            }

            if (line.type === 'first-text') {
              const spin = (i === lastFirstIdx && isRunning)
                ? SPINNER_FRAMES[spinnerFrame]
                : '·';
              return (
                <Text key={i} wrap="truncate">
                  <Text color={colors.brand}>{spin} </Text>
                  <Text color={colors.text}>{line.text}</Text>
                </Text>
              );
            }

            // continuation text — indent, dimmed
            return (
              <Text key={i} color={colors.dim} wrap="truncate">
                {'  '}{line.text}
              </Text>
            );
          })}
        </Box>
        <Box flexDirection="column" width={1}>
          {scrollbar.map((c, i) => (
            <Text key={i} color={c === '█' ? colors.scrollThumb : colors.scrollTrack}>{c}</Text>
          ))}
        </Box>
      </Box>
    </Box>
  );
};
