/** The rules in 蝴蝶效应.txt are authoritative. Numeric limits below are implementation limits. */
export const AMOUNT_LIMITS = Object.freeze({ integerDigits: 48, decimalPlaces: 18 });
const SCALE = 10n ** 18n;
const MAX = 10n ** 66n - 1n;
export class LedgerError extends Error { constructor(public code: string, message: string) { super(message); this.name = 'LedgerError'; } }
function fail(code: string, message: string): never { throw new LedgerError(code, message); }
function text(value: unknown, label: string, limit = 20000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) fail('INVALID_TEXT', `${label}须为非空文本（最多 ${limit} 字符）`);
  return (value as string).trim();
}
function id(value: unknown, label = 'ID'): string { return text(value, label, 256); }
function date(value?: string): string {
  const v = value ?? new Date().toISOString();
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) || new Date(v).toISOString() !== v) fail('INVALID_DATE', '时间须为有效 UTC ISO 时间');
  return v;
}
function rawAmount(value: unknown): bigint {
  if (typeof value !== 'string' || !/^\d{1,48}(?:\.\d{1,18})?$/.test(value)) fail('INVALID_AMOUNT', '点数须为非负十进制文本，最多 48 位整数、18 位小数');
  const [whole, fraction = ''] = (value as string).split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(18, '0'));
}
function amountFrom(value: bigint): string {
  if (value < 0n) fail('INSUFFICIENT_BALANCE', '余额不足');
  if (value > MAX) fail('AMOUNT_LIMIT', '金额超出当前实现精度上限');
  const f = (value % SCALE).toString().padStart(18, '0').replace(/0+$/, '');
  return `${value / SCALE}${f ? `.${f}` : ''}`;
}
export function normalizeAmount(value: string): string { return amountFrom(rawAmount(value)); }
export function compareAmounts(a: string, b: string): number { const av = rawAmount(a), bv = rawAmount(b); return av < bv ? -1 : av > bv ? 1 : 0; }
export function subtractAmounts(a: string, b: string): string { return amountFrom(rawAmount(a) - rawAmount(b)); }
export function addAmounts(a: string, b: string): string { return amountFrom(rawAmount(a) + rawAmount(b)); }
/** Uses the same integer quantity and precision rules as purchase. */
export function multiplyAmountByCount(price: string, quantity: number): string { return amountFrom(rawAmount(price) * BigInt(count(quantity))); }
function count(value: unknown, positive = true): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (positive ? 1 : 0)) fail('INVALID_QUANTITY', '数量须为安全范围内的整数');
  return value as number;
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
function exactFields(value: unknown, required: string[], optional: string[] = []): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_SCHEMA', '记录须为普通对象');
  const keys = Object.keys(value);
  if (required.some(k => !keys.includes(k)) || keys.some(k => !required.includes(k) && !optional.includes(k))) fail('INVALID_SCHEMA', '记录字段缺失或包含未知字段');
}
export interface EffectSpec { content: string; strength: string; quantity: string; range: string; duration: string; uses: string; conditions: string; crossWorld: string }
export const EFFECT_FIELDS: (keyof EffectSpec)[] = ['content', 'strength', 'quantity', 'range', 'duration', 'uses', 'conditions', 'crossWorld'];
export function normalizeEffect(spec: EffectSpec): EffectSpec {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec) || Object.keys(spec).some(k => !EFFECT_FIELDS.includes(k as keyof EffectSpec))) fail('INVALID_SPEC', '效果规格须且仅须包含八个字段');
  return Object.fromEntries(EFFECT_FIELDS.map(k => [k, text(spec[k], k).normalize('NFC').replace(/\s+/g, ' ')])) as unknown as EffectSpec;
}
/** Exact normalized specifications, never names/world/packaging, define a quote. No semantic-equivalence claim. */
export function canonicalEffectKey(spec: EffectSpec): string { return JSON.stringify(EFFECT_FIELDS.map(k => normalizeEffect(spec)[k])); }
export function effectDifferences(a: EffectSpec, b: EffectSpec): (keyof EffectSpec)[] {
  const left = normalizeEffect(a), right = normalizeEffect(b); return EFFECT_FIELDS.filter(k => left[k] !== right[k]);
}
export type RewardKind = 'permanent' | 'consumable' | 'equipment';
export interface Quote { id: string; key: string; name: string; category: string; world: string; spec: EffectSpec; price: string; kind: RewardKind; aliases: string[]; createdAt: string; previousQuoteId?: string; differences?: (keyof EffectSpec)[] }
export interface Standard { id: string; key: string; spec: string; reward: string; createdAt: string }
export interface CausalEvent { id: string; requestId: string; world: string; source: string; outcome: string; evidence: string; amount: string; standardId: string; kind: 'initial' | 'deepening' | 'related'; independent: boolean; parentResultId?: string; at: string }
export interface InventoryItem { id: string; purchaseId: string; quoteId: string; name: string; spec: EffectSpec; kind: RewardKind; acquired: number; remaining: number; consumed: number; transferred: number; world: string; at: string }
export interface Ripple { id: string; world: string; source: string; settled: string; tracking: string; status: 'active' | 'resolved'; updatedAt: string }
export interface Transaction { id: string; kind: 'credit' | 'purchase' | 'use' | 'transfer'; amount: string; balanceBefore: string; balanceAfter: string; world: string; at: string; referenceId: string; quantity?: number; recipient?: string; receipt: string }
export interface Impression { id: string; world: string; subject: string; summary: string; evidence: string; source: 'story' | 'user'; pinned: boolean; createdAt: string }
export interface Quest { id: string; world: string; title: string; objective: string; reason: string; sourceRippleId?: string; status: 'offered' | 'active' | 'completed' | 'dismissed'; createdAt: string; updatedAt: string; completionEventId?: string }
export interface Ledger { schemaVersion: 1; accountId: string; label: string; world: string; balance: string; income: string; spend: string; revision: number; createdAt: string; updatedAt: string; events: CausalEvent[]; standards: Standard[]; quotes: Quote[]; transactions: Transaction[]; inventory: InventoryItem[]; ripples: Ripple[]; impressions?: Impression[]; quests?: Quest[]; rippleHistory?: Ripple[] }
export interface OperationResult<T = unknown> { ledger: Ledger; value: T; receipt?: string; duplicate: boolean }
export interface QuoteInput { id: string; name: string; category: string; world: string; spec: EffectSpec; price: string; kind: RewardKind; previousQuoteId?: string; at?: string }
export interface CreditInput { requestId: string; resultId: string; world: string; source: string; outcome: string; evidence: string; amount: string; standardSpec: string; established: boolean; independent?: boolean; kind?: 'initial' | 'deepening' | 'related'; parentResultId?: string; at?: string }
/** Recognizes an exactly repeated fact even when a model invents another ID. Semantic inference stays outside the ledger. */
export function canonicalCausalFactKey(value: Pick<CausalEvent, 'world' | 'source' | 'outcome' | 'evidence'> & { kind?: CausalEvent['kind']; parentResultId?: string }): string {
  const normalize = (s: string, label: string) => text(s, label).normalize('NFC').replace(/\s+/g, ' ');
  return JSON.stringify([normalize(value.world, '世界'), normalize(value.source, '来源'), normalize(value.outcome, '新增结果'), normalize(value.evidence, '成立证据'), value.kind ?? 'initial', value.parentResultId ?? '']);
}
export interface PurchaseInput { requestId: string; quoteId: string; quantity?: number; at?: string }
export interface InventoryInput { requestId: string; inventoryId: string; quantity: number; at?: string }
export const BASELINE_SPEC: Readonly<EffectSpec> = Object.freeze({ content: '固定标准生命的完整肉体、灵魂与相应承载底蕴，保留自身种族、人格、记忆与主观连续性', strength: '健康、完整、未超凡成年人本源模板；模板永恒固定', quantity: '一份基准增量', range: '本人', duration: '永久叠加', uses: '永久生效', conditions: '必要身体、灵魂与能量承接一并适配', crossWorld: '跨世界保持同等真实增量，按环境适配表现' });
export const BASELINE_QUOTE_ID = 'baseline-origin-one-point';
export function createLedger(accountId: string, label = '我的本源', at?: string): Ledger {
  const now = date(at);
  return { schemaVersion: 1, accountId: id(accountId), label: text(label, '本源名称', 256), world: '尚未识别世界', balance: '0', income: '0', spend: '0', revision: 0, createdAt: now, updatedAt: now, events: [], standards: [], quotes: [{ id: BASELINE_QUOTE_ID, key: canonicalEffectKey(BASELINE_SPEC), name: '固定基准本源增益', category: '本源强化', world: '通用', spec: { ...BASELINE_SPEC }, price: '1', kind: 'permanent', aliases: [], createdAt: now }], transactions: [], inventory: [], ripples: [] };
}
function changed(ledger: Ledger, at: string): Ledger { const next = clone(ledger); next.revision++; if (!Number.isSafeInteger(next.revision)) fail('REVISION_LIMIT', '版本号超出范围'); next.updatedAt = at; return next; }
function done<T>(ledger: Ledger, value: T, duplicate = false, receipt?: string): OperationResult<T> { return { ledger, value, duplicate, ...(receipt ? { receipt } : {}) }; }
function kind(value: unknown): RewardKind { if (!['permanent', 'consumable', 'equipment'].includes(value as string)) fail('INVALID_KIND', '未知所得类型'); return value as RewardKind; }
export function registerQuote(ledger: Ledger, input: QuoteInput): OperationResult<Quote> {
  validateLedger(ledger);
  const spec = normalizeEffect(input.spec), key = canonicalEffectKey(spec), price = normalizeAmount(input.price), rewardKind = kind(input.kind);
  if (rawAmount(price) <= 0n) fail('INVALID_PRICE', '商品价格须大于零');
  const name = text(input.name, '商品名称', 512), quoteId = id(input.id), now = date(input.at);
  const existing = ledger.quotes.find(q => q.key === key);
  if (existing) {
    if (existing.price !== price || existing.kind !== rewardKind) fail('FIXED_QUOTE_CONFLICT', '同规格商品必须沿用永久报价与所得类型');
    if (existing.name === name || existing.aliases.includes(name)) return done(ledger, clone(existing), true);
    const next = changed(ledger, now), quote = next.quotes.find(q => q.id === existing.id)!; quote.aliases.push(name); return done(next, quote);
  }
  if (ledger.quotes.some(q => q.id === quoteId)) fail('DUPLICATE_ID', '商品 ID 已绑定另一效果规格');
  let previous: Quote | undefined;
  if (input.previousQuoteId) { previous = ledger.quotes.find(q => q.id === input.previousQuoteId); if (!previous) fail('MISSING_QUOTE', '原规格报价不存在'); }
  const quote: Quote = { id: quoteId, key, name, category: text(input.category, '体系分类', 256), world: text(input.world, '世界', 512), spec, price, kind: rewardKind, aliases: [], createdAt: now, ...(previous ? { previousQuoteId: previous.id, differences: effectDifferences(previous.spec, spec) } : {}) };
  const next = changed(ledger, now); next.quotes.push(quote); return done(next, quote);
}
function escapeReceipt(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }
export function makeSettlementReceipt(input: { gains: string[]; before: string; after: string; income: string; spend: string; standards?: string[]; unlocked?: string[]; next?: string[] }): string {
  return `<WJWK-settle>\n本轮收益：\n${input.gains.map((s, i) => `${i + 1}. ${escapeReceipt(s)}`).join('\n') || '无'}\n状态变化：\n${normalizeAmount(input.before)} → ${normalizeAmount(input.after)}；累计入账 ${normalizeAmount(input.income)}；累计消费 ${normalizeAmount(input.spend)}\n恒量记录：${input.standards?.map(escapeReceipt).join('；') || '沿用已存记录'}\n新增解锁：${input.unlocked?.map(escapeReceipt).join('；') || '无'}\n下一步：${input.next?.map(escapeReceipt).join('；') || '暂无'}\n</WJWK-settle>`;
}
function existingRequest(ledger: Ledger, requestId: string, type: Transaction['kind'], referenceId: string, quantity?: number, recipient?: string): Transaction | undefined {
  const tx = ledger.transactions.find(t => t.id === id(requestId, '请求 ID'));
  if (tx && (tx.kind !== type || tx.referenceId !== referenceId || tx.quantity !== quantity || tx.recipient !== recipient)) fail('IDEMPOTENCY_CONFLICT', '同一请求 ID 不能用于不同交易');
  return tx;
}
export function credit(ledger: Ledger, input: CreditInput): OperationResult<CausalEvent> {
  validateLedger(ledger);
  const resultId = id(input.resultId, '实际结果 ID'), requestId = id(input.requestId, '请求 ID'), amount = normalizeAmount(input.amount);
  const spec = text(input.standardSpec, '计功规格').normalize('NFC').replace(/\s+/g, ' ');
  const retry = existingRequest(ledger, requestId, 'credit', resultId);
  if (retry) {
    const event = ledger.events.find(e => e.id === resultId)!;
    const sameContent = text(input.world, '世界', 512) === event.world && text(input.source, '因果来源') === event.source && text(input.outcome, '新增结果') === event.outcome && text(input.evidence, '成立证据') === event.evidence && (input.independent !== false) === event.independent && (input.kind ?? 'initial') === event.kind && input.parentResultId === event.parentResultId && input.established === true && (input.at === undefined || date(input.at) === event.at);
    if (amount !== event.amount || ledger.standards.find(s => s.id === event.standardId)?.key !== spec || !sameContent) fail('IDEMPOTENCY_CONFLICT', '同一请求重试的事实、点数或计功参照与原记录不同');
    return done(ledger, clone(event), true, retry.receipt);
  }
  if (input.established !== true) fail('NOT_ESTABLISHED', '仅已实际成立的新增改变可以入账');
  const old = ledger.events.find(e => e.id === resultId);
  if (old) { if (old.amount !== amount || ledger.standards.find(s => s.id === old.standardId)?.key !== spec) fail('RESULT_CONFLICT', '旧结果已结算；新增深化必须使用新的实际结果 ID'); return done(ledger, clone(old), true, ledger.transactions.find(t => t.id === old.requestId)!.receipt); }
  const factKey = canonicalCausalFactKey(input), sameFact = ledger.events.find(e => canonicalCausalFactKey(e) === factKey);
  if (sameFact) {
    if (sameFact.amount !== amount || ledger.standards.find(s => s.id === sameFact.standardId)?.key !== spec) fail('FACT_CONFLICT', '同一已结算事实不能更换 ID 后改写点数或计功参照');
    return done(ledger, clone(sameFact), true, ledger.transactions.find(t => t.id === sameFact.requestId)!.receipt);
  }
  const independent = input.independent !== false, eventKind = input.kind ?? 'initial';
  if (rawAmount(amount) <= 0n || (independent && rawAmount(amount) < SCALE)) fail('MINIMUM_CREDIT', '独立有效改变至少 1 点；已累计的增量须大于零');
  if (!['initial', 'deepening', 'related'].includes(eventKind)) fail('INVALID_EVENT_KIND', '未知计功类型');
  if (eventKind !== 'initial' && (!input.parentResultId || !ledger.events.some(e => e.id === input.parentResultId))) fail('MISSING_PARENT', '深化或后续事件须引用已结算的来源结果');
  if (eventKind === 'initial' && input.parentResultId) fail('INVALID_PARENT', '首次作用不应带后续事件父级');
  const now = date(input.at);
  const existing = ledger.standards.find(s => s.key === spec);
  if (existing && existing.reward !== amount) fail('FIXED_STANDARD_CONFLICT', '同等影响规格须沿用固定计功点数');
  const next = changed(ledger, now);
  const standard = existing ?? { id: `standard:${resultId}`, key: spec, spec, reward: amount, createdAt: now };
  if (!existing) next.standards.push(standard);
  const event: CausalEvent = { id: resultId, requestId, world: text(input.world, '世界', 512), source: text(input.source, '因果来源'), outcome: text(input.outcome, '新增结果'), evidence: text(input.evidence, '成立证据'), amount, standardId: standard.id, independent, kind: eventKind, ...(input.parentResultId ? { parentResultId: input.parentResultId } : {}), at: now };
  next.events.push(event); next.balance = addAmounts(ledger.balance, amount); next.income = addAmounts(ledger.income, amount);
  const receipt = makeSettlementReceipt({ gains: [`${event.source}；${event.outcome} -- 新增因果点 +${amount}；已入账`], before: ledger.balance, after: next.balance, income: next.income, spend: next.spend, standards: [`${spec}：固定收益 ${amount}`] });
  next.transactions.push({ id: requestId, kind: 'credit', referenceId: resultId, amount, balanceBefore: ledger.balance, balanceAfter: next.balance, world: event.world, at: now, receipt });
  return done(next, event, false, receipt);
}
export function purchase(ledger: Ledger, input: PurchaseInput): OperationResult<InventoryItem> {
  validateLedger(ledger);
  const quantity = count(input.quantity ?? 1), requestId = id(input.requestId), quoteId = id(input.quoteId);
  const retry = existingRequest(ledger, requestId, 'purchase', quoteId, quantity);
  if (retry) return done(ledger, clone(ledger.inventory.find(i => i.purchaseId === requestId)!), true, retry.receipt);
  const quote = ledger.quotes.find(q => q.id === quoteId); if (!quote) fail('MISSING_QUOTE', '已确认报价不存在');
  const cost = multiplyAmountByCount(quote.price, quantity);
  if (compareAmounts(ledger.balance, cost) < 0) fail('INSUFFICIENT_BALANCE', `余额不足，还差 ${subtractAmounts(cost, ledger.balance)} 因果点`);
  const now = date(input.at), next = changed(ledger, now); next.balance = subtractAmounts(ledger.balance, cost); next.spend = addAmounts(ledger.spend, cost);
  const item: InventoryItem = { id: `inventory:${requestId}`, purchaseId: requestId, quoteId, name: quote.name, spec: clone(quote.spec), kind: quote.kind, acquired: quantity, remaining: quantity, consumed: 0, transferred: 0, world: ledger.world, at: now };
  next.inventory.push(item);
  const fullSpec = EFFECT_FIELDS.map(k => `${k}=${quote.spec[k]}`).join('；');
  const receipt = makeSettlementReceipt({ gains: [`兑换 ${quote.name} × ${quantity} -- 消耗 ${cost} 点；完整到账：${fullSpec}`], before: ledger.balance, after: next.balance, income: next.income, spend: next.spend, standards: [`${quote.name}：每份固定价格 ${quote.price}`], unlocked: [`${quote.name} × ${quantity}（含规格内全部掌握及适配）`] });
  next.transactions.push({ id: requestId, kind: 'purchase', referenceId: quoteId, quantity, amount: cost, balanceBefore: ledger.balance, balanceAfter: next.balance, world: ledger.world, at: now, receipt });
  return done(next, item, false, receipt);
}
function inventoryOperation(ledger: Ledger, input: InventoryInput, operation: 'use' | 'transfer', recipient?: string): OperationResult<InventoryItem> {
  validateLedger(ledger); const quantity = count(input.quantity), requestId = id(input.requestId), itemId = id(input.inventoryId);
  const retry = existingRequest(ledger, requestId, operation, itemId, quantity, recipient);
  if (retry) return done(ledger, clone(ledger.inventory.find(i => i.id === itemId)!), true, retry.receipt);
  const item = ledger.inventory.find(i => i.id === itemId); if (!item) fail('MISSING_ITEM', '所得不存在');
  if (operation === 'use' && item.kind !== 'consumable') fail('PERMANENT_ITEM', '永久能力或装备不会因使用而被删除');
  if (operation === 'transfer' && item.kind === 'permanent') fail('PERMANENT_ITEM', '本源强化或永久能力不能作为可移交物品转走');
  if (item.remaining < quantity) fail('INSUFFICIENT_INVENTORY', '可用数量不足');
  const now = date(input.at), next = changed(ledger, now), updated = next.inventory.find(i => i.id === itemId)!;
  updated.remaining -= quantity; updated[operation === 'use' ? 'consumed' : 'transferred'] += quantity;
  const receipt = makeSettlementReceipt({ gains: [`${operation === 'use' ? '实际使用' : `移交给 ${recipient}`} ${item.name} × ${quantity}；余量 ${updated.remaining}；不重复扣点`], before: ledger.balance, after: ledger.balance, income: ledger.income, spend: ledger.spend });
  next.transactions.push({ id: requestId, kind: operation, referenceId: itemId, quantity, ...(recipient ? { recipient } : {}), amount: '0', balanceBefore: ledger.balance, balanceAfter: ledger.balance, world: ledger.world, at: now, receipt });
  return done(next, updated, false, receipt);
}
export function useInventory(ledger: Ledger, input: InventoryInput): OperationResult<InventoryItem> { return inventoryOperation(ledger, input, 'use'); }
export function transferInventory(ledger: Ledger, input: InventoryInput & { recipient: string }): OperationResult<InventoryItem> { return inventoryOperation(ledger, input, 'transfer', text(input.recipient, '实际接收者', 512)); }
export function setWorld(ledger: Ledger, world: string, at?: string): OperationResult<string> {
  validateLedger(ledger); const value = text(world, '世界', 512); if (ledger.world === value) return done(ledger, value, true); const next = changed(ledger, date(at)); next.world = value; return done(next, value);
}
export function upsertRipple(ledger: Ledger, input: Omit<Ripple, 'updatedAt'> & { at?: string }): OperationResult<Ripple> {
  validateLedger(ledger);
  const now = date(input.at), ripple: Ripple = { id: id(input.id), world: text(input.world, '世界', 512), source: text(input.source, '余波来源'), settled: text(input.settled, '已结算作用'), tracking: text(input.tracking, '后续追踪'), status: input.status, updatedAt: now };
  if (!['active', 'resolved'].includes(ripple.status)) fail('INVALID_STATUS', '未知余波状态');
  const previous = ledger.ripples.find(r => r.id === ripple.id);
  if (previous && rippleBusinessKey(previous) === rippleBusinessKey(ripple)) return done(ledger, clone(previous), true);
  if (previous && now < previous.updatedAt) fail('INVALID_RIPPLE_TIME', '连锁反应更新不能早于当前记录时间');
  if (previous && (ledger.rippleHistory?.length ?? 0) >= 100000) fail('RIPPLE_HISTORY_LIMIT', '连锁反应历史已达十万条上限；本次更新未提交，旧历史保留');
  const next = changed(ledger, now), index = next.ripples.findIndex(r => r.id === ripple.id);
  if (index < 0) next.ripples.push(ripple);
  else { (next.rippleHistory ??= []).push(clone(previous!)); next.ripples[index] = ripple; }
  return done(next, ripple);
}
function rippleBusinessKey(r: Ripple): string { return JSON.stringify([r.id, r.world, r.source, r.settled, r.tracking, r.status]); }
function validateRipple(r: Ripple): void {
  exactFields(r, ['id', 'world', 'source', 'settled', 'tracking', 'status', 'updatedAt']);
  id(r.id); text(r.world, '世界', 512); text(r.source, '余波来源'); text(r.settled, '追踪已结算作用'); text(r.tracking, '后续追踪'); date(r.updatedAt);
  if (!['active', 'resolved'].includes(r.status)) fail('INVALID_RIPPLE', '余波状态无效');
}
function validateRippleHistory(l: Ledger): void {
  if (Object.hasOwn(l, 'rippleHistory') && (!Array.isArray(l.rippleHistory) || l.rippleHistory.length > 100000)) fail('INVALID_RIPPLE_HISTORY', '连锁反应历史须为数组（最多十万条）');
  const lastById = new Map<string, Ripple>(), currentById = new Map(l.ripples.map(r => [r.id, r]));
  const checkNext = (previous: Ripple, next: Ripple) => {
    if (rippleBusinessKey(previous) === rippleBusinessKey(next) || next.updatedAt < previous.updatedAt) fail('INVALID_RIPPLE_HISTORY', '连锁反应历史须记录有效变化，时间不可回退');
  };
  for (const archived of l.rippleHistory ?? []) {
    validateRipple(archived);
    if (!currentById.has(archived.id)) fail('INVALID_RIPPLE_HISTORY', '连锁反应历史缺少对应当前记录');
    const previous = lastById.get(archived.id); if (previous) checkNext(previous, archived);
    lastById.set(archived.id, archived);
  }
  for (const [rippleId, previous] of lastById) checkNext(previous, currentById.get(rippleId)!);
}
function unique<T>(rows: T[], key: (v: T) => string, label: string): void { const keys = rows.map(key); if (new Set(keys).size !== keys.length) fail('DUPLICATE_ID', `${label}存在重复 ID 或规格`); }
function canonicalMoney(value: string): void { if (normalizeAmount(value) !== value) fail('INVALID_AMOUNT', '保存的点数必须采用规范十进制格式'); }
/** Full accounting replay; imported balances are never accepted as authority. */
export function validateLedger(value: unknown): asserts value is Ledger {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_LEDGER', '账本格式无效');
  const l = value as Ledger;
  exactFields(l, ['schemaVersion', 'accountId', 'label', 'world', 'balance', 'income', 'spend', 'revision', 'createdAt', 'updatedAt', 'events', 'standards', 'quotes', 'transactions', 'inventory', 'ripples'], ['impressions', 'quests', 'rippleHistory']);
  if (l.schemaVersion !== 1) fail('SCHEMA_VERSION', '不支持的账本版本');
  id(l.accountId); text(l.label, '本源名称', 256); text(l.world, '世界', 512); date(l.createdAt); date(l.updatedAt); count(l.revision, false);
  [l.balance, l.income, l.spend].forEach(canonicalMoney);
  for (const key of ['events', 'standards', 'quotes', 'transactions', 'inventory', 'ripples'] as const) if (!Array.isArray(l[key]) || l[key].length > 100000) fail('INVALID_LEDGER', `${key}须为数组（每类最多十万条）`);
  unique(l.events, e => id(e.id), '因果结果'); unique(l.standards, s => id(s.id), '计功参照'); unique(l.standards, s => s.key, '计功规格'); unique(l.quotes, q => id(q.id), '商品'); unique(l.quotes, q => q.key, '商品规格'); unique(l.transactions, t => id(t.id), '交易请求'); unique(l.inventory, i => id(i.id), '所得'); unique(l.inventory, i => id(i.purchaseId), '购买回执'); unique(l.ripples, r => id(r.id), '余波');
  unique(l.events, canonicalCausalFactKey, '已结算因果事实');
  const baseline = l.quotes.find(q => q.id === BASELINE_QUOTE_ID);
  if (!baseline || baseline.key !== canonicalEffectKey(BASELINE_SPEC) || baseline.price !== '1' || baseline.kind !== 'permanent') fail('BASELINE_CHANGED', '固定 1 点本源增益不得删改');
  for (const q of l.quotes) {
    exactFields(q, ['id', 'key', 'name', 'category', 'world', 'spec', 'price', 'kind', 'aliases', 'createdAt'], ['previousQuoteId', 'differences']);
    if (canonicalEffectKey(q.spec) !== q.key || !equal(normalizeEffect(q.spec), q.spec)) fail('INVALID_SPEC', '商品规格与规范键不一致');
    text(q.name, '商品名称', 512); text(q.category, '体系分类', 256); text(q.world, '世界', 512); kind(q.kind); date(q.createdAt); canonicalMoney(q.price); if (rawAmount(q.price) <= 0n) fail('INVALID_PRICE', '价格须大于零');
    if (!Array.isArray(q.aliases)) fail('INVALID_QUOTE', '商品别名须为数组'); q.aliases.forEach(a => text(a, '别名', 512));
    if (q.previousQuoteId) { const previous = l.quotes.find(p => p.id === q.previousQuoteId); if (!previous || previous.id === q.id || !equal(q.differences, effectDifferences(previous.spec, q.spec))) fail('INVALID_DIFFERENCES', '升级规格须明确列出实际差异'); }
    else if (q.differences !== undefined) fail('INVALID_DIFFERENCES', '规格差异须绑定原报价');
  }
  for (const s of l.standards) { exactFields(s, ['id', 'key', 'spec', 'reward', 'createdAt']); text(s.spec, '计功规格'); if (s.spec.normalize('NFC').replace(/\s+/g, ' ') !== s.key) fail('INVALID_STANDARD', '计功规格键不一致'); canonicalMoney(s.reward); if (rawAmount(s.reward) <= 0n) fail('INVALID_STANDARD', '计功须为正数'); date(s.createdAt); }
  const seenEvents = new Set<string>();
  for (const e of l.events) {
    exactFields(e, ['id', 'requestId', 'world', 'source', 'outcome', 'evidence', 'amount', 'standardId', 'kind', 'independent', 'at'], ['parentResultId']);
    id(e.requestId); text(e.world, '世界', 512); text(e.source, '来源'); text(e.outcome, '结果'); text(e.evidence, '成立证据'); date(e.at); canonicalMoney(e.amount);
    if (typeof e.independent !== 'boolean' || rawAmount(e.amount) <= 0n || (e.independent && rawAmount(e.amount) < SCALE)) fail('INVALID_EVENT', '计功低于有效改变下限');
    const standard = l.standards.find(s => s.id === e.standardId); if (!standard || standard.reward !== e.amount) fail('INVALID_STANDARD', '计功与永久参照不一致');
    if (!['initial', 'deepening', 'related'].includes(e.kind) || (e.kind !== 'initial' && (!e.parentResultId || !seenEvents.has(e.parentResultId))) || (e.kind === 'initial' && e.parentResultId)) fail('INVALID_PARENT', '事件来源链不成立');
    seenEvents.add(e.id);
  }
  let balance = '0', income = '0', spend = '0'; const credited = new Set<string>(), purchased = new Set<string>();
  const balances = new Map<string, { acquired: number; remaining: number; consumed: number; transferred: number }>();
  for (const t of l.transactions) {
    exactFields(t, ['id', 'kind', 'amount', 'balanceBefore', 'balanceAfter', 'world', 'at', 'referenceId', 'receipt'], ['quantity', 'recipient']);
    text(t.world, '世界', 512); date(t.at); id(t.referenceId); text(t.receipt, '结算回执', 250000); [t.amount, t.balanceBefore, t.balanceAfter].forEach(canonicalMoney);
    if (balance !== t.balanceBefore) fail('BROKEN_HISTORY', '交易余额链断裂');
    if (t.kind === 'credit') {
      const e = l.events.find(e => e.id === t.referenceId);
      if (!e || e.requestId !== t.id || e.amount !== t.amount || credited.has(e.id) || t.quantity !== undefined || t.recipient !== undefined) fail('BROKEN_HISTORY', '计功交易无对应唯一事件');
      credited.add(e.id); balance = addAmounts(balance, t.amount); income = addAmounts(income, t.amount);
    } else if (t.kind === 'purchase') {
      const q = l.quotes.find(q => q.id === t.referenceId), i = l.inventory.find(i => i.purchaseId === t.id); const qty = count(t.quantity);
      if (!q || !i || i.quoteId !== q.id || i.kind !== q.kind || !equal(i.spec, q.spec) || i.acquired !== qty || t.amount !== amountFrom(rawAmount(q.price) * BigInt(qty)) || t.recipient !== undefined) fail('BROKEN_HISTORY', '购买/报价/完整所得不一致');
      purchased.add(i.id); balances.set(i.id, { acquired: qty, remaining: qty, consumed: 0, transferred: 0 }); balance = subtractAmounts(balance, t.amount); spend = addAmounts(spend, t.amount);
    } else if (t.kind === 'use' || t.kind === 'transfer') {
      const qty = count(t.quantity), current = balances.get(t.referenceId), item = l.inventory.find(i => i.id === t.referenceId);
      if (!current || !item || current.remaining < qty || t.amount !== '0' || (t.kind === 'use' && (item.kind !== 'consumable' || t.recipient !== undefined)) || (t.kind === 'transfer' && item.kind === 'permanent')) fail('BROKEN_HISTORY', '资产使用或移交链无效');
      if (t.kind === 'transfer') text(t.recipient, '接收者', 512);
      current.remaining -= qty; current[t.kind === 'use' ? 'consumed' : 'transferred'] += qty;
    } else fail('INVALID_TRANSACTION', '未知交易类型');
    if (balance !== t.balanceAfter) fail('BROKEN_HISTORY', '交易后余额不一致');
  }
  if (credited.size !== l.events.length || purchased.size !== l.inventory.length || l.balance !== balance || l.income !== income || l.spend !== spend) fail('BROKEN_HISTORY', '汇总余额/累计账或明细不一致');
  for (const i of l.inventory) { exactFields(i, ['id', 'purchaseId', 'quoteId', 'name', 'spec', 'kind', 'acquired', 'remaining', 'consumed', 'transferred', 'world', 'at']); id(i.purchaseId); id(i.quoteId); text(i.name, '所得名称', 512); text(i.world, '世界', 512); date(i.at); const expected = balances.get(i.id)!; for (const k of ['acquired', 'remaining', 'consumed', 'transferred'] as const) if (count(i[k], false) !== expected[k]) fail('BROKEN_INVENTORY', '资产数量与交易记录不一致'); }
  l.ripples.forEach(validateRipple); validateRippleHistory(l);
  validateJournalFields(l);
}
function normalizedJournalText(value: string): string { return value.normalize('NFC').replace(/\s+/g, ' ').trim(); }
function questKey(q: Quest): string { return JSON.stringify([q.world, q.title, q.objective].map(normalizedJournalText)); }
function validateJournalFields(l: Ledger): void {
  for (const field of ['impressions', 'quests'] as const) if (Object.hasOwn(l, field) && (!Array.isArray(l[field]) || l[field]!.length > 100000)) fail('INVALID_JOURNAL', `${field}须为数组（每类最多十万条）`);
  const impressions = l.impressions ?? [], quests = l.quests ?? [];
  unique(impressions, i => id(i.id), '重要印象'); unique(quests, q => id(q.id), '任务');
  for (const i of impressions) {
    exactFields(i, ['id', 'world', 'subject', 'summary', 'evidence', 'source', 'pinned', 'createdAt']);
    text(i.world, '印象世界', 512); text(i.subject, '印象对象', 512); text(i.summary, '重要印象', 4000); text(i.evidence, '印象证据', 8000); date(i.createdAt);
    if (!['story', 'user'].includes(i.source) || typeof i.pinned !== 'boolean') fail('INVALID_IMPRESSION', '印象来源或置顶标记无效');
    if (i.createdAt < l.createdAt || i.createdAt > l.updatedAt) fail('INVALID_JOURNAL_TIME', '印象时间超出账本记录范围');
  }
  for (const q of quests) {
    exactFields(q, ['id', 'world', 'title', 'objective', 'reason', 'status', 'createdAt', 'updatedAt'], ['sourceRippleId', 'completionEventId']);
    text(q.world, '任务世界', 512); text(q.title, '任务标题', 512); text(q.objective, '任务目标', 4000); text(q.reason, '任务缘由', 4000); date(q.createdAt); date(q.updatedAt);
    if (!['offered', 'active', 'completed', 'dismissed'].includes(q.status)) fail('INVALID_QUEST_STATUS', '任务状态无效');
    if (q.createdAt < l.createdAt || q.updatedAt < q.createdAt || q.updatedAt > l.updatedAt) fail('INVALID_JOURNAL_TIME', '任务时间超出账本记录范围');
    if (q.status === 'offered' && q.updatedAt !== q.createdAt) fail('INVALID_JOURNAL_TIME', '未接受任务的派发时间不可改写');
    if (q.sourceRippleId !== undefined) { id(q.sourceRippleId); const ripple = l.ripples.find(r => r.id === q.sourceRippleId); if (!ripple || normalizedJournalText(ripple.world) !== normalizedJournalText(q.world)) fail('MISSING_QUEST_RIPPLE', '任务须引用同世界的已有余波'); }
    if (q.status === 'completed') {
      id(q.completionEventId, '任务完成事件'); const event = l.events.find(e => e.id === q.completionEventId);
      const settlement = event && l.transactions.find(t => t.kind === 'credit' && t.id === event.requestId && t.referenceId === event.id && t.amount === event.amount);
      if (!event || !settlement || normalizedJournalText(event.world) !== normalizedJournalText(q.world) || event.at <= q.createdAt || event.at > q.updatedAt || settlement.at <= q.createdAt || settlement.at > q.updatedAt) fail('INVALID_QUEST_COMPLETION', '完成任务须绑定派发后、同世界且已经结算的真实事件');
    } else if (q.completionEventId !== undefined) fail('INVALID_QUEST_COMPLETION', '未完成任务不能绑定完成事件');
  }
  unique(quests, questKey, '规范任务');
}
/** Storage callbacks may append, but cannot erase or rewrite confirmed monetary/effect history. */
export function assertLedgerContinuation(before: Ledger, after: Ledger): void {
  validateLedger(before); validateLedger(after);
  if (before.accountId !== after.accountId || before.createdAt !== after.createdAt || after.revision < before.revision) fail('HISTORY_REWRITE', '不能替换本源身份或回滚版本');
  for (const field of ['events', 'standards', 'transactions'] as const) if (!equal(before[field], after[field].slice(0, before[field].length))) fail('HISTORY_REWRITE', '已确认的计功、标准与交易不得改写');
  for (const quote of before.quotes) { const current = after.quotes.find(q => q.id === quote.id); if (!current || !equal({ ...quote, aliases: [] }, { ...current, aliases: [] }) || !quote.aliases.every(a => current.aliases.includes(a))) fail('HISTORY_REWRITE', '已定效果报价不得改写'); }
  for (const item of before.inventory) { const current = after.inventory.find(i => i.id === item.id); if (!current || !equal({ ...item, remaining: 0, consumed: 0, transferred: 0 }, { ...current, remaining: 0, consumed: 0, transferred: 0 })) fail('HISTORY_REWRITE', '既有所得规格与来源不得改写'); }
  const oldRippleHistory = before.rippleHistory ?? [], rippleHistory = after.rippleHistory ?? [];
  if (!equal(oldRippleHistory, rippleHistory.slice(0, oldRippleHistory.length))) fail('HISTORY_REWRITE', '连锁反应历史只可追加，不可删改或重排');
  const firstArchivedById = new Map<string, Ripple>(), currentRipplesById = new Map(after.ripples.map(r => [r.id, r]));
  for (const archived of rippleHistory.slice(oldRippleHistory.length)) if (!firstArchivedById.has(archived.id)) firstArchivedById.set(archived.id, archived);
  for (const previous of before.ripples) {
    const current = currentRipplesById.get(previous.id), firstArchived = firstArchivedById.get(previous.id);
    if (!current) fail('HISTORY_REWRITE', '既有连锁反应不可删除；结束时应标记为已解决');
    if (firstArchived ? !equal(firstArchived, previous) : !equal(current, previous)) fail('HISTORY_REWRITE', '更新连锁反应前必须先保留精确旧版本');
  }
  const oldImpressions = before.impressions ?? [], impressions = after.impressions ?? [];
  if (!equal(oldImpressions, impressions.slice(0, oldImpressions.length))) fail('HISTORY_REWRITE', '重要印象历史只可追加，不能删除、改写或重排');
  if (impressions.slice(oldImpressions.length).some(i => i.createdAt < before.updatedAt)) fail('HISTORY_REWRITE', '不可回填早于已记录版本的重要印象');
  const oldQuests = before.quests ?? [], quests = after.quests ?? [];
  if (quests.slice(oldQuests.length).some(q => q.status !== 'offered' || q.createdAt < before.updatedAt)) fail('INVALID_QUEST_TRANSITION', '新增任务须以本次派发的待接受状态入账');
  for (let i = 0; i < oldQuests.length; i++) {
    const previous = oldQuests[i], current = quests[i];
    const specification = (q: Quest) => { const { status: _status, updatedAt: _updatedAt, completionEventId: _event, ...spec } = q; return spec; };
    if (!current || !equal(specification(previous), specification(current))) fail('HISTORY_REWRITE', '已派发任务的规格、来源与历史顺序不可改写');
    if (previous.status === current.status) { if (!equal(previous, current)) fail('HISTORY_REWRITE', '同状态任务不可改写时间或完成事件'); }
    else if (!((previous.status === 'offered' && ['active', 'dismissed'].includes(current.status)) || (previous.status === 'active' && ['completed', 'dismissed'].includes(current.status))) || current.updatedAt < previous.updatedAt) fail('INVALID_QUEST_TRANSITION', '任务状态不可回退、跳过接受或重复完成');
  }
  if (!equal(before, after) && after.revision <= before.revision) fail('REVISION_CONFLICT', '变更须推进账本版本');
}
