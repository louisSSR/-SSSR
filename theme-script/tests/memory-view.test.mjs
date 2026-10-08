import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { ({ JSDOM } = createRequire(new URL('../../../artifacts/shiro-butterfly-shop-20261006/patched-shujuku/package.json', import.meta.url))('jsdom')); }
const output = ts.transpileModule(readFileSync(new URL('../src/memory-view.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} }; new Function('require', 'module', 'exports', output)(require, module, module.exports);
const { createMemoryView, MEMORY_KEYS } = module.exports;
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function snapshot(options = {}, revision = 7, account = 'origin-A', chat = '["chat-A"]', prefix = '真实', count = 125) {
  const offset = options.offsets ?? {}, limit = options.limit ?? 50;
  return { version: 1, scope: { origin: 'http://localhost:18006', handle: 'user-A', chat, account }, revision, updatedAt: '2026-10-08T08:00:00.000Z',
    tables: MEMORY_KEYS.map((key, index) => { const start = offset[key] ?? 0, total = options.query ? 1 : count, size = Math.max(0, Math.min(limit, total - start));
      return { key, title: ['一、重要印象', '二、点数账目', '三、消费与所得', '四、连锁反应与任务'][index], columns: ['项目', '明细'], total, offset: start, limit,
        rows: Array.from({ length: size }, (_, row) => [`${prefix}-${key}-${start + row}`, options.query ?? '已提交记录']), recordIds: Array.from({ length: size }, (_, row) => `${account}:${key}:${start + row}`) };
    }) };
}
function fixture(reader = options => Promise.resolve(snapshot(options))) {
  const dom = new JSDOM('<!doctype html><html><body><header id="anchor">原生保存<button id="save">保存</button></header></body></html>', { url: 'http://localhost:18006' });
  const doc = dom.window.document, calls = [], listeners = new Set(); let exports = 0, stops = 0;
  const source = { readMemorySnapshot(options) { calls.push(options); return reader(options); }, subscribeMemorySnapshots(listener) { listeners.add(listener); return () => { stops++; listeners.delete(listener); }; }, async exportCompleteMemory() { exports++; } };
  const controller = createMemoryView(doc); controller.setSource(source); const view = controller.attach(doc.querySelector('#anchor'));
  const notify = notice => { for (const listener of [...listeners]) listener(notice); };
  return { dom, doc, source, calls, listeners, controller, view, notify, get exports() { return exports; }, get stops() { return stops; } };
}

test('live view reads four actual categories with versions, paginates all records, searches and exports only on a click', async () => {
  const f = fixture(); assert.equal(f.listeners.size, 1); assert.equal(f.calls.length, 0); assert.equal(f.doc.querySelector('.shiro-db-memory-body').hidden, true);
  f.controller.open(); await flush();
  assert.equal(f.calls[0].limit, 50); assert.match(f.doc.querySelector('.shiro-db-memory-status').textContent, /版本 7/);
  assert.equal(f.doc.querySelectorAll('tbody tr').length, 50);
  for (const key of MEMORY_KEYS) { f.doc.querySelector(`[data-shiro-memory-tab="${key}"]`).click(); assert.equal(f.doc.querySelector('table').dataset.shiroMemoryTable, key); assert.match(f.doc.querySelector('tbody').textContent, new RegExp(`真实-${key}`)); }
  f.doc.querySelector('.shiro-db-memory-next').click(); await flush(); assert.equal(f.calls.at(-1).offsets.ripples, 50); assert.match(f.doc.querySelector('tbody').textContent, /ripples-50/);
  f.doc.querySelector('.shiro-db-memory-next').click(); await flush(); assert.equal(f.doc.querySelectorAll('tbody tr').length, 25); assert.equal(f.doc.querySelector('.shiro-db-memory-next').disabled, true); assert.equal(f.doc.querySelector('.shiro-db-memory-page').textContent, '101–125 / 125');
  f.doc.querySelector('.shiro-db-memory-previous').click(); await flush(); assert.equal(f.calls.at(-1).offsets.ripples, 50);
  const input = f.doc.querySelector('input'); input.value = '<img src=x onerror="throw 1">'; f.doc.querySelector('form').dispatchEvent(new f.dom.window.Event('submit', { cancelable: true })); await flush();
  assert.equal(f.calls.at(-1).query, input.value); assert.deepEqual(f.calls.at(-1).offsets, {}); assert.equal(f.doc.querySelector('tbody img'), null); assert.match(f.doc.querySelector('tbody').textContent, /<img/);
  assert.equal(f.exports, 0); f.doc.querySelector('.shiro-db-memory-export').click(); await flush(); assert.equal(f.exports, 1);
  f.controller.dispose(); assert.equal(f.listeners.size, 0); assert.equal(f.doc.querySelector('.shiro-db-memory'), null); assert.ok(f.doc.querySelector('#save')); f.dom.window.close();
});

test('committed task and consumption notifications refresh current data; an account/chat switch clears synchronously and cancels old reads', async () => {
  let pending; const f = fixture(options => pending ? pending.promise : Promise.resolve(snapshot(options)));
  f.controller.open(); await flush(); assert.match(f.doc.querySelector('tbody').textContent, /真实/);
  f.doc.querySelector('input').value = '尚未提交的搜索';
  pending = deferred(); f.notify({ chat: '["chat-A"]', account: 'origin-A', revision: 8 });
  assert.equal(f.doc.querySelector('tbody'), null, 'stale rows disappear while the committed revision is reread');
  pending.resolve(snapshot({}, 8, 'origin-A', '["chat-A"]', '消费/任务已更新')); await flush(); assert.match(f.doc.querySelector('tbody').textContent, /消费\/任务已更新/);
  assert.equal(f.doc.querySelector('input').value, '尚未提交的搜索', 'a live committed revision preserves a typing draft');
  pending = deferred(); const old = pending; f.notify({ chat: '["chat-A"]', account: 'origin-A', revision: 9 });
  pending = deferred(); const next = pending; f.notify({ chat: '["chat-B"]', account: 'origin-B', revision: 2 });
  assert.equal(f.doc.querySelector('tbody'), null); assert.equal(f.doc.querySelector('.shiro-db-memory-scope').textContent, ''); assert.deepEqual(f.calls.at(-1).offsets, {}); assert.equal(f.calls.at(-1).query, '');
  assert.equal(f.doc.querySelector('input').value, '', 'an identity change resets even an unsubmitted draft');
  next.resolve(snapshot({}, 2, 'origin-B', '["chat-B"]', 'B的账本')); await flush(); old.resolve(snapshot({}, 9, 'origin-A', '["chat-A"]', 'A的迟到旧账')); await flush();
  assert.match(f.doc.querySelector('tbody').textContent, /B的账本/); assert.doesNotMatch(f.doc.querySelector('tbody').textContent, /迟到/);
  f.controller.dispose(); f.dom.window.close();
});

test('null, a rejected identity read, or mismatched/older snapshot clears data rather than leaking another scope', async () => {
  let result; const f = fixture(options => result ?? Promise.resolve(snapshot(options))); f.controller.open(); await flush();
  f.notify(null); assert.equal(f.doc.querySelector('tbody'), null); assert.equal(f.doc.querySelector('.shiro-db-memory-scope').textContent, '');
  result = Promise.reject(new Error('login mismatch')); f.notify({ chat: '["chat-B"]', account: 'origin-B', revision: 2 }); await flush(); assert.equal(f.doc.querySelector('tbody'), null); assert.match(f.doc.querySelector('.shiro-db-memory-status').textContent, /旧资料已清空/);
  result = Promise.resolve(snapshot({}, 2, 'origin-A', '["chat-A"]', 'wrong')); f.notify({ chat: '["chat-B"]', account: 'origin-B', revision: 3 }); await flush(); assert.equal(f.doc.querySelector('tbody'), null);
  result = Promise.resolve(snapshot({}, 2, 'origin-B', '["chat-B"]', 'older')); f.notify({ chat: '["chat-B"]', account: 'origin-B', revision: 3 }); await flush(); assert.equal(f.doc.querySelector('tbody'), null);
  result = Promise.resolve(snapshot({}, 3, 'origin-B', '["chat-B"]', 'current')); f.doc.querySelector('.shiro-db-memory-refresh').click(); await flush(); assert.match(f.doc.querySelector('tbody').textContent, /current/);
  f.controller.dispose(); f.dom.window.close();
});

test('multiple native mounts share one subscription; remount, service replacement, close and unload revoke late work and old controls', async () => {
  const pending = deferred(), f = fixture(() => pending.promise), header = f.doc.createElement('header'); f.doc.body.append(header);
  const second = f.controller.attach(header); assert.equal(f.listeners.size, 1);
  f.controller.open(); const oldButton = f.doc.querySelector('.shiro-db-memory-next'); f.view.dispose(); assert.equal(f.listeners.size, 1);
  second.dispose(); assert.equal(f.listeners.size, 0); assert.equal(f.stops, 1);
  pending.resolve(snapshot()); await flush(); assert.equal(f.doc.querySelector('table'), null); oldButton.click(); assert.equal(f.calls.length, 1);
  const late = f.controller.attach(header); assert.equal(f.listeners.size, 1);
  let nextStops = 0; const listeners = new Set(), newer = { ...f.source, readMemorySnapshot: options => Promise.resolve(snapshot(options, 4, 'origin-C', '["chat-C"]', 'C的账本')), subscribeMemorySnapshots(listener) { listeners.add(listener); return () => { nextStops++; listeners.delete(listener); }; } };
  f.controller.setSource(newer); assert.equal(f.listeners.size, 0); assert.equal(listeners.size, 1);
  f.controller.open(); await flush(); assert.match(f.doc.querySelector('tbody').textContent, /C的账本/);
  f.doc.querySelector('.shiro-db-memory-summary').click(); assert.equal(f.doc.querySelector('tbody'), null); assert.equal(f.doc.querySelector('.shiro-db-memory-body').hidden, true);
  const reads = f.calls.length; f.controller.dispose(); assert.equal(nextStops, 1); late.dispose(); oldButton.click(); assert.equal(f.calls.length, reads); f.dom.window.close();
});

test('malformed bridge data is rejected; export completion is independent of a newer read and cannot reanimate disposed controls', async () => {
  const f = fixture(() => Promise.resolve({ ...snapshot(), tables: snapshot().tables.slice(0, 3) })); f.controller.open(); await flush(); assert.equal(f.doc.querySelector('table'), null); assert.match(f.doc.querySelector('.shiro-db-memory-status').textContent, /旧资料/);
  const exportWork = deferred(); f.source.readMemorySnapshot = options => Promise.resolve(snapshot(options)); f.source.exportCompleteMemory = () => exportWork.promise;
  f.doc.querySelector('.shiro-db-memory-refresh').click(); await flush();
  f.doc.querySelector('.shiro-db-memory-export').click(); assert.equal(f.doc.querySelector('.shiro-db-memory-export').disabled, true);
  f.notify({ chat: '["chat-A"]', account: 'origin-A', revision: 7 }); await flush(); exportWork.resolve(); await flush();
  assert.equal(f.doc.querySelector('.shiro-db-memory-export').disabled, false);
  f.controller.dispose(); assert.equal(f.listeners.size, 0); f.dom.window.close();
});

test('a rejected complete export shows a visible failure, clears old rows and is handled without an unhandled rejection', async () => {
  const f = fixture(), unhandled = [], onUnhandled = reason => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    f.source.exportCompleteMemory = async () => { throw new Error('temporary API/me connection failure'); };
    f.controller.open(); await flush(); assert.ok(f.doc.querySelector('tbody'));
    f.doc.querySelector('.shiro-db-memory-export').click(); await flush();
    const status = f.doc.querySelector('.shiro-db-memory-status');
    assert.equal(status.textContent, '导出未完成，旧资料已清空；请确认聊天、本源和连接，再刷新重试。');
    assert.equal(status.closest('.shiro-db-memory-body').hidden, false);
    assert.equal(f.doc.querySelector('tbody'), null); assert.equal(f.doc.querySelector('.shiro-db-memory-scope').textContent, '');
    assert.equal(f.doc.querySelector('.shiro-db-memory-export').disabled, true); assert.deepEqual(unhandled, []);
    f.doc.querySelector('.shiro-db-memory-refresh').click(); await flush(); assert.ok(f.doc.querySelector('tbody'));
    assert.equal(f.doc.querySelector('.shiro-db-memory-export').disabled, false); assert.deepEqual(unhandled, []);
  } finally { process.removeListener('unhandledRejection', onUnhandled); f.controller.dispose(); f.dom.window.close(); }
});
