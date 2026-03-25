export type ScreenMode = 'running' | 'polling' | 'session_detail' | 'victory' | 'failure';

export const SNAKE_FRAMES = ['~*~*~*~>', '*~*~*~>~', '~*~*~>~*', '*~*~>~*~'];

export function buildDots(remaining: number): string {
  return Array(remaining).fill('·').join('  ');
}

export function snakeForState(mode: ScreenMode, frame: string): string {
  if (mode === 'victory') return '~*~*~*~*~*~*~*~*~*~*~*~*~*~>';
  if (mode === 'failure') return '~*~*~*~>';
  return frame;
}
