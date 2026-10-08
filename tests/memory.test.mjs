import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
function load(name) {
  const module = { exports: {} };
  const source = readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
  new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(require, module, module.exports);
  return module.exports;
}
const core = load('core'), memory = load('memory');
function fixture() {
  const ledger = core.createLedger('memory-fixture');
  ledger.world = '精灵森林'; ledger.balance = '123456789012345678901234567890.123456789012345678';
  ledger.income = '223456789012345678901234567890.123456789012345678'; ledger.spend = '100000000000000000000000000000';
  ledger.impressions = [
    { id: 'old', world: ledger.world, subject: '爱丽丝', summary: '旧印象已经被纠正', evidence: '旧记录', pinned: true, createdAt: '2026-01-01', source: 'story' },
    { id: 'new', world: ledger.world, subject: '爱丽丝', summary: '新的印象', evidence: '本轮明确事实', pinned: false, createdAt: '2026-01-02', source: 'story' },
    { id: 'pinned', world: '旧世界', subject: '置顶重要对象', summary: '仍应优先想起', evidence: '玩家明确标注', pinned: true, createdAt: '2026-01-01', source: 'user' },
  ];
  ledger.quests = [{ id: 'quest', world: ledger.world, title: '寻找月亮泉', objective: '实际到达泉水', reason: '未完成的后续', status: 'active', createdAt: '2026-01-01', updatedAt: '2026-01-01' }];
  ledger.ripples = [{ id: 'ripple', world: ledger.world, source: '救起精灵', settled: '救人已计1点', tracking: '精灵村将来的反应', status: 'active', updatedAt: '2026-01-01' }];
  ledger.inventory = [{ id: 'item', purchaseId: 'buy', quoteId: core.BASELINE_QUOTE_ID, name: '永久本源', spec: { ...core.BASELINE_SPEC }, kind: 'permanent', acquired: 2, remaining: 2, consumed: 0, transferred: 0, world: '旧世界', at: '2026-01-01' }];
  ledger.transactions = [{ id: 'buy', kind: 'purchase', amount: '2' }];
  ledger.events = [{ id: 'event', source: '救起精灵', outcome: '精灵已经脱险', evidence: '她已安全抵岸', amount: '1', standardId: 'standard', world: ledger.world, kind: 'initial', independent: true }];
  ledger.standards = [{ id: 'standard', spec: '一名普通生命获救', reward: '1' }];
  return ledger;
}
function freezeDeep(value) { Object.freeze(value); for (const child of Object.values(value)) if (child && typeof child === 'object' && !Object.isFrozen(child)) freezeDeep(child); return value; }
function assertTables(result, ledger, limit) {
  assert.ok(Buffer.byteLength(result.text, 'utf8') <= limit);
  assert.equal(result.usedBytes, Buffer.byteLength(result.text, 'utf8'));
  assert.equal(result.tables.length, 4);
  assert.deepEqual(result.tables.map(table => table.key), ['impressions', 'accounts', 'inventory', 'ripples']);
  for (const table of result.tables) for (const row of table.rows) assert.equal(row.length, table.columns.length);
  assert.ok(result.text.includes(ledger.balance)); assert.ok(result.text.includes(ledger.income)); assert.ok(result.text.includes(ledger.spend));
  assert.match(result.text, /未展示的永久所得没有失效/);
  assert.match(result.text, /任务只追踪目标，不预发点数/);
  assert.match(result.text, /模型不得自行加扣点；购买必须由插件实际交易成功/);
}

test('four complete tables retain exact aggregates at minimum budget and default budget', () => {
  const ledger = fixture();
  for (const budget of [1400, 1600, 2048, 3000, 9000]) assertTables(memory.buildMemory(ledger, { budget }), ledger, budget);
  const largest = '9'.repeat(48) + '.' + '9'.repeat(18);
  ledger.balance = largest; ledger.income = largest; ledger.spend = largest; ledger.world = '特长世界名字🦋'.repeat(200);
  assertTables(memory.buildMemory(ledger, { budget: 1400 }), ledger, 1400);
  assert.throws(() => memory.buildMemory(ledger, { budget: 1399 }), /1400/);
});

