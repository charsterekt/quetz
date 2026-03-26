// Scrollbar helper — spec §11 Scrollbar pattern
// 1 col wide, used in agent panel, log panel, session detail

import { ui, rgb } from '@rezi-ui/core';
import { c, hexToRgb } from '../theme.js';

function fg(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r, g, b);
}

interface ScrollbarProps {
  totalLines: number;
  visibleLines: number;
  scrollOffset: number;
  height: number;
}

export function Scrollbar({ totalLines, visibleLines, scrollOffset, height }: ScrollbarProps) {
  const trackColor = fg(c.sbTrack);
  const thumbColor = fg(c.sbThumb);

  if (totalLines <= visibleLines || height <= 0) {
    return ui.column({ width: 1, height: 'full', style: { bg: trackColor } }, []);
  }

  const thumbRatio = visibleLines / totalLines;
  const thumbHeight = Math.max(1, Math.round(thumbRatio * height));
  const maxScrollOffset = totalLines - visibleLines;
  const thumbTop = Math.round(
    (Math.min(scrollOffset, maxScrollOffset) / maxScrollOffset) * (height - thumbHeight)
  );

  const children = [];
  if (thumbTop > 0) {
    children.push(ui.spacer({ size: thumbTop }));
  }
  children.push(ui.box({ width: 1, height: thumbHeight, style: { bg: thumbColor } }));

  return ui.column({ width: 1, height: 'full', style: { bg: trackColor } }, children);
}
