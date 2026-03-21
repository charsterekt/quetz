import { spawn } from 'child_process';

/**
 * Spawn a Claude Code agent process and wait for it to exit.
 * The prompt is piped via stdin (avoids OS arg-length limits).
 * stdout/stderr are inherited so the user sees agent output in real time.
 *
 * @param prompt         The prompt string piped to stdin
 * @param cwd            Working directory for the agent
 * @param timeoutMinutes Kill the agent after this many minutes (default 30)
 * @param model          Claude model to use (default: sonnet)
 * @returns              Resolved exit code (0 = success)
 */
export function spawnAgent(
  prompt: string,
  cwd: string,
  timeoutMinutes: number = 30,
  model: string = 'sonnet'
): Promise<number> {
  return new Promise((resolve, reject) => {
    let proc: ReturnType<typeof spawn>;

    try {
      const args = ['--model', model, '--dangerously-skip-permissions', '-p'];
      proc = spawn('claude', args, {
        stdio: ['pipe', 'inherit', 'inherit'],
        cwd,
        shell: process.platform === 'win32',
      });
    } catch (err) {
      reject(new Error(`Failed to spawn claude: ${(err as Error).message}`));
      return;
    }

    // Feed the prompt via stdin then close — avoids Windows 8k arg limit
    proc.stdin!.write(prompt);
    proc.stdin!.end();

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
