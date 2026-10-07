import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
const require = createRequire(import.meta.url), ts = require('typescript');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { ({ JSDOM } = createRequire(new URL('../../../artifacts/shiro-butterfly-shop-20261006/patched-shujuku/package.json', import.meta.url))('jsdom')); }
const png = 'data:image/png;base64,' + readFileSync(new URL('../assets/shiro-puppet-sheet.png', import.meta.url)).toString('base64');
const native = '<div class="acu-v2-app"><div class="acu-v2-app__shell"><div class="acu-v2-app__body"><nav class="acu-v2-sidebar"></nav><div class="acu-v2-app__content"><header class="acu-v2-app__header"><div class="acu-v2-app__header-left"></div><div class="acu-v2-app__header-right"><button id="save">保存</button></div></header></div></div></div></div>';
const ownerKey = Symbol.for('shiro-database-theme:helper-script-owner'), themeKey = Symbol.for('shiro-database-theme:appearance-v1'), shopKey = Symbol.for('shiro-butterfly-shop:ui-v1');
function compile(file, imports = {}, extra = {}) {
  const output = ts.transpileModule(readFileSync(new URL(`../src/${file}.ts`, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(extra), output)(name => imports[name] ?? require(name), mod, mod.exports, ...Object.values(extra));
  return mod.exports;
}
const puppet = compile('puppet');
const renderer = compile('database-theme', { './puppet': puppet, './database-theme.css': { __esModule: true, default: readFileSync(new URL('../src/database-theme.css', import.meta.url), 'utf8') } });
const { startThemeScript } = compile('runtime', { './database-theme': renderer });
function fixture() {
  const dom = new JSDOM(`<!doctype html><html><head></head><body><div id="extensions_settings2"></div>${native}</body></html>`, { url: 'http://localhost:18006/' });
  const host = dom.window, doc = host.document, messages = [];
  host.toastr = { info: message => messages.push(message), warning: message => messages.push(message) };
  function script() {
    const iframe = doc.createElement('iframe'); doc.body.append(iframe);
    const frame = iframe.contentWindow, buttons = new Map();
    const owner = startThemeScript(frame, png, (name, handler) => { buttons.set(name, handler); return { stop: () => buttons.delete(name) }; });
    return { iframe, frame, buttons, owner };
  }
  return { dom, host, doc, messages, script };
}

test('script decorates only the parent realm, embeds the exact PNG, and pagehide restores native DOM', () => {
  const f = fixture(), save = f.doc.querySelector('#save'); let clicks = 0; save.addEventListener('click', () => clicks++);
  const s = f.script();
  assert.equal(f.doc.querySelectorAll('[data-shiro-database-theme]').length, 1);
  assert.equal(s.frame.document.querySelectorAll('[data-shiro-database-theme],style').length, 0);
  assert.equal(f.doc.querySelector('.shiro-db-avatar').style.backgroundImage, `url("${png}")`);
  assert.equal(f.doc.querySelector('.shiro-db-avatar').tagName, 'SPAN');
  assert.ok(f.host[themeKey]); assert.equal(s.frame[themeKey], undefined);
  save.click(); assert.equal(clicks, 1);
  s.frame.dispatchEvent(new s.frame.Event('pagehide'));
  assert.equal(f.doc.querySelectorAll('[data-shiro-database-theme],[data-shiro-database-style],#shiro-database-theme-script-status').length, 0);
  assert.equal(f.host[ownerKey], undefined); assert.equal(f.host[themeKey], undefined); assert.equal(s.buttons.size, 0);
  assert.equal(f.doc.querySelector('#save'), save); f.dom.window.close();
});

test('toggle is transient, a duplicate script owns only one renderer, old iframe shutdown cannot remove the new one', () => {
  const f = fixture(), a = f.script();
  a.buttons.get('切换白主题')(); assert.equal(f.doc.querySelectorAll('[data-shiro-database-theme]').length, 0);
  a.buttons.get('切换白主题')(); assert.equal(f.doc.querySelectorAll('[data-shiro-database-style]').length, 1);
  const b = f.script(); assert.equal(a.buttons.size, 0); assert.equal(f.doc.querySelectorAll('[data-shiro-database-style]').length, 1);
  a.frame.dispatchEvent(new a.frame.Event('pagehide')); assert.equal(f.host[ownerKey], b.owner);
  assert.equal(f.doc.querySelectorAll('[data-shiro-database-theme]').length, 1);
  b.owner.dispose(); f.dom.window.close();
});

test('optional shop links discover both load orders and disappear on shop disable', () => {
  for (const first of [true, false]) {
    const f = fixture(), calls = [], shop = { version: 1, open: tab => calls.push(tab) };
    if (first) f.host[shopKey] = shop;
    const s = f.script();
    if (!first) { assert.equal(f.doc.querySelectorAll('.shiro-db-shortcut').length, 0); f.host[shopKey] = shop; f.doc.dispatchEvent(new f.host.CustomEvent('shiro-butterfly-shop:availability')); }
    f.doc.querySelector('[data-shiro-tab="memory"]').click(); assert.deepEqual(calls, ['memory']);
    delete f.host[shopKey]; f.doc.dispatchEvent(new f.host.CustomEvent('shiro-butterfly-shop:availability'));
    assert.equal(f.doc.querySelectorAll('.shiro-db-shortcut').length, 0);
    s.owner.dispose(); f.dom.window.close();
  }
});

test('old extension conflict is explained without disabling or replacing its service, and can recover explicitly', () => {
  const f = fixture(), oldOwner = { dispose() { throw new Error('must not stop another extension'); } }, oldService = { version: 1, state: { enabled: true } };
  f.host[Symbol.for('shiro-database-theme:active-mount')] = oldOwner; f.host[themeKey] = oldService;
  const s = f.script();
  assert.equal(f.doc.querySelectorAll('[data-shiro-database-theme]').length, 0);
  assert.equal(f.host[themeKey], oldService); assert.match(s.owner.state.error, /先关闭/);
  delete f.host[Symbol.for('shiro-database-theme:active-mount')]; delete f.host[themeKey];
  s.buttons.get('切换白主题')(); assert.equal(f.doc.querySelectorAll('[data-shiro-database-theme]').length, 1);
  s.owner.dispose(); f.dom.window.close();
});

test('a later old extension may take over: script clears only itself and never clears the new renderer', () => {
  const f = fixture(), s = f.script();
  f.host[Symbol.for('shiro-database-theme:active-mount')] = {};
  const other = renderer.mountDatabaseTheme({ assetBase: '/ext/assets/', enabled: true, hostDocument: f.doc });
  const otherService = { version: 1, state: { enabled: true } }; f.host[themeKey] = otherService;
  f.doc.dispatchEvent(new f.host.CustomEvent('shiro-database-theme:state'));
  assert.equal(s.owner.state.enabled, false); assert.match(s.owner.state.error, /先关闭/);
  assert.equal(f.host[themeKey], otherService); assert.equal(f.doc.querySelectorAll('[data-shiro-database-theme]').length, 1);
  s.owner.dispose(); assert.equal(f.doc.querySelectorAll('[data-shiro-database-theme]').length, 1);
  other.dispose(); f.dom.window.close();
});

test('embedded image accepts only bounded PNG data, while the unchanged URL path remains same-origin', () => {
  assert.equal(renderer.databaseThemeEmbeddedPng(png), png);
  for (const invalid of ['data:image/svg+xml;base64,aGVsbG8=', 'https://example.test/a.png', 'data:image/png;base64,PHNjcmlwdD4=', png + '\n', png + 'a'.repeat(8 * 1024 * 1024)]) assert.throws(() => renderer.databaseThemeEmbeddedPng(invalid));
  assert.equal(renderer.databaseThemeAsset('/assets/', 'http://localhost/'), 'http://localhost/assets/shiro-puppet-sheet.png');
});

test('actual embedded companion sheet is a direct background URL, square frame CSS, and cleanup preserves native sources', () => {
  const f = fixture();
  const layer = f.doc.createElement('div'); layer.className = 'acu-desk-pet-layer';
  layer.innerHTML = '<div class="acu-desk-pet"><div class="acu-desk-pet__body"><div class="acu-desk-pet__flip"><img class="acu-desk-pet__img" src="/native-pose.png"></div></div><div class="acu-desk-pet__peek"><img class="acu-desk-pet__peek-img" src="/native-peek.png"></div></div>';
  f.doc.body.append(layer);
  const before = layer.outerHTML, s = f.script();
  const style = f.doc.querySelector('[data-shiro-database-style]');
  assert.doesNotMatch(style.textContent, /--shiro-db-companion-image/);
  assert.equal(layer.querySelector('.shiro-db-puppet-body').style.backgroundImage, `url("${png}")`);
  assert.equal(layer.querySelector('.shiro-db-puppet-peek').dataset.shiroPuppetPose, 'peek');
  assert.match(style.textContent, /background-size:\s*300% 200%/);
  assert.equal(layer.querySelector('.acu-desk-pet__img').getAttribute('src'), '/native-pose.png');
  assert.equal(layer.querySelector('.acu-desk-pet__peek-img').getAttribute('src'), '/native-peek.png');
  s.owner.dispose();
  assert.equal(layer.outerHTML, before); assert.equal(style.isConnected, false);
  f.dom.window.close();
});

test('pending jQuery ready does not resurrect a script stopped before initialization; button cleanup removes original handler', () => {
  const f = fixture(), iframe = f.doc.createElement('iframe'); f.doc.body.append(iframe); const frame = iframe.contentWindow;
  let ready, started = 0, listenerFactory;
  const removes = [], stops = [];
  const imports = { '../assets/shiro-puppet-sheet.png': { default: png }, './runtime': { startThemeScript: (_frame, _png, listen) => { started++; listenerFactory = listen; } } };
  const extra = { window: frame, $: fn => { ready = fn; }, getButtonEvent: name => name, eventOn: () => ({ stop: () => stops.push(true) }), eventRemoveListener: (name, handler) => removes.push([name, handler]) };
  compile('index', imports, extra); frame.dispatchEvent(new frame.Event('pagehide')); ready(); assert.equal(started, 0);
  compile('index', imports, extra); ready(); assert.equal(started, 1);
  const handler = () => {}; listenerFactory('切换白主题', handler).stop(); assert.equal(stops.length, 1); assert.deepEqual(removes, [['切换白主题', handler]]);
  f.dom.window.close();
});

test('delivery is one importable script, bundled JavaScript parses, image is self-contained and manifest hash matches', () => {
  const path = new URL('../dist/shiro-database-theme.script.json', import.meta.url), bytes = readFileSync(path), data = JSON.parse(bytes);
  assert.equal(data.type, 'script'); assert.equal(Array.isArray(data), false);
  assert.deepEqual(data.button.buttons.map(x => x.name), ['切换白主题', '主题状态']);
  assert.deepEqual(data.data, {}); assert.equal(data.export_with.data, false);
  new vm.Script(data.content); assert.ok(data.content.includes(png));
  assert.doesNotMatch(data.content, /\bfetch\s*\(|\bimport\s*\(|https:\/\/cdn|XMLHttpRequest/);
  const manifest = JSON.parse(readFileSync(new URL('../dist/component-update-manifest.json', import.meta.url)));
  assert.equal(manifest.deliveryMode, 'component'); assert.equal(manifest.artifacts.length, 1);
  assert.equal(manifest.artifacts[0].sha256, createHash('sha256').update(bytes).digest('hex'));
});
