const DEFAULT_TERMINAL_ROWS = 40;
const FULLSCREEN_CLEAR_GUARD_ROWS = 1;

export function getRenderableRows(): number {
  const terminalRows = process.stdout.rows ?? DEFAULT_TERMINAL_ROWS;

  // Ink 5.x clears and repaints the whole terminal when outputHeight >= rows.
  // Keep one row in reserve so regular rerenders stay on the incremental
  // erase-lines path instead of the full-screen clear path.
  return Math.max(10, terminalRows - FULLSCREEN_CLEAR_GUARD_ROWS);
}

export function getVisiblePanelRows(panelOverhead: number): number {
  return Math.max(3, getRenderableRows() - panelOverhead);
}
