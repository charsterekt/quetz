import { describe, expect, it } from 'vitest';

const releaseWorkflowModule = new URL('../../scripts/release-workflow.mjs', import.meta.url).href;

describe('resolveReleaseContext', () => {
  it('uses the published release tag for release events', async () => {
    const { resolveReleaseContext } = await import(releaseWorkflowModule);

    expect(resolveReleaseContext({
      eventName: 'release',
      ref: 'refs/tags/v0.8.11',
      eventPayload: {
        release: {
          tag_name: 'v0.8.12',
        },
      },
      inputTag: '',
    })).toEqual({
      tag: 'v0.8.12',
      ref: 'refs/tags/v0.8.12',
      version: '0.8.12',
    });
  });

  it('uses the explicit tag for workflow dispatch', async () => {
    const { resolveReleaseContext } = await import(releaseWorkflowModule);

    expect(resolveReleaseContext({
      eventName: 'workflow_dispatch',
      ref: 'refs/heads/main',
      eventPayload: {},
      inputTag: 'v0.8.12',
    })).toEqual({
      tag: 'v0.8.12',
      ref: 'refs/tags/v0.8.12',
      version: '0.8.12',
    });
  });

  it('normalizes refs/tags inputs for workflow dispatch', async () => {
    const { resolveReleaseContext } = await import(releaseWorkflowModule);

    expect(resolveReleaseContext({
      eventName: 'workflow_dispatch',
      ref: 'refs/heads/main',
      eventPayload: {},
      inputTag: 'refs/tags/v0.8.12',
    })).toEqual({
      tag: 'v0.8.12',
      ref: 'refs/tags/v0.8.12',
      version: '0.8.12',
    });
  });

  it('rejects workflow dispatch without an explicit tag', async () => {
    const { resolveReleaseContext } = await import(releaseWorkflowModule);

    expect(() => resolveReleaseContext({
      eventName: 'workflow_dispatch',
      ref: 'refs/heads/main',
      eventPayload: {},
      inputTag: '',
    })).toThrow(/requires a tag/i);
  });

  it('rejects non-release tags', async () => {
    const { resolveReleaseContext } = await import(releaseWorkflowModule);

    expect(() => resolveReleaseContext({
      eventName: 'workflow_dispatch',
      ref: 'refs/heads/main',
      eventPayload: {},
      inputTag: 'main',
    })).toThrow(/expected a release tag/i);
  });
});

describe('validatePackageVersion', () => {
  it('accepts a package version that matches the release tag', async () => {
    const { validatePackageVersion } = await import(releaseWorkflowModule);

    expect(() => validatePackageVersion('0.8.12', 'v0.8.12')).not.toThrow();
  });

  it('rejects a package version that does not match the release tag', async () => {
    const { validatePackageVersion } = await import(releaseWorkflowModule);

    expect(() => validatePackageVersion('0.8.11', 'v0.8.12')).toThrow(/does not match/i);
  });
});
