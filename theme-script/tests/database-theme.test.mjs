import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url), ts = require('typescript');
// Uses the already installed upstream test dependency, never a product dependency.
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { ({ JSDOM } = createRequire(new URL('../../../artifacts/shiro-butterfly-shop-20261006/patched-shujuku/package.json', import.meta.url))('jsdom')); }
const css = readFileSync(new URL('../src/database-theme.css', import.meta.url), 'utf8');
const puppetOutput = ts.transpileModule(readFileSync(new URL('../src/puppet.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const puppetModule = { exports: {} };
new Function('require', 'module', 'exports', puppetOutput)(require, puppetModule, puppetModule.exports);
const memoryOutput = ts.transpileModule(readFileSync(new URL('../src/memory-view.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const memoryModule = { exports: {} };
new Function('require', 'module', 'exports', memoryOutput)(require, memoryModule, memoryModule.exports);
const output = ts.transpileModule(readFileSync(new URL('../src/database-theme.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', output)(name => name === './database-theme.css' ? { __esModule: true, default: css } : name === './puppet' ? puppetModule.exports : name === './memory-view' ? memoryModule.exports : require(name), module, module.exports);
const { databaseThemeAsset, mountDatabaseTheme } = module.exports;
const marker = '[data-shiro-database-theme]';
const native = `<div class="acu-v2-app"><div class="acu-v2-app__shell"><div class="acu-v2-app__body"><nav class="acu-v2-sidebar"><div class="acu-v2-sidebar__brand"><button class="acu-v2-sidebar__brand-title">奶数据库</button></div><button class="acu-v2-sidebar__item">工作台</button></nav><div class="acu-v2-app__content"><header class="acu-v2-app__header"><div class="acu-v2-app__header-left"><h1>填表工作台</h1></div><div class="acu-v2-app__header-right"><button>关闭新 UI</button></div></header><main class="acu-v2-main"><textarea>原始数据</textarea></main></div></div></div></div>`;
const visualizer = `<main class="acu-visualizer-surface"><aside class="acu-visualizer-surface__sidebar"><nav class="acu-visualizer-nav"><div class="acu-visualizer-nav__brand">数据库编辑器</div><button>第一张表</button></nav></aside><section class="acu-visualizer-surface__main"><header class="acu-visualizer-surface__topbar"><button>关闭数据库编辑器</button></header><div class="acu-visualizer-surface__workspace"><textarea>保留表格</textarea></div><footer><button>保存</button></footer></section></main>`;
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(html = native) {
  const dom = new JSDOM(`<!doctype html><html><head><style id="native-theme">#acu-app-v2{--acu-bg-0:black}</style></head><body><button id="host">酒馆原有按钮</button><div id="acu-app-v2" style="color-scheme:dark">${html}</div></body></html>`, { url: 'http://localhost:8000/' });
  const doc = dom.window.document, statuses = [];
  const options = { assetBase: '/scripts/extensions/third-party/shiro/assets/', enabled: true, hostDocument: doc, onStatus: status => statuses.push(status) };
  const before = doc.documentElement.outerHTML;
  const mount = mountDatabaseTheme(options);
  return { dom, doc, statuses, options, before, mount };
}

test('asset resolver is local and treats the configured base as a directory', () => {
  assert.equal(databaseThemeAsset('/extensions/shiro/assets', 'https://example.test/'), 'https://example.test/extensions/shiro/assets/shiro-puppet-sheet.png');
  for (const base of ['https://tracker.test/a', 'data:text/plain,bad', 'javascript:void(0)', 'https://user:pass@example.test/a', '/a?secret=1', '/a#fragment']) {
    assert.throws(() => databaseThemeAsset(base, 'https://example.test/'));
  }
});

test('decoration preserves native nodes, text, inputs and listeners, then restores exact DOM', () => {
  const f = fixture(), nativeButton = f.doc.querySelector('.acu-v2-sidebar__brand-title');
  let clicks = 0;
  nativeButton.addEventListener('click', () => clicks++);
  assert.equal(f.doc.querySelectorAll(marker).length, 1);
  assert.equal(f.doc.querySelectorAll('.shiro-db-masthead').length, 1);
  assert.equal(f.doc.querySelectorAll('.shiro-db-portrait').length, 1);
  assert.equal(f.doc.querySelector('textarea').value, '原始数据');
  nativeButton.click();
  assert.equal(clicks, 1);
  assert.equal(nativeButton.textContent, '奶数据库');
  f.mount.setEnabled(false);
  assert.equal(f.doc.documentElement.outerHTML, f.before);
  f.mount.setEnabled(true);
  f.mount.dispose();
  assert.equal(f.doc.documentElement.outerHTML, f.before);
  f.dom.window.close();
});

test('late mount, Vue replacement and drawer remount get exactly one decoration each', async () => {
  const f = fixture('');
  assert.match(f.mount.getStatus(), /等待/);
  f.doc.querySelector('#acu-app-v2').innerHTML = native;
  await flush();
  assert.equal(f.doc.querySelectorAll('.shiro-db-masthead').length, 1);
  const drawer = f.doc.createElement('aside');
  drawer.innerHTML = '<nav class="acu-v2-sidebar"><div class="acu-v2-sidebar__brand">原生抽屉</div></nav>';
  f.doc.querySelector('.acu-v2-app__shell').append(drawer);
  await flush();
  assert.equal(f.doc.querySelectorAll('.shiro-db-portrait').length, 2);
  drawer.remove();
  await flush();
  f.doc.querySelector('#acu-app-v2').innerHTML = native;
  await flush();
  assert.equal(f.doc.querySelectorAll('.shiro-db-masthead').length, 1);
  assert.equal(f.doc.querySelectorAll('.shiro-db-portrait').length, 1);
  assert.equal(f.doc.querySelectorAll('[data-shiro-database-style]').length, 1);
  f.mount.dispose(); f.dom.window.close();
});

test('switching to original visualizer restores the old anchors and decorates editor without replacing controls', async () => {
  const f = fixture();
  f.doc.querySelector('.acu-v2-sidebar').remove();
  f.doc.querySelector('.acu-v2-app__content').innerHTML = visualizer;
  await flush();
  assert.equal(f.doc.querySelectorAll('.shiro-db-masthead').length, 1);
  assert.equal(f.doc.querySelectorAll('.shiro-db-portrait').length, 1);
  assert.equal(f.doc.querySelector('textarea').value, '保留表格');
  assert.ok(f.doc.querySelector('.acu-visualizer-surface__main > .shiro-db-masthead'));
  assert.equal(f.doc.querySelector('.acu-visualizer-nav__brand').textContent, '数据库编辑器');
  f.mount.dispose(); f.dom.window.close();
});

test('upstream class drift removes all decoration and can safely recover', async () => {
  const f = fixture(), root = f.doc.querySelector('.acu-v2-app');
  root.className = 'acu-v3-app';
  await flush();
  assert.equal(f.doc.querySelectorAll(marker).length, 0);
  assert.equal(f.doc.querySelectorAll('[data-shiro-database-decoration]').length, 0);
  assert.equal(f.doc.querySelectorAll('[data-shiro-database-style]').length, 0);
  root.className = 'acu-v2-app';
  await flush();
  f.doc.querySelector('.acu-v2-app__header-right').className = 'future-header-right';
  await flush();
  assert.match(f.mount.getStatus(), /不兼容/);
  assert.equal(f.doc.querySelectorAll(marker).length, 0);
  f.mount.dispose(); f.dom.window.close();
});

test('duplicate load disposes old observer; an old disposer cannot remove new decoration', async () => {
  const f = fixture(), newer = mountDatabaseTheme(f.options);
  f.mount.dispose();
  assert.equal(f.doc.querySelectorAll('.shiro-db-masthead').length, 1);
  newer.setEnabled(false);
  f.doc.querySelector('#acu-app-v2').innerHTML = native;
  await flush();
  assert.equal(f.doc.querySelectorAll(marker).length, 0);
  newer.dispose(); f.dom.window.close();
});

test('quiet pauses header, sidebar and native companion together; late headers inherit it and resume restores all blinks', async () => {
  const f = fixture(), layer = f.doc.createElement('div'); layer.className = 'acu-desk-pet-layer';
  layer.innerHTML = '<div class="acu-desk-pet"><div class="acu-desk-pet__body"><div class="acu-desk-pet__flip"><img class="acu-desk-pet__img pose-idle" src="/native.png"></div></div></div>';
  f.doc.body.append(layer); await flush();
  const animation = sprite => f.dom.window.getComputedStyle(sprite).animation;
  const sprites = () => [...f.doc.querySelectorAll('.shiro-db-puppet')];
  assert.equal(sprites().length, 3);
  assert.ok(sprites().every(sprite => /shiro-db-puppet-blink/.test(animation(sprite))));
  const quietButton = f.doc.querySelector('.shiro-db-puppet-quiet'); quietButton.click();
  assert.equal(quietButton.textContent, '让白说话');
  assert.ok(sprites().every(sprite => animation(sprite) === 'none'), 'header, sidebar and native span must all pause');
  f.doc.querySelector('.shiro-db-masthead').remove(); await flush();
  assert.equal(f.doc.querySelectorAll('.shiro-db-masthead').length, 1);
  assert.equal(animation(f.doc.querySelector('.shiro-db-masthead .shiro-db-puppet')), 'none');
  const late = f.doc.createElement('div'); late.innerHTML = native; f.doc.body.append(late); await flush();
  assert.equal(sprites().length, 5);
  assert.ok(sprites().every(sprite => animation(sprite) === 'none'), 'late root and sidebar must inherit quiet');
  quietButton.click();
  assert.ok(sprites().every(sprite => /shiro-db-puppet-blink/.test(animation(sprite))), 'resume must restore all idle blinks');
  assert.ok([...f.doc.querySelectorAll('.shiro-db-puppet-quiet')].every(button => button.textContent === '安静一会儿'));
  f.mount.setEnabled(false);
  assert.equal(f.doc.querySelector('[data-shiro-puppet-quiet]'), null);
  assert.equal(f.doc.querySelector('.shiro-db-puppet'), null);
  assert.equal(layer.querySelector('img').getAttribute('src'), '/native.png');
  quietButton.click(); assert.equal(f.doc.querySelector('[data-shiro-puppet-quiet]'), null, 'detached old control cannot restore a marker');
  f.mount.dispose(); f.dom.window.close();
});

test('optional native shortcut buttons navigate live views and vanish fully when disabled', async () => {
  const f = fixture(), calls = [];
  assert.equal(f.doc.querySelectorAll('.shiro-db-shortcut').length, 0);
  const navigate = tab => calls.push(tab);
  const mounted = mountDatabaseTheme({ ...f.options, onNavigate: navigate });
  const buttons = [...f.doc.querySelectorAll('.shiro-db-shortcut')];
  assert.deepEqual(buttons.map(button => button.textContent), ['白的委托']);
  assert.ok(buttons.every(button => button.tagName === 'BUTTON' && button.type === 'button' && button.tabIndex === 0));
  assert.equal(buttons[0].parentElement.previousElementSibling.className, 'shiro-db-portrait');
  assert.equal(buttons[0].parentElement.nextElementSibling.className, 'shiro-db-notices');
  assert.equal(buttons[0].parentElement.nextElementSibling.nextElementSibling.className, 'acu-v2-sidebar__brand');
  buttons[0].click();
  assert.deepEqual(calls, ['quests']);
  f.doc.querySelector('#acu-app-v2').innerHTML = native;
  await flush();
  assert.equal(f.doc.querySelectorAll('.shiro-db-shortcut').length, 1);
  f.doc.querySelector('[data-shiro-tab="quests"]').click();
  assert.deepEqual(calls, ['quests', 'quests']);
  mounted.setEnabled(false);
  buttons[0].click(); // A detached reference cannot navigate after disposal/disable.
  assert.equal(calls.length, 2);
  assert.equal(f.doc.documentElement.outerHTML, f.before);
  mounted.dispose(); f.dom.window.close();
});

test('quiet pauses owned native breathing and peek ancestors in place, resumes them, and leaves foreign motion/geometry untouched', async () => {
  const f = fixture(), nativeStyle = f.doc.createElement('style'); nativeStyle.id = 'native-motion-lifecycle';
  nativeStyle.textContent = '.acu-desk-pet__body.is-breathing {animation: native-breathe 3s infinite; animation-play-state: running;} .acu-desk-pet__peek {animation: native-peek 4s infinite; animation-play-state: running;}'; f.doc.head.append(nativeStyle);
  const layer = f.doc.createElement('div'); layer.className = 'acu-desk-pet-layer';
  layer.innerHTML = '<div class="acu-desk-pet"><div class="acu-desk-pet__body is-breathing" style="transform:translate(3px, 4px)"><div class="acu-desk-pet__flip"><img class="acu-desk-pet__img" src="/native.png"></div></div><div class="acu-desk-pet__peek" style="transform:translateX(7px);width:36px;height:64px"><img class="acu-desk-pet__peek-img" src="/native-peek.png" style="width:64px;height:64px;left:-14px;top:0px"></div></div>';
  const native = layer.outerHTML; f.doc.body.append(layer);
  const foreign = f.doc.createElement('div'); foreign.className = 'acu-desk-pet__body is-breathing'; f.doc.body.append(foreign); await flush();
  const body = layer.querySelector('.acu-desk-pet__body'), peek = layer.querySelector('.acu-desk-pet__peek');
  const before = [body.getAttribute('style'), peek.getAttribute('style'), ...[...layer.querySelectorAll('img')].map(img => img.getAttribute('src'))];
  const state = node => f.dom.window.getComputedStyle(node).animationPlayState;
  assert.equal(state(body), 'running'); assert.equal(state(peek), 'running');
  const quiet = f.doc.querySelector('.shiro-db-puppet-quiet'); quiet.click();
  assert.equal(state(body), 'paused'); assert.equal(state(peek), 'paused'); assert.equal(state(foreign), 'running');
  assert.equal(f.dom.window.getComputedStyle(body).animation, 'native-breathe 3s infinite'); assert.equal(f.dom.window.getComputedStyle(peek).animation, 'native-peek 4s infinite');
  assert.equal(f.dom.window.getComputedStyle(body).transform, 'translate(3px, 4px)'); assert.equal(f.dom.window.getComputedStyle(peek).transform, 'translateX(7px)');
  assert.deepEqual([body.getAttribute('style'), peek.getAttribute('style'), ...[...layer.querySelectorAll('img')].map(img => img.getAttribute('src'))], before);
  quiet.click(); assert.equal(state(body), 'running'); assert.equal(state(peek), 'running');
  quiet.click(); f.mount.setEnabled(false); assert.equal(state(body), 'running'); assert.equal(state(peek), 'running'); assert.equal(layer.outerHTML, native);
  f.mount.dispose(); f.dom.window.close();
});

test('database-local four tables occupy flow after the native header, retain original inputs/saves and unsubscribe on theme off/remount', async () => {
  const f = fixture(), listeners = new Set(); let reads = 0, stops = 0, navigations = 0;
  const source = { async readMemorySnapshot() { reads++; return { version: 1, scope: { origin: 'http://localhost:8000', handle: 'user', account: 'account', chat: 'chat' }, revision: 3, updatedAt: '2026-10-08T08:00:00Z', tables: ['impressions', 'accounts', 'inventory', 'ripples'].map(key => ({ key, title: key, columns: ['内容'], rows: [[`真实${key}`]], recordIds: [key], total: 1, offset: 0, limit: 50 })) }; }, subscribeMemorySnapshots(listener) { listeners.add(listener); return () => { stops++; listeners.delete(listener); }; }, async exportCompleteMemory() {} };
  const input = f.doc.querySelector('textarea'), nativeHeader = f.doc.querySelector('.acu-v2-app__header');
  f.mount.setMemorySource(source); f.mount.setNavigate(() => navigations++);
  assert.equal(nativeHeader.nextElementSibling.className, 'shiro-db-memory'); assert.equal(f.doc.querySelector('.shiro-db-memory').nextElementSibling.className, 'acu-v2-main'); assert.equal(listeners.size, 1);
  f.doc.querySelector('[data-shiro-tab="memory"]').click(); await flush(); assert.equal(navigations, 0); assert.equal(reads, 1); assert.match(f.doc.querySelector('.shiro-db-memory tbody').textContent, /真实impressions/);
  assert.equal(f.doc.querySelector('textarea'), input); assert.equal(input.value, '原始数据');
  f.mount.setEnabled(false); assert.equal(listeners.size, 0); assert.equal(stops, 1); assert.equal(f.doc.documentElement.outerHTML, f.before);
  f.mount.setEnabled(true); assert.equal(listeners.size, 1); assert.equal(f.doc.querySelector('.shiro-db-memory-body').hidden, true);
  f.doc.querySelector('.acu-v2-sidebar').remove(); f.doc.querySelector('.acu-v2-app__content').innerHTML = visualizer; await flush();
  assert.equal(listeners.size, 1); assert.equal(f.doc.querySelectorAll('.shiro-db-memory').length, 1); assert.ok(f.doc.querySelector('.acu-visualizer-surface__topbar + .shiro-db-memory')); assert.equal(f.doc.querySelector('textarea').value, '保留表格');
  f.mount.setMemorySource(undefined); assert.equal(listeners.size, 0); assert.equal(f.doc.querySelector('.shiro-db-memory'), null); assert.equal(f.doc.querySelector('[data-shiro-tab="memory"]'), null); assert.ok(f.doc.querySelector('[data-shiro-tab="quests"]'));
  f.mount.dispose(); f.dom.window.close();
});

test('every CSS rule is scoped; only named puppet motion is added and respects reduced motion', () => {
  const stylesheet = require('postcss').parse(css);
  stylesheet.walkRules(rule => {
    if (rule.parent.type === 'atrule' && rule.parent.name === 'keyframes') { assert.match(rule.parent.params, /^shiro-db-puppet-(blink|line-fade)$/); return; }
    const selector = rule.selector;
    assert.ok(selector.startsWith('.acu-v2-app[data-shiro-database-theme="blank-chess-v1"]') || selector.startsWith('.acu-desk-pet-layer[data-shiro-database-companion="blank-chess-v1"]') || selector.startsWith('#acu-app-v2:has(> .acu-v2-app[data-shiro-database-theme="blank-chess-v1"]) > .acu-dialog-layer'), selector);
  });
  assert.doesNotMatch(css, /position:\s*fixed/);
  assert.match(css, /background-size:\s*300% 200%/);
  const desktopMenuBreakpoints = new Map([
    ['.acu-v2-app[data-shiro-database-theme="blank-chess-v1"] .acu-v2-app__header-left > .acu-v2-app__menu', '(min-width: 721px)'],
    ['.acu-v2-app[data-shiro-database-theme="blank-chess-v1"] .acu-visualizer-surface__topbar-context > .acu-visualizer-surface__mobile-menu', '(min-width: 768px)'],
  ]);
  let desktopMenuExceptions = 0;
  let noticeDockExceptions = 0;
  stylesheet.walkDecls(declaration => {
    if (!declaration.important) return;
    const rule = declaration.parent, media = rule.parent;
    if (rule.selector === '.acu-desk-pet-layer[data-shiro-database-companion="blank-chess-v1"][data-shiro-database-notice-dock="blank-chess-v1"] > .acu-notice-bubble') {
      assert.equal(declaration.prop, 'transform'); assert.equal(declaration.value, 'none');
      assert.equal(media.type, 'atrule'); assert.equal(media.name, 'media');
      assert.equal(media.params, '(max-width: 767px), (pointer: coarse) and (max-width: 1024px)');
      noticeDockExceptions++;
      return;
    }
    assert.ok(desktopMenuBreakpoints.has(rule.selector));
    assert.equal(declaration.prop, 'display');
    assert.equal(declaration.value, 'none');
    assert.equal(media.type, 'atrule');
    assert.equal(media.name, 'media');
    assert.equal(media.params, desktopMenuBreakpoints.get(rule.selector));
    desktopMenuBreakpoints.delete(rule.selector);
    assert.equal(rule.nodes.length, 1);
    desktopMenuExceptions++;
  });
  assert.equal(desktopMenuExceptions, 2, 'only the two inactive native desktop menus may override component display');
  assert.equal(noticeDockExceptions, 1, 'only a mobile owned notice dock may override native inline translation');
  // The native mobile pet is z9410 over the full-screen shell z9000. This exact
  // lower layer prevents it intercepting save/menu taps without changing gestures
  // or geometry. Other host overlays and stacking contexts stay forbidden.
  let mobilePetLayers = 0;
  stylesheet.walkDecls('z-index', declaration => {
    if (Number(declaration.value) < 100) return;
    const rule = declaration.parent, media = rule.parent;
    assert.ok([
      '.acu-desk-pet-layer[data-shiro-database-companion="blank-chess-v1"] > .acu-desk-pet',
      '.acu-desk-pet-layer[data-shiro-database-companion="blank-chess-v1"][data-shiro-database-notices="quiet"] > .acu-notice-bubble:not(.acu-notice-bubble--warning):not(.acu-notice-bubble--error):not(:has(.acu-notice-bubble__action))',
    ].includes(rule.selector));
    assert.equal(declaration.value, '8990');
    assert.equal(media.type, 'atrule');
    assert.equal(media.name, 'media');
    assert.equal(media.params, '(max-width: 767px), (pointer: coarse) and (max-width: 1024px)');
    if (rule.selector.includes('data-shiro-database-notices')) { assert.equal(rule.nodes.length, 2); assert.equal(rule.nodes[1].prop, 'visibility'); assert.equal(rule.nodes[1].value, 'hidden'); } else assert.equal(rule.nodes.length, 1, 'mobile pet rule must not change its native geometry or pointer events');
    mobilePetLayers++;
  });
  assert.equal(mobilePetLayers, 2);
  assert.match(css, /prefers-reduced-motion/);
});

test('visual viewport follows keyboard resize and pan, respects zoom, and removes all owned layout on dispose', () => {
  const f = fixture(); f.mount.dispose();
  Object.defineProperty(f.dom.window, 'innerWidth', { value: 390, configurable: true });
  const viewport = new f.dom.window.EventTarget();
  Object.assign(viewport, { width: 390, height: 844, offsetTop: 0, offsetLeft: 0, scale: 1 });
  Object.defineProperty(f.dom.window, 'visualViewport', { value: viewport, configurable: true });
  const mount = mountDatabaseTheme(f.options);
  const layout = () => f.doc.querySelector('[data-shiro-database-layout]');
  assert.match(layout().textContent, /height:844px/);
  Object.assign(viewport, { height: 360, offsetTop: 80 }); viewport.dispatchEvent(new f.dom.window.Event('resize'));
  assert.match(layout().textContent, /height:360px/); assert.match(layout().textContent, /top:80px/); assert.match(layout().textContent, /masthead-display:none/);
  f.doc.documentElement.style.transform = 'translateZ(0)';
  Object.defineProperty(f.dom.window, 'scrollX', { value: 9, configurable: true });
  f.dom.window.dispatchEvent(new f.dom.window.Event('scroll')); assert.match(layout().textContent, /left:9px/);
  f.doc.documentElement.style.removeProperty('transform'); f.doc.documentElement.removeAttribute('style');
  viewport.scale = 2; viewport.dispatchEvent(new f.dom.window.Event('scroll')); assert.equal(layout(), null);
  viewport.scale = 1; viewport.dispatchEvent(new f.dom.window.Event('resize')); assert.ok(layout());
  mount.setEnabled(false); assert.equal(layout(), null);
  mount.setEnabled(true); assert.ok(layout()); mount.dispose();
  viewport.dispatchEvent(new f.dom.window.Event('resize')); assert.equal(layout(), null);
  assert.equal(f.doc.documentElement.outerHTML, f.before); f.dom.window.close();
});

test('routine notifications can be reopened from native navigation and regain normal behavior when database closes', async () => {
  const f = fixture(), layer = f.doc.createElement('div'); layer.className = 'acu-desk-pet-layer';
  layer.innerHTML = '<div class="acu-notice-bubble acu-notice-bubble--info"><div class="acu-notice-bubble__body">原生提示</div><button class="acu-notice-bubble__close">下一条</button></div>';
  f.doc.body.append(layer); await flush();
  assert.equal(layer.getAttribute('data-shiro-database-notices'), 'quiet');
  f.doc.querySelector('.shiro-db-notices').click(); assert.equal(layer.hasAttribute('data-shiro-database-notices'), false);
  f.doc.querySelector('.shiro-db-notices').click(); assert.equal(layer.getAttribute('data-shiro-database-notices'), 'quiet');
  f.doc.querySelector('.acu-v2-app__shell').style.display = 'none'; await flush();
  assert.equal(layer.hasAttribute('data-shiro-database-notices'), false);
  f.mount.dispose(); assert.equal(layer.hasAttribute('data-shiro-database-companion'), false);
  assert.equal(layer.querySelector('.acu-notice-bubble__body').textContent, '原生提示'); f.dom.window.close();
});

test('mobile warnings keep real nodes and actions in reserved viewport space, even with a generic carousel sentence', async () => {
  const f = fixture(); f.mount.dispose();
  Object.defineProperty(f.dom.window, 'innerWidth', { value: 320, configurable: true });
  const viewport = new f.dom.window.EventTarget();
  Object.assign(viewport, { width: 320, height: 844, offsetTop: 0, offsetLeft: 0, scale: 1 });
  Object.defineProperty(f.dom.window, 'visualViewport', { value: viewport, configurable: true });
  const layer = f.doc.createElement('div'); layer.className = 'acu-desk-pet-layer';
  layer.innerHTML = '<div class="acu-notice-bubble acu-notice-bubble--warning" style="transform:translate3d(8px,197px,0px)"><div class="acu-notice-bubble__body"><p class="acu-notice-bubble__text">正在抄小本本…</p></div><button class="acu-notice-bubble__close">下一条</button></div>';
  f.doc.body.append(layer);
  const bubble = layer.firstElementChild, body = bubble.querySelector('.acu-notice-bubble__text'), close = bubble.querySelector('button');
  const originalTransform = bubble.style.transform;
  let nativeHeight = 64, closeClicks = 0, actionClicks = 0;
  bubble.getBoundingClientRect = () => ({ height: nativeHeight });
  close.addEventListener('click', () => closeClicks++);
  const mount = mountDatabaseTheme(f.options), layout = () => f.doc.querySelector('[data-shiro-database-layout]').textContent;
  assert.equal(layer.getAttribute('data-shiro-database-notice-dock'), 'blank-chess-v1');
  assert.match(layout(), /viewport-height:764px/); assert.match(layout(), /viewport-top:80px/);
  assert.match(layout(), /notice-top:8px/); assert.match(layout(), /notice-width:304px/);
  assert.equal(body.textContent, '正在抄小本本…'); assert.equal(bubble.style.transform, originalTransform);
  assert.equal(bubble.hasAttribute('data-shiro-database-routine'), false, 'words never classify a real warning as disposable');
  close.click(); assert.equal(closeClicks, 1);
  body.textContent = '真实警告，不是已知轮播文案'; await flush();
  assert.equal(layer.getAttribute('data-shiro-database-notice-dock'), 'blank-chess-v1');
  const action = f.doc.createElement('button'); action.className = 'acu-notice-bubble__action'; action.textContent = '打开真实任务';
  action.addEventListener('click', () => actionClicks++); bubble.append(action);
  bubble.className = 'acu-notice-bubble acu-notice-bubble--error'; nativeHeight = 200; await flush();
  assert.match(layout(), /viewport-height:668px/); assert.match(layout(), /viewport-top:176px/);
  action.click(); assert.equal(actionClicks, 1); assert.equal(bubble.querySelector('.acu-notice-bubble__text'), body);
  bubble.className = 'acu-notice-bubble acu-notice-bubble--info'; action.remove(); nativeHeight = 64; await flush();
  assert.equal(layer.hasAttribute('data-shiro-database-notice-dock'), false, 'ordinary info stays on the existing quiet path');
  assert.match(layout(), /viewport-height:844px/); assert.match(layout(), /viewport-top:0px/);
  f.doc.querySelector('.shiro-db-notices').click();
  assert.equal(layer.getAttribute('data-shiro-database-notice-dock'), 'blank-chess-v1', 'explicitly opened info also gets real space');
  viewport.height = 390; viewport.dispatchEvent(new f.dom.window.Event('resize'));
  assert.match(layout(), /viewport-height:310px/); assert.match(layout(), /masthead-display:none/);
  const shell = f.doc.querySelector('.acu-v2-app__shell'); shell.style.display = 'none'; await flush();
  assert.equal(layer.hasAttribute('data-shiro-database-notice-dock'), false, 'chat resumes the native pet-following bubble');
  assert.match(layout(), /viewport-height:390px/); assert.equal(bubble.style.transform, originalTransform);
  shell.style.display = 'flex'; await flush();
  assert.equal(layer.getAttribute('data-shiro-database-notice-dock'), 'blank-chess-v1');
  viewport.scale = 2; viewport.dispatchEvent(new f.dom.window.Event('resize'));
  assert.equal(layer.hasAttribute('data-shiro-database-notice-dock'), false, 'pinch zoom remains native');
  viewport.scale = 1; viewport.dispatchEvent(new f.dom.window.Event('resize'));
  assert.equal(layer.getAttribute('data-shiro-database-notice-dock'), 'blank-chess-v1');
  bubble.className = 'acu-notice-bubble acu-notice-bubble--warning'; await flush();
  const newer = mountDatabaseTheme(f.options); mount.dispose();
  assert.equal(layer.getAttribute('data-shiro-database-notice-dock'), 'blank-chess-v1');
  newer.setEnabled(false); assert.equal(layer.hasAttribute('data-shiro-database-notice-dock'), false);
  assert.equal(bubble.style.transform, originalTransform); close.click(); assert.equal(closeClicks, 2);
  newer.dispose(); viewport.dispatchEvent(new f.dom.window.Event('resize'));
  assert.equal(f.doc.querySelector('[data-shiro-database-layout]'), null);
  assert.equal(layer.hasAttribute('data-shiro-database-notice-dock'), false);
  f.dom.window.close();
});

test('exact teleported companion keeps native image sources, gestures and useful notice actions; off restores latest pose', async () => {
  const f = fixture();
  f.mount.setEnabled(false);
  const layer = f.doc.createElement('div'); layer.className = 'acu-desk-pet-layer';
  layer.innerHTML = '<div class="acu-desk-pet" role="img" aria-label="桌宠：打呼噜" style="transform:translate3d(12px,30px,0)"><div class="acu-desk-pet__body"><div class="acu-desk-pet__flip"><img class="acu-desk-pet__img pose-idle" src="data:image/png;base64,original" alt="" draggable="false"></div></div></div><div class="acu-notice-bubble acu-notice-bubble--warning"><div class="acu-notice-bubble__body">真实任务仍在进行</div><button class="acu-notice-bubble__action">打开任务</button></div>';
  f.doc.body.append(layer);
  const nativeBefore = layer.outerHTML;
  let gestures = 0, actions = 0;
  layer.querySelector('.acu-desk-pet').addEventListener('pointerdown', () => gestures++);
  layer.querySelector('button').addEventListener('click', () => actions++);
  f.mount.setEnabled(true);
  assert.equal(layer.getAttribute('data-shiro-database-companion'), 'blank-chess-v1');
  assert.equal(layer.querySelector('img').getAttribute('src'), 'data:image/png;base64,original');
  assert.match(layer.querySelector('.shiro-db-puppet-body').style.backgroundImage, /http:\/\/localhost:8000\/scripts\/extensions\/third-party\/shiro\/assets\/shiro-puppet-sheet.png/);
  layer.querySelector('.acu-desk-pet').dispatchEvent(new f.dom.window.Event('pointerdown'));
  layer.querySelector('button').click();
  assert.equal(gestures, 1); assert.equal(actions, 1);
  assert.equal(layer.querySelector('.acu-notice-bubble__body').textContent, '真实任务仍在进行');
  f.mount.setEnabled(false);
  assert.equal(layer.outerHTML, nativeBefore);
  f.mount.setEnabled(true);
  const image = layer.querySelector('img');
  image.src = 'data:image/png;base64,latest-pose'; image.className = 'acu-desk-pet__img pose-wave';
  await flush();
  f.mount.setEnabled(false);
  assert.equal(image.getAttribute('src'), 'data:image/png;base64,latest-pose');
  assert.equal(image.className, 'acu-desk-pet__img pose-wave');
  assert.equal(layer.hasAttribute('data-shiro-database-companion'), false);
  f.mount.dispose(); f.dom.window.close();
});

test('companion late mount/peek remount are recognised, unrelated overlays and future layouts stay untouched', async () => {
  const f = fixture();
  const layer = f.doc.createElement('div'); layer.className = 'acu-desk-pet-layer';
  layer.innerHTML = '<div class="acu-desk-pet"><div class="acu-desk-pet__peek"><img class="acu-desk-pet__peek-img" src="/native.png"></div></div>';
  f.doc.body.append(layer);
  const unrelated = f.doc.createElement('div'); unrelated.className = 'some-other-pet'; unrelated.innerHTML = '<img src="/other.png">';
  f.doc.body.append(unrelated);
  await flush();
  assert.equal(layer.getAttribute('data-shiro-database-companion'), 'blank-chess-v1');
  assert.equal(unrelated.outerHTML, '<div class="some-other-pet"><img src="/other.png"></div>');
  layer.querySelector('img').className = 'future-pet-image';
  await flush();
  assert.equal(layer.hasAttribute('data-shiro-database-companion'), false);
  layer.querySelector('img').className = 'acu-desk-pet__peek-img';
  await flush();
  assert.equal(layer.getAttribute('data-shiro-database-companion'), 'blank-chess-v1');
  f.doc.querySelector('.acu-v2-app').className = 'future-app';
  await flush();
  assert.equal(layer.hasAttribute('data-shiro-database-companion'), false);
  f.mount.dispose(); f.dom.window.close();
});
