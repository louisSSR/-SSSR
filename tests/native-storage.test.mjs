import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript'), cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  if (!['core', 'journal', 'native-schema', 'native-storage'].includes(name)) throw new Error(`Unexpected dependency ${name}`);
  const js = ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} }; new Function('require', 'module', 'exports', js)(dep => load(dep.slice(2).replace(/\.js$/, '')), module, module.exports);
  cache.set(name, module.exports); return module.exports;
}
const c = load('core'), j = load('journal'), n = load('native-schema'), { NativeFourTableRepository, nativeSqlText } = load('native-storage');
const clone = value => JSON.parse(JSON.stringify(value));
const scope = () => ({ origin: 'https://tavern.test', handle: 'fixture-user', chat: 'chat-A', epoch: 1 });
const at = n => `2026-10-08T00:00:${String(n).padStart(2, '0')}.000Z`;
const code = expected => error => error.code === expected;
const locks = (() => { const queue = new Map(); return { request(name, _options, callback) { const prior = queue.get(name) ?? Promise.resolve(), next = prior.catch(() => undefined).then(callback); queue.set(name, next); return next.finally(() => { if (queue.get(name) === next) queue.delete(name); }); } }; })();
function fixture(initial = n.createNativeFourTableTemplate()) {
  const db = new DatabaseSync(':memory:'), callbacks = new Set(), data = clone(initial);
  data.sheet_other = { uid: 'sheet_other', name: '用户自有表', sourceData: { note: 'retain' }, content: [['row_id', 'value'], ['7', 'untouched']], updateConfig: { updateFrequency: 17, lock: true }, exportConfig: { enabled: true } };
  data.mate.userTemplatePreference = 'retain';
  const liveKeys = Object.fromEntries(n.NATIVE_FOUR_TABLES.map(table => [table.key, Object.keys(data).find(key => data[key]?.name === table.name)]));
  let savedData = clone(data), calls = 0, beforeExecute, afterExecute, failLate = false, saved = true;
  for (const table of n.NATIVE_FOUR_TABLES) {
    db.exec(data[liveKeys[table.key]].sourceData.ddl);
    for (const values of data[liveKeys[table.key]].content.slice(1)) db.prepare(`INSERT INTO ${table.sqlName} (row_id,${table.columns.map(x => x.sql).join(',')}) VALUES (${values.map(() => '?').join(',')})`).run(...values);
  }
  function sync() { for (const table of n.NATIVE_FOUR_TABLES) data[liveKeys[table.key]].content = [data[liveKeys[table.key]].content[0], ...db.prepare(`SELECT * FROM ${table.sqlName} ORDER BY row_id`).all().map(row => [String(row.row_id), ...table.columns.map(column => row[column.sql])])]; }
  const api = {
    exportTableAsJson: () => data,
    executeSqlQuery(request) { const values = db.prepare(request.sql).all(); return { columns: ['shiro_native_sql_ready'], values: values.map(row => [row.shiro_native_sql_ready]), rows: values.map(row => ({ ...row })), rowCount: values.length }; },
    registerTableUpdateCallback: cb => callbacks.add(cb), unregisterTableUpdateCallback: cb => callbacks.delete(cb),
    async executeSqlBatch(request) {
      calls++; assert.equal(request.skipChatSave, false); assert.equal(request.skipNotify, false); assert.equal('params' in request, false);
      await beforeExecute?.(request);
      try { db.exec('BEGIN'); db.exec(request.sql); if (failLate) { failLate = false; db.exec('INSERT INTO shiro_memory_4(record_id) VALUES(NULL)'); } db.exec('COMMIT'); sync(); }
      catch (error) { db.exec('ROLLBACK'); sync(); return { success: false, saved: true, errors: [error.message], changes: 0 }; }
      await afterExecute?.(request); if (saved) savedData = clone(data);
      for (const callback of callbacks) callback(data, { persisted: saved });
      return { success: true, saved, changes: request.sql.split(';\n').length, modifiedKeys: request.targetSheetKeys, errors: [] };
    },
  };
  return { api, db, callbacks, data, get savedData() { return savedData; }, get calls() { return calls; }, before(fn) { beforeExecute = fn; }, after(fn) { afterExecute = fn; }, failLate() { failLate = true; }, saved(value) { saved = value; }, notify(persisted) { for (const callback of callbacks) callback(data, { persisted }); }, external(sql) { db.exec(sql); sync(); }, close() { db.close(); } };
}
function repository(f, overrides = {}) { return new NativeFourTableRepository({ scope, getApi: () => f.api, locks, verifyPersisted: async context => JSON.stringify(f.savedData) === JSON.stringify(context.tables), ...overrides }); }
function creditInput(id = 'earn', amount = '20', time = at(2)) { return { requestId: id, resultId: `event:${id}`, world: '世界A', source: '修复河渠', outcome: `农田实际通水:${id}`, evidence: '现场实际已通水', amount, standardSpec: `固定:${amount}`, established: true, at: time }; }
function richLedger() {
  let l = c.createLedger('native:测试-wallet', '可迁移本源', at(0)); l = c.setWorld(l, '世界A', at(1)).ledger;
  l = j.appendImpression(l, { id: 'important:1', world: '世界A', subject: '阿青', summary: '已建立信任', evidence: "实际交钥匙；'<!-- quoted -->' \u0000 😀", source: 'user', pinned: true, at: at(2) }).ledger;
  l = c.upsertRipple(l, { id: 'ripple:1', world: '世界A', source: '河渠已修复', settled: '修渠已成立', tracking: '关注新农田通水', status: 'active', at: at(3) }).ledger;
  l = j.registerQuest(l, { id: 'quest:1', world: '世界A', title: '疏通支渠', objective: '支渠实际通水', reason: '农田仍未灌溉', sourceRippleId: 'ripple:1', at: at(4) }).ledger;
  l = j.transitionQuest(l, { questId: 'quest:1', status: 'active', at: at(5) }).ledger;
  l = c.credit(l, creditInput('earn:large', '123456789012345678901234567890123456789012345678.123456789012345678', at(6))).ledger;
  const spec = { content: '药效全部到账', strength: '完整疗效', quantity: '一瓶', range: '本人', duration: '即时', uses: '一次', conditions: '真实使用', crossWorld: '跨界保持' };
  l = c.registerQuote(l, { id: 'quote:unused', name: '未购买报价', category: '消耗品', world: '世界A', spec, price: '0.123456789012345678', kind: 'consumable', at: at(7) }).ledger;
  l = c.registerQuote(l, { id: 'alias-unused-id', name: '跨界别名', category: '消耗品', world: '世界B', spec, price: '0.123456789012345678', kind: 'consumable', at: at(8) }).ledger;
  l = c.registerQuote(l, { id: 'quote:upgrade-unused', name: '升级但未买', category: '消耗品', world: '世界A', spec: { ...spec, strength: '更强完整疗效' }, price: '2', kind: 'consumable', previousQuoteId: 'quote:unused', at: at(9) }).ledger;
  l = c.purchase(l, { requestId: 'buy:3', quoteId: 'quote:unused', quantity: 3, at: at(10) }).ledger;
  l = c.useInventory(l, { requestId: 'use:1', inventoryId: 'inventory:buy:3', quantity: 1, at: at(11) }).ledger;
  l = c.transferInventory(l, { requestId: 'transfer:1', inventoryId: 'inventory:buy:3', quantity: 1, recipient: '阿青', at: at(12) }).ledger;
  l = c.credit(l, { ...creditInput('earn:deepening', '0.123456789012345678', at(13)), independent: false, kind: 'deepening', parentResultId: 'event:earn:large' }).ledger;
  l = j.transitionQuest(l, { questId: 'quest:1', status: 'completed', completionEventId: 'event:earn:deepening', at: at(14) }).ledger;
  l = c.upsertRipple(l, { id: 'ripple:1', world: '世界A', source: '支渠已通水', settled: '农田通水已结算', tracking: '追踪后续收成', status: 'active', at: at(15) }).ledger;
  c.validateLedger(l); return l;
}

