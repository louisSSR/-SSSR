import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url), ts = require('typescript');
function load(name, imports = {}) {
  const source = readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(key => { if (key in imports) return imports[key]; throw new Error(`Unexpected runtime import: ${key}`); }, module, module.exports);
  return module.exports;
}
const c = load('core'), j = load('journal'), { LedgerStore } = load('storage', { './core': c });
const t = n => `2026-10-06T00:00:${String(n).padStart(2, '0')}.000Z`;
const fresh = () => c.createLedger('wallet', '测试本源', t(0));
const impression = (id = 'i1', extra = {}) => ({ id, world: '世界 A', subject: '阿青', summary: '已建立初步信任', evidence: '阿青把钥匙交给了我。', source: 'story', at: t(1), ...extra });
const quest = (id = 'q1', extra = {}) => ({ id, world: '世界 A', title: '恢复水渠', objective: '让水渠实际通水', reason: '河堤修复后仍有未通水农田', at: t(1), ...extra });
const event = (id = 'e1', extra = {}) => ({ requestId: `earn:${id}`, resultId: id, world: '世界 A', source: '玩家修复水渠', outcome: `水渠实际通水 ${id}`, evidence: '水流已进入干涸农田。', amount: '2', standardSpec: '固定双点水渠改变', established: true, at: t(4), ...extra });
const offered = () => j.registerQuest(fresh(), quest()).ledger;
const active = () => j.transitionQuest(offered(), { questId: 'q1', status: 'active', at: t(2) }).ledger;
const settled = () => c.credit(active(), event()).ledger;
const completed = () => j.transitionQuest(settled(), { questId: 'q1', status: 'completed', completionEventId: 'e1', at: t(5) }).ledger;
function code(fn, expected) { assert.throws(fn, e => e.code === expected); }
function wallet(l) { return JSON.stringify({ balance: l.balance, income: l.income, spend: l.spend, events: l.events, standards: l.standards, transactions: l.transactions, quotes: l.quotes, inventory: l.inventory }); }

