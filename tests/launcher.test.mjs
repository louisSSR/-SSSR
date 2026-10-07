import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { ({ JSDOM } = createRequire(new URL('../../../artifacts/shiro-butterfly-shop-20261006/patched-shujuku/package.json', import.meta.url))('jsdom')); }
const module = { exports: {} };
new Function('module', 'exports', ts.transpileModule(readFileSync(new URL('../src/launcher.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(module, module.exports);
const { readLauncherPosition, launcherBounds, placeLauncher, normalizeLauncher, createLauncherPosition, LAUNCHER_POSITION_KEY } = module.exports;
function fixture(storageOverride) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:18006/' }), win = dom.window;
  const surface = win.document.createElement('div'); win.document.body.append(surface);
  const shadow = surface.attachShadow({ mode: 'open' });
  let size = { width: 390, height: 844 }, opens = 0;
  surface.getBoundingClientRect = () => ({ ...size, left: 0, top: 0 });
  const values = new Map(), writes = [];
  const storage = storageOverride ?? { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); writes.push(key); }, removeItem: key => values.delete(key) };
  function makeButton() {
    const item = win.document.createElement('button'); item.className = 'launcher'; item.innerHTML = '<img><b>蝶翼商店</b><small>0点</small>';
    Object.defineProperty(item, 'offsetWidth', { get: () => 48 });
    let captured; item.setPointerCapture = id => { captured = id; }; item.hasPointerCapture = id => captured === id; item.releasePointerCapture = () => { captured = undefined; };
    item.addEventListener('click', () => opens++); shadow.append(item); return item;
  }
  let item = makeButton(), api = createLauncherPosition(surface, shadow, storage);
  const point = () => ({ x: Number.parseFloat(surface.style.getPropertyValue('--shiro-launcher-x')), y: Number.parseFloat(surface.style.getPropertyValue('--shiro-launcher-y')) });
  function pointer(type, x, y, extra = {}) {
    const event = new win.MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y, button: 0, ...extra });
    Object.defineProperties(event, { pointerId: { value: extra.pointerId ?? 1 }, isPrimary: { value: extra.isPrimary ?? true } }); item.dispatchEvent(event);
  }
  return { dom, win, surface, shadow, storage, values, writes, point, pointer, get opens() { return opens; }, get item() { return item; }, get api() { return api; },
    resize: (width, height) => { size = { width, height }; api.reflow(); },
    remount: () => { item.remove(); item = makeButton(); api.refresh(); },
    reload: () => { api.dispose(); api = createLauncherPosition(surface, shadow, storage); },
    close: () => { api.dispose(); dom.window.close(); },
    click: (detail = 1) => item.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true, cancelable: true, detail })),
  };
}

test('launcher preference rejects corrupt data and safe bounds preserve normalized placement across viewports', () => {
  for (const value of [null, '', '{', '{}', '{"version":1,"x":2,"y":0}', '{"version":1,"x":"0","y":0}', '{"version":9,"x":0,"y":0}']) assert.equal(readLauncherPosition(value), null);
  assert.deepEqual(readLauncherPosition('{"version":1,"x":0.25,"y":0.7}'), { x: 0.25, y: 0.7 });
  const bounds = launcherBounds(390, 844, 48, { left: 0, top: 20, right: 0, bottom: 34 });
  assert.deepEqual(bounds, { left: 12, top: 32, right: 330, bottom: 750 });
  assert.deepEqual(placeLauncher(null, bounds), { x: 330, y: 670 });
  const ratio = normalizeLauncher({ x: 170, y: 400 }, bounds), point = placeLauncher(ratio, bounds);
  assert.equal(point.x, 170); assert.equal(point.y, 400);
});

test('a tap and tiny hand movement still open the shop exactly once without storing a drag', () => {
  const f = fixture(), before = f.point();
  f.pointer('pointerdown', 340, 710); f.pointer('pointermove', 342, 712); f.pointer('pointerup', 342, 712); f.click();
  assert.equal(f.opens, 1); assert.deepEqual(f.point(), before); assert.equal(f.writes.length, 0);
  assert.match(f.item.getAttribute('aria-label'), /可拖动/); assert.equal(f.item.querySelector('img').draggable, false); f.close();
});

