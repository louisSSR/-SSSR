import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { ({ JSDOM } = createRequire(new URL('../../../artifacts/shiro-butterfly-shop-20261006/patched-shujuku/package.json', import.meta.url))('jsdom')); }
const source = readFileSync(new URL('../src/database-visibility.ts', import.meta.url), 'utf8');
const module = { exports: {} };
new Function('module', 'exports', ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(module, module.exports);
const { observeDatabaseVisibility } = module.exports;
const native = '<div class="acu-v2-app"><div class="acu-v2-app__shell"><div class="acu-v2-app__body"><nav class="acu-v2-sidebar"></nav><div class="acu-v2-app__content"><header class="acu-v2-app__header"><div class="acu-v2-app__header-left"></div><div class="acu-v2-app__header-right"></div></header></div></div></div></div>';
const flush = () => new Promise(resolve => setImmediate(resolve));

test('shop alone observes v-show and cleans up without changing a single native DOM node/style', async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${native}</body></html>`);
  const doc = dom.window.document, shell = doc.querySelector('.acu-v2-app__shell'), calls = [];
  shell.style.display = 'none'; const before = doc.documentElement.outerHTML;
  const stop = observeDatabaseVisibility(value => calls.push(value), doc);
  assert.equal(doc.documentElement.outerHTML, before);
  shell.style.display = ''; await flush(); assert.deepEqual(calls, [true]);
  shell.style.display = 'none'; await flush(); assert.deepEqual(calls, [true, false]);
  shell.style.display = ''; await flush(); stop();
  assert.deepEqual(calls, [true, false, true, false]);
  shell.style.display = 'none'; await flush(); shell.style.display = ''; await flush();
  assert.deepEqual(calls, [true, false, true, false]);
  assert.equal(doc.querySelectorAll('style,[data-shiro-database-theme],[data-shiro-database-decoration]').length, 0);
  dom.window.close();
});

test('late native mount, removal, unknown layouts and pending disposal cannot leave the launcher hidden', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>'), doc = dom.window.document, calls = [];
  const stop = observeDatabaseVisibility(value => calls.push(value), doc);
  doc.body.innerHTML = native; await flush(); assert.deepEqual(calls, [true]);
  doc.querySelector('.acu-v2-app__header-right').className = 'future-header'; await flush(); assert.deepEqual(calls, [true, false]);
  doc.body.innerHTML = native; await flush(); assert.deepEqual(calls, [true, false, true]);
  doc.body.innerHTML = ''; await flush(); assert.deepEqual(calls, [true, false, true, false]);
  doc.body.innerHTML = native; stop(); await flush(); assert.equal(calls.at(-1), false);
  dom.window.close();
});

test('shop optional appearance bridge discovers independent theme and removes its listener on dispose', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>'), doc = dom.window.document;
  const key = Symbol.for('shiro-database-theme:appearance-v1'), registry = {}, mod = { exports: {} };
  const text = readFileSync(new URL('../src/appearance.ts', import.meta.url), 'utf8');
  new Function('require', 'module', 'exports', 'globalThis', 'document', ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(() => ({ reactive: x => x }), mod, mod.exports, registry, doc);
  const appearance = mod.exports.createDatabaseAppearance();
  assert.equal(appearance.state.available, false);
  const calls = []; registry[key] = { version: 1, state: { enabled: true, status: '已连接', error: '' }, setEnabled: value => { calls.push(value); registry[key].state.enabled = value; } };
  doc.dispatchEvent(new dom.window.CustomEvent('shiro-database-theme:state'));
  assert.equal(appearance.state.enabled, true); appearance.setEnabled(false); assert.deepEqual(calls, [false]);
  delete registry[key]; doc.dispatchEvent(new dom.window.CustomEvent('shiro-database-theme:state')); assert.equal(appearance.state.available, false);
  appearance.dispose(); registry[key] = { version: 1, state: { enabled: true }, setEnabled: () => {} };
  doc.dispatchEvent(new dom.window.CustomEvent('shiro-database-theme:state')); assert.equal(appearance.state.available, false);
  dom.window.close();
});
