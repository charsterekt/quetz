import { Column, Text } from '@rezi-ui/jsx';
import type { VNode } from '@rezi-ui/core';
import chalk from 'chalk';

const sbTrack = chalk.hex('#141414');
const sbThumb = chalk.hex('#3F3F3F');

export interface ScrollbarProps {
  height: number;
  totalLines: number;
  scrollTop: number;
}

export function Scrollbar(props: ScrollbarProps): VNode {
  const { height, totalLines, scrollTop } = props;

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
    <Column width={1}>
      {chars.map((char, i) => (
        <Text key={String(i)}>{char}</Text>
      ))}
    </Column>
  );
}
