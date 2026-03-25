import { Column, Row, Text } from '@rezi-ui/jsx';
import type { VNode } from '@rezi-ui/core';
import chalk from 'chalk';

const c = {
  brand:  chalk.hex('#10B981'),
  accent: chalk.hex('#F59E0B'),
  dim:    chalk.hex('#6B7280'),
  text:   chalk.hex('#FAFAFA'),
  border: chalk.hex('#2a2a2a'),
};

export interface VictoryData {
  totalSessions: number;
  totalTime: string;
  prsMerged: number;
  sessionDate: string;
}

interface VictoryCardProps {
  data: VictoryData;
  termCols: number;
  termRows: number;
}

export function VictoryCard(props: VictoryCardProps): VNode {
  const { data, termCols } = props;

  const cardWidth = Math.round(termCols * 0.49);
  const cardPad = 4;
  const innerWidth = Math.max(1, cardWidth - cardPad * 2 - 2);
  const divider = c.border('─'.repeat(innerWidth));

  const padding = ' '.repeat(cardPad);
  const border = c.accent('─'.repeat(innerWidth));

  const rows = [
    `${padding}${' '}`,
    `${padding}${c.brand('the serpent rests.')}`,
    `${padding}`,
    `${padding}${c.dim('sessions completed'.padEnd(20))}${c.text(String(data.totalSessions))}`,
    `${padding}${c.dim('total time'.padEnd(20))}${c.accent(data.totalTime)}`,
    `${padding}${c.dim('prs merged'.padEnd(20))}${c.brand(String(data.prsMerged))}`,
    `${padding}${c.dim('session date'.padEnd(20))}${c.dim(data.sessionDate)}`,
    `${padding}`,
    `${padding}${divider}`,
  ];

  const borderLine = c.accent('─'.repeat(innerWidth));
  const leftBorder = c.accent('│');
  const rightBorder = c.accent('│');
  const topLine = c.accent('┌' + '─'.repeat(innerWidth) + '┐');
  const bottomLine = c.accent('└' + '─'.repeat(innerWidth) + '┘');

  return (
    <Column flex={1} items="center" justify="center">
      <Column width={cardWidth}>
        <Text>{topLine}</Text>
        {rows.map((row, i) => (
          <Text key={String(i)} textOverflow="ellipsis">
            {leftBorder + row.padEnd(innerWidth).slice(0, innerWidth) + rightBorder}
          </Text>
        ))}
        <Text>{bottomLine}</Text>
      </Column>
    </Column>
  );
}