test('journal/core/storage typecheck and journal has no runtime core import', () => {
  const paths = ['journal', 'core', 'storage'].map(n => fileURLToPath(new URL(`../src/${n}.ts`, import.meta.url)));
  const program = ts.createProgram(paths, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, noEmit: true, types: [], lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], skipLibCheck: true });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
});
test('old v1 ledger remains valid without optional arrays, and first append preserves accounting', () => {
  const old = JSON.parse(JSON.stringify(fresh())); c.validateLedger(old);
  assert.equal(Object.hasOwn(old, 'impressions'), false); assert.equal(Object.hasOwn(old, 'quests'), false);
  const next = j.appendImpression(old, impression()).ledger; c.validateLedger(next); c.assertLedgerContinuation(old, next);
  assert.equal(next.schemaVersion, 1); assert.equal(next.revision, old.revision + 1); assert.equal(wallet(next), wallet(old));
  assert.equal(Object.hasOwn(old, 'impressions'), false);
});
test('impressions append history for the same subject, retries are idempotent and IDs cannot be rewritten', () => {
  const a = j.appendImpression(fresh(), impression()).ledger;
  const b = j.appendImpression(a, impression('i2', { summary: '并肩作战后关系深化', pinned: true, at: t(2) })).ledger;
  assert.deepEqual(b.impressions[0], a.impressions[0]); assert.equal(b.impressions[1].subject, '阿青'); c.assertLedgerContinuation(a, b);
  const retry = j.appendImpression(b, impression()); assert.equal(retry.duplicate, true); assert.strictEqual(retry.ledger, b); assert.equal(retry.ledger.revision, b.revision);
  const reordered = structuredClone(b); reordered.impressions[0] = Object.fromEntries(Object.entries(reordered.impressions[0]).reverse());
  assert.equal(j.appendImpression(reordered, impression()).duplicate, true, 'JSON field order after import does not alter idempotency');
  code(() => j.appendImpression(b, impression('i1', { summary: '篡改过去', at: t(3) })), 'IDEMPOTENCY_CONFLICT');
});
test('impression inputs require real text, a supported source, boolean pin and finite UTC timestamps', () => {
  for (const bad of [{ evidence: '' }, { subject: ' ' }, { summary: 'x'.repeat(4001) }, { source: 'system' }, { pinned: 'yes' }, { at: '2026-99-99T00:00:00.000Z' }]) assert.throws(() => j.appendImpression(fresh(), impression('i1', bad)));
  code(() => j.appendImpression(fresh(), impression('i1', { at: '2025-01-01T00:00:00.000Z' })), 'INVALID_JOURNAL_TIME');
});
test('quest canonical world/title/objective rejects alternate-ID duplicate offers without resetting progress', () => {
  const a = active();
  const retry = j.registerQuest(a, quest('other-id', { world: ' 世界   A ', title: '\n恢复水渠 ', objective: '让水渠实际通水\n', reason: '另一种建议说法', at: t(3) }));
  assert.equal(retry.duplicate, true); assert.equal(retry.value.id, 'q1'); assert.equal(retry.value.status, 'active'); assert.equal(retry.ledger.quests.length, 1);
  code(() => j.registerQuest(a, quest('q1', { objective: '改成另一目标', at: t(3) })), 'IDEMPOTENCY_CONFLICT');
  assert.equal(j.registerQuest(completed(), quest()).duplicate, true);
});
test('quest source links must exist in the same world and never credit points', () => {
  const a = c.upsertRipple(fresh(), { id: 'r1', world: '世界 A', source: '河堤工程', settled: '堤坝已修复', tracking: '农田仍待引水', status: 'active', at: t(1) }).ledger;
  const b = j.registerQuest(a, quest('q1', { sourceRippleId: 'r1', at: t(2) })).ledger; c.validateLedger(b);
  assert.equal(wallet(a), wallet(b));
  code(() => j.registerQuest(a, quest('missing', { sourceRippleId: 'missing', at: t(2) })), 'MISSING_QUEST_RIPPLE');
  code(() => j.registerQuest(a, quest('foreign', { sourceRippleId: 'r1', world: '世界 B', at: t(2) })), 'MISSING_QUEST_RIPPLE');
});
test('tasks require acceptance and completion can only cite a settled event after dispatch in the same world', () => {
  code(() => j.transitionQuest(offered(), { questId: 'q1', status: 'completed', completionEventId: 'e1', at: t(3) }), 'INVALID_QUEST_TRANSITION');
  code(() => j.transitionQuest(active(), { questId: 'q1', status: 'completed', completionEventId: 'invented', at: t(5) }), 'INVALID_QUEST_COMPLETION');
  for (const extra of [{ world: '世界 B' }, { at: t(1) }, { at: t(0) }]) {
    const l = c.credit(active(), event('e1', extra)).ledger;
    code(() => j.transitionQuest(l, { questId: 'q1', status: 'completed', completionEventId: 'e1', at: t(5) }), 'INVALID_QUEST_COMPLETION');
  }
  const noTx = structuredClone(settled()); noTx.transactions = [];
  code(() => j.transitionQuest(noTx, { questId: 'q1', status: 'completed', completionEventId: 'e1', at: t(5) }), 'INVALID_QUEST_COMPLETION');
  code(() => j.transitionQuest(settled(), { questId: 'q1', status: 'completed', completionEventId: 'e1', at: t(3) }), 'INVALID_QUEST_COMPLETION');
});
test('completion and retries never mint points, consume assets or create any transaction', () => {
  const before = settled(), result = j.transitionQuest(before, { questId: 'q1', status: 'completed', completionEventId: 'e1', at: t(5) });
  c.validateLedger(result.ledger); c.assertLedgerContinuation(before, result.ledger);
  assert.equal(wallet(result.ledger), wallet(before)); assert.equal(result.ledger.revision, before.revision + 1); assert.equal(result.ledger.quests[0].completionEventId, 'e1');
  const later = j.appendImpression(result.ledger, impression('later', { at: t(6) })).ledger;
  const retry = j.transitionQuest(later, { questId: 'q1', status: 'completed', completionEventId: 'e1', at: t(5) });
  assert.equal(retry.duplicate, true); assert.strictEqual(retry.ledger, later); assert.equal(wallet(retry.ledger), wallet(before));
  code(() => j.transitionQuest(later, { questId: 'q1', status: 'completed', completionEventId: 'another', at: t(7) }), 'IDEMPOTENCY_CONFLICT');
});
test('completed/dismissed tasks are terminal and non-completions cannot carry event IDs', () => {
  for (const initial of [offered(), active()]) {
    const stopped = j.transitionQuest(initial, { questId: 'q1', status: 'dismissed', at: t(3) }).ledger; c.assertLedgerContinuation(initial, stopped);
    assert.equal(j.transitionQuest(stopped, { questId: 'q1', status: 'dismissed', at: t(4) }).duplicate, true);
    code(() => j.transitionQuest(stopped, { questId: 'q1', status: 'active', at: t(4) }), 'INVALID_QUEST_TRANSITION');
  }
  for (const status of ['active', 'dismissed']) code(() => j.transitionQuest(completed(), { questId: 'q1', status, at: t(6) }), 'INVALID_QUEST_TRANSITION');
  code(() => j.transitionQuest(offered(), { questId: 'q1', status: 'active', completionEventId: 'e1', at: t(2) }), 'INVALID_QUEST_COMPLETION');
});
test('continuation rejects impression edits, deletion, pin changes, reordering and backdating', () => {
  const before = j.appendImpression(j.appendImpression(fresh(), impression()).ledger, impression('i2', { at: t(2) })).ledger;
  for (const mutate of [l => l.impressions.shift(), l => l.impressions.reverse(), l => { l.impressions[0].summary = '篡改'; }, l => { l.impressions[0].pinned = true; }, l => { delete l.impressions; }, l => l.impressions.push({ ...l.impressions[0], id: 'backdated' })]) {
    const after = structuredClone(before); mutate(after); after.revision++; after.updatedAt = t(3);
    code(() => c.assertLedgerContinuation(before, after), 'HISTORY_REWRITE');
  }
});
test('continuation rejects task spec edits, reordering, deletion, rollback and direct completed insertion', () => {
  const before = active();
  for (const mutate of [l => { l.quests[0].objective = '改写目标'; }, l => { l.quests[0].reason = '改写缘由'; }, l => { l.quests[0].id = 'another'; }, l => { delete l.quests; }]) {
    const after = structuredClone(before); mutate(after); after.revision++; after.updatedAt = t(3);
    code(() => c.assertLedgerContinuation(before, after), 'HISTORY_REWRITE');
  }
  const rollback = structuredClone(before); rollback.quests[0].status = 'offered'; rollback.quests[0].updatedAt = rollback.quests[0].createdAt; rollback.revision++; rollback.updatedAt = t(3);
  code(() => c.assertLedgerContinuation(before, rollback), 'INVALID_QUEST_TRANSITION');
  const forged = completed(), empty = structuredClone(forged); delete empty.quests; empty.revision--; c.validateLedger(empty);
  code(() => c.assertLedgerContinuation(empty, forged), 'INVALID_QUEST_TRANSITION');
});
test('import validation rejects malformed journal fields, forged completion and canonical duplicate tasks', () => {
  for (const field of ['impressions', 'quests']) for (const invalid of [undefined, null, {}, '[]']) { const l = fresh(); l[field] = invalid; code(() => c.validateLedger(l), 'INVALID_JOURNAL'); }
  const good = completed();
  for (const mutation of [l => { l.quests[0].completionEventId = 'invented'; }, l => { l.quests[0].world = 'other world'; }, l => { l.quests[0].createdAt = t(4); }, l => { l.quests[0].status = 'active'; }]) { const l = structuredClone(good); mutation(l); code(() => c.validateLedger(l), 'INVALID_QUEST_COMPLETION'); }
  const duplicate = offered(); duplicate.quests.push({ ...duplicate.quests[0], id: 'duplicate', title: '  恢复水渠 ' }); code(() => c.validateLedger(duplicate), 'DUPLICATE_ID');
  const unknown = j.appendImpression(fresh(), impression()).ledger; unknown.impressions[0].hidden = true; code(() => c.validateLedger(unknown), 'INVALID_SCHEMA');
});

