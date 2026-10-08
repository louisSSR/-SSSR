// Portable business regressions extracted from the existing workspace integration suite.
// Native database source and browser IndexedDB probes remain separate, explicitly scoped evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
const require = createRequire(import.meta.url), ts = require('typescript');
const root = new URL('../', import.meta.url);
const moduleCache = new Map();
function load(file, dependencies = {}) {
  if (!Object.keys(dependencies).length && moduleCache.has(file)) return moduleCache.get(file);
  const source = readFileSync(new URL(`src/${file}`, root), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(name => {
    if (name in dependencies) return dependencies[name];
    if (name === '../docs/蝴蝶效应原文.txt') return { default: readFileSync(new URL('docs/蝴蝶效应原文.txt', root), 'utf8') };
    if (name.startsWith('./')) return load(name.slice(2).replace(/\.js$/, '').replace(/\.ts$/, '') + '.ts');
    return require(name);
  }, module, module.exports);
  if (!Object.keys(dependencies).length) moduleCache.set(file, module.exports);
  return module.exports;
}
const core = load('core.ts'), protocol = load('protocol.ts'), journal = load('journal.ts'), memory = load('memory.ts'), budget = load('prompt-budget.ts'), memoryDatabase = load('memory-database.ts');
const pause = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const effect = (id = 'result-a') => ({ resultId: id, source: '玩家救起落水者', outcome: '落水者已脱离危险', evidence: '落水者已经安全获救', amount: '1', standardSpec: '一位普通人被实际救起并脱险', established: true, independent: true, kind: 'initial', world: '世界A' });
const response = (effects = []) => JSON.stringify({ world: { name: '世界A', systems: ['普通生命'], evidence: '故事中确认的世界' }, quotes: [], effects, ripples: [] });
const income = (id = 'r1') => ({ requestId: `earn:${id}`, resultId: id, world: '世界A', source: '实际行为', outcome: '明确成立的独立改变', evidence: '可查证的故事内容', amount: '10', standardSpec: '固定影响十点规格', established: true });
function harness(saved = {}, options = {}) {
  const events = new EventEmitter(), records = new Map(), uploads = [], downloads = [], prompts = [];
  let chat = 'chat-A', handle = 'alice', generation = () => Promise.resolve(response()), gate, transactionStarted;
  let storyText = '落水者已经安全获救', stamp = 'story1', chatOpen = true;
  const settings = new Map([[`shiro-butterfly-shop:settings:alice`, JSON.stringify({ accountId: 'wallet', provider: 'host', preset: '', autoWorld: false, autoSettle: false, worldNotes: '', syncChats: [], ...saved })]]);
  records.set('wallet', options.ledger ?? core.credit(core.createLedger('wallet'), income()).ledger);
  globalThis.location = { origin: 'https://example.test' };
  globalThis.localStorage = { getItem: k => settings.get(k) ?? null, setItem: (k, value) => settings.set(k, value) };
  globalThis.BroadcastChannel = class { postMessage() {} close() {} };
  class FakeStore {
    async list() { return structuredClone([...records.values()]); }
    async read(id) { return structuredClone(records.get(id)); }
    async create(id, label) { const l = core.createLedger(id, label); records.set(id, l); return structuredClone(l); }
    async transact(id, callback) {
      transactionStarted?.resolve();
      if (gate) { const wait = gate; gate = undefined; await wait.promise; }
      const before = structuredClone(records.get(id)), output = callback(before), next = 'ledger' in output ? output.ledger : output;
      core.assertLedgerContinuation(records.get(id), next); records.set(id, structuredClone(next)); return structuredClone(output);
    }
    async export(id) { return { format: 'shiro-butterfly-ledger', version: 1, exportedAt: new Date().toISOString(), scope: { origin: location.origin, handle: 'alice' }, ledger: await this.read(id) }; }
    async close() {}
  }
  const hostContext = { eventSource: events, eventTypes: Object.fromEntries(['CHAT_CHANGED', 'MESSAGE_RECEIVED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_DELETED', 'GENERATION_AFTER_COMMANDS'].map(k => [k, k])), generateQuietPrompt: (...args) => generation(...args) };
  // Deterministic fixture count only; not a claim about real model tokenization.
  if (options.tokenizer !== null) hostContext.getTokenCountAsync = options.tokenizer ?? (async text => Math.ceil(new TextEncoder().encode(text).length / 3));
  const host = {
    MODULE_ID: 'shiro-butterfly-shop', context: () => hostContext, chatIdentity: () => chat, hasChat: () => chatOpen,
    verifiedHandle: async () => handle,
    storyContext: () => ({ text: storyText, evidence: storyText, stamp: `${chat}:${stamp}` }),
    setLedgerPrompt: value => prompts.push({ chat, account: controller.state.settings.accountId, value }), download: (...args) => downloads.push(args), serverBackup: (...args) => uploads.push(args),
  };
  const database = { discoverDatabaseApi: () => null, callDatabaseAI: () => { throw new Error('unused'); }, enableButterflyTables: () => {}, syncButterflyLedger: () => {} };
  const { createController } = load('controller.ts', { './core': core, './protocol': protocol, './storage': { LedgerStore: FakeStore }, './host': host, './database': database });
  const controller = createController();
  return { controller, records, downloads, prompts, settings, events, hostContext, setGeneration: fn => { generation = fn; }, setHandle: value => { handle = value; }, setStory: (text, id = 'changed') => { storyText = text; stamp = id; }, changeChat: value => { chat = value; events.emit('CHAT_CHANGED'); }, closeChat: () => { chatOpen = false; events.emit('CHAT_CHANGED'); }, holdTransaction() { gate = deferred(); transactionStarted = deferred(); return { entered: transactionStarted.promise, release: gate.resolve }; } };
}

test('protocol rejects world-mode credit and evidence absent from completed story', () => {
  assert.throws(() => protocol.parseWorldReply(response([effect()]), 'world', '落水者已经安全获救'), /浏览商店/);
  assert.throws(() => protocol.parseWorldReply(response([effect()]), 'settle', '这是另一个事件'), /证据不在/);
  const parsed = protocol.parseWorldReply(response([effect()]), 'settle', '落水者已经安全获救'); assert.equal(parsed.effects[0].amount, '1');
});
test('a late API answer from A is discarded after chat B becomes current', async () => {
  const h = harness(), api = deferred(); await h.controller.start(); h.setGeneration(() => api.promise);
  const task = h.controller.settle(); await pause(); h.changeChat('chat-B'); api.resolve(response([effect()])); await task;
  assert.equal(h.records.get('wallet').balance, '10'); assert.equal(h.records.get('wallet').events.length, 1); await h.controller.dispose();
});
test('queued IndexedDB commit must recheck current chat before crediting a late A operation', async () => {
  const h = harness(); await h.controller.start(); h.setGeneration(() => Promise.resolve(response([effect()])));
  const hold = h.holdTransaction(), task = h.controller.settle(); await hold.entered; h.changeChat('chat-B'); hold.release(); await task;
  assert.equal(h.records.get('wallet').balance, '10', 'A passed preflight, then waited for IDB; changing to B must cancel before mutation'); await h.controller.dispose();
});
test('queued purchase must recheck current chat before consuming points', async () => {
  const h = harness(); await h.controller.start(); h.controller.state.selectedQuote = h.records.get('wallet').quotes[0]; h.controller.state.quantity = 1;
  const hold = h.holdTransaction(), task = h.controller.buy(); await hold.entered; h.changeChat('chat-B'); hold.release(); await task;
  assert.equal(h.records.get('wallet').balance, '10', 'purchase was selected in A and must be cancelled if B is active before write'); await h.controller.dispose();
});
test('explicit local export must verify that the logged-in user still owns loaded ledger', async () => {
  const h = harness(); await h.controller.start(); h.setHandle('bob'); await h.controller.exportLedger(false);
  assert.equal(h.downloads.length, 0, 'do not export Alice ledger while authenticated as Bob'); await h.controller.dispose();
});
test('repeated settlement with stable result ID does not credit twice', async () => {
  const h = harness(); await h.controller.start(); h.setGeneration(() => Promise.resolve(response([effect()])));
  await h.controller.settle(); await h.controller.settle(); assert.equal(h.records.get('wallet').balance, '11'); assert.equal(h.records.get('wallet').events.length, 2); await h.controller.dispose();
});
test('same completed story cannot mint twice merely because model chose a different result ID', async () => {
  const h = harness(); await h.controller.start(); let call = 0; h.setGeneration(() => Promise.resolve(response([effect(`model-random-id-${++call}`)])));
  await h.controller.settle(); await h.controller.settle();
  assert.equal(h.records.get('wallet').balance, '11', 'a second API ID for identical source/outcome/evidence is the same already-settled fact'); await h.controller.dispose();
});
test('corrupted null settings recover to safe defaults without blocking startup', async () => {
  const h = harness(); h.settings.set('shiro-butterfly-shop:settings:alice', 'null'); await h.controller.start();
  assert.equal(h.controller.state.ready, true); assert.equal(typeof h.controller.state.settings.autoWorld, 'boolean'); await h.controller.dispose();
});
test('restored settings cannot turn string false into enabled API automation', async () => {
  const h = harness({ autoSettle: 'false', autoWorld: 'false', syncChats: [5, null], provider: 'unknown' }); await h.controller.start();
  assert.equal(typeof h.controller.state.settings.autoSettle, 'boolean'); assert.equal(typeof h.controller.state.settings.autoWorld, 'boolean');
  assert.ok(['host', 'database'].includes(h.controller.state.settings.provider)); assert.ok(h.controller.state.settings.syncChats.every(x => typeof x === 'string')); await h.controller.dispose();
});
test('purchase modal computes total quantity and correct shortfall through actual Vue setup', () => {
  const { parse, compileScript } = require('vue/compiler-sfc'), vue = require('vue');
  const descriptor = parse(readFileSync(new URL('src/App.vue', root), 'utf8')).descriptor;
  const script = compileScript(descriptor, { id: 'integration-modal', genDefaultAs: 'component' });
  const output = ts.transpileModule(`${script.content}\nexport default component;`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} }; new Function('require', 'module', 'exports', output)(name => name.startsWith('./') ? load(name.slice(2).replace(/\.js$/, '').replace(/\.ts$/, '') + '.ts') : require(name), module, module.exports);
  const state = vue.reactive({ ledger: { balance: '3', quotes: [] }, selectedQuote: { price: '2' }, quantity: 2 });
  const setup = module.exports.default.setup({ controller: { state }, assetUrl: 'https://example.test/assets/shiro.png' }, { expose() {} });
  assert.equal(setup.totalPrice.value, '4'); assert.equal(setup.totalShortfall.value, '1');
  state.quantity = 1; assert.equal(setup.totalPrice.value, '2'); assert.equal(setup.totalShortfall.value, '');
  state.quantity = 0; assert.equal(setup.totalPrice.value, '');
});
test('disposing controller removes listeners and discards outstanding API reply', async () => {
  const h = harness(), api = deferred(); await h.controller.start(); h.setGeneration(() => api.promise);
  const task = h.controller.settle(); await pause(); assert.ok(h.events.listenerCount('CHAT_CHANGED') > 0);
  await h.controller.dispose(); assert.equal(h.events.listenerCount('CHAT_CHANGED'), 0); assert.equal(h.events.listenerCount('MESSAGE_RECEIVED'), 0);
  api.resolve(response([effect()])); await task; assert.equal(h.records.get('wallet').balance, '10'); assert.equal(h.prompts.at(-1).value, '');
});

