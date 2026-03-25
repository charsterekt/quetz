import { Column, Row, Text, Spacer } from '@rezi-ui/jsx';
import type { VNode } from '@rezi-ui/core';
import chalk from 'chalk';
import { LOGO_LINES, LOGO_SUBTITLE } from '../logo.js';
import { buildDots, snakeForState, type ScreenMode } from '../snake.js';

const c = {
  logo:   chalk.hex('#0DBC79'),
  brand:  chalk.hex('#10B981'),
  accent: chalk.hex('#F59E0B'),
  cyan:   chalk.hex('#06B6D4'),
  error:  chalk.hex('#EF4444'),
  border: chalk.hex('#2a2a2a'),
  muted:  chalk.hex('#4B5563'),
};

export interface HeaderProps {
  mode: ScreenMode;
  done: number;
  total: number;
  snakeFrame: string;
  /** session_detail: the issue id being browsed */
  sessionId?: string;
  /** session_detail: elapsed time of background loop */
  elapsed?: string;
}

export function Header(props: HeaderProps): VNode {
  const { mode, done, total, snakeFrame, sessionId = '', elapsed = '0m 00s' } = props;

  const snake = snakeForState(mode, snakeFrame);

  let rightNode: VNode;

  if (mode === 'session_detail') {
    rightNode = (
      <Column items="end">
        <Text>{c.cyan('[ viewing session ]')}</Text>
        <Text>{c.accent(`bg: ${sessionId}  |  agent running  |  ${elapsed}`)}</Text>
      </Column>
    );
  } else {
    let snakeLine: string;
    if (mode === 'failure') {
      const dots = buildDots(Math.max(0, total - done));
      snakeLine = c.brand(snake) + c.error(' ✗') + (dots ? c.border(`  ${dots}`) : '');
    } else if (mode === 'victory') {
      snakeLine = c.brand(snake);
    } else {
      const dots = buildDots(Math.max(0, total - done));
      snakeLine = c.brand(snake) + (dots ? c.muted(`  ${dots}`) : '');
    }

    let counterLine: string;
    if (mode === 'victory') {
      counterLine = c.brand(`${total}/${total}  [done]`);
    } else if (mode === 'failure') {
      counterLine = c.error(`${done}/${total}  [failed]`);
    } else {
      counterLine = c.accent(`${done}/${total}`);
    }

    rightNode = (
      <Column items="end">
        <Text>{snakeLine}</Text>
        <Text>{counterLine}</Text>
      </Column>
    );
  }

  return (
    <Row justify="between" px={3} py={1}>
      <Column>
        {LOGO_LINES.map((line, i) => (
          <Text key={String(i)}>{c.logo(line)}</Text>
        ))}
        <Text>{c.brand(LOGO_SUBTITLE)}</Text>
      </Column>
      <Row items="end">
        {rightNode}
      </Row>
    </Row>
  );
}
