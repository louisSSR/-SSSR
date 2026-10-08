import { assertLedgerContinuation, createLedger, LedgerError, validateLedger, type Ledger, type OperationResult } from './core';
import type { AutoCardUpdaterApi, ChatSheets } from './database';
import { NATIVE_FOUR_TABLES, createNativeFourTableExport, ledgerToNativeRows, nativeCommitRow, readNativeSnapshot, type NativeRow, type NativeRows, type NativeScope } from './native-schema';

export type { NativeScope } from './native-schema';
export interface NativeBatchResult { success: boolean; saved?: boolean; changes?: number; appliedEdits?: number; modifiedKeys?: string[]; errors?: string[]; error?: string; messageIndex?: number; saveError?: string }
export interface NativeSqlApi extends AutoCardUpdaterApi {
  executeSqlQuery?(request: { sql: string; limit: 1; offset: 0 }): { columns: string[]; values: unknown[][]; rows: Record<string, unknown>[]; rowCount: number } | null;
  executeSqlBatch?(request: { sql: string; targetSheetKeys: string[]; updateGroupKeys: string[]; trackingSheetKeys: string[]; skipChatSave: false; skipNotify: false }): Promise<NativeBatchResult>;
}
export interface NativeLockManager { request<T>(name: string, options: { mode: 'exclusive' }, callback: () => Promise<T>): Promise<T> }
export interface NativeVerificationContext {
  stage: 'preflight' | 'commit' | 'refresh'; scope: Readonly<NativeScope>; api: NativeSqlApi; ledger: Ledger | undefined; tables: ChatSheets; result?: NativeBatchResult;
}
export interface NativeRepositoryOptions {
  scope(): NativeScope;
  getApi(): AutoCardUpdaterApi | null;
  canWrite?(): boolean;
  /** Must verify the captured chat's saved native frames, not just the runtime export. */
  verifyPersisted?(context: NativeVerificationContext): boolean | Promise<boolean>;
  /** Optional injection for tests; browsers use navigator.locks. No unsafe lock fallback. */
  locks?: NativeLockManager;
}
export interface NativeLedgerBackup { format: 'shiro-butterfly-ledger'; version: 2; exportedAt: string; scope: { origin: string; handle: string; chat: string }; ledger: Ledger }
type Snapshot = ReturnType<typeof readNativeSnapshot>;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
const equal = (left: unknown, right: unknown): boolean => canonical(left) === canonical(right);
function fail(code: string, message: string): never { throw new LedgerError(code, message); }
function clean(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048 || value !== value.trim()) fail('INVALID_SCOPE', `${label}不能为空、含首尾空白或超过2048字符`);
  return value;
}
function captureScope(value: NativeScope): Readonly<NativeScope> {
  if (!value || (typeof value.epoch !== 'string' && typeof value.epoch !== 'number') || (typeof value.epoch === 'number' && (!Number.isSafeInteger(value.epoch) || value.epoch < 0))) fail('INVALID_SCOPE', '聊天加载版本无效');
  return Object.freeze({ origin: clean(value.origin, '源站'), handle: clean(value.handle, '酒馆用户'), chat: clean(value.chat, '聊天'), epoch: value.epoch });
}
const scopeKey = (scope: Pick<NativeScope, 'origin' | 'handle' | 'chat'>): string => JSON.stringify([scope.origin, scope.handle, scope.chat]);
/** Hex UTF-8 avoids quote injection and the public wrapper's global HTML-comment stripping. */
export function nativeSqlText(value: string): string {
  if (typeof value !== 'string') fail('NATIVE_SQL_VALUE', 'SQL业务值必须为TEXT');
  return `CAST(X'${Array.from(new TextEncoder().encode(value), byte => byte.toString(16).padStart(2, '0').toUpperCase()).join('')}' AS TEXT)`;
}
const hex = (value: string): string => Array.from(new TextEncoder().encode(value), byte => byte.toString(16).padStart(2, '0').toUpperCase()).join('');
function oldTableGuard(table: (typeof NATIVE_FOUR_TABLES)[number], rows: NativeRow[]): string {
  // Every target is guarded only by its own prior records, so native per-sheet cold replay is valid.
  // Hex and separators are unambiguous even for quotes, NULs, Unicode or literal SQL/HTML markers.
  const prior = [...rows].sort((a, b) => a.record_id! < b.record_id! ? -1 : a.record_id! > b.record_id! ? 1 : 0).map(row => table.columns.map(column => hex(row[column.sql]!)).join(':')).join('|');
  const expression = table.columns.map(column => `hex(${column.sql})`).join("||':'||");
  return `COALESCE((SELECT group_concat(native_row,'|') FROM (SELECT ${expression} AS native_row FROM ${table.sqlName} ORDER BY record_id COLLATE BINARY)),'')='${prior}'`;
}
function insertSql(table: (typeof NATIVE_FOUR_TABLES)[number], row: NativeRow, guard?: string): string {
  return `INSERT INTO ${table.sqlName} (${table.columns.map(column => column.sql).join(',')}) VALUES (${table.columns.map(column => column.sql === 'record_id' && guard ? `CASE WHEN ${guard} THEN ${nativeSqlText(row[column.sql]!)} ELSE NULL END` : nativeSqlText(row[column.sql]!)).join(',')})`;
}
function updateSql(table: (typeof NATIVE_FOUR_TABLES)[number], row: NativeRow): string {
  return `UPDATE ${table.sqlName} SET ${table.columns.filter(column => column.sql !== 'record_id').map(column => `${column.sql}=${nativeSqlText(row[column.sql]!)}`).join(',')} WHERE record_id=${nativeSqlText(row.record_id!)}`;
}
function planBatch(before: Snapshot, next: Ledger, scope: NativeScope): { sql: string; targetSheetKeys: string[]; expectedRows: NativeRows } {
  const proposed = ledgerToNativeRows(next, scope), expectedRows = copy(before.rows), statements: string[] = [], targetSheetKeys: string[] = [];
  NATIVE_FOUR_TABLES.forEach((table, index) => {
    const prior = new Map(before.rows[table.key].filter(row => row.record_kind !== 'commit').map(row => [row.record_id, row]));
    const nextRows = proposed[table.key], nextIds = new Set(nextRows.map(row => row.record_id));
    if ([...prior.keys()].some(id => !nextIds.has(id))) fail('HISTORY_REWRITE', '原生业务历史不可删除或替换身份');
    const inserted = nextRows.filter(row => !prior.has(row.record_id)), updated = nextRows.filter(row => prior.has(row.record_id) && !equal(prior.get(row.record_id), row));
    if (!inserted.length && !updated.length) return;
    const audit = nativeCommitRow(index, next, before.ledger?.revision, inserted.map(row => row.record_id!), updated.map(row => row.record_id!));
    // The first real persisted record forces NOT NULL failure on stale data. A zero-row UPDATE is never the guard.
    statements.push(insertSql(table, audit, oldTableGuard(table, before.rows[table.key])));
    inserted.forEach(row => statements.push(insertSql(table, row)));
    updated.forEach(row => statements.push(updateSql(table, row)));
    expectedRows[table.key] = [...before.rows[table.key].filter(row => row.record_kind === 'commit'), ...nextRows, audit];
    targetSheetKeys.push(before.keys[table.key]);
  });
  if (!statements.length) fail('INVALID_TRANSACTION', '变更账本却没有原生业务变化');
  return { sql: statements.join(';\n') + ';', targetSheetKeys, expectedRows };
}
function sortedRows(rows: NativeRow[]): NativeRow[] { return [...rows].sort((a, b) => a.record_id! < b.record_id! ? -1 : a.record_id! > b.record_id! ? 1 : 0); }
function unrelatedTables(tables: ChatSheets, keys: Snapshot['keys']): Record<string, unknown> { return Object.fromEntries(Object.entries(tables).filter(([key]) => !Object.values(keys).includes(key))); }
function assertNativeOrder(before: Ledger, next: Ledger): void {
  for (const field of ['quotes', 'inventory', 'ripples'] as const) if (before[field].some((row, index) => next[field][index]?.id !== row.id)) fail('HISTORY_REWRITE', '原生业务数组的稳定顺序不可改写');
  for (const quote of before.quotes) { const after = next.quotes.find(row => row.id === quote.id)!; if (!equal(quote.aliases, after.aliases.slice(0, quote.aliases.length))) fail('HISTORY_REWRITE', '报价别名只可在原顺序之后追加'); }
}

