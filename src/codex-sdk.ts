export type CodexSdkModule = typeof import('@openai/codex-sdk');

const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<CodexSdkModule>;

export function loadCodexSdk(): Promise<CodexSdkModule> {
  return dynamicImport('@openai/codex-sdk');
}

export type {
  CommandExecutionItem,
  FileChangeItem,
  McpToolCallItem,
  ThreadEvent,
  ThreadItem,
  ThreadOptions as CodexThreadOptions,
  TodoListItem,
  WebSearchItem,
  WebSearchMode as CodexWebSearchMode,
  ModelReasoningEffort as CodexModelReasoningEffort,
} from '@openai/codex-sdk';
