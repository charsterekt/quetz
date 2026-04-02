import { EventEmitter } from 'events';

export type QuetzPhase =
  | 'idle' | 'fetching' | 'git_reset' | 'assembling'
  | 'agent_running' | 'pr_detecting' | 'pr_polling'
  | 'commit_verifying' | 'amend_verifying'
  | 'completed' | 'error';

export interface QuetzEvent {
  'loop:start':          { total: number };
  'loop:issue_pickup':   { id: string; title: string; priority: number; type: string; iteration: number; total: number };
  'loop:dependency_context': { message: string };
  'loop:phase':          { phase: QuetzPhase; detail?: string; agentProvider?: string; agentModel?: string; agentEffort?: string };
  'loop:pr_found':       { number: number; title: string; url: string };
  'loop:merged':         { prNumber: number; issueId: string; remaining: number };
  'loop:commit_landed':  { issueId: string; hash?: string };
  'loop:amend_complete': { issueId: string; iteration: number };
  'loop:victory':        { issuesCompleted: number; totalTime: string; prsMerged: number; mode: string; commitsLanded?: number; commitHash?: string; commitMsg?: string };
  'loop:failure':        { reason: string; detail?: string; prNumber?: number; prUrl?: string };
  'loop:warning':        { message: string };
  'loop:mode':           { mode: 'pr' | 'commit' | 'amend' };

  'agent:text':          { text: string };
  'agent:tool_start':    { index: number; name: string };
  'agent:tool_done':     { index: number; name: string; summary: string };
  'agent:stderr':        { data: string };
}

export type QuetzEventName = keyof QuetzEvent;

export class QuetzBus extends EventEmitter {
  emit<K extends QuetzEventName>(event: K, payload: QuetzEvent[K]): boolean {
    return super.emit(event, payload);
  }

  on<K extends QuetzEventName>(event: K, listener: (payload: QuetzEvent[K]) => void): this {
    return super.on(event, listener);
  }

  once<K extends QuetzEventName>(event: K, listener: (payload: QuetzEvent[K]) => void): this {
    return super.once(event, listener);
  }

  off<K extends QuetzEventName>(event: K, listener: (payload: QuetzEvent[K]) => void): this {
    return super.off(event, listener);
  }
}

export function createBus(): QuetzBus {
  return new QuetzBus();
}
