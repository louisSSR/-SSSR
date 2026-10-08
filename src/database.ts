import type { Ledger } from './core.js';

/** Contract audited against AlbusKen/shujuku 1a5ffdb3ef8817452c370c6cfef7cac86683d7cc. */
export const DATABASE_SOURCE_COMMIT = '1a5ffdb3ef8817452c370c6cfef7cac86683d7cc';
export type DatabaseRow = Record<string, string>;
export interface DatabaseSheet {
  uid: string;
  name: string;
  content: (string | null)[][];
  sourceData: Record<string, unknown>;
  [key: string]: unknown;
}
export interface ChatSheets {
  mate: Record<string, unknown>;
  [key: string]: DatabaseSheet | Record<string, unknown>;
}
export interface AutoCardUpdaterApi {
  exportTableAsJson(): unknown;
  refreshDataAndWorldbook?(): Promise<boolean>;
  getTableTemplate?(options?: { scope: 'chat' | 'global' }): unknown;
  importTemplateFromData?(data: ChatSheets, options: { scope: 'chat'; presetName: string; dataMode: 'seed'; conflictPolicy: 'reject' }): Promise<{ success: boolean; runtimeReady?: boolean; message?: string; error?: string }>;
  getChatBoundProjectionContext?(): { protocol: string; patchVersion: string; chatIdentity: string; ready: boolean };
  applyChatBoundProjection?(request: { protocol: string; expectedChatIdentity: string; template: ChatSheets; rows?: Record<string, DatabaseRow[]> }): Promise<{ success: boolean; saved?: boolean; runtimeReady?: boolean; added?: number; inserted?: number; updated?: number; unchanged?: number; error?: string }>;
  updateRow?(options: { tableName: string; rowIndex: number; data: DatabaseRow }): Promise<boolean>;
  registerTableUpdateCallback?(callback: (data: unknown, meta?: { persisted: boolean }) => void): void;
  unregisterTableUpdateCallback?(callback: (data: unknown, meta?: { persisted: boolean }) => void): void;
  callAI?(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, options: { presetName?: string; maxTokens?: number }): Promise<string | null>;
  getStoryContext?(maxTurns?: number): string;
}
export interface ChatGuard { expectedChatId: string; getChatId(): string | null | undefined; }
export interface SyncResult { inserted: number; updated: number; unchanged: number; tables: number; revision: number; }
export class DatabaseSyncError extends Error {
  constructor(message: string, public readonly progress: SyncResult) { super(message); this.name = 'DatabaseSyncError'; }
}

