import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { nativeControllerHarness } from './native-controller-fixture.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
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
const harness = (saved = {}, options = {}) => nativeControllerHarness({ load, core, protocol, income, response }, saved, options);

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
test('queued native lock must recheck current chat before crediting a late A operation', async () => {
  const h = harness(); await h.controller.start(); h.setGeneration(() => Promise.resolve(response([effect()])));
  const hold = h.holdTransaction(), task = h.controller.settle(); await hold.entered; h.changeChat('chat-B'); hold.release(); await task;
  assert.equal(h.records.get('wallet').balance, '10', 'A passed preflight, then waited for a native lock; changing to B must cancel before mutation'); await h.controller.dispose();
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
  const h = harness(); h.settings.set('shiro-butterfly-shop:settings:v2:alice:chat-A', 'null'); await h.controller.start();
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
      assert.deepEqual(h.records.get('wallet'), JSON.parse(snapshot)); assert.match(h.prompts.at(-1).value, /可用余额.*\n?/);
      await h.controller.exportLedger(false); const backup = JSON.parse(h.downloads.at(-1)[1]); assert.equal(backup.ledger.impressions.length, 40); assert.deepEqual(backup.ledger, JSON.parse(snapshot));
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

function nativeValidators() {
  const upstream = fileURLToPath(new URL('../../../artifacts/shiro-butterfly-shop-20261006/reference/shujuku/', import.meta.url));
  const head = execFileSync('git', ['-c', `safe.directory=${upstream.replaceAll('\\', '/')}`, '-C', upstream, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(head, '1a5ffdb3ef8817452c370c6cfef7cac86683d7cc');
  const cache = new Map();
  function source(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const module = { exports: {} }; cache.set(file, module);
    new Function('require', 'module', 'exports', code)(name => {
      if (name === 'pinyin-pro') return require(path.join(upstream, '../validation-deps/package/dist/index.js'));
      if (!name.startsWith('.')) throw new Error(`Unexpected validator dependency ${name}`);
      const base = path.resolve(path.dirname(file), name), resolved = [base, `${base}.ts`, `${base}.js`, path.join(base, 'index.ts')].find(p => existsSync(p) && statSync(p).isFile());
      if (resolved === path.join(upstream, 'src/shared/utils.ts')) return { logDebug_ACU() {}, logWarn_ACU() {}, logError_ACU() {} };
      if (!resolved) throw new Error(`Validator dependency missing ${name}`);
      return source(resolved);
    }, module, module.exports); return module.exports;
  }
  function fixtureModule(relative, dependencies) {
    const code = ts.transpileModule(readFileSync(path.join(upstream, relative), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', code)(name => {
      if (name in dependencies) return dependencies[name];
      // Unused imports are inert; any accidental use fails visibly in this fixture.
      return new Proxy({}, { get(_target, key) { throw new Error(`Unexpected native fixture call ${name}.${String(key)}`); } });
    }, module, module.exports); return module.exports;
  }
  return { validator: source(path.join(upstream, 'src/service/template/template-import-validator.ts')), ddl: source(path.join(upstream, 'src/shared/ddl-utils.ts')), fixtureModule };
}
test('four native memory tables pass pinned upstream validator/DDL and disable duplicate AI exports', async () => {
  const h = harness({}, { ledger: archive() });
  try {
    await h.controller.start(); await pause(); await h.controller.exportMemory(); assert.equal(h.controller.state.error, '');
    const [name, text] = h.downloads.at(-1), wire = JSON.parse(text); assert.match(name, /四表/);
    assert.deepEqual(wire, memoryDatabase.createMemoryTableExport(h.controller.state.memory, 'wallet'));
    const sheets = Object.entries(wire).filter(([key]) => key.startsWith('sheet_')); assert.equal(sheets.length, 4);
    const { validator, ddl } = nativeValidators(); assert.deepEqual(validator.validateImportedTemplateObject_ACU(wire), []);
    for (const [key, sheet] of sheets) {
      assert.equal(sheet.uid, key); assert.equal(sheet.exportConfig.enabled, false); assert.equal(sheet.exportConfig.injectIntoWorldbook, false);
      assert.equal(sheet.updateConfig.updateFrequency, 0, 'read-only memory snapshots do not participate in native automatic fill');
      const check = ddl.validateDDLTextAgainstHeaders_ACU(sheet.sourceData.ddl, sheet.content[0]); assert.equal(check.valid, true, JSON.stringify(check));
      for (const row of sheet.content.slice(1)) { assert.equal(row.length, sheet.content[0].length); assert.equal(row[2], 'wallet'); }
      assert.equal(new Set(sheet.content.slice(1).map(r => r[1])).size, sheet.content.length - 1);
    }
    assert.equal(h.records.get('wallet').impressions.length, 40);
  } finally { await h.controller.dispose(); }
});

test('native scheduler excludes zero-frequency snapshots; export flags alone cannot exclude native fill prompts', async () => {
  const wire = memoryDatabase.createMemoryTableExport(memory.buildMemory(archive(4), { budget: 4000 }), 'wallet');
  const { ddl, fixtureModule } = nativeValidators(), logs = { logDebug_ACU() {}, logWarn_ACU() {}, logError_ACU() {}, isSummaryOrOutlineTable_ACU: () => false };
  const sorted = data => Object.keys(data).filter(k => k.startsWith('sheet_'));
  const scheduler = fixtureModule('src/service/table/update-scheduler.ts', {
    '../../shared/utils': logs,
    '../../shared/runtime-performance': { startRuntimePerformanceSpan_ACU: () => ({ end() {} }) },
    '../template/chat-scope': { getSortedSheetKeys_ACU: sorted },
    './table-history': { resolveTableHistoryStatesFromChat_ACU: () => new Map(), getLatestV2FullCheckpointMessageIndex_ACU: () => -1 },
  });
  const chat = [{ is_user: false, mes: 'isolated scheduler fixture' }], settings = { autoUpdateThreshold: 3, autoUpdateFrequency: 1, skipUpdateFloors: 0, updateBatchSize: 3 };
  assert.equal(scheduler.buildAutoUpdatePlan_ACU(chat, wire, settings, 'qa').tablesToUpdate.length, 0);
  const inherited = structuredClone(wire);
  for (const key of sorted(inherited)) inherited[key].updateConfig.updateFrequency = -1;
  assert.equal(scheduler.buildAutoUpdatePlan_ACU(chat, inherited, settings, 'qa').tablesToUpdate.length, 4, 'worldbook export=false alone did not disable native fill');
  const normal = structuredClone(wire.sheet_shiro_memory_1); normal.uid = 'sheet_normal'; normal.name = '其他业务表'; normal.updateConfig.updateFrequency = 1;
  const mixed = { ...wire, sheet_normal: normal };
  const plan = scheduler.buildAutoUpdatePlan_ACU(chat, mixed, settings, 'qa');
  assert.deepEqual(plan.tablesToUpdate.map(t => t.sheetKey), ['sheet_normal']); assert.deepEqual(Object.values(plan.updateGroups).flatMap(g => g.sheetKeys), ['sheet_normal']);
  // The real scheduler emits these exact target keys; real prepare code filters by them.
  const prepare = fixtureModule('src/service/ai/prompt-builder/prompt-prepare.ts', {
    '../../runtime/state-manager': { settings_ACU: {}, manualExtraHint_ACU: '' },
    '../../template/chat-scope': { ensureChatSheetGuideSeeded_ACU: async () => null, attachSeedRowsToCurrentDataFromGuide_ACU() {}, getEffectiveSeedRowsForSheet_ACU: () => [], getSortedSheetKeys_ACU: sorted, filterSheetKeysByTemplateScope_ACU: keys => keys, projectSheetForTemplateScope_ACU: table => table, resolveTemplateScope_ACU: () => null },
    '../../worldbook/pipeline': { getCombinedWorldbookContent_ACU: async () => '' },
    '../../worldbook/worldbook-placeholder-classification': { isDatabaseGeneratedLorebookEntry_ACU: () => false },
    '../../worldbook/read-context': { createLorebookReadContext_ACU: () => ({}) },
    '../../worldbook/read-scope': { buildTableCandidateScope_ACU: () => [], collectAsyncTableCandidateScope_ACU: async () => [], resolveLorebookReadTargets_ACU: async () => [] },
    '../../settings/settings-readers': { getCurrentWorldbookConfig_ACU: () => ({}) },
    '../../agent/agent-worldbook-takeover': { resolvePreTakeoverWorldbookSnapshot_ACU: async () => ({}) },
    '../../../shared/utils': logs,
    '../../table/storage-mode': { isSqliteMode: () => false },
    '../../../shared/ddl-utils': ddl,
    '../../flight-mode/flight-mode-state': { getCurrentFlightModeState_ACU: () => ({ enabled: false, hiddenRowIds: [] }) },
    '../../fill-mode/fill-mode-preferences': { getClassicRecentChronicleRows_ACU: () => 10, resolveSheetSourceDataPlaceholders_ACU: table => table },
  });
  const filtered = await prepare.prepareAIInput_ACU([], 'auto_standard', ['sheet_normal'], { tableData: mixed, templateScope: null });
  assert.match(filtered.tableDataText, /其他业务表/); assert.doesNotMatch(filtered.tableDataText, /蝴蝶·二、点数账目/);
  const manuallySelected = await prepare.prepareAIInput_ACU([], 'manual_unified', ['sheet_shiro_memory_2'], { tableData: wire, templateScope: null });
  assert.match(manuallySelected.tableDataText, /可用余额/); assert.match(manuallySelected.tableDataText, /10/);
  assert.equal(wire.sheet_shiro_memory_2.updateConfig.updateFrequency, 0, 'frequency disables automatic scheduling, not explicit manual selection');
});

// Regression expectations below are intentionally strict: the controller must not
// expose a different account's data or spend an API call on already obsolete input.
test('switching chats never publishes old account balance under the new chat account', async () => {
  const h = harness();
  try {
    h.setChatLedger('chat-B', core.createLedger('wallet-b'));
    await h.controller.start(); await pause(); const start = h.prompts.length;
    h.changeChat('chat-B'); await pause(); await pause();
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

/** Run the returned expression in an actual HTTP(S) browser page to exercise native IndexedDB.
 * No dependencies, network calls, app globals or existing wallets are needed.
 * Isolated QA handle and exact-key cleanup preserve user data. Separate-tab tests remain separate evidence.
 */
export function nativeIndexedDBProbeSource() {
  const compile = file => ts.transpileModule(readFileSync(new URL(`src/${file}`, root), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const coreSource = compile('core.ts'), storageSource = compile('storage.ts');
  return `(async()=>{
    const core=(()=>{const exports={};${coreSource}\nreturn exports;})();
    const storage=(()=>{const exports={};const require=name=>{if(name==='./core')return core;throw Error('Unexpected dependency '+name)};${storageSource}\nreturn exports;})();
    const handle='__shiro-native-qa-'+crypto.randomUUID(),scope={origin:location.origin,handle};
    const a=new storage.LedgerStore(scope),b=new storage.LedgerStore(scope),other=new storage.LedgerStore({origin:location.origin,handle:handle+'-other'});
    const checks=[];function check(name,value){checks.push({name,pass:!!value});if(!value)throw Error(name)}
    async function rejected(action,code){try{await action();return false}catch(e){return !code||e.code===code}}
    const ids=['wallet','restored'];
    try{
      await a.create('wallet','Native IndexedDB QA');
      check('zero initial points',(await a.read('wallet')).balance==='0');
      await a.transact('wallet',l=>core.credit(l,{requestId:'earn-1',resultId:'result-1',world:'test',source:'test source',outcome:'one actual change',evidence:'test evidence',amount:'1',standardSpec:'one change one point',established:true}));
      const results=await Promise.allSettled([a.transact('wallet',l=>core.purchase(l,{requestId:'buy-a',quoteId:core.BASELINE_QUOTE_ID})),b.transact('wallet',l=>core.purchase(l,{requestId:'buy-b',quoteId:core.BASELINE_QUOTE_ID}))]);
      check('native concurrent connections exactly one purchase',results.filter(r=>r.status==='fulfilled').length===1);
      const ledger=await a.read('wallet');check('no overspend and one inventory',ledger.balance==='0'&&ledger.spend==='1'&&ledger.inventory.length===1);
      check('handle isolation',(await other.read('wallet'))===undefined&&(await other.list()).length===0);
      check('async transaction rejected',await rejected(()=>a.transact('wallet',async l=>l),'ASYNC_TRANSACTION'));
      const before=JSON.stringify(await a.read('wallet'));
      check('invalid mutation aborts',await rejected(()=>a.transact('wallet',l=>({...l,balance:'999'}))));
      check('abort leaves exact ledger',JSON.stringify(await a.read('wallet'))===before);
      const backup=await a.export('wallet');check('existing-account import blocked',await rejected(()=>a.import(backup),'ACCOUNT_EXISTS'));
      const restored=await a.import(backup,'restored');check('restoration under new ID preserves history',restored.accountId==='restored'&&JSON.stringify(restored.transactions)===JSON.stringify(ledger.transactions));
      const bad=JSON.parse(JSON.stringify(backup));bad.ledger.balance='-1';check('negative backup rejected',await rejected(()=>a.import(bad,'negative')));
      await a.close();const reopened=new storage.LedgerStore(scope);check('close and reopen reads committed ledger',JSON.stringify(await reopened.read('wallet'))===before);await reopened.close();
      return {pass:true,engine:navigator.userAgent,origin:location.origin,checks,scope:'isolated QA handle; native IndexedDB; two connections; no real-host acceptance claimed'};
    }finally{
      await a.close();await b.close();await other.close();
      await new Promise((resolve,reject)=>{const request=indexedDB.open('shiro-butterfly-shop-v1',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('ledgers','readwrite');for(const id of ids)tx.objectStore('ledgers').delete([scope.origin,scope.handle,id]);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}}});
    }
  })()`;
}