// Small deterministic IndexedDB fixture. This tests the real LedgerStore validation,
// serialization and rollback callbacks, not browser persistence or host acceptance.
function memoryDB() {
  const rows = new Map();
  const api = { open() {
    const request = {};
    setImmediate(() => {
      request.result = { objectStoreNames: { contains: () => true }, close() {}, transaction() {
        const local = new Map([...rows].map(([k, v]) => [k, structuredClone(v)])), queue = []; let ended = false;
        const tx = { abort() { ended = true; setImmediate(() => tx.onabort?.()); }, objectStore() { return store; } };
        const op = action => { const r = {}; queue.push(() => { try { action(r); r.onsuccess?.(); } catch (e) { r.error = e; r.onerror?.(); tx.error = e; tx.abort(); } }); return r; };
        const store = { get(k) { return op(r => { r.result = structuredClone(local.get(JSON.stringify(k))); }); }, add(v) { return op(() => { const k = JSON.stringify(v.key); if (local.has(k)) throw Object.assign(new Error('exists'), { name: 'ConstraintError' }); local.set(k, structuredClone(v)); }); }, put(v) { return op(() => local.set(JSON.stringify(v.key), structuredClone(v))); } };
        const run = () => { if (ended) return; if (queue.length) { queue.shift()(); setImmediate(run); } else { ended = true; rows.clear(); for (const [k, v] of local) rows.set(k, v); tx.oncomplete?.(); } };
        setImmediate(run); return tx;
      } }; request.onsuccess?.();
    }); return request;
  } }; return api;
}
test('real storage imports old backups, carries new history through export/restore, and rolls back illegal edits (fixture)', async () => {
  const store = new LedgerStore({ origin: 'https://journal.test', handle: 'alice' }, memoryDB());
  const backup = ledger => ({ format: 'shiro-butterfly-ledger', version: 1, exportedAt: t(9), scope: { origin: 'https://journal.test', handle: 'alice' }, ledger });
  const old = await store.import(backup(fresh())); assert.equal(Object.hasOwn(old, 'quests'), false);
  await store.transact('wallet', l => j.appendImpression(l, impression()));
  await store.transact('wallet', l => j.registerQuest(l, quest('q1', { at: t(2) })));
  await store.transact('wallet', l => j.transitionQuest(l, { questId: 'q1', status: 'active', at: t(3) }));
  await store.transact('wallet', l => c.credit(l, event()));
  await store.transact('wallet', l => j.transitionQuest(l, { questId: 'q1', status: 'completed', completionEventId: 'e1', at: t(5) }));
  const saved = await store.export('wallet'), restored = await store.import(JSON.parse(JSON.stringify(saved)), 'restored');
  assert.deepEqual(restored.impressions, saved.ledger.impressions); assert.deepEqual(restored.quests, saved.ledger.quests); assert.equal(wallet(restored), wallet(saved.ledger));
  await assert.rejects(store.transact('wallet', l => { l.impressions[0].summary = '篡改'; l.revision++; return l; }), e => e.code === 'HISTORY_REWRITE');
  assert.deepEqual(await store.read('wallet'), saved.ledger);
  const invalid = structuredClone(saved); invalid.ledger.quests[0].completionEventId = 'fabricated'; await assert.rejects(store.import(invalid, 'forged'), e => e.code === 'INVALID_QUEST_COMPLETION');
  assert.equal(await store.read('forged'), undefined);
  await store.close();
});