const PREFIX = 'shiro-butterfly:v1:';
const OWNERSHIP = '白·蝴蝶效应：本源账本只读投影 v1';
const recordHeaders = ['记录ID', '本源账户'];
export const BUTTERFLY_TABLES = [
  { key: 'sheet_shiro_overview', name: '蝴蝶·因果总览', columns: [...recordHeaders, '账户称呼', '当前世界', '因果点余额', '累计入账', '累计消费', '账本版本', '最后更新'], note: '余额与累计账目来自商店唯一持久账本。跨世界接续同一本源账户，禁止填表模型自行计算、增加、扣除或覆盖。' },
  { key: 'sheet_shiro_causality', name: '蝴蝶·因果与余波', columns: [...recordHeaders, '记录类别', '所属世界', '作用来源', '新增结果', '证据', '本次入账', '独立有效改变', '计功参照ID', '关联结果ID', '已结算作用', '后续追踪', '记录状态', '发生时间'], note: '实际已成立结果和未成立余波分开记录。余波只是追踪，不提前入账；深化仅新增部分，重复结果不重复计功。完整原始事件由商店账本保存。' },
  { key: 'sheet_shiro_standards', name: '蝴蝶·恒量计功参照', columns: [...recordHeaders, '参照ID', '规格键', '固定影响规格', '固定收益', '确认时间'], note: '永久固定计功参照。相同实际因果影响沿用同一收益；不得随实力、世界或余额改写。1因果点的标准生命本源内涵恒定。' },
  { key: 'sheet_shiro_quotes', name: '蝴蝶·永久商品报价', columns: [...recordHeaders, '报价ID', '规格键', '商品名称', '奖励类别', '来源世界', '完整所得', '实际强度', '数量规格', '作用范围', '持续时间', '使用次数', '承接条件', '跨界效力', '固定价格', '存续类别', '别名', '旧版报价ID', '新增规格', '确认时间'], note: '完整八项效果规格与固定报价绑定；同规格跨界同价。稀有奖励始终可看，报价不受余额、稀缺度、实力、剧情或购买次数影响。1点基准本源增益常驻。' },
  { key: 'sheet_shiro_transactions', name: '蝴蝶·交易回执', columns: [...recordHeaders, '交易ID', '交易类别', '所属世界', '因果点金额', '交易前余额', '交易后余额', '关联记录ID', '物品数量', '接收者', '完整回执', '发生时间'], note: '商店已提交交易的幂等回执投影。购买、使用、移交与入账分别记录；界面重开或重新同步不能产生新交易。禁止填表模型虚构消费或领取。' },
  { key: 'sheet_shiro_inventory', name: '蝴蝶·长期所得', columns: [...recordHeaders, '所得ID', '购买交易ID', '报价ID', '所得名称', '存续类别', '取得数量', '剩余数量', '已用数量', '已移交数量', '来源世界', '完整所得', '实际强度', '数量规格', '作用范围', '持续时间', '使用次数', '承接条件', '跨界效力', '取得时间'], note: '长期能力保留，消耗品按实际使用扣减，移交按真实归属记录。保留人格、记忆与主观连续性，跨世界维持原规格效力。禁止独立增加或删除所得。' },
] as const;

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown): string { return value === undefined || value === null ? '' : String(value); }
function guardChat(guard: ChatGuard): void {
  if (!guard.expectedChatId || guard.getChatId() !== guard.expectedChatId) throw new Error('聊天已切换或尚未打开；数据库操作已停止，请回到目标聊天后重试。');
}
function snapshot(api: AutoCardUpdaterApi): Record<string, unknown> {
  const value = api.exportTableAsJson();
  if (!object(value)) throw new Error('数据库尚未返回可用表格，请等待当前聊天载入。');
  return clone(value);
}
function requireSheet(data: Record<string, unknown>, key: string): DatabaseSheet {
  const descriptor = BUTTERFLY_TABLES.find(t => t.key === key)!;
  const matches = Object.entries(data).filter(([liveKey, value]) => liveKey.startsWith('sheet_') && object(value) && (liveKey === key || text(value.name).normalize('NFKC').trim() === descriptor.name));
  if (matches.length !== 1) throw new Error(`缺少唯一兼容表格「${descriptor.name}」，请先启用当前聊天的蝴蝶表。`);
  const [liveKey, value] = matches[0]!;
  if (!object(value) || value.uid !== liveKey || value.name !== descriptor.name || !Array.isArray(value.content)) throw new Error(`「${descriptor.name}」的表身份不匹配。`);
  const sheet = value as unknown as DatabaseSheet;
  const expected = ['row_id', ...descriptor.columns];
  if (JSON.stringify(sheet.content[0]) !== JSON.stringify(expected) || !object(sheet.sourceData) || !text(sheet.sourceData.note).includes(OWNERSHIP)) throw new Error(`「${descriptor.name}」的列结构或来源标识不匹配，已停止写入以保护现有表格。`);
  return sheet;
}

export const CHAT_BOUND_PROJECTION_PROTOCOL = 'acu-chat-bound-projection/1';
export function getSafeDatabaseWriteContext(api: AutoCardUpdaterApi) {
  if (typeof api.getChatBoundProjectionContext !== 'function' || typeof api.applyChatBoundProjection !== 'function') throw new Error('当前数据库没有安全聊天投影接口；自动写回已停用。请使用交付的 1.2.5-shiro.1 兼容修正版，或导出六表后由数据库原生导入。');
  const context = api.getChatBoundProjectionContext();
  if (context.protocol !== CHAT_BOUND_PROJECTION_PROTOCOL || context.patchVersion !== '1.2.5-shiro.1') throw new Error('数据库安全投影协议版本尚未核验，未执行写入。');
  if (!context.ready || !context.chatIdentity) throw new Error('数据库目标聊天尚未就绪或正在填表，请稍后重试。');
  return context;
}
export function discoverDatabaseApi(scope: unknown = globalThis): AutoCardUpdaterApi | null {
  try {
    const value = (scope as { AutoCardUpdaterAPI?: unknown })?.AutoCardUpdaterAPI;
    if (object(value) && typeof value.exportTableAsJson === 'function') return value as unknown as AutoCardUpdaterApi;
  } catch { /* A cross-origin caller must not probe further. */ }
  return null;
}

export function getDatabaseStoryContext(api: AutoCardUpdaterApi, maxTurns = 3): string {
  if (typeof api.getStoryContext !== 'function') return '';
  const result = api.getStoryContext(Math.max(1, Math.min(12, Math.trunc(maxTurns) || 3)));
  return typeof result === 'string' ? result : '';
}

