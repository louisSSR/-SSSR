import { addAmounts, subtractAmounts, validateLedger, LedgerError, EFFECT_FIELDS, type EffectSpec, type Ledger } from './core';
import type { ChatSheets, DatabaseSheet } from './database';

/** Storage version is separate from the business Ledger.schemaVersion. */
export const NATIVE_STORAGE_VERSION = 2;
export const NATIVE_OWNERSHIP = '白·蝴蝶四表业务真源 v2';
export interface NativeScope { origin: string; handle: string; chat: string; epoch: number | string }
export type NativeTableKey = 'sheet_shiro_memory_1' | 'sheet_shiro_memory_2' | 'sheet_shiro_memory_3' | 'sheet_shiro_memory_4';
export type NativeRow = Record<string, string>;
export type NativeRows = Record<NativeTableKey, NativeRow[]>;
interface Column { sql: string; label: string }
const c = (sql: string, label: string): Column => ({ sql, label });
const common = [c('record_id', '记录ID'), c('account_id', '本源账户'), c('record_kind', '记录种类'), c('record_order', '稳定序号'), c('business_id', '业务ID'), c('commit_revision', '提交版本'), c('previous_revision', '此前版本'), c('committed_at', '提交时间'), c('audit_changes', '提交记录ID清单')];
const effect = EFFECT_FIELDS.map(field => c(`effect_${field === 'crossWorld' ? 'cross_world' : field}`, ({ content: '完整所得', strength: '实际强度', quantity: '数量规格', range: '作用范围', duration: '持续时间', uses: '使用次数', conditions: '承接条件', crossWorld: '跨界效力' })[field]));
export const NATIVE_FOUR_TABLES = [
  { key: 'sheet_shiro_memory_1', sqlName: 'shiro_memory_1', name: '蝴蝶·一、重要印象', kinds: ['impression'], columns: [...common, c('world', '所属世界'), c('subject', '印象对象'), c('summary', '重要印象'), c('evidence', '成立证据'), c('source', '印象来源'), c('pinned', '优先保留'), c('created_at', '记录时间')] },
  { key: 'sheet_shiro_memory_2', sqlName: 'shiro_memory_2', name: '蝴蝶·二、点数账目', kinds: ['account', 'transaction', 'event', 'standard'], columns: [...common, c('schema_version', '存储版本'), c('account_label', '账户称呼'), c('current_world', '当前世界'), c('ledger_revision', '账本版本'), c('created_at', '建立时间'), c('updated_at', '最后更新'), c('optional_fields', '可选历史字段'), c('scope_origin', '所属源站'), c('scope_handle', '酒馆用户'), c('scope_chat', '所属聊天'), c('world', '所属世界'), c('transaction_kind', '交易种类'), c('amount', '因果点金额'), c('balance_before', '交易前余额'), c('balance_after', '交易后余额'), c('reference_id', '关联记录ID'), c('quantity', '物品数量'), c('recipient', '接收者'), c('receipt', '完整回执'), c('occurred_at', '发生时间'), c('request_id', '计功请求ID'), c('source', '因果来源'), c('outcome', '新增结果'), c('evidence', '成立证据'), c('standard_id', '计功参照ID'), c('event_kind', '计功种类'), c('independent_change', '独立有效改变'), c('parent_result_id', '关联结果ID'), c('spec_key', '规格键'), c('standard_spec', '固定影响规格'), c('reward', '固定收益')] },
  { key: 'sheet_shiro_memory_3', sqlName: 'shiro_memory_3', name: '蝴蝶·三、消费与所得', kinds: ['quote', 'inventory'], columns: [...common, c('world', '所属世界'), c('name', '名称'), c('category', '体系分类'), c('spec_key', '规格键'), ...effect, c('price', '固定价格'), c('reward_kind', '存续类别'), c('aliases_json', '别名'), c('previous_quote_id', '旧版报价ID'), c('differences_json', '新增规格'), c('created_at', '确认或取得时间'), c('purchase_id', '购买交易ID'), c('quote_id', '报价ID'), c('acquired', '取得数量'), c('remaining', '剩余数量'), c('consumed', '已用数量'), c('transferred', '已移交数量')] },
  { key: 'sheet_shiro_memory_4', sqlName: 'shiro_memory_4', name: '蝴蝶·四、连锁反应与任务', kinds: ['ripple', 'ripple-history', 'quest'], columns: [...common, c('world', '所属世界'), c('source', '作用来源'), c('settled', '已结算作用'), c('tracking', '后续追踪'), c('status', '记录状态'), c('updated_at', '最后更新'), c('title', '任务标题'), c('objective', '任务目标'), c('reason', '任务缘由'), c('source_ripple_id', '来源余波ID'), c('created_at', '任务派发时间'), c('completion_event_id', '完成结算事件ID')] },
] as const;

