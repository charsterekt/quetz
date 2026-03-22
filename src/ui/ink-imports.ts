// Dynamic import bridge for ink (ESM-only) in CJS project.
// Call initInk() once before rendering. Components access via ink().
//
// TypeScript CJS compilation transforms `import('ink')` → `require('ink')`.
// We use Function() to create a true runtime dynamic import that survives compilation.

type InkModule = typeof import('ink');

const dynamicImport = (() => {
  if (process.env.VITEST) {
    return (specifier: string) => import(specifier);
  }

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;
})();

let _ink: InkModule | null = null;

export function ink(): InkModule {
  if (!_ink) throw new Error('Call initInk() before using Ink components');
  return _ink;
}

export async function initInk(): Promise<InkModule> {
  if (!_ink) _ink = await dynamicImport('ink') as InkModule;
  return _ink;
}