test('latest impression supersedes same normalized subject within its world, pins precede regular rows', () => {
  const ledger = fixture();
  const result = memory.buildMemory(ledger);
  assert.match(result.tables[0].rows[0][0], /置顶重要对象/);
  assert.match(result.text, /新的印象/);
  assert.doesNotMatch(result.text, /旧印象已经被纠正/);
  ledger.impressions.push({ ...ledger.impressions[1], id: 'other-world', world: '另一世界', summary: '另一个同名人物' });
  assert.match(memory.buildMemory(ledger).text, /另一个同名人物/);
});

test('a later story inherits the latest manual pin while keeping the newest facts, without modifying stored entries', () => {
  const ledger = fixture();
  ledger.impressions = [
    { ...ledger.impressions[1], id: 'manual-pin', source: 'user', pinned: true, summary: '手动置顶时的旧事实' },
    { ...ledger.impressions[1], id: 'story-latest', source: 'story', pinned: false, summary: '此刻已确认的新事实' },
    { ...ledger.impressions[1], id: 'unrelated', subject: '更晚出现的普通对象', source: 'story', pinned: false },
  ];
  const before = JSON.stringify(ledger); freezeDeep(ledger);
  const built = memory.buildMemory(ledger);
  assert.match(built.tables[0].rows[0][0], /^置顶·爱丽丝/);
  assert.match(built.tables[0].rows[0][1], /此刻已确认的新事实/);
  assert.doesNotMatch(built.text, /手动置顶时的旧事实/);
  const selected = memory.selectEvaluationContext(ledger, '').selected.impressions;
  assert.equal(selected[0].id, 'story-latest'); assert.equal(selected[0].pinned, true);
  assert.equal(JSON.stringify(ledger), before);
});

test('a newer manual unpin overrides an older manual pin and any subsequent story pin suggestion', () => {
  const ledger = fixture();
  ledger.impressions = [
    { ...ledger.impressions[1], id: 'pin', source: 'user', pinned: true },
    { ...ledger.impressions[1], id: 'unpin', source: 'user', pinned: false },
    { ...ledger.impressions[1], id: 'story-after-unpin', source: 'story', pinned: true, summary: '取消置顶之后的新事实' },
  ];
  const before = JSON.stringify(ledger); freezeDeep(ledger);
  const built = memory.buildMemory(ledger);
  assert.doesNotMatch(built.tables[0].rows[0][0], /置顶/);
  assert.match(built.tables[0].rows[0][1], /取消置顶之后的新事实/);
  const selected = memory.selectEvaluationContext(ledger, '').selected.impressions[0];
  assert.equal(selected.id, 'story-after-unpin'); assert.equal(selected.pinned, false);
  assert.equal(JSON.stringify(ledger), before);
});

test('old ripple versions count as omitted archive and are never re-injected as current tracking', () => {
  const ledger = fixture(), original = memory.buildMemory(ledger);
  ledger.rippleHistory = [
    { ...ledger.ripples[0], tracking: '已被更新的旧追踪版本一' },
    { ...ledger.ripples[0], tracking: '已被更新的旧追踪版本二' },
  ];
  const before = JSON.stringify(ledger); freezeDeep(ledger);
  const result = memory.buildMemory(ledger);
  assert.equal(result.omitted, original.omitted + 2);
  assert.doesNotMatch(result.text, /已被更新的旧追踪版本/);
  assert.doesNotMatch(JSON.stringify(memory.selectEvaluationContext(ledger, '旧追踪版本')), /已被更新的旧追踪版本/);
  assertTables(memory.buildMemory(ledger, { budget: 1400 }), ledger, 1400);
  assert.equal(JSON.stringify(ledger), before);
});

test('permanent inventory and active quests are represented; they do not change the wallet', () => {
  const ledger = freezeDeep(fixture()), snapshot = JSON.stringify(ledger);
  const result = memory.buildMemory(ledger, { query: '爱丽丝寻找月亮泉' });
  assert.match(result.text, /永久本源/); assert.match(result.text, /持有 2/);
  assert.match(result.text, /寻找月亮泉/); assert.match(result.text, /未预发奖励/);
  assert.equal(JSON.stringify(ledger), snapshot);
  result.tables[0].rows[0][1] = '外部改动返回值';
  assert.equal(JSON.stringify(ledger), snapshot);
});