export function nativeRecordId(accountId: string, kind: string, businessId: string): string { return `shiro-native:v2:${encodeURIComponent(accountId)}:${kind}:${encodeURIComponent(businessId)}`; }
export function nativeDDL(table: (typeof NATIVE_FOUR_TABLES)[number]): string {
  return `CREATE TABLE ${table.sqlName} ( -- ${table.name}\n  row_id INTEGER PRIMARY KEY, -- 原生行号，不是业务ID\n${table.columns.map((column, index) => `  ${column.sql} TEXT NOT NULL${column.sql === 'record_id' ? ' UNIQUE' : " DEFAULT ''"}${index < table.columns.length - 1 ? ',' : ''} -- ${column.label}`).join('\n')}\n);`;
}
/** Empty installation artifact only. No runtime method imports or replaces all chat sheets. */
export function createNativeFourTableTemplate(): ChatSheets {
  const out: ChatSheets = { mate: { type: 'chatSheets', version: 1, updateConfigUiSentinel: -1, globalInjectionConfig: { readableEntryPlacement: { position: 'before_char', depth: 2, order: 99981 }, wrapperPlacement: { position: 'before_char', depth: 2, order: 99980 } } } };
  NATIVE_FOUR_TABLES.forEach((table, index) => {
    const placement = (order: number) => ({ position: 'at_depth_as_system', depth: 2, order });
    out[table.key] = { uid: table.key, name: table.name, orderNo: index, content: [['row_id', ...table.columns.map(column => column.label)]],
      sourceData: { note: `${NATIVE_OWNERSHIP}。可读业务列就是账本真源；嵌套数组仅保存在对应JSON列。所有金额为精确十进制TEXT，余额、累计入账与消费由交易顺序推导，不另设可编辑余额。交易、计功、固定标准和已结算历史不得改写；报价只可追加别名。业务主键为记录ID，row_id由数据库维护。请勿打开世界书注入或自动填表。`, initNode: '保持空表，等待商店在当前聊天创建或显式恢复唯一一份本源。', insertNode: '仅由商店通过公开SQL批次提交；不要自动填表，不要编造事实或点数。', updateNode: '可读业务列为真源；修改后必须通过完整业务校验。禁止自动填表或自由修改余额、已结算交易、报价和历史。', deleteNode: '历史与提交审计只可追加，不删除原有业务记录。', ddl: nativeDDL(table) },
      updateConfig: { uiSentinel: -1, contextDepth: -1, updateFrequency: 0, batchSize: -1, skipFloors: -1 },
      exportConfig: { enabled: false, splitByRow: false, entryName: table.name, entryType: 'constant', keywords: '', preventRecursion: true, injectionTemplate: '', extraIndexEnabled: false, extraIndexEntryName: `${table.name}·索引`, extraIndexColumns: [], extraIndexColumnModes: {}, extraIndexInjectionTemplate: '', entryPlacement: placement(10000 + index), extraIndexPlacement: placement(10010 + index), fixedEntryPlacement: placement(99990), fixedIndexPlacement: placement(99991), injectIntoWorldbook: false },
    };
  });
  return out;
}

