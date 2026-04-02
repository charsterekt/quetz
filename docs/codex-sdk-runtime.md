# `quetz-6gm` Runtime Decision: Codex SDK Migration

## Purpose

This document closes the research question in `quetz-6gm.4` and records the runtime target for the rest of epic `quetz-6gm`.

The question was:

1. Should Quetz keep driving Codex by shelling out to `codex exec --json` directly?
2. Should Quetz rebuild the Codex path around the OpenAI local shell / Responses tooling?
3. Or should Quetz adopt the official Codex SDK as the programmatic runtime seam?

## Sources

- Codex SDK docs: <https://developers.openai.com/codex/sdk>
- Codex non-interactive mode docs: <https://developers.openai.com/codex/noninteractive>
- Local shell guide: <https://platform.openai.com/docs/guides/local-shell>
- Shell tool guide: <https://developers.openai.com/docs/guides/tools-shell>
- SDK package surface inspected from `@openai/codex-sdk@0.118.0`

## Decision

Quetz should target the official TypeScript Codex SDK, `@openai/codex-sdk`, as the Codex provider runtime.

This is the right seam because it preserves the existing Quetz architecture:

- Quetz already wants a single provider adapter that can start one autonomous coding agent and normalize its streamed events into `QuetzBus`.
- The Codex SDK already exposes that shape directly through `Codex.startThread(...).runStreamed(...)`.
- The SDK publishes structured thread events for agent messages, command execution, MCP tool calls, file changes, web search, todo lists, and turn completion/failure.

By contrast, the local shell / Responses path is the wrong abstraction level for Quetz's runtime adapter.

- The local shell guide is explicit that the app must execute `shell_call`, then send `shell_call_output` back to the model.
- That means Quetz would be re-implementing an agent orchestration loop instead of plugging into an official Codex runtime surface.
- The shell tool docs are useful as background for generic tool-building, but they are not a drop-in replacement for Quetz's current "launch one coding agent and stream its work" contract.

## Why Not Keep Direct `codex exec --json`

The non-interactive docs still describe the direct CLI path, and Quetz's old adapter proved that it works. But keeping the direct shell-out as Quetz's primary runtime has two problems:

- It hard-codes Codex CLI flags and JSONL parsing into Quetz instead of delegating that contract to OpenAI's maintained SDK layer.
- It leaves Quetz responsible for runtime-shape drift whenever the Codex CLI evolves.

The Codex SDK does still wrap the local Codex runtime internally, but that is a materially better dependency boundary than Quetz spawning and parsing the CLI on its own.

## Runtime Mapping

Quetz's Codex adapter should map to the SDK like this:

- Normal runs:
  - `approvalPolicy: "never"`
  - `sandboxMode: "danger-full-access"`
  - `workingDirectory: <repo root>`
- Simulate runs:
  - `approvalPolicy: "never"`
  - `sandboxMode: "read-only"`
  - `networkAccessEnabled: false`
- Effort:
  - `low -> low`
  - `medium -> medium`
  - `high -> high`
  - `max -> xhigh`

## Event Normalization

The SDK's `ThreadEvent` surface cleanly maps to QuetzBus:

- `item.completed.agent_message` -> `agent:text`
- `item.started.command_execution` -> `agent:tool_start`
- `item.completed.command_execution` -> `agent:tool_done`
- `item.started/completed.mcp_tool_call` -> tool lifecycle events
- `item.completed.file_change` -> tool completion summary
- `turn.failed` / top-level `error` -> failure path + stderr visibility

## Important Nuance

The SDK is programmatic, but it is not a cloud-only runtime.

- The package README and shipped JS implementation show that the TypeScript SDK wraps the local Codex CLI and exchanges structured JSONL events with it.
- The SDK uses the CLI's experimental JSON protocol internally rather than exposing Quetz to raw CLI process management.

This means Quetz's preflight contract should now be:

- the bundled `@openai/codex-sdk` package must be present
- the user must authenticate via `OPENAI_API_KEY`, `CODEX_API_KEY`, or existing Codex auth state in `~/.codex/auth.json`

## Known Gap

The public SDK surface exposes structured item events and turn failures, but it does not expose a dedicated raw stderr callback like the Claude SDK does.

Quetz can still preserve practical visibility by:

- forwarding SDK `error` items through `agent:stderr`
- forwarding `turn.failed` and top-level stream errors through `agent:stderr`

That keeps failure details visible in Quetz without reverting to the old direct CLI adapter, while the remaining live-stderr parity gap stays tracked separately in `quetz-qg5l`.

## Resulting Implementation Work

The remaining implementation tasks under `quetz-6gm` should therefore do the following:

1. Use the official Codex SDK as the adapter entry point.
2. Remove legacy direct-CLI assumptions from config and docs.
3. Update preflight/init so they describe the real SDK-backed contract.
4. Expand regression coverage around the SDK event surface instead of the old CLI JSON contract.
