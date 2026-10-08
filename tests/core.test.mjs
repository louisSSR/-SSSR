import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const sourcePath = new URL('../src/core.ts', import.meta.url);
const compiled = ts.transpileModule(readFileSync(sourcePath, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const c = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const AT = '2026-10-06T00:00:00.000Z';
const fresh = () => c.createLedger('origin-a', '测试本源', AT);
const event = (id = 'r1', amount = '10', extra = {}) => ({ requestId: `earn:${id}`, resultId: id, world: '铜林世界', source: '实际提供新工艺', outcome: `结果 ${id} 已实际成立`, evidence: `楼层证据 ${id}`, amount, standardSpec: `已成立实际改变规格 ${amount}`, established: true, at: AT, ...extra });
const funded = (amount = '10') => c.credit(fresh(), event('r1', amount)).ledger;
const spec = { content: '可食用恢复药剂', strength: '恢复十单位体力', quantity: '一瓶', range: '一位使用者', duration: '即时恢复', uses: '一次', conditions: '完整药剂及服用能力一并适配', crossWorld: '保持等效恢复能力' };
const quote = (price = '2', extra = {}) => ({ id: 'q-potion', name: '药剂', category: '资源', world: '铜林世界', spec, price, kind: 'consumable', at: AT, ...extra });
function rejectsCode(fn, code) { assert.throws(fn, error => error.code === code); }

test('core and storage pass strict TypeScript checks independently of UI', () => {
  const paths = [sourcePath, new URL('../src/storage.ts', import.meta.url)].map(fileURLToPath);
  const program = ts.createProgram(paths, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, noEmit: true, types: [], lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], skipLibCheck: true });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
});
test('new account has no free points and immutable one-point baseline', () => {
  const l = fresh(); c.validateLedger(l); assert.equal(l.balance, '0'); assert.equal(l.income, '0'); assert.equal(l.quotes[0].price, '1');
  rejectsCode(() => c.purchase(l, { requestId: 'buy0', quoteId: c.BASELINE_QUOTE_ID }), 'INSUFFICIENT_BALANCE');
  for (const field of ['price', 'kind', 'key']) { const bad = structuredClone(l); bad.quotes[0][field] = 'bad'; rejectsCode(() => c.validateLedger(bad), 'BASELINE_CHANGED'); }
});
test('exact decimal arithmetic handles large balances and fractional increments', () => {
  assert.equal(c.addAmounts('9007199254740993123456789012345.000000000000000001', '0.000000000000000009'), '9007199254740993123456789012345.00000000000000001');
  assert.equal(c.subtractAmounts('1', '0.999999999999999999'), '0.000000000000000001');
  assert.equal(c.normalizeAmount('00001.2000'), '1.2');
  for (const value of ['-1', '1e3', 'NaN', 'Infinity', '0.0000000000000000001', '1'.repeat(49), 3]) assert.throws(() => c.normalizeAmount(value));
  rejectsCode(() => c.addAmounts('9'.repeat(48), '1'), 'AMOUNT_LIMIT');
});
test('purchase preview total uses exactly the same decimal multiplication as debit', () => {
  assert.equal(c.multiplyAmountByCount('0.3', 3), '0.9');
  assert.equal(c.multiplyAmountByCount('2', 2), '4');
  assert.equal(c.multiplyAmountByCount('0.000000000000000001', 999999), '0.000000000000999999');
  for (const n of [0, -1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '2']) assert.throws(() => c.multiplyAmountByCount('2', n));
  rejectsCode(() => c.multiplyAmountByCount('9'.repeat(48), 2), 'AMOUNT_LIMIT');
});
test('credit requires actual evidence, fixed standard, positive amount and independent minimum', () => {
  const l = fresh(); rejectsCode(() => c.credit(l, event('r1', '10', { established: false })), 'NOT_ESTABLISHED');
  rejectsCode(() => c.credit(l, event('r1', '0.9')), 'MINIMUM_CREDIT');
  rejectsCode(() => c.credit(l, event('r1', '0')), 'MINIMUM_CREDIT');
  rejectsCode(() => c.credit(l, event('r1', '1', { evidence: '' })), 'INVALID_TEXT');
  const earned = c.credit(l, event()).ledger; assert.equal(l.balance, '0'); assert.equal(earned.balance, '10');
  rejectsCode(() => c.credit(earned, event('r2', '11', { standardSpec: event().standardSpec })), 'FIXED_STANDARD_CONFLICT');
  c.validateLedger(c.credit(earned, event('r2')).ledger);
});
test('credit retries and duplicate actual result IDs never mint twice', () => {
  const result = c.credit(fresh(), event());
  assert.equal(c.credit(result.ledger, event()).ledger.revision, result.ledger.revision);
  assert.equal(c.credit(result.ledger, event('r1', '10', { requestId: 'different-request' })).ledger.balance, '10');
  rejectsCode(() => c.credit(result.ledger, event('r1', '11')), 'IDEMPOTENCY_CONFLICT');
  rejectsCode(() => c.credit(result.ledger, event('r1', '11', { requestId: 'new-request' })), 'RESULT_CONFLICT');
});
test('same credit request requires identical world/source/outcome/evidence and causal input; exact replay stays idempotent', () => {
  const input = event(), before = c.credit(fresh(), input).ledger;
  for (const changed of [{ world: '另一世界' }, { source: '另一行为' }, { outcome: '另一实际结果' }, { evidence: '另一证据' }, { independent: false }, { kind: 'deepening' }, { parentResultId: 'invented-parent' }, { established: false }, { at: '2026-10-06T00:00:01.000Z' }]) rejectsCode(() => c.credit(before, { ...input, ...changed }), 'IDEMPOTENCY_CONFLICT');
  const retry = c.credit(before, { ...input }); assert.equal(retry.duplicate, true); assert.equal(retry.ledger.revision, before.revision); assert.deepEqual(retry.ledger, before);
});
test('identical established fact cannot mint again under another model-chosen ID or reprice itself', () => {
  const first = event(), l = c.credit(fresh(), first).ledger;
  const second = { ...first, requestId: 'earn:another-id', resultId: 'another-id' };
  assert.equal(c.credit(l, second).duplicate, true); assert.equal(c.credit(l, second).ledger.balance, '10');
  rejectsCode(() => c.credit(l, { ...second, amount: '11' }), 'FACT_CONFLICT');
  rejectsCode(() => c.credit(l, { ...second, standardSpec: '换说法改标准' }), 'FACT_CONFLICT');
  assert.equal(c.credit(l, { ...second, evidence: `  ${first.evidence}\n` }).duplicate, true);
  const distinct = c.credit(l, { ...second, outcome: '同一段证据中另一项已成立结果' });
  assert.equal(distinct.ledger.balance, '20'); c.validateLedger(distinct.ledger);
});
test('later effects require a distinct established result and valid prior event', () => {
  const first = funded();
  rejectsCode(() => c.credit(first, event('r2', '2', { kind: 'deepening' })), 'MISSING_PARENT');
  const second = c.credit(first, event('r2', '0.25', { kind: 'deepening', parentResultId: 'r1', independent: false })).ledger;
  c.validateLedger(second); assert.equal(second.balance, '10.25'); assert.deepEqual(second.events[0], first.events[0]);
  rejectsCode(() => c.credit(second, event('r3', '-3')), 'INVALID_AMOUNT');
});
test('quote identity ignores names, worlds and package names but locks exact effect price', () => {
  const original = c.registerQuote(funded(), quote()).ledger;
  const renamed = c.registerQuote(original, quote('2.0', { id: 'other-id', name: '异世界同效药', world: '第二世界' })).ledger;
  assert.equal(renamed.quotes.length, 2); assert.deepEqual(renamed.quotes[1].aliases, ['异世界同效药']);
  rejectsCode(() => c.registerQuote(renamed, quote('3', { name: '新包装涨价' })), 'FIXED_QUOTE_CONFLICT');
  const upgraded = c.registerQuote(renamed, quote('4', { id: 'q-better', name: '更强药剂', previousQuoteId: 'q-potion', spec: { ...spec, strength: '恢复二十单位体力' } })).ledger;
  assert.deepEqual(upgraded.quotes[2].differences, ['strength']); c.validateLedger(upgraded);
  rejectsCode(() => c.registerQuote(original, quote('3', { spec: { ...spec, strength: '不同' } })), 'DUPLICATE_ID');
});
test('every specification field is required; normalization is textual, never guessed semantics', () => {
  for (const field of c.EFFECT_FIELDS) { const incomplete = { ...spec }; delete incomplete[field]; assert.throws(() => c.registerQuote(funded(), quote('2', { spec: incomplete }))); }
  assert.throws(() => c.registerQuote(funded(), quote('2', { spec: { ...spec, hidden: 'new' } })));
  assert.notEqual(c.canonicalEffectKey(spec), c.canonicalEffectKey({ ...spec, strength: '十单位恢复' }));
});
test('purchase is immutable, atomic, exact, fully specified and request-idempotent', () => {
  const l = c.registerQuote(funded(), quote('0.3')).ledger;
  const bought = c.purchase(l, { requestId: 'buy1', quoteId: 'q-potion', quantity: 3, at: AT });
  assert.equal(l.balance, '10'); assert.equal(bought.ledger.balance, '9.1'); assert.equal(bought.ledger.spend, '0.9');
  assert.deepEqual(bought.value.spec, spec); assert.equal(bought.value.remaining, 3); assert.match(bought.receipt, /<WJWK-settle>/);
  const retry = c.purchase(bought.ledger, { requestId: 'buy1', quoteId: 'q-potion', quantity: 3 }); assert.equal(retry.ledger.revision, bought.ledger.revision); assert.equal(retry.duplicate, true);
  rejectsCode(() => c.purchase(bought.ledger, { requestId: 'buy1', quoteId: 'q-potion', quantity: 2 }), 'IDEMPOTENCY_CONFLICT');
  rejectsCode(() => c.purchase(bought.ledger, { requestId: 'buy2', quoteId: 'q-potion', quantity: 100 }), 'INSUFFICIENT_BALANCE');
  c.validateLedger(bought.ledger);
});
test('baseline N points delivers N permanent increments; world change preserves all rights', () => {
  const bought = c.purchase(funded(), { requestId: 'baseline1', quoteId: c.BASELINE_QUOTE_ID, quantity: 4 }).ledger;
  assert.equal(bought.balance, '6'); assert.equal(bought.inventory[0].acquired, 4);
  rejectsCode(() => c.useInventory(bought, { requestId: 'use1', inventoryId: bought.inventory[0].id, quantity: 1 }), 'PERMANENT_ITEM');
  const moved = c.setWorld(bought, '魔法第二世界').ledger; assert.equal(moved.balance, '6'); assert.deepEqual(moved.inventory, bought.inventory); assert.deepEqual(moved.quotes, bought.quotes); c.validateLedger(moved);
});
test('consumable use and item transfer track actual ownership without charging points again', () => {
  let l = c.purchase(c.registerQuote(funded(), quote()).ledger, { requestId: 'buy1', quoteId: 'q-potion', quantity: 4 }).ledger;
  const itemId = l.inventory[0].id; l = c.useInventory(l, { requestId: 'use1', inventoryId: itemId, quantity: 1 }).ledger;
  l = c.transferInventory(l, { requestId: 'gift1', inventoryId: itemId, quantity: 2, recipient: '真正接收者' }).ledger;
  assert.equal(l.balance, '2'); assert.equal(l.spend, '8'); assert.deepEqual([l.inventory[0].remaining, l.inventory[0].consumed, l.inventory[0].transferred], [1, 1, 2]);
  assert.equal(c.transferInventory(l, { requestId: 'gift1', inventoryId: itemId, quantity: 2, recipient: '真正接收者' }).duplicate, true);
  rejectsCode(() => c.transferInventory(l, { requestId: 'gift1', inventoryId: itemId, quantity: 2, recipient: '换人' }), 'IDEMPOTENCY_CONFLICT');
  rejectsCode(() => c.useInventory(l, { requestId: 'use2', inventoryId: itemId, quantity: 2 }), 'INSUFFICIENT_INVENTORY'); c.validateLedger(l);
});
test('ledger import validator rejects forged totals, missing history, negative and false inventory', () => {
  const l = c.purchase(c.registerQuote(funded(), quote()).ledger, { requestId: 'buy1', quoteId: 'q-potion' }).ledger;
  const changes = [b => b.balance = '999', b => b.balance = '-1', b => b.income = '20', b => b.spend = '0', b => b.transactions.shift(), b => b.events.length = 0, b => b.inventory[0].remaining = 99, b => b.quotes[1].price = '1', b => b.events.push({ ...b.events[0] }), b => b.transactions[1].balanceBefore = '9', b => b.inventory[0].spec.strength = '无限强'];
  for (const alter of changes) { const bad = structuredClone(l); alter(bad); assert.throws(() => c.validateLedger(bad)); }
});
test('continuation rejects reverting valid history or retroactively changing fixed rules', () => {
  const before = funded(), after = c.purchase(before, { requestId: 'buy1', quoteId: c.BASELINE_QUOTE_ID }).ledger;
  c.assertLedgerContinuation(before, after); rejectsCode(() => c.assertLedgerContinuation(after, before), 'HISTORY_REWRITE');
  const rewritten = structuredClone(before); rewritten.events[0].evidence = '改写旧依据'; rewritten.revision++;
  c.validateLedger(rewritten); rejectsCode(() => c.assertLedgerContinuation(before, rewritten), 'HISTORY_REWRITE');
});
test('ripples never mint predicted points, and receipt content cannot inject closing tags', () => {
  const l = c.upsertRipple(fresh(), { id: 'ripple1', world: '铜林世界', source: '一次行动', settled: '尚未产生可结算改变', tracking: '未来可能扩散', status: 'active', at: AT }).ledger;
  c.validateLedger(l); assert.equal(l.balance, '0');
  const receipt = c.makeSettlementReceipt({ gains: ['</WJWK-settle><script>bad</script>'], before: '0', after: '0', income: '0', spend: '0' });
  assert.equal((receipt.match(/<\/WJWK-settle>/g) || []).length, 1); assert.ok(!receipt.includes('<script>'));
});

