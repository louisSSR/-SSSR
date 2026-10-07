import type { Impression, Ledger, OperationResult, Quest } from './core';

/** These operations only append memory or advance tasks; accounting stays in core. */
export class JournalError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'JournalError'; }
}
function fail(code: string, message: string): never { throw new JournalError(code, message); }
function text(value: unknown, label: string, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) fail('INVALID_TEXT', `${label}须为非空文本（最多 ${limit} 字符）`);
  return value.trim();
}
function normalized(value: string): string { return value.normalize('NFC').replace(/\s+/g, ' ').trim(); }
function date(value?: string): string {
  const result = value ?? new Date().toISOString();
  if (typeof result !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) fail('INVALID_DATE', '时间须为有效 UTC ISO 时间');
  return result;
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const impressionKey = (i: Impression) => JSON.stringify([i.id, i.world, i.subject, i.summary, i.evidence, i.source, i.pinned]);
function prepare(ledger: Ledger, at?: string): string {
  // The storage boundary runs core.validateLedger and assertLedgerContinuation.
  // Here we validate the inputs we touch without creating a runtime core cycle.
  if (!ledger || ledger.schemaVersion !== 1 || !Number.isSafeInteger(ledger.revision) || ledger.revision < 0 || !Array.isArray(ledger.events) || !Array.isArray(ledger.transactions) || !Array.isArray(ledger.ripples)) fail('INVALID_LEDGER', '任务需要有效的本源账本');
  for (const key of ['impressions', 'quests'] as const) if (Object.hasOwn(ledger, key) && (!Array.isArray(ledger[key]) || ledger[key]!.length > 100000)) fail('INVALID_JOURNAL', `${key}须为数组（每类最多十万条）`);
  date(ledger.createdAt); date(ledger.updatedAt);
  return date(at);
}
function changed(ledger: Ledger, at: string): Ledger {
  if (at < ledger.updatedAt || at < ledger.createdAt) fail('INVALID_JOURNAL_TIME', '不能在已记录时间之前追加任务或印象');
  const next = clone(ledger); next.revision++;
  if (!Number.isSafeInteger(next.revision)) fail('REVISION_LIMIT', '版本号超出范围');
  next.updatedAt = at; return next;
}
function duplicate<T>(ledger: Ledger, value: T): OperationResult<T> { return { ledger, value: clone(value), duplicate: true }; }
export interface ImpressionInput { id: string; world: string; subject: string; summary: string; evidence: string; source: 'story' | 'user'; pinned?: boolean; at?: string }
export interface QuestInput { id: string; world: string; title: string; objective: string; reason: string; sourceRippleId?: string; at?: string }
export interface QuestTransitionInput { questId: string; status: 'active' | 'completed' | 'dismissed'; completionEventId?: string; at?: string }

export function appendImpression(ledger: Ledger, input: ImpressionInput): OperationResult<Impression> {
  const now = prepare(ledger, input.at);
  if (!['story', 'user'].includes(input.source) || (input.pinned !== undefined && typeof input.pinned !== 'boolean')) fail('INVALID_IMPRESSION', '印象来源或置顶标记无效');
  const value: Impression = { id: text(input.id, '印象 ID', 256), world: normalized(text(input.world, '世界', 512)), subject: normalized(text(input.subject, '印象对象', 512)), summary: text(input.summary, '重要印象', 4000), evidence: text(input.evidence, '印象证据', 8000), source: input.source, pinned: input.pinned ?? false, createdAt: now };
  const old = (ledger.impressions ?? []).find(i => i.id === value.id);
  if (old) {
    if (impressionKey(old) !== impressionKey(value)) fail('IDEMPOTENCY_CONFLICT', '同一印象 ID 不能绑定另一条记录');
    return duplicate(ledger, old);
  }
  if ((ledger.impressions?.length ?? 0) >= 100000) fail('JOURNAL_LIMIT', '重要印象已达到本地历史条数上限');
  const next = changed(ledger, now); (next.impressions ??= []).push(value);
  return { ledger: next, value: clone(value), duplicate: false };
}

/** Canonical equality is textual NFC + whitespace normalization, not inferred equivalence. */
export function canonicalQuestKey(value: Pick<Quest, 'world' | 'title' | 'objective'>): string {
  return JSON.stringify([normalized(text(value.world, '世界', 512)), normalized(text(value.title, '任务标题', 512)), normalized(text(value.objective, '任务目标', 4000))]);
}
export function registerQuest(ledger: Ledger, input: QuestInput): OperationResult<Quest> {
  const now = prepare(ledger, input.at);
  const value: Quest = { id: text(input.id, '任务 ID', 256), world: normalized(text(input.world, '世界', 512)), title: normalized(text(input.title, '任务标题', 512)), objective: normalized(text(input.objective, '任务目标', 4000)), reason: text(input.reason, '任务缘由', 4000), status: 'offered', createdAt: now, updatedAt: now, ...(input.sourceRippleId !== undefined ? { sourceRippleId: text(input.sourceRippleId, '余波 ID', 256) } : {}) };
  const quests = ledger.quests ?? [], oldId = quests.find(q => q.id === value.id);
  if (oldId) {
    if (canonicalQuestKey(oldId) !== canonicalQuestKey(value) || oldId.reason !== value.reason || oldId.sourceRippleId !== value.sourceRippleId) fail('IDEMPOTENCY_CONFLICT', '同一任务 ID 不能改写原有目标或缘由');
    return duplicate(ledger, oldId);
  }
  const oldSpec = quests.find(q => canonicalQuestKey(q) === canonicalQuestKey(value));
  if (oldSpec) return duplicate(ledger, oldSpec);
  if (value.sourceRippleId !== undefined) {
    const ripple = ledger.ripples.find(r => r.id === value.sourceRippleId);
    if (!ripple || normalized(ripple.world) !== value.world) fail('MISSING_QUEST_RIPPLE', '任务须引用同世界的已有余波');
  }
  if (quests.length >= 100000) fail('JOURNAL_LIMIT', '任务已达到本地历史条数上限');
  const next = changed(ledger, now); (next.quests ??= []).push(value);
  return { ledger: next, value: clone(value), duplicate: false };
}

export function transitionQuest(ledger: Ledger, input: QuestTransitionInput): OperationResult<Quest> {
  const now = prepare(ledger, input.at), questId = text(input.questId, '任务 ID', 256);
  if (!['active', 'completed', 'dismissed'].includes(input.status)) fail('INVALID_QUEST_STATUS', '任务目标状态无效');
  const old = (ledger.quests ?? []).find(q => q.id === questId);
  if (!old) fail('MISSING_QUEST', '任务不存在');
  if (input.status !== 'completed' && input.completionEventId !== undefined) fail('INVALID_QUEST_COMPLETION', '只有完成任务才能绑定结算事件');
  if (old.status === input.status) {
    if (old.completionEventId !== input.completionEventId) fail('IDEMPOTENCY_CONFLICT', '已经完成的任务不可更换结算事件');
    return duplicate(ledger, old);
  }
  if (!((old.status === 'offered' && ['active', 'dismissed'].includes(input.status)) || (old.status === 'active' && ['completed', 'dismissed'].includes(input.status)))) fail('INVALID_QUEST_TRANSITION', '任务须先接受；完成或放弃后不能回退或重复完成');
  if (input.status === 'completed') {
    const eventId = text(input.completionEventId, '任务完成事件', 256), event = ledger.events.find(e => e.id === eventId);
    const settlement = event && ledger.transactions.find(t => t.kind === 'credit' && t.id === event.requestId && t.referenceId === event.id && t.amount === event.amount);
    if (!event || !settlement || normalized(event.world) !== normalized(old.world) || event.at <= old.createdAt || event.at > now || settlement.at <= old.createdAt || settlement.at > now) fail('INVALID_QUEST_COMPLETION', '完成任务须绑定派发后、同世界且已经结算的真实事件');
  }
  const next = changed(ledger, now), value = next.quests!.find(q => q.id === questId)!;
  value.status = input.status; value.updatedAt = now;
  if (input.status === 'completed') value.completionEventId = input.completionEventId;
  return { ledger: next, value: clone(value), duplicate: false };
}
