import React, { useState, useEffect } from 'react';
import { ink } from '../ink-imports.js';
import chalk from 'chalk';
import { LOGO_LINES, LOGO_SUBTITLE } from '../logo.js';
import { SNAKE_FRAMES, buildDots, snakeForState, type ScreenMode } from '../snake.js';

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
  /** session_detail: the issue id being browsed */
  sessionId?: string;
  /** session_detail: elapsed time of background loop */
  elapsed?: string;
}

export const Header: React.FC<HeaderProps> = ({
  mode,
  done,
  total,
  sessionId = '',
  elapsed = '0m 00s',
}) => {
  const { Box, Text } = ink();

  const [frameIdx, setFrameIdx] = useState(0);

  // Animate snake every 150ms (only needed for running/polling modes)
  useEffect(() => {
    if (mode === 'session_detail') return;
    const id = setInterval(() => {
      setFrameIdx(i => (i + 1) % SNAKE_FRAMES.length);
    }, 150);
    return () => clearInterval(id);
  }, [mode]);

  const currentFrame = SNAKE_FRAMES[frameIdx];
  const snake = snakeForState(mode, currentFrame);

  // Right column content
  let rightColumn: React.ReactNode;

  if (mode === 'session_detail') {
    rightColumn = (
      <Box flexDirection="column" alignItems="flex-end">
        <Text>{c.cyan('[ viewing session ]')}</Text>
        <Text>{c.accent(`bg: ${sessionId}  |  agent running  |  ${elapsed}`)}</Text>
      </Box>
    );
  } else {
    // Snake bar
    let snakeNode: React.ReactNode;
    if (mode === 'failure') {
      const dots = buildDots(Math.max(0, total - done));
      snakeNode = (
        <Text>
          {c.brand(snake)}{c.error(' ✗')}{c.border(dots ? `  ${dots}` : '')}
        </Text>
      );
    } else if (mode === 'victory') {
      snakeNode = <Text>{c.brand(snake)}</Text>;
    } else {
      const dots = buildDots(Math.max(0, total - done));
      snakeNode = (
        <Text>
          {c.brand(snake)}{dots ? c.muted(`  ${dots}`) : ''}
        </Text>
      );
    }

    // Counter
    let counterNode: React.ReactNode;
    if (mode === 'victory') {
      counterNode = <Text>{c.brand(`${total}/${total}  [done]`)}</Text>;
    } else if (mode === 'failure') {
      counterNode = <Text>{c.error(`${done}/${total}  [failed]`)}</Text>;
    } else {
      counterNode = <Text bold>{c.accent(`${done}/${total}`)}</Text>;
    }

    rightColumn = (
      <Box flexDirection="column" alignItems="flex-end">
        {snakeNode}
        {counterNode}
      </Box>
    );
  }

  return (
    <Box justifyContent="space-between" paddingX={3} paddingY={1}>
      {/* Left: logo + subtitle */}
      <Box flexDirection="column">
        {LOGO_LINES.map((line, i) => (
          <Text key={i}>{c.logo(line)}</Text>
        ))}
        <Text>{c.brand(LOGO_SUBTITLE)}</Text>
      </Box>

      {/* Right: snake/counter or session detail info */}
      <Box alignItems="flex-end">
        {rightColumn}
      </Box>
    </Box>
  );
};