function archive(count = 40) {
  let l = core.createLedger('wallet', '完整历史测试', '2026-10-01T00:00:00.000Z');
  l = core.setWorld(l, '世界A', '2026-10-01T00:00:01.000Z').ledger;
  l = core.credit(l, { ...income(), at: '2026-10-01T00:00:02.000Z' }).ledger;
  for (let i = 0; i < count; i++) l = journal.appendImpression(l, { id: `history-${i}`, world: '世界A', subject: `人物${i}`, summary: `人物${i}的重要印象，历史必须完整保留。${'本轮并肩作战后更加信任。'.repeat(8)}`, evidence: '并肩作战后他交出了重要钥匙。', source: 'story', at: '2026-10-02T00:00:00.000Z' }).ledger;
  return l;
}
const taskReply = (extra = {}) => JSON.stringify({ world: { name: '世界A', systems: ['普通生命'], evidence: '故事确认' }, quotes: [], effects: [], ripples: [], impressions: [], quests: [], questCompletions: [], ...extra });
const offeredTask = () => ({ id: 'rescue-task', world: '世界A', title: '救起落水者', objective: '让落水者实际脱离危险', reason: '河岸有人需要救援' });

test('prompt counter never trusts missing/zero/negative/nonfinite/throwing counters as free tokens', async () => {
  const sample = '中文😀word';
  for (const counter of [undefined, async () => 0, async () => -1, async () => NaN, async () => Infinity, async () => '3', async () => { throw new Error('offline'); }]) {
    const result = await budget.countPrompt(sample, counter); assert.equal(result.count, Buffer.byteLength(sample)); assert.match(result.method, /字节/);
  }
  assert.deepEqual(await budget.countPrompt(sample, async () => 3.2), { count: 4, method: '宿主 Token 计数' });
});
test('tokenizer timeout falls back instead of hanging forever, and eventual result cannot replace fallback', async () => {
  const pending = deferred(), begun = Date.now();
  const result = await budget.countPrompt('计数超时也不能作零', () => pending.promise);
  assert.equal(result.count, Buffer.byteLength('计数超时也不能作零')); assert.match(result.method, /字节/); assert.ok(Date.now() - begun >= 3500);
  pending.resolve(1); await pause(); assert.match(result.method, /字节/);
});
test('controller retains exact complete archive while missing/zero/failing tokenizer memory stays within byte ceiling', async () => {
  for (const tokenizer of [null, async () => 0, async () => { throw new Error('failed'); }]) {
    const ledger = archive(), snapshot = JSON.stringify(ledger), h = harness({}, { ledger, tokenizer });
    try {
      await h.controller.start(); await pause(); await h.controller.refreshMemory();
      assert.ok(h.controller.state.memory.usedBytes <= 2048); assert.match(h.controller.state.memoryMethod, /字节/);
      assert.ok(h.controller.state.memory.omitted > 0); assert.equal(h.controller.state.memory.tables.length, 4);
      assert.equal(JSON.stringify(h.records.get('wallet')), snapshot); assert.match(h.prompts.at(-1).value, /可用余额.*\n?/);
      await h.controller.exportLedger(false); const backup = JSON.parse(h.downloads.at(-1)[1]); assert.equal(backup.ledger.impressions.length, 40); assert.equal(JSON.stringify(backup.ledger), snapshot);
    } finally { await h.controller.dispose(); }
  }
});
test('older asynchronous token count cannot overwrite a newer query injection in the same chat', async () => {
  const h = harness({}, { ledger: archive() }), waiting = deferred();
  try {
    await h.controller.start(); await pause();
    h.controller.state.memoryQuery = '人物1'; h.hostContext.getTokenCountAsync = () => waiting.promise;
    const older = h.controller.refreshMemory(); await pause();
    h.controller.state.memoryQuery = '人物39'; h.hostContext.getTokenCountAsync = async () => 999;
    await h.controller.refreshMemory(); const newest = h.prompts.at(-1).value, length = h.prompts.length;
    waiting.resolve(1); await older; await pause();
    assert.equal(h.prompts.length, length); assert.equal(h.prompts.at(-1).value, newest); assert.equal(h.controller.state.memoryTokens, 999);
  } finally { waiting.resolve(1); await h.controller.dispose(); }
});
test('A token count resolving after B chat switch or disposal never publishes A memory into B', async () => {
  const h = harness({}, { ledger: archive() }), waiting = deferred();
  try {
    await h.controller.start(); await pause(); h.hostContext.getTokenCountAsync = () => waiting.promise;
    const a = h.controller.refreshMemory(); await pause();
    h.hostContext.getTokenCountAsync = async () => 555; h.changeChat('chat-B'); await pause(); await pause();
    const current = h.prompts.at(-1).value, count = h.prompts.length;
    waiting.resolve(1); await a; assert.equal(h.prompts.length, count); assert.equal(h.prompts.at(-1).value, current); assert.equal(h.controller.state.memoryTokens, 555);
    const disposal = deferred(); h.hostContext.getTokenCountAsync = () => disposal.promise; const pending = h.controller.refreshMemory(); await pause();
    await h.controller.dispose(); const afterDispose = h.prompts.length; disposal.resolve(1); await pending;
    assert.equal(h.prompts.length, afterDispose); assert.equal(h.prompts.at(-1).value, '');
  } finally { waiting.resolve(1); await h.controller.dispose(); }
});
test('a delayed request token count is cancelled before any model call if chat changes', async () => {
  const h = harness(), waiting = deferred(), entered = deferred(); let calls = 0;
  try {
    await h.controller.start(); await pause(); h.setGeneration(() => { calls++; return Promise.resolve(response([effect()])); });
    h.hostContext.getTokenCountAsync = text => { if (text.startsWith('你是蝴蝶效应商店')) { entered.resolve(); return waiting.promise; } return Promise.resolve(100); };
    const work = h.controller.settle(); await entered.promise; h.changeChat('chat-B'); waiting.resolve(100); await work;
    assert.equal(calls, 0); assert.equal(h.records.get('wallet').balance, '10');
  } finally { waiting.resolve(100); await h.controller.dispose(); }
});
test('task dispatch, accept, settle and repeated completion use one real credit transaction only', async () => {
  const h = harness({}, { ledger: archive(0) });
  try {
    await h.controller.start(); h.setGeneration(() => Promise.resolve(taskReply({ quests: [offeredTask()] })));
    await h.controller.dispatchTasks(); assert.equal(h.controller.state.error, ''); assert.equal(h.records.get('wallet').quests[0].status, 'offered'); assert.equal(h.records.get('wallet').balance, '10');
    await h.controller.taskAction('rescue-task', 'active'); assert.equal(h.records.get('wallet').quests[0].status, 'active');
    // Separate dispatch and factual event instants; production clocks are real UTC milliseconds.
    await new Promise(resolve => setTimeout(resolve, 5));
    let index = 0; h.setGeneration(() => { const id = `same-fact-new-model-id-${++index}`; return Promise.resolve(taskReply({ effects: [effect(id)], questCompletions: [{ questId: 'rescue-task', resultId: id }] })); });
    await h.controller.settle(); assert.equal(h.controller.state.error, ''); const done = structuredClone(h.records.get('wallet'));
    assert.equal(done.quests[0].status, 'completed'); assert.equal(done.balance, '11'); assert.equal(done.transactions.length, 2);
    await h.controller.settle(); assert.equal(h.controller.state.error, ''); assert.deepEqual(h.records.get('wallet'), done);
  } finally { await h.controller.dispose(); }
});
test('unaccepted/fake completion rejects the entire submitted batch including newly proposed credit', async () => {
  const h = harness({}, { ledger: archive(0) });
  try {
    await h.controller.start(); h.setGeneration(() => Promise.resolve(taskReply({ quests: [offeredTask()] }))); await h.controller.dispatchTasks();
    const original = JSON.stringify(h.records.get('wallet'));
    h.setGeneration(() => Promise.resolve(taskReply({ effects: [effect()], questCompletions: [{ questId: 'rescue-task', resultId: 'result-a' }] }))); await h.controller.settle();
    assert.match(h.controller.state.error, /先接受/); assert.equal(JSON.stringify(h.records.get('wallet')), original);
    await h.controller.taskAction('rescue-task', 'active'); const accepted = JSON.stringify(h.records.get('wallet'));
    h.setGeneration(() => Promise.resolve(taskReply({ questCompletions: [{ questId: 'rescue-task', resultId: 'invented' }] }))); await h.controller.settle();
    assert.match(h.controller.state.error, /本轮实际因果/); assert.equal(JSON.stringify(h.records.get('wallet')), accepted);
  } finally { await h.controller.dispose(); }
});
test('protocol keeps task-only API responses from mutating story facts and rejects fabricated impression evidence', () => {
  for (const extra of [{ effects: [effect()] }, { impressions: [{ id: 'i', world: '世界A', subject: '人物', summary: '变化', evidence: '落水者已经安全获救' }] }, { questCompletions: [{ questId: 'q', resultId: 'r' }] }]) assert.throws(() => protocol.parseWorldReply(taskReply(extra), 'quests', '落水者已经安全获救'));
  assert.throws(() => protocol.parseWorldReply(taskReply({ impressions: [{ id: 'i', world: '世界A', subject: '人物', summary: '变化', evidence: '这段证据并不存在' }] }), 'settle', '落水者已经安全获救'), /印象证据/);
  const parsed = protocol.parseWorldReply(taskReply({ quests: [{ ...offeredTask(), at: '1900-01-01T00:00:00.000Z', status: 'completed' }] }), 'quests', '');
  assert.equal(Object.hasOwn(parsed.quests[0], 'at'), false); assert.equal(Object.hasOwn(parsed.quests[0], 'status'), false);
});