/** Native four-table business authority. All external generation finishes before synchronous transact callbacks. */
export class NativeFourTableRepository {
  private closed = false;
  private readonly dirtyScopes = new Set<string>();
  private readonly listeners = new Map<NativeSqlApi, (data: unknown, meta?: { persisted: boolean }) => void>();
  private readonly activeScopes = new Map<string, Readonly<NativeScope>>();
  constructor(private readonly options: NativeRepositoryOptions) {}
  private capture(): Readonly<NativeScope> { if (this.closed) fail('NATIVE_REPOSITORY_CLOSED', '原生本源仓库已关闭'); return captureScope(this.options.scope()); }
  private guard(scope: Readonly<NativeScope>, api?: NativeSqlApi): void {
    if (this.closed || !equal(scope, captureScope(this.options.scope())) || (api && this.options.getApi() !== api)) fail('NATIVE_SCOPE_CHANGED', '聊天、用户或加载版本已变化；已停止本次本源操作');
  }
  private api(scope: Readonly<NativeScope>): NativeSqlApi {
    this.guard(scope);
    const api = this.options.getApi() as NativeSqlApi | null;
    if (!api || typeof api.exportTableAsJson !== 'function') fail('NATIVE_UNAVAILABLE', '当前聊天原生数据库不可用；不会自动合并旧IndexedDB账本');
    if (!this.listeners.has(api) && typeof api.registerTableUpdateCallback === 'function') {
      const callback = (_data: unknown, meta?: { persisted: boolean }) => {
        if (meta?.persisted === false) {
          for (const [key] of this.activeScopes) this.dirtyScopes.add(key);
          try { this.dirtyScopes.add(scopeKey(this.capture())); } catch { /* Closed or unloading. */ }
        }
      };
      api.registerTableUpdateCallback(callback); this.listeners.set(api, callback);
    }
    this.guard(scope, api); return api;
  }
  private snapshot(scope: Readonly<NativeScope>, api = this.api(scope)): Snapshot {
    this.guard(scope, api);
    const value = api.exportTableAsJson();
    if (value && typeof value === 'object' && 'then' in value) fail('NATIVE_NOT_READY', '原生表导出必须是已就绪的同步公开快照');
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('NATIVE_NOT_READY', '原生数据库尚未返回当前聊天的完整表格快照');
    const detached = copy(value); this.guard(scope, api);
    return readNativeSnapshot(detached, scope);
  }
  private readable(scope: Readonly<NativeScope>): void {
    this.guard(scope);
    if (this.dirtyScopes.has(scopeKey(scope))) fail('NATIVE_PERSISTENCE_PENDING', '原生表存在尚未确认保存的更新；请刷新并确认目标聊天已落盘后再读取或提交');
  }
  private writable(scope: Readonly<NativeScope>, api: NativeSqlApi): void {
    this.guard(scope, api); this.readable(scope);
    if (this.options.canWrite?.() === false) fail('NATIVE_WRITE_PAUSED', '原生数据库当前暂停业务写入，请等待宿主就绪或刷新确认');
    if (typeof api.executeSqlBatch !== 'function') fail('NATIVE_SQL_BATCH_UNAVAILABLE', '原生数据库未提供公开executeSqlBatch，无法安全提交四表交易');
    if (!this.options.verifyPersisted) fail('NATIVE_VERIFICATION_REQUIRED', '尚未提供目标聊天保存确认，原生业务写入已拒绝');
  }
  private lockManager(): NativeLockManager {
    const locks = this.options.locks ?? (typeof navigator !== 'undefined' ? navigator.locks : undefined);
    if (!locks || typeof locks.request !== 'function') fail('NATIVE_CONCURRENCY_UNAVAILABLE', '当前浏览器缺少Web Locks，无法安全串行处理跨标签本源写入');
    return locks;
  }
  private async locked<T>(scope: Readonly<NativeScope>, action: (api: NativeSqlApi) => Promise<T>): Promise<T> {
    const api = this.api(scope); this.writable(scope, api);
    const locks = this.lockManager(); this.guard(scope, api);
    const key = scopeKey(scope);
    const result = await locks.request(`shiro-native-four:v2:${key}`, { mode: 'exclusive' }, async () => {
      this.guard(scope, api); this.writable(scope, api); this.activeScopes.set(key, scope);
      try {
        // Native-mode executeSqlBatch can fall back to the DSL parser and report success without SQL.
        // Only the published ready SQLite read API plus a real SELECT result proves SQL is available.
        if (typeof api.executeSqlQuery !== 'function') fail('NATIVE_SQLITE_MODE_REQUIRED', '当前数据库未启用或尚未就绪SQLite模式。请在数据库设置选择SQLite、完成重载后重试；商店不会自动改设置');
        this.guard(scope, api);
        const query = await api.executeSqlQuery({ sql: 'SELECT 1 AS shiro_native_sql_ready', limit: 1, offset: 0 });
        this.guard(scope, api); this.writable(scope, api);
        if (!query || !equal(query.columns, ['shiro_native_sql_ready']) || !equal(query.values, [[1]]) || !equal(query.rows, [{ shiro_native_sql_ready: 1 }]) || query.rowCount !== 1) fail('NATIVE_SQLITE_MODE_REQUIRED', '公开只读SQL探针未返回有效SQLite结果，尚未执行业务写入。请启用SQLite并等待数据库重载完成');
        return await action(api);
      } finally { this.activeScopes.delete(key); }
    });
    this.guard(scope, api); return result;
  }
  private async commit(scope: Readonly<NativeScope>, api: NativeSqlApi, before: Snapshot, next: Ledger): Promise<Ledger> {
    this.writable(scope, api); validateLedger(next);
    // Reject an unsupported source shape before SQL, instead of discovering lost fields after a mutation.
    if (!equal(readNativeSnapshot(createNativeFourTableExport(next, scope), scope).ledger, next)) fail('NATIVE_SCHEMA_ROUNDTRIP', '源账本含无法按v2业务列完整保留的字段形式，尚未写入原生表');
    // Web Locks serialize tabs, but do not refresh an independent tab's stale native runtime.
    // Compare the captured saved chat before invoking SQL, so stale runtimes cannot overwrite newer frames.
    let baselineVerified = false;
    try {
      this.guard(scope, api);
      baselineVerified = await this.options.verifyPersisted!({ stage: 'preflight', scope: { ...scope }, api, ledger: before.ledger ? copy(before.ledger) : undefined, tables: copy(before.tables) });
      this.guard(scope, api);
    } catch (error) { this.dirtyScopes.add(scopeKey(scope)); throw error; }
    if (baselineVerified !== true) { this.dirtyScopes.add(scopeKey(scope)); fail('NATIVE_PREFLIGHT_UNCONFIRMED', '原生运行时与目标聊天的已保存记录不一致，写入前检查未通过；请刷新后重试'); }
    this.writable(scope, api);
    const baseline = this.snapshot(scope, api);
    if (!equal(before.rows, baseline.rows) || !equal(before.keys, baseline.keys)) { this.dirtyScopes.add(scopeKey(scope)); fail('NATIVE_STALE', '写入前保存确认期间原生记录或表身份已变化，请刷新后重试'); }
    const plan = planBatch(before, next, scope);
    // Recheck synchronously after planning; this detects synchronous provider callbacks or host edits.
    const latest = this.snapshot(scope, api);
    if (!equal(before.rows, latest.rows) || !equal(before.keys, latest.keys)) fail('NATIVE_STALE', '原生记录或表身份在提交准备期间已变化，请刷新后重试');
    this.writable(scope, api);
    let result: NativeBatchResult;
    try {
      this.guard(scope, api);
      result = await api.executeSqlBatch!({ sql: plan.sql, targetSheetKeys: plan.targetSheetKeys, updateGroupKeys: [], trackingSheetKeys: [], skipChatSave: false, skipNotify: false });
      this.guard(scope, api);
    } catch (error) {
      this.dirtyScopes.add(scopeKey(scope)); throw error;
    }
    // changes counts statements, not affected rows. Success is proven by the roundtrip and saved confirmation.
    if (!result || result.success !== true || result.saved !== true || result.errors?.length || result.error || result.saveError) {
      if (result?.saved !== true) this.dirtyScopes.add(scopeKey(scope));
      fail('NATIVE_COMMIT_FAILED', result?.error || result?.saveError || result?.errors?.join('；') || '原生批次或目标聊天保存未确认；本次提交没有成功回执');
    }
    const saved = this.snapshot(scope, api);
    if (!saved.ledger || !equal(saved.ledger, next) || NATIVE_FOUR_TABLES.some(table => !equal(sortedRows(saved.rows[table.key]), sortedRows(plan.expectedRows[table.key])))) {
      this.dirtyScopes.add(scopeKey(scope)); fail('NATIVE_ROUNDTRIP_FAILED', '原生批次完成后业务列核对不一致；已暂停后续提交');
    }
    if (!equal(before.keys, saved.keys) || !equal(unrelatedTables(before.tables, before.keys), unrelatedTables(saved.tables, saved.keys))) {
      this.dirtyScopes.add(scopeKey(scope)); fail('NATIVE_UNRELATED_CHANGE', '提交期间其他原生表或模板元数据发生变化；保存范围尚未确认，已暂停后续提交');
    }
    let verified = false;
    try {
      this.guard(scope, api);
      verified = await this.options.verifyPersisted!({ stage: 'commit', scope: { ...scope }, api, ledger: copy(saved.ledger), tables: copy(saved.tables), result: copy(result) });
      this.guard(scope, api);
    } catch (error) { this.dirtyScopes.add(scopeKey(scope)); throw error; }
    if (verified !== true) { this.dirtyScopes.add(scopeKey(scope)); fail('NATIVE_PERSISTENCE_UNCONFIRMED', '目标聊天的原生保存记录尚未核验；已暂停后续提交'); }
    if (!equal(saved.rows, this.snapshot(scope, api).rows)) { this.dirtyScopes.add(scopeKey(scope)); fail('NATIVE_STALE', '目标聊天保存确认期间原生业务又发生变化；已暂停后续提交'); }
    this.dirtyScopes.delete(scopeKey(scope));
    return copy(saved.ledger);
  }
  async read(accountId: string): Promise<Ledger | undefined> {
    const scope = this.capture(); this.readable(scope);
    const snapshot = this.snapshot(scope); this.readable(scope);
    return snapshot.ledger?.accountId === clean(accountId, '本源ID') ? copy(snapshot.ledger) : undefined;
  }
  async list(): Promise<Ledger[]> { const scope = this.capture(); this.readable(scope); const snapshot = this.snapshot(scope); this.readable(scope); return snapshot.ledger ? [copy(snapshot.ledger)] : []; }
  async create(accountId: string, label?: string): Promise<Ledger> {
    const scope = this.capture(), ledger = createLedger(clean(accountId, '本源ID'), label);
    return this.locked(scope, async api => {
      const before = this.snapshot(scope, api);
      if (before.ledger) fail('ACCOUNT_EXISTS', '当前聊天已有唯一一份本源；不能再创建或覆盖另一份');
      return this.commit(scope, api, before, ledger);
    });
  }
  async transact<T>(accountId: string, operation: (ledger: Ledger) => OperationResult<T>): Promise<OperationResult<T>>;
  async transact(accountId: string, operation: (ledger: Ledger) => Ledger): Promise<Ledger>;
  async transact<T>(accountId: string, operation: (ledger: Ledger) => OperationResult<T> | Ledger): Promise<OperationResult<T> | Ledger> {
    const scope = this.capture(), id = clean(accountId, '本源ID');
    return this.locked(scope, async api => {
      const before = this.snapshot(scope, api);
      if (!before.ledger || before.ledger.accountId !== id) fail('MISSING_ACCOUNT', '当前聊天没有这份原生本源');
      if (typeof operation !== 'function' || operation.constructor.name === 'AsyncFunction') fail('ASYNC_TRANSACTION', '原生事务必须使用同步业务回调；请先完成模型请求再提交');
      const result = operation(copy(before.ledger));
      if (result && typeof result === 'object' && 'then' in result && typeof result.then === 'function') { void Promise.resolve(result).catch(() => undefined); fail('ASYNC_TRANSACTION', '原生事务不能等待异步业务回调'); }
      this.writable(scope, api);
      if (!result || typeof result !== 'object') fail('INVALID_TRANSACTION', '业务回调必须返回账本或业务操作结果');
      const next = 'ledger' in result ? result.ledger : result;
      assertLedgerContinuation(before.ledger, next); assertNativeOrder(before.ledger, next);
      // Core checks the content bound to existing request IDs before this no-op path. No SQL is appended for retries.
      if (equal(before.ledger, next)) {
        this.guard(scope, api);
        let confirmed = false;
        try { confirmed = await this.options.verifyPersisted!({ stage: 'refresh', scope: { ...scope }, api, ledger: copy(before.ledger), tables: copy(before.tables) }); }
        catch (error) { this.dirtyScopes.add(scopeKey(scope)); throw error; }
        this.guard(scope, api);
        if (confirmed !== true || !equal(before.rows, this.snapshot(scope, api).rows)) { this.dirtyScopes.add(scopeKey(scope)); fail('NATIVE_PERSISTENCE_UNCONFIRMED', '重复请求已有业务记录的目标聊天保存尚未确认，未返回成功回执'); }
        return copy(result);
      }
      const saved = await this.commit(scope, api, before, next); this.guard(scope, api);
      return 'ledger' in result ? copy({ ...result, ledger: saved }) : saved;
    });
  }
  async export(accountId: string): Promise<NativeLedgerBackup> {
    const scope = this.capture(); this.readable(scope);
    const snapshot = this.snapshot(scope); this.readable(scope);
    if (!snapshot.ledger || snapshot.ledger.accountId !== clean(accountId, '本源ID')) fail('MISSING_ACCOUNT', '当前聊天没有这份原生本源');
    this.guard(scope);
    return copy({ format: 'shiro-butterfly-ledger', version: 2, exportedAt: new Date().toISOString(), scope: { origin: scope.origin, handle: scope.handle, chat: scope.chat }, ledger: snapshot.ledger });
  }
  /** Explicit restore/migration only, into four empty v2 tables. A second native account is never created. */
  async import(textOrBackup: unknown, newAccountId?: string): Promise<Ledger> {
    const scope = this.capture(); let backup: unknown = textOrBackup;
    if (typeof textOrBackup === 'string') { try { backup = JSON.parse(textOrBackup); } catch { fail('INVALID_BACKUP', '备份不是完整JSON'); } }
    if (!backup || typeof backup !== 'object' || Array.isArray(backup)) fail('INVALID_BACKUP', '备份格式无效');
    const data = backup as { format?: string; version?: number; exportedAt?: string; scope?: { origin?: string; handle?: string; chat?: string }; ledger?: unknown };
    if (data.format !== 'shiro-butterfly-ledger' || ![1, 2].includes(data.version!) || typeof data.exportedAt !== 'string' || !Number.isFinite(Date.parse(data.exportedAt)) || !data.scope) fail('INVALID_BACKUP', '备份版本或元数据无效');
    clean(data.scope.origin, '备份源站'); clean(data.scope.handle, '备份用户'); if (data.version === 2) clean(data.scope.chat, '备份聊天');
    validateLedger(data.ledger); const ledger = copy(data.ledger);
    if (newAccountId !== undefined) ledger.accountId = clean(newAccountId, '恢复本源ID');
    validateLedger(ledger);
    return this.locked(scope, async api => { const before = this.snapshot(scope, api); if (before.ledger) fail('ACCOUNT_EXISTS', '当前聊天已有原生本源；恢复不会覆盖、合并或创建第二份'); return this.commit(scope, api, before, ledger); });
  }
  /** persisted=false stays latched until a fresh saved-chat verification succeeds (or tables are empty after reload). */
  async refresh(): Promise<Ledger | undefined> {
    const scope = this.capture(), api = this.api(scope), snapshot = this.snapshot(scope, api);
    if (snapshot.ledger) {
      if (!this.options.verifyPersisted) fail('NATIVE_VERIFICATION_REQUIRED', '尚未提供目标聊天保存确认，无法解除暂停');
      this.guard(scope, api);
      let verified = false;
      try {
        verified = await this.options.verifyPersisted({ stage: 'refresh', scope: { ...scope }, api, ledger: copy(snapshot.ledger), tables: copy(snapshot.tables) });
        this.guard(scope, api);
      } catch (error) { this.dirtyScopes.add(scopeKey(scope)); throw error; }
      if (verified !== true) { this.dirtyScopes.add(scopeKey(scope)); fail('NATIVE_PERSISTENCE_UNCONFIRMED', '刷新后仍未确认原生本源已保存至目标聊天'); }
      const latest = this.snapshot(scope, api);
      if (!equal(snapshot.rows, latest.rows) || !equal(snapshot.keys, latest.keys)) { this.dirtyScopes.add(scopeKey(scope)); fail('NATIVE_STALE', '刷新确认期间原生数据或表身份又发生变化，请重试'); }
    }
    this.dirtyScopes.delete(scopeKey(scope)); return snapshot.ledger ? copy(snapshot.ledger) : undefined;
  }
  async close(): Promise<void> {
    this.closed = true;
    for (const [api, callback] of this.listeners) api.unregisterTableUpdateCallback?.(callback);
    this.listeners.clear(); this.activeScopes.clear();
  }
}
