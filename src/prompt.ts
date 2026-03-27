import Handlebars from 'handlebars';
import type { BeadsIssue } from './beads.js';
import type { QuetzConfig } from './config.js';

// Default prompt template per spec section 2.3
const DEFAULT_TEMPLATE = `{{bdPrime}}

---

You are picking up Beads issue {{issue.id}}: "{{issue.title}}"
Priority: {{issue.priority}} | Type: {{issue.type}}

{{#if issue.description}}
Description:
{{issue.description}}
{{/if}}

{{#if issue.dependencies}}
Dependencies (already resolved):
{{issue.dependencies}}
{{/if}}

Your task:
{{#if simulate}}
1. This is Quetz simulate mode. Keep the session strictly read-only.
2. Do not modify files, git state, GitHub state, issue tracker state, or any user/project settings.
3. Use read-only investigation tools only, then summarize what you would change in a real run.
4. Do not ask for confirmation. Finish autonomously without attempting mutations.
{{else}}
1. Claim this issue: bd update {{issue.id}} --claim
2. Review the project spec and relevant code to understand context.
3. Create a new branch for this work.
4. Implement the solution.
5. Run tests. Fix any failures.
6. Commit with a conventional commit message referencing the issue, e.g.: feat: add auth middleware ({{issue.id}})
{{#if amend}}
{{#if isFirstIssue}}
7. Stage and commit: git add -A && git commit -m 'wip: accumulated changes ({{issue.id}} and others to follow)'
{{else}}
7. Amend the existing commit: git add -A && git commit --amend --no-edit
{{/if}}
8. Close the issue: bd close {{issue.id}} --reason 'Completed — amend'
Do NOT push. Do NOT open a PR.
{{else if localCommits}}
7. Stage and commit your work: git add -A && git commit -m 'type: description ({{issue.id}})'
8. Close the issue: bd close {{issue.id}} --reason 'Completed — local commit'
Do NOT push. Do NOT open a PR.
{{else}}
7. Push your branch to origin.
8. Open a pull request with the "{{automergeLabel}}" label.
9. Close the issue: bd close {{issue.id}} --reason "Completed — PR raised"
{{/if}}
Do not ask for confirmation. Complete all steps autonomously.
{{/if}}`;

export function assemblePrompt(
  issue: BeadsIssue,
  bdPrime: string,
  config: QuetzConfig,
  localCommits: boolean = false,
  amend: boolean = false,
  isFirstIssue: boolean = true,
  simulate: boolean = false,
): string {
  const templateSource = config.agent.prompt ?? DEFAULT_TEMPLATE;
  const template = Handlebars.compile(templateSource, { noEscape: true });

  const dependenciesText = issue.dependencies && issue.dependencies.length > 0
    ? issue.dependencies.map(d => `  - ${d.depends_on_id}`).join('\n')
    : '';

  return template({
    bdPrime,
    issue: {
      id: issue.id,
      title: issue.title,
      priority: issue.priority,
      type: issue.issue_type,
      description: issue.description ?? '',
      dependencies: dependenciesText,
    },
    automergeLabel: config.github.automergeLabel,
    localCommits,
    amend,
    isFirstIssue,
    simulate,
  });
}
