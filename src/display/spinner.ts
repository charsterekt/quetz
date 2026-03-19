// Animated spinner for polling states (spec 6.5)

import ora, { type Ora } from 'ora';

let current: Ora | null = null;

export function startSpinner(text: string): Ora {
  if (current) current.stop();
  current = ora({ text, spinner: 'dots' }).start();
  return current;
}

export function stopSpinner(finalText?: string): void {
  if (!current) return;
  if (finalText) {
    current.succeed(finalText);
  } else {
    current.stop();
  }
  current = null;
}

export function updateSpinner(text: string): void {
  if (current) current.text = text;
}
