import { useEffect, useState } from 'react';

const DEFAULT_TERMINAL_ROWS = 40;
const DEFAULT_TERMINAL_COLUMNS = 120;
const FULLSCREEN_CLEAR_GUARD_ROWS = 1;

export interface TerminalViewport {
  rows: number;
  columns: number;
}

export function getTerminalViewport(stdout: Pick<NodeJS.WriteStream, 'rows' | 'columns'> = process.stdout): TerminalViewport {
  return {
    rows: stdout.rows ?? DEFAULT_TERMINAL_ROWS,
    columns: stdout.columns ?? DEFAULT_TERMINAL_COLUMNS,
  };
}

export function useTerminalViewport(stdout: NodeJS.WriteStream = process.stdout): TerminalViewport {
  const [viewport, setViewport] = useState<TerminalViewport>(() => getTerminalViewport(stdout));

  useEffect(() => {
    const onResize = () => {
      setViewport(getTerminalViewport(stdout));
    };

    onResize();
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  return viewport;
}

export function getRenderableRows(terminalRows: number): number {
  // Ink 5.x clears and repaints the whole terminal when outputHeight >= rows.
  // Keep one row in reserve so regular rerenders stay on the incremental
  // erase-lines path instead of the full-screen clear path.
  return Math.max(10, terminalRows - FULLSCREEN_CLEAR_GUARD_ROWS);
}

export function getVisiblePanelRows(terminalRows: number, panelOverhead: number): number {
  return Math.max(3, getRenderableRows(terminalRows) - panelOverhead);
}
