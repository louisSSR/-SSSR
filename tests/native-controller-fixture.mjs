// Controller boundary fixture: real repository + Node SQLite; host/saveChat and browser locks are explicit fixtures.
import { DatabaseSync } from 'node:sqlite';
import { EventEmitter } from 'node:events';
import 'vue';
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
export function nativeControllerHarness({ load, core, protocol, income, response }, saved = {}, options = {}) {
  const schema = load('native-schema.ts'), { NativeFourTableRepository } = load('native-storage.ts');
  const events = new EventEmitter(), uploads = [], downloads = [], prompts = [], chats = new Map(), callbacks = new Set();
  let chat = 'chat-A', handle = 'alice', generation = () => Promise.resolve(response()), chatOpen = true, storyText = '落水者已经安全获救', stamp = 'story1', gate, transactionStarted, readGate, readStarted;
  const settings = new Map(['chat-A', 'chat-B'].map(id => [`shiro-butterfly-shop:settings:v2:alice:${id}`, JSON.stringify({ accountId: 'wallet', provider: 'host', preset: '', autoWorld: false, autoSettle: false, worldNotes: '', syncChats: [], ...saved })]));
  globalThis.location = { origin: 'https://example.test' };
  globalThis.localStorage = { getItem: k => settings.get(k) ?? null, setItem: (k, value) => settings.set(k, value) };
  globalThis.BroadcastChannel = class { postMessage() {} close() {} };
  globalThis.document = { hidden: false, getElementById: () => null, addEventListener() {}, removeEventListener() {} };
  const nativeScope = id => ({ origin: location.origin, handle, chat: id });
  function seed(id, ledger) {
    chats.get(id)?.db.close(); const data = schema.createNativeFourTableExport(ledger, nativeScope(id)), db = new DatabaseSync(':memory:');
    for (const table of schema.NATIVE_FOUR_TABLES) { db.exec(data[table.key].sourceData.ddl); for (const values of data[table.key].content.slice(1)) db.prepare(`INSERT INTO ${table.sqlName} (row_id,${table.columns.map(c => c.sql).join(',')}) VALUES (${values.map(() => '?').join(',')})`).run(...values); }
    chats.set(id, { data, db, persisted: clone(data) });
  }
  const initial = options.ledger ?? core.credit(core.createLedger('wallet'), income()).ledger;
  seed('chat-A', initial); seed('chat-B', options.chatBLedger ?? clone(initial));
  const currentState = () => chats.get(chat);
  const records = {
    get(id) { const ledger = schema.readNativeSnapshot(currentState().data, nativeScope(chat)).ledger; return ledger?.accountId === id ? clone(ledger) : undefined; },
    set(id, ledger) { if (ledger.accountId !== id) throw new Error('fixture account mismatch'); seed(chat, ledger); return records; },
    *[Symbol.iterator]() { const ledger = schema.readNativeSnapshot(currentState().data, nativeScope(chat)).ledger; if (ledger) yield [ledger.accountId, clone(ledger)]; },
  };
  const api = {
    exportTableAsJson: () => currentState().data,
    executeSqlQuery(request) { const rows = currentState().db.prepare(request.sql).all().map(row => ({ ...row })); return { columns: ['shiro_native_sql_ready'], values: rows.map(row => [row.shiro_native_sql_ready]), rows, rowCount: rows.length }; },
    registerTableUpdateCallback: cb => callbacks.add(cb), unregisterTableUpdateCallback: cb => callbacks.delete(cb),
    async executeSqlBatch(request) {
      const state = currentState();
      try { state.db.exec('BEGIN'); state.db.exec(request.sql); state.db.exec('COMMIT'); }
      catch (error) { state.db.exec('ROLLBACK'); return { success: false, saved: true, errors: [error.message] }; }
      for (const table of schema.NATIVE_FOUR_TABLES) state.data[table.key].content = [state.data[table.key].content[0], ...state.db.prepare(`SELECT * FROM ${table.sqlName} ORDER BY row_id`).all().map(row => [String(row.row_id), ...table.columns.map(c => row[c.sql])])];
      state.persisted = clone(state.data); for (const callback of callbacks) callback(state.data, { persisted: true });
      return { success: true, saved: true, errors: [], changes: 1, modifiedKeys: request.targetSheetKeys };
    },
  };
  const lockQueue = new Map();
  const fixtureLocks = { request(name, _options, callback) { const prior = lockQueue.get(name) ?? Promise.resolve(); const next = prior.catch(() => undefined).then(async () => { transactionStarted?.resolve(); if (gate) { const wait = gate; gate = undefined; await wait.promise; } return callback(); }); lockQueue.set(name, next); return next; } };
  class FixtureNativeRepository extends NativeFourTableRepository {
    constructor(options) { super({ ...options, locks: fixtureLocks }); }
    async read(id) { if (readGate) { const waiting = readGate; readGate = undefined; readStarted.resolve(); await waiting.promise; } return super.read(id); }
  }
  const hostContext = { eventSource: events, eventTypes: Object.fromEntries(['CHAT_CHANGED', 'MESSAGE_RECEIVED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_DELETED', 'GENERATION_AFTER_COMMANDS'].map(k => [k, k])), generateQuietPrompt: (...args) => generation(...args) };
  if (options.tokenizer !== null) hostContext.getTokenCountAsync = options.tokenizer ?? (async text => Math.ceil(new TextEncoder().encode(text).length / 3));
  const host = {
    MODULE_ID: 'shiro-butterfly-shop', context: () => hostContext, chatIdentity: () => chat, hasChat: () => chatOpen, verifiedHandle: async () => options.verifyHandle ? options.verifyHandle() : handle,
    verifyNativeChatSaved: async (id, tables) => id === chat && JSON.stringify(chats.get(id).persisted) === JSON.stringify(tables),
    storyContext: () => ({ text: storyText, evidence: storyText, stamp: `${chat}:${stamp}` }), setLedgerPrompt: value => prompts.push({ chat, account: controller.state.settings.accountId, value }), download: (...args) => downloads.push(args), serverBackup: (...args) => uploads.push(args),
  };
  const database = { discoverDatabaseApi: () => api, callDatabaseAI: () => { throw new Error('unused'); } };
  const { createController } = load('controller.ts', { './core': core, './protocol': protocol, './native-storage': { NativeFourTableRepository: FixtureNativeRepository }, './host': host, './database': database });
  const controller = createController();
  return { controller, records, downloads, prompts, settings, events, hostContext, setChatLedger: seed, setGeneration: fn => { generation = fn; }, setHandle: value => { handle = value; }, setStory: (text, id = 'changed') => { storyText = text; stamp = id; }, changeChat: value => { chat = value; events.emit('CHAT_CHANGED'); }, closeChat: () => { chatOpen = false; events.emit('CHAT_CHANGED'); }, holdTransaction() { gate = deferred(); transactionStarted = deferred(); return { entered: transactionStarted.promise, release: gate.resolve }; }, holdRead() { readGate = deferred(); readStarted = deferred(); return { entered: readStarted.promise, release: readGate.resolve }; } };
}
