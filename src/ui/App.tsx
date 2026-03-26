// Root Rezi TUI — spec §11, adapted for actual Rezi createNodeApp API
// Issue 1: shell only — all panels are blank placeholders

import { ui, rgb } from '@rezi-ui/core';
import { createNodeApp } from '@rezi-ui/node';
import type { QuetzBus } from '../events.js';
import { c, hexToRgb } from './theme.js';
import { wireState, INITIAL_STATE } from './state.js';
import type { AppState } from './state.js';
import { Header } from './components/Header.js';
import { Footer } from './components/Footer.js';

/** Parse a c.* hex color into an rgb() call */
function fg(hex: string) { const [r, g, b] = hexToRgb(hex); return rgb(r, g, b); }
function bgColor(hex: string) { const [r, g, b] = hexToRgb(hex); return rgb(r, g, b); }

export interface MountOptions {
  bus: QuetzBus;
  version: string;
  onQuit: () => void;
}

export interface AppHandle {
  unmount: () => void;
}

export function mountApp({ bus, version, onQuit }: MountOptions): AppHandle {
  const app = createNodeApp<AppState>({
    initialState: INITIAL_STATE,
  });

  // Wire QuetzBus events → state updates
  const cleanupWire = wireState(bus, app.update);

  // Key bindings
  app.keys({
    q: () => onQuit(),
    'ctrl+c': () => onQuit(),
  });

  // View: renders based on current state
  app.view((state: AppState) => {
    const rootBg = bgColor(c.bg);
    const rightCols = 36; // placeholder width — future issues add useViewport

    if (state.mode === 'victory') {
      return ui.column({ width: 'full', height: 'full', style: { bg: rootBg } }, [
        ui.text('  Victory — all issues resolved', { style: { fg: fg(c.brand), bold: true } }),
        ui.text(`  quetz v${version}`, { style: { fg: fg(c.dim) } }),
        ui.text('  Press q to exit', { style: { fg: fg(c.dim) } }),
      ]);
    }

    if (state.mode === 'failure') {
      return ui.column({ width: 'full', height: 'full', style: { bg: rootBg } }, [
        ui.text('  Failure', { style: { fg: fg(c.error), bold: true } }),
        ui.text(`  ${state.failureData?.reason ?? 'unknown error'}`, { style: { fg: fg(c.text) } }),
        ui.text('  Press q to exit', { style: { fg: fg(c.dim) } }),
      ]);
    }

    if (state.mode === 'session_detail') {
      return ui.column({ width: 'full', height: 'full', style: { bg: rootBg } }, [
        ui.text('  Session Detail', { style: { fg: fg(c.cyan), bold: true } }),
        ui.text('  Press q to exit', { style: { fg: fg(c.dim) } }),
      ]);
    }

    // Screens 1 & 2: running / polling
    return ui.column({ width: 'full', height: 'full', style: { bg: rootBg } }, [
      // Header
      Header({ mode: state.mode, issueCount: state.issueCount, phase: state.phase, bgStatus: state.bgStatus }),

      // Body: agent panel (left) + right column
      ui.row({ width: 'full', flex: 1 }, [
        // Agent panel placeholder
        ui.column({ flex: 1, height: 'full' }, []),
        // Right column placeholder
        ui.column({ width: rightCols, height: 'full' }, []),
      ]),

      // Footer
      Footer({ phase: state.phase, issueId: state.issueId, issueCount: state.issueCount, prNumber: state.prNumber, elapsed: state.elapsed, version }),
    ]);
  });

  // Start the app
  app.start();

  return {
    unmount: () => {
      cleanupWire();
      app.stop();
    },
  };
}
