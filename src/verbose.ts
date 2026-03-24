// Global verbose flag for debug logging

let verboseMode = false;

export function setVerbose(enabled: boolean): void {
  verboseMode = enabled;
}

export function log(category: string, message: string): void {
  if (verboseMode) {
    process.stderr.write(`[${category}] ${message}\n`);
  }
}