export async function callDatabaseAI(api: AutoCardUpdaterApi, messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, options: { presetName?: string; maxTokens?: number } = {}): Promise<string> {
  if (typeof api.callAI !== 'function') throw new Error('数据库未提供模型调用接口，请更新兼容版本或选择其他 API 来源。');
  if (!messages.length || messages.some(m => !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string')) throw new Error('模型请求消息格式不正确。');
  const request: { presetName?: string; maxTokens?: number } = {};
  if (options.presetName?.trim()) request.presetName = options.presetName.trim();
  if (options.maxTokens !== undefined) {
    if (!Number.isSafeInteger(options.maxTokens) || options.maxTokens < 64 || options.maxTokens > 32768) throw new Error('最大回复长度须为 64 至 32768 的整数。');
    request.maxTokens = options.maxTokens;
  }
  const result = await api.callAI(messages, request);
  if (typeof result !== 'string' || !result.trim()) throw new Error('模型未返回商品内容，请检查数据库 API 预设。');
  return result.trim();
}

/** Strict JSON only; no eval, executable fences, or automatic prose repair. */
export function parseDatabaseAIJson(value: string): unknown {
  const trimmed = value.trim();
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
  const candidate = fence ? fence[1]!.trim() : trimmed;
  if (candidate.length > 1_000_000) throw new Error('模型返回内容过大。');
  try { return JSON.parse(candidate); } catch { throw new Error('模型回复不是完整 JSON，请重新生成；尚未创建报价或扣点。'); }
}

export function createButterflyTemplate(): ChatSheets {
  const placement = (order: number) => ({ position: 'at_depth_as_system', depth: 2, order });
  const template: ChatSheets = { mate: { type: 'chatSheets', version: 1, updateConfigUiSentinel: -1, globalInjectionConfig: { readableEntryPlacement: { position: 'before_char', depth: 2, order: 99981 }, wrapperPlacement: { position: 'before_char', depth: 2, order: 99980 } } } };
  BUTTERFLY_TABLES.forEach((table, index) => {
    // Stable English physical names; identical display columns always receive identical SQL identifiers.
    const columns = table.columns.map((name) => ({ name, sql: COLUMN_IDS[name] }));
    if (columns.some(c => !c.sql)) throw new Error(`模板缺少物理列映射：${table.name}`);
    const ddl = `CREATE TABLE shiro_${table.key.slice('sheet_shiro_'.length)} ( -- ${table.name}\n  row_id INTEGER PRIMARY KEY, -- 行号\n${columns.map((column, i) => `  ${column.sql} TEXT${column.name === '记录ID' ? ' NOT NULL UNIQUE' : ''}${i < columns.length - 1 ? ',' : ''} -- ${column.name}`).join('\n')}\n);`;
    template[table.key] = {
      uid: table.key, name: table.name, content: [['row_id', ...table.columns]], orderNo: index,
      sourceData: { note: `${OWNERSHIP}。${table.note}\n此表由白·蝴蝶商店同步；AI只读，不得填表或改账。业务主键为记录ID，row_id由数据库维护。`, initNode: '保持空表，等待商店同步。', insertNode: '禁止AI新增。仅接受商店从已提交本源账本同步的记录。', updateNode: '禁止AI修改。仅接受商店同步，不以剧情描述覆盖已确认权益。', deleteNode: '禁止AI删除。永久计功、报价和交易保留。', ddl },
      updateConfig: { uiSentinel: -1, contextDepth: -1, updateFrequency: 0, batchSize: -1, skipFloors: -1 },
      exportConfig: { enabled: false, splitByRow: false, entryName: table.name, entryType: 'constant', keywords: '', preventRecursion: true, injectionTemplate: '', extraIndexEnabled: false, extraIndexEntryName: `${table.name}·索引`, extraIndexColumns: [], extraIndexColumnModes: {}, extraIndexInjectionTemplate: '', entryPlacement: placement(10000 + index), extraIndexPlacement: placement(10010 + index), fixedEntryPlacement: placement(99990), fixedIndexPlacement: placement(99991), injectIntoWorldbook: false },
    };
  });
  return template;
}

const COLUMN_IDS: Record<string, string> = {
  '记录ID': 'record_id', '本源账户': 'account_id', '账户称呼': 'account_label', '当前世界': 'current_world', '因果点余额': 'balance', '累计入账': 'income', '累计消费': 'spend', '账本版本': 'ledger_revision', '最后更新': 'updated_at',
  '记录类别': 'record_type', '所属世界': 'world', '作用来源': 'source', '新增结果': 'outcome', '证据': 'evidence', '本次入账': 'credited_amount', '独立有效改变': 'independent_change', '计功参照ID': 'standard_id', '关联结果ID': 'parent_result_id', '已结算作用': 'settled', '后续追踪': 'tracking', '记录状态': 'status', '发生时间': 'occurred_at',
  '参照ID': 'standard_id', '规格键': 'spec_key', '固定影响规格': 'effect_standard', '固定收益': 'reward', '确认时间': 'confirmed_at', '报价ID': 'quote_id', '商品名称': 'product_name', '奖励类别': 'category', '来源世界': 'source_world', '完整所得': 'effect_content', '实际强度': 'effect_strength', '数量规格': 'effect_quantity', '作用范围': 'effect_range', '持续时间': 'effect_duration', '使用次数': 'effect_uses', '承接条件': 'effect_conditions', '跨界效力': 'effect_cross_world', '固定价格': 'price', '存续类别': 'persistence_kind', '别名': 'aliases', '旧版报价ID': 'previous_quote_id', '新增规格': 'spec_differences',
  '交易ID': 'transaction_id', '交易类别': 'transaction_kind', '因果点金额': 'amount', '交易前余额': 'balance_before', '交易后余额': 'balance_after', '关联记录ID': 'reference_id', '物品数量': 'item_quantity', '接收者': 'recipient', '完整回执': 'receipt',
  '所得ID': 'inventory_id', '购买交易ID': 'purchase_id', '所得名称': 'item_name', '取得数量': 'acquired', '剩余数量': 'remaining', '已用数量': 'consumed', '已移交数量': 'transferred', '取得时间': 'acquired_at',
};

/** Call only from the explicit “启用当前聊天表格” user action. Safe bridge retains unrelated data. */
export async function enableButterflyTables(api: AutoCardUpdaterApi, guard: ChatGuard): Promise<{ added: number; alreadyEnabled: boolean }> {
  guardChat(guard);
  const context = getSafeDatabaseWriteContext(api);
  guardChat(guard);
  const result = await api.applyChatBoundProjection!({ protocol: CHAT_BOUND_PROJECTION_PROTOCOL, expectedChatIdentity: context.chatIdentity, template: createButterflyTemplate() });
  guardChat(guard);
  if (!result.success || result.runtimeReady === false) throw new Error(result.error || '模板未在当前聊天准备完成。');
  const after = snapshot(api);
  for (const descriptor of BUTTERFLY_TABLES) requireSheet(after, descriptor.key);
  return { added: result.added ?? 0, alreadyEnabled: result.added === 0 };
}
function specColumns(spec: { content: string; strength: string; quantity: string; range: string; duration: string; uses: string; conditions: string; crossWorld: string }): DatabaseRow {
  return { '完整所得': spec.content, '实际强度': spec.strength, '数量规格': spec.quantity, '作用范围': spec.range, '持续时间': spec.duration, '使用次数': spec.uses, '承接条件': spec.conditions, '跨界效力': spec.crossWorld };
}

export function projectLedgerToDatabase(ledger: Ledger): Record<string, DatabaseRow[]> {
  const rows: Record<string, DatabaseRow[]> = Object.fromEntries(BUTTERFLY_TABLES.map(t => [t.key, []]));
  const add = (table: string, id: string, values: Record<string, unknown>) => rows[`sheet_shiro_${table}`]!.push({ '记录ID': `${PREFIX}${encodeURIComponent(ledger.accountId)}:${table}:${encodeURIComponent(id)}`, '本源账户': ledger.accountId, ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, text(value)])) });
  add('overview', 'account', { '账户称呼': ledger.label, '当前世界': ledger.world, '因果点余额': ledger.balance, '累计入账': ledger.income, '累计消费': ledger.spend, '账本版本': ledger.revision, '最后更新': ledger.updatedAt });
  for (const event of ledger.events) add('causality', `event:${event.id}`, { '记录类别': '已计功', '所属世界': event.world, '作用来源': event.source, '新增结果': event.outcome, '证据': event.evidence, '本次入账': event.amount, '独立有效改变': event.independent ? '是' : '否', '计功参照ID': event.standardId, '关联结果ID': event.parentResultId, '已结算作用': event.outcome, '记录状态': event.kind, '发生时间': event.at });
  for (const ripple of ledger.ripples) add('causality', `ripple:${ripple.id}`, { '记录类别': '余波追踪', '所属世界': ripple.world, '作用来源': ripple.source, '已结算作用': ripple.settled, '后续追踪': ripple.tracking, '记录状态': ripple.status, '发生时间': ripple.updatedAt });
  for (const standard of ledger.standards) add('standards', standard.id, { '参照ID': standard.id, '规格键': standard.key, '固定影响规格': standard.spec, '固定收益': standard.reward, '确认时间': standard.createdAt });
  for (const quote of ledger.quotes) add('quotes', quote.id, { '报价ID': quote.id, '规格键': quote.key, '商品名称': quote.name, '奖励类别': quote.category, '来源世界': quote.world, ...specColumns(quote.spec), '固定价格': quote.price, '存续类别': quote.kind, '别名': JSON.stringify(quote.aliases), '旧版报价ID': quote.previousQuoteId, '新增规格': quote.differences ? JSON.stringify(quote.differences) : '', '确认时间': quote.createdAt });
  for (const tx of ledger.transactions) add('transactions', tx.id, { '交易ID': tx.id, '交易类别': tx.kind, '所属世界': tx.world, '因果点金额': tx.amount, '交易前余额': tx.balanceBefore, '交易后余额': tx.balanceAfter, '关联记录ID': tx.referenceId, '物品数量': tx.quantity, '接收者': tx.recipient, '完整回执': tx.receipt, '发生时间': tx.at });
  for (const item of ledger.inventory) add('inventory', item.id, { '所得ID': item.id, '购买交易ID': item.purchaseId, '报价ID': item.quoteId, '所得名称': item.name, '存续类别': item.kind, '取得数量': item.acquired, '剩余数量': item.remaining, '已用数量': item.consumed, '已移交数量': item.transferred, '来源世界': item.world, ...specColumns(item.spec), '取得时间': item.at });
  return rows;
}