const ripple = (extra = {}) => ({ id: 'ripple-a', world: '世界 A', source: '修复河堤', settled: '河堤已修复', tracking: '等待引水工程', status: 'active', at: t(1), ...extra });
test('ripple updates archive exact previous versions while identical retries never grow history or revision', () => {
  const original = fresh(), first = c.upsertRipple(original, ripple()).ledger;
  assert.equal(Object.hasOwn(first, 'rippleHistory'), false, 'first version needs no synthetic prehistory');
  let retry = first;
  for (let i = 0; i < 100; i++) {
    const result = c.upsertRipple(retry, ripple({ at: t(9) })); assert.equal(result.duplicate, true); assert.strictEqual(result.ledger, first); retry = result.ledger;
  }
  assert.equal(retry.revision, first.revision); assert.equal(Object.hasOwn(retry, 'rippleHistory'), false);
  const second = c.upsertRipple(first, ripple({ tracking: '工程已开始，等待水渠贯通', at: t(2) })).ledger;
  const third = c.upsertRipple(second, ripple({ settled: '河堤和水渠均已恢复', tracking: '农田已恢复灌溉', status: 'resolved', at: t(3) })).ledger;
  assert.deepEqual(second.rippleHistory, [first.ripples[0]]); assert.deepEqual(third.rippleHistory, [first.ripples[0], second.ripples[0]]);
  assert.equal(first.ripples[0].tracking, '等待引水工程'); assert.equal(first.rippleHistory, undefined);
  assert.equal(wallet(third), wallet(original)); c.assertLedgerContinuation(first, third);
  assert.notStrictEqual(second.rippleHistory[0], first.ripples[0]);
});
test('ripple history permits interleaved multi-update batches and same-time meaningful cycles', () => {
  let before = c.upsertRipple(fresh(), ripple()).ledger;
  before = c.upsertRipple(before, ripple({ id: 'ripple-b', source: '打开城门' })).ledger;
  let next = c.upsertRipple(before, ripple({ tracking: 'A第二状态', at: t(2) })).ledger;
  next = c.upsertRipple(next, ripple({ id: 'ripple-b', source: '打开城门', tracking: 'B第二状态', at: t(2) })).ledger;
  const intermediate = structuredClone(next.ripples[0]);
  next = c.upsertRipple(next, ripple({ tracking: 'A第三状态', at: t(2) })).ledger;
  assert.deepEqual(next.rippleHistory, [before.ripples[0], before.ripples[1], intermediate]); c.assertLedgerContinuation(before, next);
  const initial = c.upsertRipple(fresh(), ripple()).ledger;
  const cycle = c.upsertRipple(c.upsertRipple(initial, ripple({ tracking: '临时新态' })).ledger, ripple()).ledger;
  assert.deepEqual(cycle.ripples, initial.ripples); assert.equal(cycle.rippleHistory.length, 2); c.assertLedgerContinuation(initial, cycle);
  let newlyCreated = c.upsertRipple(fresh(), ripple()).ledger; newlyCreated = c.upsertRipple(newlyCreated, ripple({ tracking: '同一批次创建后再改变', at: t(2) })).ledger;
  c.assertLedgerContinuation(fresh(), newlyCreated);
});
test('continuation rejects erased/mutated/reordered ripple history and replacement without the exact old snapshot', () => {
  const first = c.upsertRipple(fresh(), ripple()).ledger;
  for (const mutate of [l => { l.ripples = []; }, l => { l.ripples[0].tracking = '偷偷替换'; }, l => { l.ripples[0].updatedAt = t(3); }]) {
    const next = structuredClone(first); mutate(next); next.revision++; next.updatedAt = t(3); code(() => c.assertLedgerContinuation(first, next), 'HISTORY_REWRITE');
  }
  const second = c.upsertRipple(first, ripple({ tracking: '第二状态', at: t(2) })).ledger;
  const third = c.upsertRipple(second, ripple({ tracking: '第三状态', at: t(3) })).ledger;
  for (const mutate of [l => { delete l.rippleHistory; }, l => { l.rippleHistory = []; }, l => { l.rippleHistory[0].tracking = '伪造最早历史'; }]) {
    const next = structuredClone(third); mutate(next); next.revision++; next.updatedAt = t(4); code(() => c.assertLedgerContinuation(third, next), 'HISTORY_REWRITE');
  }
  const wrongSnapshot = structuredClone(second); wrongSnapshot.rippleHistory[0].tracking = '不是真实旧状态'; code(() => c.assertLedgerContinuation(first, wrongSnapshot), 'HISTORY_REWRITE');
  const reordered = structuredClone(third); reordered.rippleHistory.reverse(); reordered.revision++; assert.throws(() => c.assertLedgerContinuation(third, reordered));
  const omittedMiddle = structuredClone(third); omittedMiddle.rippleHistory = [first.ripples[0]]; code(() => c.assertLedgerContinuation(second, omittedMiddle), 'HISTORY_REWRITE');
});
test('import validator validates every ripple history field and forbids orphan, duplicate or time-reversed versions', () => {
  const first = c.upsertRipple(fresh(), ripple()).ledger, second = c.upsertRipple(first, ripple({ tracking: '下一状态', at: t(2) })).ledger;
  for (const value of [null, undefined, {}, 'history']) { const bad = structuredClone(second); bad.rippleHistory = value; code(() => c.validateLedger(bad), 'INVALID_RIPPLE_HISTORY'); }
  for (const change of [{ id: '' }, { world: '' }, { source: '' }, { tracking: '' }, { settled: '' }, { status: 'future' }, { updatedAt: 'not UTC' }, { extra: 'unknown field' }]) {
    const bad = structuredClone(second); Object.assign(bad.rippleHistory[0], change); assert.throws(() => c.validateLedger(bad));
  }
  const orphan = structuredClone(second); orphan.ripples = []; code(() => c.validateLedger(orphan), 'INVALID_RIPPLE_HISTORY');
  const same = structuredClone(second); same.rippleHistory.push(structuredClone(same.rippleHistory[0])); code(() => c.validateLedger(same), 'INVALID_RIPPLE_HISTORY');
  code(() => c.upsertRipple(second, ripple({ tracking: '时间倒退', at: t(1) })), 'INVALID_RIPPLE_TIME');
});
test('real storage preserves ripple history across old-backup migration/export/reimport and aborts illegal rewrite (fixture)', async () => {
  const old = c.upsertRipple(fresh(), ripple()).ledger;
  const store = new LedgerStore({ origin: 'https://ripple.test', handle: 'alice' }, memoryDB());
  await store.import({ format: 'shiro-butterfly-ledger', version: 1, exportedAt: t(2), scope: { origin: 'https://ripple.test', handle: 'alice' }, ledger: old });
  assert.equal(Object.hasOwn(await store.read('wallet'), 'rippleHistory'), false);
  await store.transact('wallet', l => c.upsertRipple(l, ripple({ tracking: '第一次新的发展', at: t(3) })));
  await store.transact('wallet', l => c.upsertRipple(l, ripple({ tracking: '第二次新的发展', at: t(4) })));
  const backup = await store.export('wallet'); assert.equal(backup.ledger.rippleHistory.length, 2); assert.deepEqual(backup.ledger.rippleHistory[0], old.ripples[0]);
  const restored = await store.import(JSON.parse(JSON.stringify(backup)), 'restored');
  assert.deepEqual(restored.rippleHistory, backup.ledger.rippleHistory); assert.deepEqual(restored.ripples, backup.ledger.ripples); assert.equal(wallet(restored), wallet(old));
  await assert.rejects(store.transact('wallet', l => { l.rippleHistory = []; l.revision++; return l; }), e => e.code === 'HISTORY_REWRITE');
  assert.deepEqual(await store.read('wallet'), backup.ledger);
  await store.close();
});