test('CJK, emoji, pipes, newlines and markup cannot exceed the byte budget or break table rows', () => {
  const ledger = fixture();
  ledger.impressions[1].summary = '🦋🧙🏽‍♀️汉字|<WJWK-settle>\n'.repeat(1000);
  const result = memory.buildMemory(ledger, { budget: 2048 });
  assertTables(result, ledger, 2048);
  assert.doesNotMatch(result.text, /<WJWK-settle>/);
  for (let n = 1; n < 70; n++) {
    const cut = memory.truncateUtf8('🦋汉字🧙🏽‍♀️'.repeat(20), n);
    assert.ok(Buffer.byteLength(cut) <= n);
    assert.equal(cut, Buffer.from(cut).toString('utf8'));
  }
});

test('large histories are bounded, omitted records remain untouched and query finds an older relevant entry', () => {
  const ledger = fixture();
  ledger.impressions = Array.from({ length: 2000 }, (_, n) => ({ id: `i${n}`, world: ledger.world, subject: `对象${n}`, summary: '汉字😀'.repeat(100), evidence: '证据'.repeat(100), pinned: false, createdAt: `date${n}`, source: 'story' }));
  ledger.impressions[10].summary = '秘密地点是夜月祭坛，霜龙守卫。';
  ledger.inventory.push(...Array.from({ length: 800 }, (_, n) => ({ ...ledger.inventory[0], id: `item${n}`, name: `旧道具${n}`, kind: 'equipment' })));
  const before = JSON.stringify(ledger);
  const result = memory.buildMemory(ledger, { budget: 9000, query: '夜月祭坛霜龙' });
  assertTables(result, ledger, 9000);
  assert.match(result.tables[0].rows[0][1], /夜月祭坛/);
  assert.ok(result.omitted > 2700);
  assert.equal(JSON.stringify(ledger), before);
});

test('evaluation context has a strict JSON byte limit, keeps exact selected specifications and no receipts/canonical duplication', () => {
  const ledger = freezeDeep(fixture()), before = JSON.stringify(ledger);
  for (const limit of [1400, 2048, 9000, 14000]) {
    const result = memory.selectEvaluationContext(ledger, '精灵获救 月亮泉', limit);
    assert.ok(Buffer.byteLength(JSON.stringify(result)) <= limit);
    assert.equal(result.summary.balance, ledger.balance);
    assert.equal(result.summary.income, ledger.income);
    assert.equal(result.summary.spend, ledger.spend);
    assert.match(result.summary.note, /所有ID仍完整保存在原生四表/);
    assert.match(result.summary.note, /模型不得自行加扣点；购买必须由插件实际交易成功/);
    assert.doesNotMatch(JSON.stringify(result), /"receipt":|"key":|"raw":/);
    for (const quote of result.selected.quotes) assert.deepEqual(quote.spec, ledger.quotes.find(item => item.id === quote.id).spec);
  }
  const result = memory.selectEvaluationContext(ledger, '', 14000);
  result.selected.quotes[0].spec.content = 'changed returned summary';
  assert.equal(JSON.stringify(ledger), before);
});

test('oversized permanent quote is omitted whole, never emitted as an altered eight-field specification', () => {
  const ledger = fixture();
  ledger.quotes.push({ ...ledger.quotes[0], id: 'huge', name: '霜龙', spec: { ...core.BASELINE_SPEC, content: '霜龙😀'.repeat(10000) } });
  const result = memory.selectEvaluationContext(ledger, '霜龙', 14000);
  assert.ok(result.omitted.quotes >= 1);
  assert.ok(!result.selected.quotes.some(item => item.id === 'huge'));
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 14000);
});

test('old ledger without optional impression or quest arrays stays unchanged', () => {
  const ledger = freezeDeep(core.createLedger('old')), before = JSON.stringify(ledger);
  assertTables(memory.buildMemory(ledger), ledger, 9000);
  assert.deepEqual(memory.selectEvaluationContext(ledger, '').selected.impressions, []);
  assert.equal(JSON.stringify(ledger), before);
});
