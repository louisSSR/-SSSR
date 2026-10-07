import { assertLedgerContinuation, createLedger, LedgerError, validateLedger, type Ledger, type OperationResult } from './core';

export interface StorageScope { origin: string; handle: string }
export interface LedgerBackup { format: 'shiro-butterfly-ledger'; version: 1; exportedAt: string; scope: StorageScope; ledger: Ledger }
interface RecordValue { key: [string, string, string]; ledger: Ledger }
const DB_NAME = 'shiro-butterfly-shop-v1';
const STORE = 'ledgers';
function clean(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) throw new LedgerError('INVALID_SCOPE', `${label}不能为空或超过 2048 字符`);
  return value.trim();
}
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function checkBackup(value: unknown): asserts value is LedgerBackup {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LedgerError('INVALID_BACKUP', '备份格式无效');
  const b = value as LedgerBackup;
  if (b.format !== 'shiro-butterfly-ledger' || b.version !== 1 || !b.scope || typeof b.exportedAt !== 'string' || !Number.isFinite(Date.parse(b.exportedAt))) throw new LedgerError('INVALID_BACKUP', '备份版本或元数据无效');
  clean(b.scope.origin, '源站'); clean(b.scope.handle, '酒馆用户'); validateLedger(b.ledger);
}
/** IndexedDB serializes overlapping readwrite transactions, including across tabs.
 * Every update reads current data and writes within ONE synchronous callback transaction.
 * Do not pass async callbacks or perform API work inside transact; generate first, then commit.
 */
