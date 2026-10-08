/** Generate the empty native four-table template from the shop's own export contract. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url), ts = require('typescript');
const modules = new Map();
function load(name) {
  if (!['core', 'native-schema'].includes(name)) throw new Error(`Unexpected template dependency: ${name}`);
  if (modules.has(name)) return modules.get(name);
  const source = readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(dependency => dependency.startsWith('./')
    ? load(dependency.slice(2).replace(/\.(?:js|ts)$/, '')) : require(dependency), module, module.exports);
  modules.set(name, module.exports);
  return module.exports;
}

export function createEmptyMemoryTableTemplate() { return load('native-schema').createNativeFourTableTemplate(); }

export const templateFile = new URL('./butterfly-memory-four-tables.json', import.meta.url);
export const serializeMemoryTableTemplate = () => JSON.stringify(createEmptyMemoryTableTemplate(), null, 2) + '\n';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];
  if (!['--write', '--check'].includes(mode)) throw new Error('Use --write to generate or --check to verify the committed JSON.');
  const serialized = serializeMemoryTableTemplate();
  if (mode === '--write') writeFileSync(templateFile, serialized, 'utf8');
  else assert.equal(readFileSync(templateFile, 'utf8'), serialized, 'The standalone four-table template is out of date.');
  console.log(`${mode === '--write' ? 'Generated' : 'Verified'} empty four-table template: ${fileURLToPath(templateFile)}`);
}
