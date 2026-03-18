import { spawn } from 'child_process';

/**
 * Spawn a Claude Code agent process and wait for it to exit.
 * stdio is inherited so the user sees all agent output in real time.
 *
 * @param prompt         The prompt string passed via -p
 * @param cwd            Working directory for the agent
 * @param timeoutMinutes Kill the agent after this many minutes (default 30)
 * @returns              Resolved exit code (0 = success)
 */
export function spawnAgent(
  prompt: string,
  cwd: string,
  timeoutMinutes: number = 30
): Promise<number> {
  return new Promise((resolve, reject) => {
    let proc: ReturnType<typeof spawn>;

    try {
      proc = spawn('claude', ['-p', prompt, '--dangerously-skip-permissions'], {
        stdio: 'inherit',
        cwd,
      });
    } catch (err) {
      reject(new Error(`Failed to spawn claude: ${(err as Error).message}`));
      return;
    }

    const timeoutMs = timeoutMinutes * 60 * 1000;
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      // Give the process a moment to terminate before rejecting
      setTimeout(() => {
        reject(new Error(`Agent timed out after ${timeoutMinutes} minutes`));
      }, 3000);
    }, timeoutMs);

    proc.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Agent process error: ${err.message}`));
    });
  });
}