export class LedgerStore {
  readonly scope: Readonly<StorageScope>;
  private dbPromise: Promise<IDBDatabase> | undefined;
  private readonly factory: IDBFactory;
  constructor(scope: StorageScope, factory: IDBFactory = globalThis.indexedDB) {
    this.scope = Object.freeze({ origin: clean(scope.origin, '源站'), handle: clean(scope.handle, '酒馆用户') });
    if (!factory) throw new LedgerError('STORAGE_UNAVAILABLE', '当前环境无法使用 IndexedDB；不会退回不安全的临时钱包');
    this.factory = factory;
  }
  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = this.factory.open(DB_NAME, 1);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'key' }); };
        request.onerror = () => reject(request.error ?? new LedgerError('STORAGE_ERROR', '无法打开账本数据库'));
        request.onblocked = () => reject(new LedgerError('STORAGE_BLOCKED', '另一旧标签页阻止账本数据库升级，请关闭旧页面后重试'));
        request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); this.dbPromise = undefined; }; resolve(db); };
      });
      this.dbPromise.catch(() => { this.dbPromise = undefined; });
    }
    return this.dbPromise;
  }
  private key(accountId: string): [string, string, string] { return [this.scope.origin, this.scope.handle, clean(accountId, '本源 ID')]; }
  async close(): Promise<void> { if (this.dbPromise) (await this.dbPromise).close(); this.dbPromise = undefined; }
  async list(): Promise<Ledger[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly'); const rows: Ledger[] = [];
      const request = tx.objectStore(STORE).openCursor(); let failure: unknown;
      request.onsuccess = () => {
        const cursor = request.result; if (!cursor) return;
        const record = cursor.value as RecordValue;
        if (record.key?.[0] === this.scope.origin && record.key?.[1] === this.scope.handle) {
          try { validateLedger(record.ledger); if (record.key[2] !== record.ledger.accountId) throw new LedgerError('BROKEN_STORAGE', '账本身份与存储键不符'); rows.push(copy(record.ledger)); } catch (error) { failure = error; tx.abort(); return; }
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve(rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      tx.onerror = tx.onabort = () => reject(failure ?? tx.error ?? new LedgerError('STORAGE_ERROR', '读取本源列表失败'));
    });
  }
  async read(accountId: string): Promise<Ledger | undefined> {
    const db = await this.open(), key = this.key(accountId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly'); const request = tx.objectStore(STORE).get(key); let output: Ledger | undefined, failure: unknown;
      request.onsuccess = () => {
        if (!request.result) return;
        try { const record = request.result as RecordValue; validateLedger(record.ledger); if (record.ledger.accountId !== key[2]) throw new LedgerError('BROKEN_STORAGE', '本源身份与存储键不符'); output = copy(record.ledger); } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => resolve(output);
      tx.onerror = tx.onabort = () => reject(failure ?? tx.error ?? new LedgerError('STORAGE_ERROR', '账本读取失败'));
    });
  }
  async create(accountId: string, label?: string): Promise<Ledger> { const ledger = createLedger(accountId, label); await this.insert(ledger); return copy(ledger); }
  private async insert(ledger: Ledger): Promise<void> {
    validateLedger(ledger); const db = await this.open(), key = this.key(ledger.accountId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite'); let failure: DOMException | null | undefined;
      const request = tx.objectStore(STORE).add({ key, ledger: copy(ledger) } satisfies RecordValue);
      // A request error bubbles before the transaction has necessarily populated tx.error.
      // Capture the original request error, allow the native abort, then classify it.
      request.onerror = () => { failure = request.error; };
      tx.oncomplete = () => resolve();
      tx.onerror = () => { failure ??= tx.error; };
      tx.onabort = () => { const error = failure ?? tx.error; reject(error?.name === 'ConstraintError' ? new LedgerError('ACCOUNT_EXISTS', '此本源已存在；恢复备份请使用新的本源 ID') : error ?? new LedgerError('STORAGE_ERROR', '本源创建失败')); };
    });
  }
  async transact<T>(accountId: string, operation: (ledger: Ledger) => OperationResult<T>): Promise<OperationResult<T>>;
  async transact(accountId: string, operation: (ledger: Ledger) => Ledger): Promise<Ledger>;
  async transact<T>(accountId: string, operation: (ledger: Ledger) => OperationResult<T> | Ledger): Promise<OperationResult<T> | Ledger> {
    const db = await this.open(), key = this.key(accountId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE); let output: OperationResult<T> | Ledger, failure: unknown;
      const request = store.get(key);
      request.onsuccess = () => {
        try {
          if (!request.result) throw new LedgerError('MISSING_ACCOUNT', '本源不存在');
          const before = (request.result as RecordValue).ledger; validateLedger(before);
          if (before.accountId !== key[2]) throw new LedgerError('BROKEN_STORAGE', '本源身份与存储键不符');
          if (operation.constructor.name === 'AsyncFunction') throw new LedgerError('ASYNC_TRANSACTION', '账本事务不能使用异步回调；请先完成 API 请求再提交');
          const result = operation(copy(before));
          if (result && typeof result === 'object' && 'then' in result && typeof result.then === 'function') {
            void Promise.resolve(result).catch(() => undefined);
            throw new LedgerError('ASYNC_TRANSACTION', '账本事务不能使用异步回调；请先完成 API 请求再提交');
          }
          if (!result || typeof result !== 'object') throw new LedgerError('INVALID_TRANSACTION', '账本事务必须返回账本或业务操作结果');
          const next = 'ledger' in result ? result.ledger : result; assertLedgerContinuation(before, next);
          output = copy(result);
          if (JSON.stringify(before) !== JSON.stringify(next)) store.put({ key, ledger: copy(next) } satisfies RecordValue);
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => resolve(output);
      tx.onerror = tx.onabort = () => reject(failure ?? tx.error ?? new LedgerError('STORAGE_ERROR', '账本保存失败；本次交易未提交'));
    });
  }
  async export(accountId: string): Promise<LedgerBackup> {
    const ledger = await this.read(accountId); if (!ledger) throw new LedgerError('MISSING_ACCOUNT', '本源不存在');
    return { format: 'shiro-butterfly-ledger', version: 1, exportedAt: new Date().toISOString(), scope: { ...this.scope }, ledger };
  }
  /** Import only into an absent ID. Existing history is never overwritten, even by an older valid backup. */
  async import(backup: unknown, newAccountId?: string): Promise<Ledger> {
    checkBackup(backup); const ledger = copy(backup.ledger);
    if (newAccountId !== undefined) ledger.accountId = clean(newAccountId, '恢复后的本源 ID');
    validateLedger(ledger); await this.insert(ledger); return copy(ledger);
  }
}
