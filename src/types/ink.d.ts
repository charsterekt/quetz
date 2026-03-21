// Type declarations for ESM-only packages that can't be resolved by moduleResolution: "node"
// These packages are loaded at runtime via dynamic import()

declare module 'ink' {
  import type { FC, ReactNode, Key } from 'react';

  interface BoxProps {
    flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
    flexGrow?: number;
    flexShrink?: number;
    width?: number | string;
    height?: number | string;
    minWidth?: number;
    minHeight?: number;
    paddingX?: number;
    paddingY?: number;
    padding?: number;
    borderStyle?: 'single' | 'double' | 'round' | 'bold' | 'singleDouble' | 'doubleSingle' | 'classic' | 'arrow';
    borderColor?: string;
    justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
    alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch';
    children?: ReactNode;
  }

  interface TextProps {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    dimColor?: boolean;
    color?: string;
    backgroundColor?: string;
    wrap?: 'wrap' | 'truncate' | 'truncate-start' | 'truncate-middle' | 'truncate-end';
    children?: ReactNode;
  }

  interface KeyInput {
    upArrow: boolean;
    downArrow: boolean;
    leftArrow: boolean;
    rightArrow: boolean;
    return: boolean;
    escape: boolean;
    tab: boolean;
    backspace: boolean;
    delete: boolean;
    ctrl: boolean;
    shift: boolean;
    meta: boolean;
  }

  interface Instance {
    unmount: () => void;
    waitUntilExit: () => Promise<void>;
    rerender: (node: ReactNode) => void;
    cleanup: () => void;
  }

  export const Box: FC<BoxProps>;
  export const Text: FC<TextProps>;
  export const Newline: FC;
  export const Spacer: FC;
  export const Static: FC<{ items: any[]; children: (item: any, index: number) => ReactNode }>;
  export const Transform: FC<{ transform: (children: string) => string; children?: ReactNode }>;

  export function render(node: ReactNode): Instance;
  export function measureElement(ref: any): { width: number; height: number };

  export function useInput(handler: (input: string, key: KeyInput) => void, options?: { isActive?: boolean }): void;
  export function useApp(): { exit: (error?: Error) => void };
  export function useFocus(options?: { autoFocus?: boolean; isActive?: boolean; id?: string }): { isFocused: boolean };
  export function useFocusManager(): { focusNext: () => void; focusPrevious: () => void; focus: (id: string) => void };
  export function useStdout(): { stdout: NodeJS.WriteStream; write: (data: string) => void };
  export function useStdin(): { stdin: NodeJS.ReadStream; setRawMode: (mode: boolean) => void; isRawModeSupported: boolean };
  export function useStderr(): { stderr: NodeJS.WriteStream; write: (data: string) => void };
}

declare module 'ink-testing-library' {
  import type { ReactElement } from 'react';

  interface RenderResult {
    lastFrame: () => string;
    frames: string[];
    unmount: () => void;
    rerender: (node: ReactElement) => void;
    stdin: { write: (data: string) => void };
  }

  export function render(node: ReactElement): RenderResult;
  export function cleanup(): void;
}