test('mouse or touch drag is clamped, persisted once, suppresses drag-click and preserves the next deliberate click', () => {
  const f = fixture();
  f.pointer('pointerdown', 340, 710); f.pointer('pointermove', -900, -900); f.pointer('pointerup', -900, -900); f.click();
  assert.deepEqual(f.point(), { x: 12, y: 12 }); assert.equal(f.opens, 0); assert.deepEqual(f.writes, [LAUNCHER_POSITION_KEY]);
  assert.deepEqual(JSON.parse(f.values.get(LAUNCHER_POSITION_KEY)), { version: 1, x: 0, y: 0 });
  f.pointer('pointerdown', 20, 20); f.pointer('pointerup', 20, 20); f.click(); assert.equal(f.opens, 1);
  f.pointer('pointerdown', 20, 20); f.pointer('pointermove', 4000, 4000); f.pointer('pointerup', 4000, 4000);
  assert.deepEqual(f.point(), { x: 330, y: 784 }); f.close();
});

test('Vue close/reopen, reload, orientation and shortened keyboard space retain preferred position without writing on resize', () => {
  const f = fixture();
  f.pointer('pointerdown', 340, 710); f.pointer('pointermove', 190, 430); f.pointer('pointerup', 190, 430);
  const preferred = f.values.get(LAUNCHER_POSITION_KEY), original = f.point();
  f.remount(); assert.deepEqual(f.point(), original); f.reload(); assert.deepEqual(f.point(), original);
  f.resize(844, 390); assert.ok(f.point().x >= 12 && f.point().x <= 784); assert.ok(f.point().y >= 12 && f.point().y <= 330);
  f.resize(390, 380); assert.ok(f.point().y <= 320); f.resize(390, 844);
  assert.deepEqual(f.point(), original); assert.equal(f.values.get(LAUNCHER_POSITION_KEY), preferred); assert.equal(f.writes.length, 1); f.close();
});

test('resize, pointercancel and lost capture cancel the current drag; late release never persists stale coordinates', () => {
  const f = fixture();
  f.pointer('pointerdown', 340, 710); f.pointer('pointermove', 50, 50); f.resize(844, 390);
  f.pointer('pointerup', 50, 50); f.click(); assert.equal(f.opens, 0); assert.equal(f.writes.length, 0);
  assert.deepEqual(f.point(), { x: 784, y: 250 });
  for (const cancel of ['pointercancel', 'lostpointercapture']) {
    const prior = f.point(); f.pointer('pointerdown', 800, 270); f.pointer('pointermove', 200, 100); f.pointer(cancel, 200, 100);
    assert.deepEqual(f.point(), prior); f.pointer('pointerup', 200, 100); assert.equal(f.writes.length, 0);
  }
  f.close();
});

test('keyboard directions and Home/reset are accessible; a storage error cannot disable dragging', () => {
  const f = fixture(), origin = f.point();
  f.item.dispatchEvent(new f.win.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, composed: true, cancelable: true }));
  assert.equal(f.point().x, origin.x - 8); assert.equal(f.values.size, 1);
  f.item.dispatchEvent(new f.win.KeyboardEvent('keydown', { key: 'Home', bubbles: true, composed: true, cancelable: true }));
  assert.deepEqual(f.point(), origin); assert.equal(f.values.size, 0); f.close();
  const denied = fixture({ getItem() { throw Error('disabled'); }, setItem() { throw Error('disabled'); }, removeItem() { throw Error('disabled'); } });
  denied.pointer('pointerdown', 340, 710); denied.pointer('pointermove', 40, 40); denied.pointer('pointerup', 40, 40);
  assert.ok(denied.point().x < 100); denied.api.reset(); assert.deepEqual(denied.point(), origin); denied.close();
});

test('dispose clears transient state and listeners without erasing the saved preference', () => {
  const f = fixture(); f.pointer('pointerdown', 340, 710); f.pointer('pointermove', 200, 300); f.pointer('pointerup', 200, 300);
  const saved = f.values.get(LAUNCHER_POSITION_KEY); f.api.dispose();
  assert.equal(f.surface.style.getPropertyValue('--shiro-launcher-x'), '');
  f.pointer('pointerdown', 20, 20); f.pointer('pointermove', 500, 500); f.pointer('pointerup', 500, 500);
  assert.equal(f.surface.style.getPropertyValue('--shiro-launcher-x'), ''); assert.equal(f.values.get(LAUNCHER_POSITION_KEY), saved); assert.equal(f.writes.length, 1); f.close();
});