/** Standalone native JSON export; does not write or import into any chat. */
export function createLedgerTableExport(ledger: Ledger): ChatSheets {
  const template = createButterflyTemplate();
  const projection = projectLedgerToDatabase(ledger);
  for (const descriptor of BUTTERFLY_TABLES) {
    const sheet = template[descriptor.key] as DatabaseSheet;
    projection[descriptor.key]!.forEach((row, index) => sheet.content.push([String(index + 1), ...descriptor.columns.map(column => row[column] ?? '')]));
  }
  return template;
}

const inFlight = new WeakSet<object>();
/** Derived projection only. Unsafe original CRUD/SQL are never called, even as a fallback. */
export async function syncButterflyLedger(api: AutoCardUpdaterApi, ledger: Ledger, guard: ChatGuard): Promise<SyncResult> {
  const progress: SyncResult = { inserted: 0, updated: 0, unchanged: 0, tables: 0, revision: ledger.revision };
  if (inFlight.has(api)) throw new DatabaseSyncError('当前数据库同步尚未结束。', progress);
  inFlight.add(api);
  try {
    guardChat(guard);
    const context = getSafeDatabaseWriteContext(api);
    const projection = projectLedgerToDatabase(clone(ledger));
    guardChat(guard);
    const result = await api.applyChatBoundProjection!({ protocol: CHAT_BOUND_PROJECTION_PROTOCOL, expectedChatIdentity: context.chatIdentity, template: createButterflyTemplate(), rows: projection });
    guardChat(guard);
    if (!result.success || result.runtimeReady === false) throw new Error(result.error || '数据库投影未保存或重载未完成。');
    const saved = snapshot(api);
    for (const descriptor of BUTTERFLY_TABLES) {
      const sheet = requireSheet(saved, descriptor.key);
      const headers = sheet.content[0]!.map(text);
      for (const row of projection[descriptor.key]!) {
        const matches = sheet.content.slice(1).filter(values => values[headers.indexOf('记录ID')] === row['记录ID']);
        if (matches.length !== 1 || descriptor.columns.some(column => text(matches[0]![headers.indexOf(column)]) !== (row[column] ?? ''))) throw new Error(`「${descriptor.name}」保存后核对未通过。`);
      }
      progress.tables += 1;
    }
    progress.inserted = result.inserted ?? 0;
    progress.updated = result.updated ?? 0;
    progress.unchanged = result.unchanged ?? 0;
    return progress;
  } catch (error) {
    throw new DatabaseSyncError(`${error instanceof Error ? error.message : '数据库同步失败'} 本源账本不受影响；可稍后重试同步。`, { ...progress });
  } finally { inFlight.delete(api); }
}
