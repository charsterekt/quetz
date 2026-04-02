import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const RELEASE_TAG_PATTERN = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/;

function parseJsonFile(filePath) {
  if (!filePath) {
    return {};
  }

  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function normalizeReleaseTag(rawTag) {
  const trimmed = String(rawTag ?? '').trim();

  if (!trimmed) {
    throw new Error('Manual release recovery requires a tag input.');
  }

  const tag = trimmed.replace(/^refs\/tags\//, '');
  const match = RELEASE_TAG_PATTERN.exec(tag);

  if (!match) {
    throw new Error(`Expected a release tag like v1.2.3, received "${trimmed}".`);
  }

  return {
    tag,
    ref: `refs/tags/${tag}`,
    version: match[1],
  };
}

export function resolveReleaseContext({ eventName, ref, eventPayload, inputTag }) {
  if (eventName === 'release') {
    const releaseTag = eventPayload?.release?.tag_name ?? ref;
    return normalizeReleaseTag(releaseTag);
  }

  if (eventName === 'workflow_dispatch') {
    return normalizeReleaseTag(inputTag);
  }

  throw new Error(`Unsupported release workflow event "${eventName}".`);
}

export function validatePackageVersion(packageVersion, tag) {
  const { version } = normalizeReleaseTag(tag);

  if (packageVersion !== version) {
    throw new Error(`package.json version "${packageVersion}" does not match release tag "${tag}".`);
  }

  return version;
}

function writeGithubOutputs(outputs) {
  const outputPath = process.env.GITHUB_OUTPUT;

  if (!outputPath) {
    return;
  }

  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`);
  appendFileSync(outputPath, `${lines.join('\n')}\n`);
}

function resolveFromEnvironment() {
  const eventPayload = parseJsonFile(process.env.GITHUB_EVENT_PATH);
  const context = resolveReleaseContext({
    eventName: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF,
    eventPayload,
    inputTag: process.env.INPUT_TAG,
  });

  writeGithubOutputs(context);
  process.stdout.write(`Resolved publish target ${context.tag} (${context.ref}).\n`);
}

function verifyPackageVersionFromEnvironment() {
  const packageJson = parseJsonFile(new URL('../package.json', import.meta.url));
  const releaseTag = process.env.RELEASE_TAG;
  const version = validatePackageVersion(packageJson.version, releaseTag);
  process.stdout.write(`Verified package.json version ${version} matches ${releaseTag}.\n`);
}

function main() {
  const command = process.argv[2];

  if (command === 'resolve') {
    resolveFromEnvironment();
    return;
  }

  if (command === 'verify-package-version') {
    verifyPackageVersionFromEnvironment();
    return;
  }

  throw new Error(`Unknown command "${command}". Expected "resolve" or "verify-package-version".`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
