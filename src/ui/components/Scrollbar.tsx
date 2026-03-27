// Scrollbar helper, spec section 11 Scrollbar pattern
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

  if (height <= 0) {
    return ui.column({ width: 1, height: 'full', style: { bg: trackColor } }, []);
  }

  const hasOverflow = totalLines > visibleLines;
  const thumbRatio = hasOverflow ? visibleLines / totalLines : 1;
  const thumbHeight = Math.max(1, Math.round(thumbRatio * height));
  const maxScrollOffset = Math.max(0, totalLines - visibleLines);
  const thumbTop = hasOverflow && maxScrollOffset > 0
    ? Math.round((Math.min(scrollOffset, maxScrollOffset) / maxScrollOffset) * (height - thumbHeight))
    : 0;

  const children = [];
  if (thumbTop > 0) {
    children.push(ui.spacer({ size: thumbTop }));
  }
  children.push(ui.box({ width: 1, height: thumbHeight, style: { bg: thumbColor } }));

  return ui.column({ width: 1, height: 'full', style: { bg: trackColor } }, children);
}
