import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { ({ JSDOM } = createRequire(new URL('../../../artifacts/shiro-butterfly-shop-20261006/patched-shujuku/package.json', import.meta.url))('jsdom')); }
const output = ts.transpileModule(readFileSync(new URL('../src/puppet.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} }; new Function('require', 'module', 'exports', output)(require, module, module.exports);
const { createPuppetPresentation, createPuppetSprite, setPuppetPose, PUPPET_LINES } = module.exports;
function fixture() {
  const dom = new JSDOM('<!doctype html><body><aside id="portrait"></aside><div class="acu-desk-pet-layer"><div class="acu-desk-pet"><div class="acu-desk-pet__body"><div class="acu-desk-pet__flip"><img class="acu-desk-pet__img pose-idle" src="/native.png"></div></div></div><div class="acu-notice-bubble acu-notice-bubble--warning"><button>原生操作</button></div></div></body>', { url: 'http://localhost:18006/' });
  const doc = dom.window.document, timers = new Map(); let id = 0;
  dom.window.setTimeout = (fn, delay) => { timers.set(++id, { fn, delay }); return id; };
  dom.window.clearTimeout = timer => timers.delete(timer);
  const presentation = createPuppetPresentation(doc, 'data:image/png;base64,iVBORw0KGgo=', undefined, '/shiro-peek-head-hands.png');
  return { dom, doc, timers, presentation, close() { presentation.dispose(); assert.equal(timers.size, 0); dom.window.close(); } };
}
function pointer(f, target, type, x, y, extra = {}) {
  const event = new f.dom.window.Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: 1, clientX: x, clientY: y, button: 0, isPrimary: true, ...extra }); target.dispatchEvent(event); return event;
}
test('six states select single square cells on the dedicated sheet, never a scaled img contact sheet', () => {
  const f = fixture(), sprite = createPuppetSprite(f.doc, 'data:image/png;base64,iVBORw0KGgo=', 'test');
  const positions = [];
  for (const pose of ['idle', 'blink', 'smug', 'poke', 'carried', 'peek']) { setPuppetPose(sprite, pose); positions.push(sprite.style.backgroundPosition); }
  assert.equal(new Set(positions).size, 6); assert.deepEqual(positions, ['0% 0%', '49.4% 0%', '100% 0%', '0% 100%', '50% 100%', '100% 100%']);
  assert.equal(sprite.tagName, 'SPAN'); assert.equal(sprite.getAttribute('aria-hidden'), 'true'); assert.match(sprite.style.backgroundImage, /^url\("data:image\/png/);
  f.close();
});
test('local jokes cycle with cooldown, expire after four seconds, quiet stops them and detached controls are inert', t => {
  const f = fixture(), node = f.doc.querySelector('#portrait'), avatar = f.doc.createElement('button'), sprite = f.presentation.sprite('shiro-db-avatar');
  avatar.append(sprite); node.append(avatar); const stop = f.presentation.portrait(node, sprite, avatar);
  let now = 0; t.mock.method(Date, 'now', () => now);
  const jokeButton = node.querySelector('.shiro-db-puppet-joke-button'), line = node.querySelector('.shiro-db-puppet-line'), quiet = node.querySelector('.shiro-db-puppet-quiet');
  jokeButton.click(); assert.equal(line.textContent, PUPPET_LINES[0]); assert.equal(line.hidden, false); assert.equal(sprite.dataset.shiroPuppetPose, 'smug');
  avatar.click(); assert.equal(line.textContent, PUPPET_LINES[0]); assert.equal(f.timers.size, 1);
  now = 3001; jokeButton.click(); assert.equal(line.textContent, PUPPET_LINES[1]); assert.equal(f.timers.size, 1);
  const [timer, entry] = [...f.timers][0]; assert.equal(entry.delay, 4000); f.timers.delete(timer); entry.fn(); assert.equal(line.hidden, true); assert.equal(sprite.dataset.shiroPuppetPose, 'idle');
  now = 6002; jokeButton.click(); quiet.click(); assert.equal(line.hidden, true); assert.equal(f.timers.size, 0); assert.equal(quiet.getAttribute('aria-pressed'), 'true'); assert.equal(jokeButton.disabled, true);
  quiet.click(); assert.equal(quiet.getAttribute('aria-pressed'), 'false'); assert.equal(jokeButton.disabled, false);
  stop(); avatar.click(); jokeButton.click(); quiet.click(); assert.equal(f.timers.size, 0); assert.equal(node.querySelector('.shiro-db-puppet-line'), null); f.close();
});
test('native pointer handlers and warnings retain their actions; drag and tap get different transient states', () => {
  const f = fixture(), layer = f.doc.querySelector('.acu-desk-pet-layer'), pet = layer.querySelector('.acu-desk-pet'), image = layer.querySelector('img');
  let nativeMoves = 0, warnings = 0; pet.addEventListener('pointermove', () => nativeMoves++); layer.querySelector('button').addEventListener('click', () => warnings++);
  const before = layer.outerHTML, companion = f.presentation.companion(layer), sprite = layer.querySelector('.shiro-db-puppet-body');
  assert.equal(image.getAttribute('src'), '/native.png');
  pointer(f, pet, 'pointerdown', 10, 10); const moved = pointer(f, pet, 'pointermove', 20, 30); assert.equal(moved.defaultPrevented, false); assert.equal(nativeMoves, 1); assert.equal(sprite.dataset.shiroPuppetPose, 'carried');
  pointer(f, pet, 'pointerup', 20, 30); assert.equal(sprite.dataset.shiroPuppetPose, 'smug'); assert.equal(f.timers.size, 1);
  pointer(f, pet, 'pointerdown', 20, 30); pointer(f, pet, 'pointerup', 20, 30); assert.equal(sprite.dataset.shiroPuppetPose, 'poke'); assert.equal(f.timers.size, 1);
  layer.querySelector('button').click(); assert.equal(warnings, 1); companion.dispose(); assert.equal(layer.outerHTML, before); assert.equal(f.timers.size, 0); f.close();
});
test('rotation/cancel/blur cancel the old gesture, preserve latest native pose, and leave no owned listeners or timers', () => {
  const f = fixture(), layer = f.doc.querySelector('.acu-desk-pet-layer'), pet = layer.querySelector('.acu-desk-pet');
  const companion = f.presentation.companion(layer), sprite = layer.querySelector('.shiro-db-puppet-body');
  for (const cancel of ['resize', 'orientationchange', 'blur', 'pointercancel']) {
    pointer(f, pet, 'pointerdown', 1, 1); pointer(f, pet, 'pointermove', 25, 25);
    if (cancel === 'pointercancel') pointer(f, pet, cancel, 25, 25); else f.dom.window.dispatchEvent(new f.dom.window.Event(cancel));
    pointer(f, pet, 'pointerup', 25, 25); assert.equal(sprite.dataset.shiroPuppetPose, 'idle'); assert.equal(f.timers.size, 0);
  }
  layer.querySelector('img').src = '/new-native.png'; companion.dispose(); pointer(f, pet, 'pointerdown', 0, 0); pointer(f, pet, 'pointerup', 0, 0);
  assert.equal(f.timers.size, 0); assert.equal(layer.querySelector('.shiro-db-puppet'), null); assert.equal(layer.querySelector('img').getAttribute('src'), '/new-native.png'); f.close();
});
test('independent peek preserves native size while discarding rotation and offsets; future layouts remove owned spans', () => {
  const f = fixture(), layer = f.doc.querySelector('.acu-desk-pet-layer'), pet = layer.querySelector('.acu-desk-pet'), companion = f.presentation.companion(layer);
  pet.innerHTML = '<div class="acu-desk-pet__peek is-right" style="width:36px;height:64px"><img class="acu-desk-pet__peek-img" src="/peek.png" style="width:64px;height:64px;top:0;right:0;transform:rotate(-90deg)"></div>';
  companion.sync(); const span = pet.querySelector('.shiro-db-puppet-peek'), image = pet.querySelector('img');
  assert.equal(span.dataset.shiroPuppetPose, 'peek'); assert.equal(span.dataset.shiroPuppetIndependentPeek, 'true'); assert.match(span.style.backgroundImage, /shiro-peek-head-hands/);
  assert.match(span.style.backgroundPosition, /^center(?: center)?$/); assert.equal(span.style.width, '64px'); assert.equal(span.style.height, '64px'); assert.equal(span.style.right, ''); assert.equal(span.style.transform, ''); assert.equal(pet.querySelectorAll('.shiro-db-puppet-body').length, 0);
  const before = image.getAttribute('style'); pointer(f, pet, 'pointerdown', 1, 1); pointer(f, pet, 'pointermove', 25, 25);
  assert.equal(span.dataset.shiroPuppetPose, 'peek'); assert.equal(image.getAttribute('style'), before);
  image.style.width = '90px'; companion.sync(); assert.equal(span.style.width, '90px'); assert.equal(pet.querySelectorAll('.shiro-db-puppet').length, 1);
  image.className = 'future-image'; companion.sync(); assert.equal(pet.querySelector('.shiro-db-puppet'), null); f.close();
});
