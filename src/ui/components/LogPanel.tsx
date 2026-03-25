import React, { useState, useEffect, useRef } from 'react';
import { ink } from '../ink-imports.js';
import chalk from 'chalk';
import type { QuetzBus } from '../../events.js';

const c = {
  brand:  chalk.hex('#10B981'),
  cyan:   chalk.hex('#06B6D4'),
  agent:  chalk.hex('#A855F7'),
  accent: chalk.hex('#F59E0B'),
  error:  chalk.hex('#EF4444'),
  dim:    chalk.hex('#6B7280'),
  sbTrack: chalk.hex('#141414'),
  sbThumb: chalk.hex('#3F3F3F'),
};

interface LogEntryStyle {
  icon: string;
  colorFn: (s: string) => string;
}

function getEntryStyle(text: string): LogEntryStyle {
  if (text.startsWith('VICTORY'))                             return { icon: '◆', colorFn: c.brand };
  if (text.startsWith('START') || text.startsWith('MODE'))   return { icon: '◆', colorFn: c.brand };
  if (text.startsWith('PICKUP'))                             return { icon: '→', colorFn: c.cyan };
  if (text.startsWith('AGENT'))                              return { icon: '▸', colorFn: c.agent };
  if (text.startsWith('MERGED') || text.startsWith('COMMIT') || text.startsWith('AMEND') || text.startsWith('DONE'))
                                                             return { icon: '✓', colorFn: c.brand };
  if (text.startsWith('PR'))                                 return { icon: '⎇', colorFn: c.accent };
  if (text.startsWith('FAILURE') || text.startsWith('ERROR') || text.startsWith('WARN'))
                                                             return { icon: '✗', colorFn: c.error };
  return { icon: '·', colorFn: c.dim };
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

export interface LogPanelProps {
  bus: QuetzBus;
  lines: string[];
  width: number;
  height: number;
}

export const LogPanel: React.FC<LogPanelProps> = ({ bus, lines, width, height }) => {
  const { Box, Text } = ink();
  const [scrollOffset, setScrollOffset] = useState(0);
  const autoScrollRef = useRef(true);

  // Title bar occupies 1 row; remaining rows for content
  const contentHeight = Math.max(0, height - 1);
  const maxScroll = Math.max(0, lines.length - contentHeight);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (autoScrollRef.current) setScrollOffset(0);
  }, [lines.length]);

  // Expose [ ] scroll callbacks via bus
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

  // Visible slice (scrollOffset=0 means bottom, higher = further up)
  const visibleLines = (() => {
    const start = scrollOffset > 0
      ? Math.max(0, lines.length - scrollOffset - contentHeight)
      : Math.max(0, lines.length - contentHeight);
    const end = scrollOffset > 0 ? lines.length - scrollOffset : lines.length;
    return lines.slice(start, end);
  })();

  // Pad to exactly contentHeight rows so panel height stays fixed
  const paddedLines = [...visibleLines];
  while (paddedLines.length < contentHeight) paddedLines.push('');

  const scrollbar = renderScrollbar(lines.length, contentHeight, scrollOffset);

  return (
    <Box flexDirection="column" width={width} height={height}>
      {/* Title bar */}
      <Box paddingX={2}>
        <Text>{c.cyan('quetz log')}</Text>
      </Box>

      {/* Content: entries column + scrollbar */}
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" flexGrow={1} paddingX={2} minWidth={0}>
          {paddedLines.map((line, i) => {
            if (!line) return <Text key={i}> </Text>;
            const { icon, colorFn } = getEntryStyle(line);
            return (
              <Text key={i} wrap="truncate">
                {colorFn(`${icon} ${line}`)}
              </Text>
            );
          })}
        </Box>
        <Box flexDirection="column" width={1}>
          {scrollbar.map((char, i) => (
            <Text key={i}>{char}</Text>
          ))}
        </Box>
      </Box>
    </Box>
  );
};