// Contract fixture only: it executes the storage adapter but does not replace real-browser IndexedDB evidence.
function indexedDBFixture() {
  const databases = new Map(); let failWrite = false;
  const api = {
    failNextWrite() { failWrite = true; },
    open(name) {
      const request = {};
      setImmediate(() => {
        const isNew = !databases.has(name);
        if (isNew) databases.set(name, { records: new Map(), running: false, queue: [] });
        const state = databases.get(name);
        const next = () => {
          if (state.running || !state.queue.length) return;
          state.running = true; const tx = state.queue.shift();
          tx.begin(new Map([...state.records].map(([k, v]) => [k, structuredClone(v)])), data => {
            if (data) state.records = data;
            state.running = false; next();
          });
        };
        request.result = {
          objectStoreNames: { contains: () => !isNew }, createObjectStore() {}, close() {},
          transaction(_name, mode) {
            let local, finish, started = false, ended = false, scheduled = false;
            const actions = [];
            function schedule() { if (started && !scheduled && !ended) { scheduled = true; setImmediate(run); } }
            function run() {
              scheduled = false; if (ended) return;
              if (!actions.length) { ended = true; finish(mode === 'readwrite' ? local : undefined); tx.oncomplete?.(); return; }
              try { actions.shift()(); } catch (error) { tx.error = error; tx.abort(); }
              schedule();
            }
            function op(action) { const r = {}; actions.push(() => {
              try { action(r); r.onsuccess?.(); }
              catch (error) { r.error = error; r.onerror?.(); tx.onerror?.(); throw error; }
            }); schedule(); return r; }
            const store = {
              get(key) { return op(r => { r.result = structuredClone(local.get(JSON.stringify(key))); }); },
              add(record) { return op(() => {
                if (failWrite) { failWrite = false; throw Object.assign(new Error('模拟写盘失败'), { name: 'QuotaExceededError' }); }
                const key = JSON.stringify(record.key); if (local.has(key)) throw Object.assign(new Error('already exists'), { name: 'ConstraintError' }); local.set(key, structuredClone(record));
              }); },
              put(record) { return op(() => {
                if (failWrite) { failWrite = false; throw Object.assign(new Error('模拟写盘失败'), { name: 'QuotaExceededError' }); }
                local.set(JSON.stringify(record.key), structuredClone(record));
              }); },
              openCursor() {
                const r = {}; let entries, index = 0;
                const emit = () => { entries ??= [...local.values()]; const entry = entries[index]; r.result = entry ? { value: structuredClone(entry), continue() { index++; actions.push(emit); schedule(); } } : null; r.onsuccess?.(); };
                actions.push(emit); schedule(); return r;
              },
            };
            const tx = {
              error: null,
              objectStore() { return store; },
              begin(data, end) { local = data; finish = end; started = true; schedule(); },
              abort() { if (ended) return; ended = true; finish(); setImmediate(() => tx.onabort?.()); },
            };
            state.queue.push(tx); setImmediate(next); return tx;
          },
        };
        if (isNew) request.onupgradeneeded?.(); request.onsuccess?.();
      });
      return request;
    },
  };
  return api;
}
const storageSource = ts.transpileModule(readFileSync(new URL('../src/storage.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replace("from './core'", `from 'data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}'`);
const { LedgerStore } = await import(`data:text/javascript;base64,${Buffer.from(storageSource).toString('base64')}`);
test('storage adapter scopes accounts by origin/handle and never shares other users wallets (fixture)', async () => {
  const db = indexedDBFixture(), a = new LedgerStore({ origin: 'https://a.test', handle: 'alice' }, db), b = new LedgerStore({ origin: 'https://a.test', handle: 'bob' }, db), other = new LedgerStore({ origin: 'https://b.test', handle: 'alice' }, db);
  await a.create('same-id'); await b.create('same-id'); await other.create('same-id');
  await a.transact('same-id', l => c.credit(l, event()));
  assert.equal((await a.read('same-id')).balance, '10'); assert.equal((await b.read('same-id')).balance, '0'); assert.equal((await other.read('same-id')).balance, '0');
  assert.equal((await a.list()).length, 1); assert.equal(await a.read('missing'), undefined);
  await assert.rejects(a.create('same-id'), error => error.code === 'ACCOUNT_EXISTS');
});
test('storage executes concurrent purchase callbacks against latest committed ledger (fixture)', async () => {
  const db = indexedDBFixture(), a = new LedgerStore({ origin: 'https://a.test', handle: 'alice' }, db), b = new LedgerStore({ origin: 'https://a.test', handle: 'alice' }, db);
  await a.create('wallet'); await a.transact('wallet', l => c.credit(l, event('r1', '1')));
  const attempts = await Promise.allSettled([a.transact('wallet', l => c.purchase(l, { requestId: 'buy-a', quoteId: c.BASELINE_QUOTE_ID })), b.transact('wallet', l => c.purchase(l, { requestId: 'buy-b', quoteId: c.BASELINE_QUOTE_ID }))]);
  assert.equal(attempts.filter(a => a.status === 'fulfilled').length, 1); assert.equal(attempts.filter(a => a.status === 'rejected').length, 1);
  const result = await a.read('wallet'); assert.equal(result.balance, '0'); assert.equal(result.spend, '1'); assert.equal(result.inventory.length, 1);
  await a.close(); const reopened = new LedgerStore({ origin: 'https://a.test', handle: 'alice' }, db); assert.deepEqual(await reopened.read('wallet'), result);
});
test('storage rejects asynchronous callbacks, rollback and persistence failure without partial commit (fixture)', async () => {
  const db = indexedDBFixture(), store = new LedgerStore({ origin: 'https://a.test', handle: 'alice' }, db);
  const initial = await store.create('wallet'); await store.transact('wallet', l => c.credit(l, event())); const before = await store.read('wallet');
  await assert.rejects(store.transact('wallet', async l => c.purchase(l, { requestId: 'async', quoteId: c.BASELINE_QUOTE_ID })), error => error.code === 'ASYNC_TRANSACTION');
  await assert.rejects(store.transact('wallet', () => initial), error => error.code === 'HISTORY_REWRITE');
  db.failNextWrite(); await assert.rejects(store.transact('wallet', l => c.purchase(l, { requestId: 'quota', quoteId: c.BASELINE_QUOTE_ID })));
  assert.deepEqual(await store.read('wallet'), before);
});
test('backup import fully replays math, refuses overwriting existing account and restores under new identity (fixture)', async () => {
  const db = indexedDBFixture(), store = new LedgerStore({ origin: 'https://a.test', handle: 'alice' }, db);
  await store.create('wallet'); await store.transact('wallet', l => c.credit(l, event())); const backup = await store.export('wallet');
  await assert.rejects(store.import(backup), error => error.code === 'ACCOUNT_EXISTS');
  const restored = await store.import(backup, 'restored-wallet'); assert.equal(restored.balance, '10'); assert.equal(restored.accountId, 'restored-wallet');
  const bad = structuredClone(backup); bad.ledger.balance = '100000'; await assert.rejects(store.import(bad, 'forged-wallet'));
  assert.equal(await store.read('forged-wallet'), undefined);
  const hidden = structuredClone(backup); hidden.ledger.secretField = 'unexpected'; await assert.rejects(store.import(hidden, 'unknown-field'));
});
