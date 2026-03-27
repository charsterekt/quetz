import { c } from './theme.js';
import type { ScreenMode } from './state.js';

export const SNAKE_FRAMES = ['~*~*~*~>', '*~*~*~>~', '~*~*~>~*', '*~*~>~*~'];
export const SNAKE_VICTORY = '~*~*~*~*~*~*~*~*~*~*~*~*~*~>';

export function snakeHead(mode: ScreenMode, frame: string): string {
  return mode === 'victory' ? SNAKE_VICTORY : frame;
}

export function dotsColor(mode: ScreenMode): string {
  return mode === 'failure' ? '#2a2a2a' : c.dim;
}

export function counterColor(mode: ScreenMode): string {
  return mode === 'failure' ? c.error : c.accent;
}

export function counterText(count: { current: number; total: number }, mode: ScreenMode): string {
  if (mode === 'victory') return `${count.total}/${count.total}  [done]`;
  if (mode === 'failure') return `${count.current}/${count.total}  [failed]`;
  return `${count.current}/${count.total}`;
}

export function buildDots(count: { current: number; total: number }, mode: ScreenMode): string {
  if (mode === 'victory') return '';
  const remaining = count.total - count.current;
  if (remaining <= 0) return '';
  return ' ' + Array(remaining).fill('·').join('  ');
}