test('v2 schema preserves every Ledger field, TEXT precision, unused quote/upgrade/aliases, optional arrays and transaction sequence', () => {
  const l = richLedger(), exported = n.createNativeFourTableExport(l, scope()), result = n.readNativeSnapshot(clone(exported), scope()); assert.deepEqual(result.ledger, l);
  assert.deepEqual(result.ledger.transactions.map(tx => tx.id), ['earn:large', 'buy:3', 'use:1', 'transfer:1', 'earn:deepening']);
  assert.deepEqual(result.rows.sheet_shiro_memory_2.filter(row => row.record_kind === 'transaction').map(row => row.record_order), ['0', '1', '2', '3', '4']);
  for (const sheet of Object.values(exported).filter(value => value.content)) { const rows = sheet.content.slice(1).reverse(); rows.forEach((row, i) => { row[0] = String(300 + i); }); sheet.content = [sheet.content[0], ...rows]; }
  assert.deepEqual(n.readNativeSnapshot(exported, scope()).ledger, l, 'row_id/order in exported native arrays is not business order');
  const empty = { ...c.createLedger('empty-flags', 'test', at(0)), impressions: [], quests: [], rippleHistory: [] }; assert.deepEqual(n.readNativeSnapshot(n.createNativeFourTableExport(empty, scope()), scope()).ledger, empty);
});
test('real SQLite fixture restores native authority in one batch, keeps unrelated tables/preferences/locks, refuses second account and returns deep copies', async () => {
  const f = fixture(), store = repository(f), other = clone(f.data.sheet_other), mate = clone(f.data.mate);
  try {
    assert.deepEqual(await store.list(), []); const l = richLedger(); assert.deepEqual(await store.import(JSON.stringify({ format: 'shiro-butterfly-ledger', version: 1, exportedAt: at(20), scope: { origin: 'https://legacy.test', handle: 'legacy' }, ledger: l })), l);
    assert.deepEqual(await store.read(l.accountId), l); assert.equal(f.calls, 1); assert.deepEqual(f.data.sheet_other, other); assert.deepEqual(f.data.mate, mate);
    assert.ok(f.data.sheet_shiro_memory_2.content.some(row => row[3] === 'commit')); assert.equal(await store.read('other'), undefined);
    await assert.rejects(store.create('second'), code('ACCOUNT_EXISTS')); await assert.rejects(store.import(await store.export(l.accountId)), code('ACCOUNT_EXISTS')); assert.equal(f.calls, 1);
    const backup = await store.export(l.accountId); backup.ledger.label = 'external mutation'; assert.equal((await store.read(l.accountId)).label, l.label);
    const reopened = repository(f); assert.deepEqual(await reopened.read(l.accountId), l); await reopened.close();
  } finally { await store.close(); f.close(); }
});
test('native business source never opens legacy IndexedDB; absent account with orphan records cannot initialize', async () => {
  const f = fixture(), prior = globalThis.indexedDB, store = repository(f); globalThis.indexedDB = { open() { throw new Error('IDB must not be read'); } };
  try { await store.create('wallet'); await store.transact('wallet', l => c.credit(l, creditInput())); assert.equal((await store.read('wallet')).balance, '20'); }
  finally { globalThis.indexedDB = prior; await store.close(); f.close(); }
  const orphan = n.createNativeFourTableExport(c.createLedger('orphan', 'test', at(0)), scope()); orphan.sheet_shiro_memory_2.content = [orphan.sheet_shiro_memory_2.content[0]];
  const g = fixture(orphan), bad = repository(g); try { await assert.rejects(bad.create('replacement'), code('BROKEN_NATIVE_STORAGE')); assert.equal(g.calls, 0); } finally { await bad.close(); g.close(); }
});
test('synchronous callback sees latest native data; duplicate request adds no SQL and changed content/async callback fails', async () => {
  const f = fixture(), store = repository(f);
  try {
    await store.create('wallet'); const request = creditInput(), first = await store.transact('wallet', l => c.credit(l, request)), count = f.calls, before = clone(f.data);
    const retry = await store.transact('wallet', l => c.credit(l, request)); assert.equal(retry.duplicate, true); assert.deepEqual(retry.ledger, first.ledger); assert.equal(f.calls, count); assert.deepEqual(f.data, before);
    await assert.rejects(store.transact('wallet', l => c.credit(l, { ...request, amount: '21' })), code('IDEMPOTENCY_CONFLICT')); await assert.rejects(store.transact('wallet', async l => c.purchase(l, { requestId: 'async', quoteId: c.BASELINE_QUOTE_ID })), code('ASYNC_TRANSACTION')); assert.equal(f.calls, count);
  } finally { await store.close(); f.close(); }
});
test('Web Locks serialize competing tabs against latest committed balance and only one purchase succeeds', async () => {
  const f = fixture(), a = repository(f), b = repository(f);
  try { await a.create('wallet'); await a.transact('wallet', l => c.credit(l, creditInput('earn-one', '1'))); const results = await Promise.allSettled(['A', 'B'].map(id => (id === 'A' ? a : b).transact('wallet', l => c.purchase(l, { requestId: `buy-${id}`, quoteId: c.BASELINE_QUOTE_ID })))); assert.equal(results.filter(x => x.status === 'fulfilled').length, 1); assert.equal(results.filter(x => x.status === 'rejected').length, 1); assert.equal((await b.read('wallet')).balance, '0'); assert.equal((await a.read('wallet')).inventory.length, 1); }
  finally { await a.close(); await b.close(); f.close(); }
});
test('old-state NOT NULL guard rejects stale edits; late statement failure rolls back every changed table', async () => {
  const f = fixture(), store = repository(f);
  try { await store.create('wallet'); const before = clone(f.data); f.failLate(); await assert.rejects(store.transact('wallet', l => c.credit(l, creditInput())), code('NATIVE_COMMIT_FAILED')); assert.deepEqual(f.data, before);
    f.before(() => { f.before(undefined); f.external("UPDATE shiro_memory_2 SET account_label='external edit' WHERE record_kind='account'"); }); await assert.rejects(store.transact('wallet', l => c.credit(l, creditInput())), code('NATIVE_COMMIT_FAILED')); assert.equal((await store.read('wallet')).label, 'external edit'); assert.equal((await store.read('wallet')).transactions.length, 0); assert.deepEqual(f.data.sheet_shiro_memory_3, before.sheet_shiro_memory_3);
  } finally { await store.close(); f.close(); }
});
test('persisted=false and failed saved-chat confirmation pause writes until verified refresh; saved=false never succeeds', async () => {
  const f = fixture(); let confirm = true; const store = repository(f, { verifyPersisted: async context => context.stage === 'preflight' ? true : confirm });
  try { await store.create('wallet'); f.notify(false); const count = f.calls; await assert.rejects(store.transact('wallet', l => c.credit(l, creditInput())), code('NATIVE_PERSISTENCE_PENDING')); assert.equal(f.calls, count);
    confirm = false; await assert.rejects(store.refresh(), code('NATIVE_PERSISTENCE_UNCONFIRMED')); confirm = true; await store.refresh(); await store.transact('wallet', l => c.credit(l, creditInput()));
    confirm = false; await assert.rejects(store.transact('wallet', l => c.setWorld(l, '世界B', at(3))), code('NATIVE_PERSISTENCE_UNCONFIRMED')); await assert.rejects(store.transact('wallet', l => c.setWorld(l, '世界C', at(4))), code('NATIVE_PERSISTENCE_PENDING'));
    confirm = true; await store.refresh(); f.saved(false); await assert.rejects(store.transact('wallet', l => c.setWorld(l, '世界C', at(4))), code('NATIVE_COMMIT_FAILED'));
  } finally { await store.close(); f.close(); }
});
test('unconfirmed runtime mutations cannot be read, listed or exported until explicit refresh verifies saved data', async () => {
  const f = fixture(); let confirm = true; const store = repository(f, { verifyPersisted: context => context.stage === 'preflight' ? true : confirm });
  async function assertPaused() {
    await assert.rejects(store.read('wallet'), code('NATIVE_PERSISTENCE_PENDING'));
    await assert.rejects(store.list(), code('NATIVE_PERSISTENCE_PENDING'));
    await assert.rejects(store.export('wallet'), code('NATIVE_PERSISTENCE_PENDING'));
  }
  try {
    await store.create('wallet'); await store.transact('wallet', l => c.credit(l, creditInput()));
    confirm = false;
    await assert.rejects(store.transact('wallet', l => c.purchase(l, { requestId: 'runtime-buy', quoteId: c.BASELINE_QUOTE_ID })), code('NATIVE_PERSISTENCE_UNCONFIRMED'));
    assert.equal(n.readNativeSnapshot(f.data, scope()).ledger.balance, '19', 'fixture really mutated runtime before confirmation failed');
    await assertPaused(); await assert.rejects(store.refresh(), code('NATIVE_PERSISTENCE_UNCONFIRMED')); await assertPaused();
    confirm = true; const recovered = await store.refresh(); assert.equal(recovered.balance, '19'); assert.deepEqual(await store.read('wallet'), recovered);
    f.saved(false);
    await assert.rejects(store.transact('wallet', l => c.purchase(l, { requestId: 'unsaved-buy', quoteId: c.BASELINE_QUOTE_ID })), code('NATIVE_COMMIT_FAILED'));
    assert.equal(n.readNativeSnapshot(f.data, scope()).ledger.balance, '18'); assert.equal(n.readNativeSnapshot(f.savedData, scope()).ledger.balance, '19');
    await assertPaused(); confirm = false; await assert.rejects(store.refresh(), code('NATIVE_PERSISTENCE_UNCONFIRMED')); await assertPaused();
  } finally { await store.close(); f.close(); }
});
test('refresh discovering unconfirmed persistence also pauses a previously readable repository, including hook errors', async () => {
  const f = fixture(); let verification = true; const store = repository(f, { verifyPersisted: () => { if (verification instanceof Error) throw verification; return verification; } });
  try {
    await store.create('wallet'); assert.equal((await store.read('wallet')).accountId, 'wallet');
    verification = false; await assert.rejects(store.refresh(), code('NATIVE_PERSISTENCE_UNCONFIRMED'));
    await assert.rejects(store.read('wallet'), code('NATIVE_PERSISTENCE_PENDING'));
    verification = true; await store.refresh(); assert.equal((await store.read('wallet')).accountId, 'wallet');
    verification = new Error('saved backend unavailable'); await assert.rejects(store.refresh(), /saved backend unavailable/);
    await assert.rejects(store.list(), code('NATIVE_PERSISTENCE_PENDING'));
    verification = true; await store.refresh(); assert.equal((await store.list()).length, 1);
  } finally { await store.close(); f.close(); }
});
test('chat/epoch changes while awaiting batch or lock suppress further confirmation and successful return', async () => {
  const f = fixture(); let current = scope(), confirmations = 0; const store = repository(f, { scope: () => current, verifyPersisted: async context => { if (context.stage === 'commit') confirmations++; return true; } });
  try { await store.create('wallet'); const count = confirmations; f.after(async () => { current = { ...current, chat: 'chat-B', epoch: 2 }; }); await assert.rejects(store.transact('wallet', l => c.credit(l, creditInput())), code('NATIVE_SCOPE_CHANGED')); assert.equal(confirmations, count); } finally { await store.close(); f.close(); }
  const g = fixture(); let now = scope(); const queued = repository(g, { scope: () => now, locks: { async request(_name, _options, callback) { now = { ...now, epoch: 2 }; return callback(); } } }); try { await assert.rejects(queued.create('wallet'), code('NATIVE_SCOPE_CHANGED')); assert.equal(g.calls, 0); } finally { await queued.close(); g.close(); }
});
test('missing tables/legacy schema, verification/concurrency capability and wrong scope fail explicitly', async () => {
  const f = fixture(), store = repository(f, { verifyPersisted: undefined }); try { await assert.rejects(store.create('wallet'), code('NATIVE_VERIFICATION_REQUIRED')); assert.equal(f.calls, 0); } finally { await store.close(); f.close(); }
  const missingApi = { exportTableAsJson: () => ({ mate: {} }) }, missing = new NativeFourTableRepository({ scope, getApi: () => missingApi, locks, verifyPersisted: () => true }); await assert.rejects(missing.list(), code('NATIVE_TABLES_MISSING')); await missing.close();
  const legacy = n.createNativeFourTableTemplate(); legacy.sheet_shiro_memory_1.content = [['row_id', '记录ID', '本源账户', '对象 / 世界', '最新印象']]; assert.throws(() => n.readNativeSnapshot(legacy, scope()), code('NATIVE_SCHEMA_VERSION'));
  assert.throws(() => n.readNativeSnapshot(n.createNativeFourTableExport(c.createLedger('wallet', 'test', at(0)), scope()), { ...scope(), chat: 'chat-B' }), code('NATIVE_SCOPE_MISMATCH'));
  const noLockApi = { exportTableAsJson: () => n.createNativeFourTableTemplate(), executeSqlBatch: async () => { throw new Error('must not call'); } }, noLocks = new NativeFourTableRepository({ scope, getApi: () => noLockApi, locks: {}, verifyPersisted: () => true }); await assert.rejects(noLocks.create('wallet'), code('NATIVE_CONCURRENCY_UNAVAILABLE')); await noLocks.close();
});
test('schema roundtrip rejects whole-ledger shadows, unknown fields, money tampering and duplicate transaction sequence', () => {
  const base = n.createNativeFourTableExport(richLedger(), scope());
  const mutations = [v => v.sheet_shiro_memory_2.content[0].push('隐藏整份账本'), v => { const s = v.sheet_shiro_memory_2, h = s.content[0]; s.content.find(r => r[h.indexOf('记录种类')] === 'transaction')[h.indexOf('因果点金额')] = '100'; }, v => { const s = v.sheet_shiro_memory_2, h = s.content[0]; s.content.filter(r => r[h.indexOf('记录种类')] === 'transaction')[1][h.indexOf('稳定序号')] = '0'; }, v => { const s = v.sheet_shiro_memory_1; s.content[1][s.content[0].indexOf('提交记录ID清单')] = JSON.stringify(richLedger()); }];
  for (const mutate of mutations) { const value = clone(base); mutate(value); assert.throws(() => n.readNativeSnapshot(value, scope())); }
});
test('literal encoder preserves SQL/HTML markers, quotes, Unicode/newline/NUL through real SQLite and public comment stripping', () => {
  const db = new DatabaseSync(':memory:'), value = "x'); DROP TABLE t; -- <!-- --> O'Brien\n中文😀\u0000tail";
  try { db.exec('CREATE TABLE t(value TEXT)'); db.exec(`INSERT INTO t(value) VALUES(${nativeSqlText(value)});`.replace(/<!--|-->/g, '')); assert.equal(db.prepare('SELECT value FROM t').get().value, value); } finally { db.close(); }
});
test('native importer regenerated sheet keys bind only unique exact names/contracts and target their actual keys', async () => {
  const initial = n.createNativeFourTableTemplate(), expected = {};
  for (const [index, table] of n.NATIVE_FOUR_TABLES.entries()) { const key = `sheet_hu_die_actual_${index + 1}`, sheet = initial[table.key]; delete initial[table.key]; sheet.uid = key; initial[key] = sheet; expected[table.key] = key; }
  assert.deepEqual(n.readNativeSnapshot(initial, scope()).keys, expected);
  const f = fixture(initial), store = repository(f), other = clone(f.data.sheet_other);
  try { await store.create('wallet'); await store.transact('wallet', l => c.credit(l, creditInput())); assert.equal((await store.read('wallet')).balance, '20'); assert.deepEqual(f.data.sheet_other, other); }
  finally { await store.close(); f.close(); }
  const ambiguous = clone(initial); ambiguous.sheet_duplicate = clone(ambiguous.sheet_hu_die_actual_1); ambiguous.sheet_duplicate.uid = 'sheet_duplicate'; assert.throws(() => n.readNativeSnapshot(ambiguous, scope()), code('NATIVE_TABLES_AMBIGUOUS'));
  const corrupt = clone(initial); corrupt.sheet_hu_die_actual_1.uid = 'wrong-uid'; assert.throws(() => n.readNativeSnapshot(corrupt, scope()), code('NATIVE_SCHEMA_VERSION'));
});
test('existing no-op request cannot report success from runtime-only rows when saved-chat confirmation fails', async () => {
  const f = fixture(); let verified = true; const store = repository(f, { verifyPersisted: () => verified });
  try { await store.create('wallet'); await store.transact('wallet', l => c.credit(l, creditInput())); const count = f.calls; verified = false; await assert.rejects(store.transact('wallet', l => c.credit(l, creditInput())), code('NATIVE_PERSISTENCE_UNCONFIRMED')); assert.equal(f.calls, count); await assert.rejects(store.transact('wallet', l => c.credit(l, creditInput())), code('NATIVE_PERSISTENCE_PENDING')); }
  finally { await store.close(); f.close(); }
});
test('two independent native runtimes sharing a saved-chat backend reject the stale tab before any SQL despite Web Locks', async () => {
  const a = fixture(), first = repository(a); let b, second;
  try {
    await first.create('wallet'); await first.transact('wallet', l => c.credit(l, creditInput()));
    b = fixture(clone(a.data)); second = repository(b, { verifyPersisted: context => JSON.stringify(context.tables) === JSON.stringify(a.savedData) });
    await first.transact('wallet', l => c.purchase(l, { requestId: 'buy-A', quoteId: c.BASELINE_QUOTE_ID }));
    const committed = clone(a.savedData), count = b.calls;
    await assert.rejects(second.transact('wallet', l => c.purchase(l, { requestId: 'stale-B', quoteId: c.BASELINE_QUOTE_ID })), code('NATIVE_PREFLIGHT_UNCONFIRMED'));
    assert.equal(b.calls, count); assert.deepEqual(a.savedData, committed); assert.equal((await first.read('wallet')).balance, '19');
  } finally { await first.close(); await second?.close(); a.close(); b?.close(); }
});
test('native DSL fallback or malformed public SQL read results cannot reach a business SQL batch', async () => {
  const f = fixture(); const query = f.api.executeSqlQuery; delete f.api.executeSqlQuery; const missing = repository(f);
  try { await assert.rejects(missing.create('wallet'), code('NATIVE_SQLITE_MODE_REQUIRED')); assert.equal(f.calls, 0); } finally { await missing.close(); }
  for (const result of [null, { columns: ['shiro_native_sql_ready'], values: [[1]], rows: [], rowCount: 1 }, { columns: ['shiro_native_sql_ready'], values: [['1']], rows: [{ shiro_native_sql_ready: '1' }], rowCount: 1 }]) {
    f.api.executeSqlQuery = () => result; const bad = repository(f); try { await assert.rejects(bad.create('wallet'), code('NATIVE_SQLITE_MODE_REQUIRED')); assert.equal(f.calls, 0); } finally { await bad.close(); }
  }
  f.api.executeSqlQuery = query; f.close();
});