function blank(table: (typeof NATIVE_FOUR_TABLES)[number], accountId: string, kind: string, businessId: string, ordinal: number, values: Record<string, unknown>): NativeRow {
  const row: NativeRow = Object.fromEntries(table.columns.map(column => [column.sql, '']));
  Object.assign(row, { record_id: nativeRecordId(accountId, kind, businessId), account_id: accountId, record_kind: kind, record_order: String(ordinal), business_id: businessId });
  for (const [key, value] of Object.entries(values)) {
    if (!(key in row)) throw new LedgerError('NATIVE_SCHEMA', `原生映射包含未知列 ${key}`);
    row[key] = value === undefined ? '' : String(value);
  }
  return row;
}
function specColumns(spec: EffectSpec): Record<string, string> { return Object.fromEntries(EFFECT_FIELDS.map(key => [`effect_${key === 'crossWorld' ? 'cross_world' : key}`, spec[key]])); }
export function ledgerToNativeRows(ledger: Ledger, scope: Pick<NativeScope, 'origin' | 'handle' | 'chat'>): NativeRows {
  validateLedger(ledger);
  const rows = Object.fromEntries(NATIVE_FOUR_TABLES.map(table => [table.key, []])) as unknown as NativeRows;
  const add = (tableIndex: number, kind: string, businessId: string, ordinal: number, values: Record<string, unknown>) => { const table = NATIVE_FOUR_TABLES[tableIndex]!; rows[table.key].push(blank(table, ledger.accountId, kind, businessId, ordinal, values)); };
  add(1, 'account', ledger.accountId, 0, { schema_version: NATIVE_STORAGE_VERSION, account_label: ledger.label, current_world: ledger.world, ledger_revision: ledger.revision, created_at: ledger.createdAt, updated_at: ledger.updatedAt, optional_fields: JSON.stringify(['impressions', 'quests', 'rippleHistory'].filter(field => Object.hasOwn(ledger, field))), scope_origin: scope.origin, scope_handle: scope.handle, scope_chat: scope.chat });
  ledger.transactions.forEach((tx, index) => add(1, 'transaction', tx.id, index, { transaction_kind: tx.kind, amount: tx.amount, balance_before: tx.balanceBefore, balance_after: tx.balanceAfter, world: tx.world, occurred_at: tx.at, reference_id: tx.referenceId, quantity: tx.quantity, recipient: tx.recipient, receipt: tx.receipt }));
  ledger.events.forEach((event, index) => add(1, 'event', event.id, index, { request_id: event.requestId, world: event.world, source: event.source, outcome: event.outcome, evidence: event.evidence, amount: event.amount, standard_id: event.standardId, event_kind: event.kind, independent_change: event.independent, parent_result_id: event.parentResultId, occurred_at: event.at }));
  ledger.standards.forEach((standard, index) => add(1, 'standard', standard.id, index, { spec_key: standard.key, standard_spec: standard.spec, reward: standard.reward, created_at: standard.createdAt }));
  ledger.quotes.forEach((quote, index) => add(2, 'quote', quote.id, index, { spec_key: quote.key, name: quote.name, category: quote.category, world: quote.world, ...specColumns(quote.spec), price: quote.price, reward_kind: quote.kind, aliases_json: JSON.stringify(quote.aliases), created_at: quote.createdAt, previous_quote_id: quote.previousQuoteId, differences_json: quote.differences === undefined ? '' : JSON.stringify(quote.differences) }));
  ledger.inventory.forEach((item, index) => add(2, 'inventory', item.id, index, { purchase_id: item.purchaseId, quote_id: item.quoteId, name: item.name, ...specColumns(item.spec), reward_kind: item.kind, acquired: item.acquired, remaining: item.remaining, consumed: item.consumed, transferred: item.transferred, world: item.world, created_at: item.at }));
  (ledger.impressions ?? []).forEach((item, index) => add(0, 'impression', item.id, index, { world: item.world, subject: item.subject, summary: item.summary, evidence: item.evidence, source: item.source, pinned: item.pinned, created_at: item.createdAt }));
  ledger.ripples.forEach((item, index) => add(3, 'ripple', item.id, index, { world: item.world, source: item.source, settled: item.settled, tracking: item.tracking, status: item.status, updated_at: item.updatedAt }));
  (ledger.rippleHistory ?? []).forEach((item, index) => add(3, 'ripple-history', String(index), index, { business_id: item.id, world: item.world, source: item.source, settled: item.settled, tracking: item.tracking, status: item.status, updated_at: item.updatedAt }));
  (ledger.quests ?? []).forEach((item, index) => add(3, 'quest', item.id, index, { world: item.world, title: item.title, objective: item.objective, reason: item.reason, source_ripple_id: item.sourceRippleId, status: item.status, created_at: item.createdAt, updated_at: item.updatedAt, completion_event_id: item.completionEventId }));
  return rows;
}
export function nativeCommitRow(tableIndex: number, ledger: Ledger, previousRevision: number | undefined, inserted: string[], updated: string[]): NativeRow {
  const table = NATIVE_FOUR_TABLES[tableIndex]!;
  return blank(table, ledger.accountId, 'commit', `${tableIndex + 1}:${ledger.revision}`, ledger.revision, { commit_revision: ledger.revision, previous_revision: previousRevision, committed_at: ledger.updatedAt, audit_changes: JSON.stringify({ inserted: [...inserted].sort(), updated: [...updated].sort() }) });
}
function broken(message: string): never { throw new LedgerError('BROKEN_NATIVE_STORAGE', message); }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
const identical = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function ordinal(value: string): number { if (!/^(0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value))) broken('原生稳定序号必须为非负安全整数'); return Number(value); }
function bool(value: string): boolean { if (!['true', 'false'].includes(value)) broken('原生布尔业务列必须为true或false'); return value === 'true'; }
function json(value: string): unknown { try { return JSON.parse(value); } catch { return broken('原生嵌套JSON列损坏'); } }
function optional(row: NativeRow, column: string, property: string): Record<string, unknown> { return row[column] === '' ? {} : { [property]: row[column] }; }
function spec(row: NativeRow): EffectSpec { return Object.fromEntries(EFFECT_FIELDS.map(key => [key, row[`effect_${key === 'crossWorld' ? 'cross_world' : key}`]])) as unknown as EffectSpec; }
function sameRow(a: NativeRow, b: NativeRow): boolean { return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => a[key] === b[key]); }

