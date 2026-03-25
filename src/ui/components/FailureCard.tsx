import { Column, Text } from '@rezi-ui/jsx';
import type { VNode } from '@rezi-ui/core';
import chalk from 'chalk';

const c = {
  error:    chalk.hex('#EF4444'),
  dim:      chalk.hex('#6B7280'),
  text:     chalk.hex('#FAFAFA'),
  failDark: chalk.hex('#3F1515'),
  border:   chalk.hex('#2a2a2a'),
};

export interface FailureData {
  issueId: string;
  prNumber: number | null;
  failedChecks?: string;
  reason: string;
}

interface FailureCardProps {
  data: FailureData;
  termCols: number;
  termRows: number;
}

const ASCII_TAIL = [
  '~*~*~*~>',
  ' \\  \\  \\',
  '  \\/\\/\\/',
];

export function FailureCard(props: FailureCardProps): VNode {
  const { data, termCols } = props;

  const cardWidth = Math.round(termCols * 0.49);
  const cardPad = 4;
  const innerWidth = Math.max(1, cardWidth - cardPad * 2 - 2);
  const padding = ' '.repeat(cardPad);
  const divider = c.failDark('─'.repeat(innerWidth));

  const leftBorder = c.error('│');
  const rightBorder = c.error('│');
  const topLine = c.error('┌' + '─'.repeat(innerWidth) + '┐');
  const bottomLine = c.error('└' + '─'.repeat(innerWidth) + '┘');

  const prStr = data.prNumber != null ? `#${data.prNumber}` : '—';

  const rows: string[] = [
    `${padding}${divider}`,
    `${padding}`,
    `${padding}${c.error('the loop has stopped.')}`,
    `${padding}`,
    `${padding}${c.dim('issue'.padEnd(16))}${c.error(data.issueId)}`,
    `${padding}${c.dim('pr'.padEnd(16))}${c.error(prStr)}`,
    ...(data.failedChecks != null
      ? [`${padding}${c.dim('failed checks'.padEnd(16))}${c.error(data.failedChecks)}`]
      : []),
    `${padding}${c.dim('reason'.padEnd(16))}${c.text(data.reason)}`,
    `${padding}`,
    ...ASCII_TAIL.map(l => `${padding}${c.failDark(l)}`),
    `${padding}${divider}`,
  ];

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
