import React from 'react';
import { ink } from '../ink-imports.js';
import chalk from 'chalk';

const sbTrack = chalk.hex('#141414');
const sbThumb = chalk.hex('#3F3F3F');

export interface ScrollbarProps {
  /** Visible height of the scrollbar in rows */
  height: number;
  /** Total number of content lines */
  totalLines: number;
  /** First visible line index (0 = top) */
  scrollTop: number;
}

export const Scrollbar: React.FC<ScrollbarProps> = ({ height, totalLines, scrollTop }) => {
  const { Box, Text } = ink();

  const chars = (() => {
    if (totalLines <= height) {
      return Array.from({ length: height }, () => sbTrack('░'));
    }
    const thumbSize = Math.max(3, Math.floor((height / totalLines) * height));
    const thumbPos = Math.floor((scrollTop / totalLines) * height);
    return Array.from({ length: height }, (_, i) =>
      i >= thumbPos && i < thumbPos + thumbSize
        ? sbThumb('█')
        : sbTrack('░')
    );
  })();

  return (
    <Box flexDirection="column" width={1}>
      {chars.map((char, i) => (
        <Text key={i}>{char}</Text>
      ))}
    </Box>
  );
};