/** Snapshot is already detached by the repository; this function never reads IndexedDB. */
export function readNativeSnapshot(value: unknown, scope: Pick<NativeScope, 'origin' | 'handle' | 'chat'>): { rows: NativeRows; ledger?: Ledger; tables: ChatSheets; keys: Record<NativeTableKey, string> } {
  if (!object(value)) throw new LedgerError('NATIVE_NOT_READY', '原生数据库尚未返回当前聊天表格');
  const tables = value as ChatSheets, rows = {} as NativeRows, keys = {} as Record<NativeTableKey, string>;
  for (const table of NATIVE_FOUR_TABLES) {
    // The official chat template importer regenerates sheet keys/uid from display names.
    // Only one exact display identity with the complete v2 contract may bind a logical slot.
    const matches = Object.entries(tables).filter(([key, sheet]) => key.startsWith('sheet_') && object(sheet) && sheet.name === table.name);
    if (!matches.length) throw new LedgerError('NATIVE_TABLES_MISSING', '当前聊天缺少原生四表。请单独导出并安装v2空模板后重试；商店不会默认覆盖其他表。');
    if (matches.length !== 1) throw new LedgerError('NATIVE_TABLES_AMBIGUOUS', `「${table.name}」存在重名表，无法确定业务真源，已停止读写`);
    const [liveKey, sheet] = matches[0]!;
    if (!object(sheet) || !Array.isArray(sheet.content) || sheet.uid !== liveKey || !identical(sheet.content[0], ['row_id', ...table.columns.map(column => column.label)]) || !object(sheet.sourceData) || sheet.sourceData.ddl !== nativeDDL(table) || typeof sheet.sourceData.note !== 'string' || !sheet.sourceData.note.includes(NATIVE_OWNERSHIP)) throw new LedgerError('NATIVE_SCHEMA_VERSION', `「${table.name}」不是兼容的v2业务真源表，已停止读写。请保留旧表并单独安装v2模板。`);
    keys[table.key] = liveKey;
    const ids = new Set<string>(), nativeRowIds = new Set<number>();
    rows[table.key] = sheet.content.slice(1).map((values: unknown) => {
      if (!Array.isArray(values) || values.length !== table.columns.length + 1 || !Number.isSafeInteger(Number(values[0])) || Number(values[0]) < 1 || values.slice(1).some(cell => typeof cell !== 'string')) broken(`「${table.name}」的行长度、原生行号或TEXT列不兼容`);
      if (nativeRowIds.has(Number(values[0]))) broken(`「${table.name}」的原生行号重复`); nativeRowIds.add(Number(values[0]));
      const row: NativeRow = Object.fromEntries(table.columns.map((column, index) => [column.sql, values[index + 1] as string]));
      if (!row.record_id || ids.has(row.record_id)) broken('记录ID不能为空或重复'); ids.add(row.record_id);
      if (!(table.kinds as readonly string[]).includes(row.record_kind!) && row.record_kind !== 'commit') broken(`「${table.name}」包含未知记录种类`);
      ordinal(row.record_order!); return row;
    });
  }
  const allRows = Object.values(rows).flat(), accounts = rows.sheet_shiro_memory_2.filter(row => row.record_kind === 'account');
  if (accounts.length === 0) { if (allRows.length) broken('四表含业务或提交记录却缺少本源账户，禁止初始化覆盖'); return { rows, tables, keys }; }
  if (accounts.length !== 1) broken('每个聊天只能有唯一一份本源账户');
  const account = accounts[0]!;
  if (account.scope_origin !== scope.origin || account.scope_handle !== scope.handle || account.scope_chat !== scope.chat) throw new LedgerError('NATIVE_SCOPE_MISMATCH', '原生本源属于另一源站、用户或聊天，不能合并或覆盖');
  if (allRows.some(row => row.account_id !== account.account_id)) broken('原生四表含另一份本源账户的记录');
  const get = (tableIndex: number, kind: string) => {
    const found = rows[NATIVE_FOUR_TABLES[tableIndex]!.key].filter(row => row.record_kind === kind).sort((a, b) => ordinal(a.record_order!) - ordinal(b.record_order!));
    if (found.some((row, index) => ordinal(row.record_order!) !== index)) broken(`${kind}记录的稳定序号缺失、重复或重排`);
    return found;
  };
  const optionalFields = json(account.optional_fields!);
  if (!Array.isArray(optionalFields) || !identical(optionalFields, ['impressions', 'quests', 'rippleHistory'].filter(field => optionalFields.includes(field)))) broken('可选历史字段列表不兼容');
  if (account.schema_version !== String(NATIVE_STORAGE_VERSION)) broken('本源记录的原生存储版本不兼容');
  const ledger: Ledger = { schemaVersion: 1, accountId: account.account_id!, label: account.account_label!, world: account.current_world!, revision: ordinal(account.ledger_revision!), createdAt: account.created_at!, updatedAt: account.updated_at!, balance: '0', income: '0', spend: '0', transactions: get(1, 'transaction').map(row => ({ id: row.business_id!, kind: row.transaction_kind as Ledger['transactions'][number]['kind'], amount: row.amount!, balanceBefore: row.balance_before!, balanceAfter: row.balance_after!, world: row.world!, at: row.occurred_at!, referenceId: row.reference_id!, receipt: row.receipt!, ...(row.quantity === '' ? {} : { quantity: ordinal(row.quantity!) }), ...optional(row, 'recipient', 'recipient') })), events: get(1, 'event').map(row => ({ id: row.business_id!, requestId: row.request_id!, world: row.world!, source: row.source!, outcome: row.outcome!, evidence: row.evidence!, amount: row.amount!, standardId: row.standard_id!, kind: row.event_kind as Ledger['events'][number]['kind'], independent: bool(row.independent_change!), at: row.occurred_at!, ...optional(row, 'parent_result_id', 'parentResultId') })), standards: get(1, 'standard').map(row => ({ id: row.business_id!, key: row.spec_key!, spec: row.standard_spec!, reward: row.reward!, createdAt: row.created_at! })), quotes: get(2, 'quote').map(row => ({ id: row.business_id!, key: row.spec_key!, name: row.name!, category: row.category!, world: row.world!, spec: spec(row), price: row.price!, kind: row.reward_kind as Ledger['quotes'][number]['kind'], aliases: json(row.aliases_json!) as string[], createdAt: row.created_at!, ...optional(row, 'previous_quote_id', 'previousQuoteId'), ...(row.differences_json === '' ? {} : { differences: json(row.differences_json!) as (keyof EffectSpec)[] }) })), inventory: get(2, 'inventory').map(row => ({ id: row.business_id!, purchaseId: row.purchase_id!, quoteId: row.quote_id!, name: row.name!, spec: spec(row), kind: row.reward_kind as Ledger['inventory'][number]['kind'], acquired: ordinal(row.acquired!), remaining: ordinal(row.remaining!), consumed: ordinal(row.consumed!), transferred: ordinal(row.transferred!), world: row.world!, at: row.created_at! })), ripples: get(3, 'ripple').map(row => ({ id: row.business_id!, world: row.world!, source: row.source!, settled: row.settled!, tracking: row.tracking!, status: row.status as 'active' | 'resolved', updatedAt: row.updated_at! })) };
  const impressions = get(0, 'impression').map(row => ({ id: row.business_id!, world: row.world!, subject: row.subject!, summary: row.summary!, evidence: row.evidence!, source: row.source as 'story' | 'user', pinned: bool(row.pinned!), createdAt: row.created_at! }));
  const quests = get(3, 'quest').map(row => ({ id: row.business_id!, world: row.world!, title: row.title!, objective: row.objective!, reason: row.reason!, status: row.status as Ledger['quests'] extends (infer T)[] | undefined ? T extends { status: infer S } ? S : never : never, createdAt: row.created_at!, updatedAt: row.updated_at!, ...optional(row, 'source_ripple_id', 'sourceRippleId'), ...optional(row, 'completion_event_id', 'completionEventId') }));
  const history = get(3, 'ripple-history').map(row => ({ id: row.business_id!, world: row.world!, source: row.source!, settled: row.settled!, tracking: row.tracking!, status: row.status as 'active' | 'resolved', updatedAt: row.updated_at! }));
  for (const [field, data] of [['impressions', impressions], ['quests', quests], ['rippleHistory', history]] as const) { if (optionalFields.includes(field)) Object.assign(ledger, { [field]: data }); else if (data.length) broken(`${field}有记录却没有账户字段声明`); }
  for (const tx of ledger.transactions) { if (tx.kind === 'credit') { ledger.balance = addAmounts(ledger.balance, tx.amount); ledger.income = addAmounts(ledger.income, tx.amount); } else if (tx.kind === 'purchase') { ledger.balance = subtractAmounts(ledger.balance, tx.amount); ledger.spend = addAmounts(ledger.spend, tx.amount); } }
  validateLedger(ledger);
  const canonical = ledgerToNativeRows(ledger, scope);
  for (const [tableIndex, table] of NATIVE_FOUR_TABLES.entries()) {
    const actual = rows[table.key].filter(row => row.record_kind !== 'commit'), expected = new Map(canonical[table.key].map(row => [row.record_id, row]));
    if (actual.length !== expected.size || actual.some(row => !expected.has(row.record_id) || !sameRow(row, expected.get(row.record_id)!))) broken(`「${table.name}」包含不兼容、非规范或未映射业务列`);
    const commits = rows[table.key].filter(row => row.record_kind === 'commit').sort((a, b) => ordinal(a.commit_revision!) - ordinal(b.commit_revision!));
    let last = -1;
    for (const row of commits) {
      const revision = ordinal(row.commit_revision!), previous = row.previous_revision === '' ? undefined : ordinal(row.previous_revision!);
      const audit = json(row.audit_changes!);
      if (!object(audit) || !Array.isArray(audit.inserted) || !Array.isArray(audit.updated) || Object.keys(audit).length !== 2 || [...audit.inserted, ...audit.updated].some(id => typeof id !== 'string' || !expected.has(id)) || new Set([...audit.inserted, ...audit.updated]).size !== audit.inserted.length + audit.updated.length || revision <= last || revision > ledger.revision || (previous !== undefined && previous >= revision) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.committed_at!) || !Number.isFinite(Date.parse(row.committed_at!))) broken('提交审计记录损坏、引用缺失或版本顺序不成立');
      const expectedCommit = nativeCommitRow(tableIndex, { ...ledger, revision, updatedAt: row.committed_at! }, previous, audit.inserted as string[], audit.updated as string[]);
      if (!sameRow(row, expectedCommit)) broken('提交审计包含未知列或非规范身份');
      last = revision;
    }
  }
  return { rows, ledger, tables, keys };
}

/** Complete, lossless native v2 records; this is not the bounded model summary. */
export function createNativeFourTableExport(ledger: Ledger, scope: Pick<NativeScope, 'origin' | 'handle' | 'chat'>): ChatSheets {
  const out = createNativeFourTableTemplate(), rows = ledgerToNativeRows(ledger, scope);
  NATIVE_FOUR_TABLES.forEach(table => { const sheet = out[table.key] as DatabaseSheet; rows[table.key].forEach((row, index) => sheet.content.push([String(index + 1), ...table.columns.map(column => row[column.sql]!)])); });
  return out;
}
