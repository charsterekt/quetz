import { spawn } from 'child_process';
import { AgentStreamRenderer } from './display/agent-stream.js';

/**
 * Spawn a Claude Code agent process and wait for it to exit.
 * The prompt is piped via stdin (avoids OS arg-length limits).
 * Uses --output-format stream-json to get structured JSONL events,
 * which are parsed and rendered as a live activity log. This works
 * reliably across all terminals (cmd.exe, Git Bash, PowerShell, etc.)
 * because we control the rendering — no PTY/TTY detection needed.
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
      const args = [
        '--model', model,
        '--dangerously-skip-permissions',
        '--output-format', 'stream-json',
        '-p',
      ];
      proc = spawn('claude', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd,
        shell: process.platform === 'win32',
      });
    } catch (err) {
      reject(new Error(`Failed to spawn claude: ${(err as Error).message}`));
      return;
    }

    // Parse JSONL from stdout and render tool calls + text as a live log
    const renderer = new AgentStreamRenderer();
    let buffer = '';
    proc.stdout!.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // keep incomplete last line
      for (const line of lines) {
        renderer.processLine(line);
      }
    });

    // Forward stderr (warnings/errors from claude)
    proc.stderr!.on('data', (chunk: Buffer) => process.stderr.write(chunk));

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
