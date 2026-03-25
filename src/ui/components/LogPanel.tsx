import { Column, Row, Text } from '@rezi-ui/jsx';
import type { VNode } from '@rezi-ui/core';
import chalk from 'chalk';

const c = {
  brand:   chalk.hex('#10B981'),
  cyan:    chalk.hex('#06B6D4'),
  agent:   chalk.hex('#A855F7'),
  accent:  chalk.hex('#F59E0B'),
  error:   chalk.hex('#EF4444'),
  dim:     chalk.hex('#6B7280'),
  sbTrack: chalk.hex('#141414'),
  sbThumb: chalk.hex('#3F3F3F'),
};

function getEntryStyle(text: string): { icon: string; colorFn: (s: string) => string } {
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
    (i >= thumbPos && i < thumbPos + thumbSize) ? c.sbThumb('█') : c.sbTrack('░')
  );
}

export interface LogPanelProps {
  lines: string[];
  scrollOffset: number;
  width: number;
  height: number;
}

export function LogPanel(props: LogPanelProps): VNode {
  const { lines, scrollOffset, width, height } = props;

  const contentHeight = Math.max(0, height - 1);
  const maxScroll = Math.max(0, lines.length - contentHeight);

  // scrollOffset=0 means bottom, higher = further up
  const start = scrollOffset > 0
    ? Math.max(0, lines.length - scrollOffset - contentHeight)
    : Math.max(0, lines.length - contentHeight);
  const end = scrollOffset > 0 ? lines.length - scrollOffset : lines.length;
  const visibleLines = lines.slice(start, end);

  const paddedLines = [...visibleLines];
  while (paddedLines.length < contentHeight) paddedLines.push('');

  const scrollbar = renderScrollbar(lines.length, contentHeight, maxScroll - scrollOffset);

  return (
    <Column width={width} height={height}>
      <Row px={2}>
        <Text>{c.cyan('quetz log')}</Text>
      </Row>
      <Row flex={1}>
        <Column flex={1} px={2}>
          {paddedLines.map((line, i) => {
            if (!line) return <Text key={String(i)}>{' '}</Text>;
            const { icon, colorFn } = getEntryStyle(line);
            return (
              <Text key={String(i)} textOverflow="ellipsis">
                {colorFn(`${icon} ${line}`)}
              </Text>
            );
          })}
        </Column>
        <Column width={1}>
          {scrollbar.map((char, i) => (
            <Text key={String(i)}>{char}</Text>
          ))}
        </Column>
      </Row>
    </Column>
  );
}