test('switching accounts never publishes old account balance under the selected new account', async () => {
  const h = harness();
  try {
    h.records.set('wallet-b', core.createLedger('wallet-b'));
    await h.controller.start(); await pause(); const start = h.prompts.length;
    await h.controller.selectAccount('wallet-b'); await pause();
    const wrong = h.prompts.slice(start).filter(p => p.account === 'wallet-b' && p.value.includes('| 可用余额 | 精确值 | 10 |'));
    assert.equal(wrong.length, 0, 'old wallet must be cleared before saveSettings triggers synchronous injection');
  } finally { await h.controller.dispose(); }
});
test('story changed during request tokenization cancels before calling the model', async () => {
  const h = harness(), waiting = deferred(), entered = deferred(); let calls = 0;
  try {
    await h.controller.start(); await pause(); h.setGeneration(() => { calls++; return Promise.resolve(response([effect()])); });
    h.hostContext.getTokenCountAsync = text => { if (text.startsWith('你是蝴蝶效应商店')) { entered.resolve(); return waiting.promise; } return Promise.resolve(100); };
    const work = h.controller.settle(); await entered.promise; h.setStory('完全不同的一轮剧情，旧事实已被编辑替换。'); waiting.resolve(100); await work;
    assert.equal(calls, 0, 'obsolete input should be rejected before an API call, not only after its response'); assert.equal(h.records.get('wallet').balance, '10');
  } finally { waiting.resolve(100); await h.controller.dispose(); }
});

