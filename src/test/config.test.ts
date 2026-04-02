import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadConfig, writeConfig, ConfigError, DEFAULTS } from '../config.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'quetz-test-'));
}

describe('loadConfig', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('throws ConfigError when .quetzrc.yml is missing', () => {
    expect(() => loadConfig(dir)).toThrowError(ConfigError);
    expect(() => loadConfig(dir)).toThrowError(/not found/i);
  });

  it('throws ConfigError when yaml is invalid', () => {
    fs.writeFileSync(path.join(dir, '.quetzrc.yml'), ': bad: yaml: [');
    expect(() => loadConfig(dir)).toThrowError(ConfigError);
  });

  it('throws ConfigError when github section is missing', () => {
    fs.writeFileSync(path.join(dir, '.quetzrc.yml'), 'agent:\n  timeout: 10\n');
    expect(() => loadConfig(dir)).toThrowError(/github/i);
  });

  it('throws ConfigError when owner is missing', () => {
    fs.writeFileSync(path.join(dir, '.quetzrc.yml'), 'github:\n  repo: myrepo\n');
    expect(() => loadConfig(dir)).toThrowError(/owner/i);
  });

  it('throws ConfigError when repo is missing', () => {
    fs.writeFileSync(
      path.join(dir, '.quetzrc.yml'),
      'github:\n  owner: myowner\n'
    );
    expect(() => loadConfig(dir)).toThrowError(/repo/i);
  });

  it('loads a minimal valid config with defaults applied', () => {
    fs.writeFileSync(
      path.join(dir, '.quetzrc.yml'),
      'github:\n  owner: myorg\n  repo: myrepo\n'
    );
    const cfg = loadConfig(dir);
    expect(cfg.github.owner).toBe('myorg');
    expect(cfg.github.repo).toBe('myrepo');
    expect(cfg.github.defaultBranch).toBe(DEFAULTS.github.defaultBranch);
    expect(cfg.github.automergeLabel).toBe(DEFAULTS.github.automergeLabel);
    expect(cfg.agent.provider).toBe('claude');
    expect(cfg.agent.timeout).toBe(DEFAULTS.agent.timeout);
    expect(cfg.poll.interval).toBe(DEFAULTS.poll.interval);
    expect(cfg.poll.mergeTimeout).toBe(DEFAULTS.poll.mergeTimeout);
    expect(cfg.poll.prDetectionTimeout).toBe(DEFAULTS.poll.prDetectionTimeout);
    expect(cfg.display.animations).toBe(DEFAULTS.display.animations);
  });

  it('loads provider-specific agent config blocks', () => {
    const yaml = [
      'github:',
      '  owner: acme',
      '  repo: widget',
      'agent:',
      '  provider: claude',
      '  providers:',
      '    claude:',
      '      model: opus',
      '      effort: high',
      '      settingSources: [user, project]',
      '    codex:',
      '      model: gpt-5-codex',
      '      baseUrl: https://api.example.test/v1',
      '      approvalPolicy: on-request',
      '      sandboxMode: workspace-write',
      '      networkAccessEnabled: true',
      '      webSearchMode: cached',
    ].join('\n');
    fs.writeFileSync(path.join(dir, '.quetzrc.yml'), yaml);

    const cfg = loadConfig(dir);
    expect(cfg.agent.provider).toBe('claude');
    expect(cfg.agent.providers.claude.model).toBe('opus');
    expect(cfg.agent.providers.claude.effort).toBe('high');
    expect(cfg.agent.providers.claude.settingSources).toEqual(['user', 'project']);
    expect(cfg.agent.providers.codex.model).toBe('gpt-5-codex');
    expect(cfg.agent.providers.codex.baseUrl).toBe('https://api.example.test/v1');
    expect(cfg.agent.providers.codex.approvalPolicy).toBe('on-request');
    expect(cfg.agent.providers.codex.sandboxMode).toBe('workspace-write');
    expect(cfg.agent.providers.codex.networkAccessEnabled).toBe(true);
    expect(cfg.agent.providers.codex.webSearchMode).toBe('cached');
  });

  it('loads an optional default epic scope', () => {
    const yaml = [
      'github:',
      '  owner: acme',
      '  repo: widget',
      'beads:',
      '  epic: "  quetz-a0p  "',
    ].join('\n');
    fs.writeFileSync(path.join(dir, '.quetzrc.yml'), yaml);

    const cfg = loadConfig(dir);
    expect(cfg.beads?.epic).toBe('quetz-a0p');
  });

  it('honours all explicit config values', () => {
    const yaml = [
      'github:',
      '  owner: acme',
      '  repo: widget',
      '  defaultBranch: develop',
      '  automergeLabel: ship-it',
      'agent:',
      '  timeout: 60',
      '  effort: medium',
      '  prompt: "do the thing"',
      'poll:',
      '  interval: 15',
      '  mergeTimeout: 30',
      '  prDetectionTimeout: 90',
      'display:',
      '  animations: false',
      '  colors: false',
    ].join('\n');
    fs.writeFileSync(path.join(dir, '.quetzrc.yml'), yaml);

    const cfg = loadConfig(dir);
    expect(cfg.github.defaultBranch).toBe('develop');
    expect(cfg.github.automergeLabel).toBe('ship-it');
    expect(cfg.agent.timeout).toBe(60);
    expect(cfg.agent.effort).toBe('medium');
    expect(cfg.agent.prompt).toBe('do the thing');
    expect(cfg.poll.interval).toBe(15);
    expect(cfg.poll.mergeTimeout).toBe(30);
    expect(cfg.poll.prDetectionTimeout).toBe(90);
    expect(cfg.display.animations).toBe(false);
    expect(cfg.display.colors).toBe(false);
  });

  it('trims whitespace from owner and repo', () => {
    fs.writeFileSync(
      path.join(dir, '.quetzrc.yml'),
      'github:\n  owner: "  spaced  "\n  repo: "  also  "\n'
    );
    const cfg = loadConfig(dir);
    expect(cfg.github.owner).toBe('spaced');
    expect(cfg.github.repo).toBe('also');
  });

  it('accepts legacy agent.thinkingLevel as a compatibility alias', () => {
    fs.writeFileSync(
      path.join(dir, '.quetzrc.yml'),
      'github:\n  owner: myorg\n  repo: myrepo\nagent:\n  thinkingLevel: medium\n'
    );
    expect(loadConfig(dir).agent.effort).toBe('medium');
  });

  it('throws ConfigError when agent.effort is invalid', () => {
    fs.writeFileSync(
      path.join(dir, '.quetzrc.yml'),
      'github:\n  owner: myorg\n  repo: myrepo\nagent:\n  effort: turbo\n'
    );
    expect(() => loadConfig(dir)).toThrowError(/agent\.effort/i);
  });

  it('rejects legacy codex profile config under the SDK runtime', () => {
    fs.writeFileSync(
      path.join(dir, '.quetzrc.yml'),
      'github:\n  owner: myorg\n  repo: myrepo\nagent:\n  providers:\n    codex:\n      profile: ci\n'
    );
    expect(() => loadConfig(dir)).toThrowError(/codex\.profile/i);
  });
});

describe('writeConfig', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes a config file that can be read back', () => {
    const cfg = {
      github: { owner: 'dk', repo: 'aegis', defaultBranch: 'main', automergeLabel: 'automerge' },
      agent: { timeout: 30 },
      beads: { epic: 'quetz-a0p' },
      poll: { interval: 30, mergeTimeout: 15, prDetectionTimeout: 60 },
      display: { animations: true, colors: true },
    };
    writeConfig(cfg, dir);
    expect(fs.existsSync(path.join(dir, '.quetzrc.yml'))).toBe(true);
    const loaded = loadConfig(dir);
    expect(loaded.github.owner).toBe('dk');
    expect(loaded.github.repo).toBe('aegis');
    expect(loaded.agent.timeout).toBe(30);
    expect(loaded.beads?.epic).toBe('quetz-a0p');
  });
});
