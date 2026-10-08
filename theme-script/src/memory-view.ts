/** Read-only, bounded projection of the shop's committed ledger; never native database internals. */
export const MEMORY_KEYS = ['impressions', 'accounts', 'inventory', 'ripples'] as const;
export type MemoryTableKey = typeof MEMORY_KEYS[number];
export interface MemoryPageOptions { query?: string; offsets?: Partial<Record<MemoryTableKey, number>>; limit?: number }
export interface MemorySnapshot {
  version: 1;
  scope: { origin: string; handle: string; chat: string; account: string };
  revision: number;
  updatedAt: string;
  tables: { key: MemoryTableKey; title: string; columns: string[]; total: number; offset: number; limit: number; rows: string[][]; recordIds: string[] }[];
}
export type MemorySnapshotNotice = Readonly<{ chat: string; account: string; revision: number }> | null;
export interface MemorySnapshotSource {
  readMemorySnapshot(options?: MemoryPageOptions): Promise<MemorySnapshot | null>;
  subscribeMemorySnapshots(listener: (notice: MemorySnapshotNotice) => void): () => void;
  exportCompleteMemory(): Promise<void>;
}

function validSnapshot(value: MemorySnapshot): boolean {
  const integer = (number: number) => Number.isSafeInteger(number) && number >= 0;
  return value?.version === 1 && value.scope &&
    ['origin', 'handle', 'chat', 'account'].every(key => typeof value.scope[key as keyof typeof value.scope] === 'string') &&
    integer(value.revision) && typeof value.updatedAt === 'string' && Array.isArray(value.tables) && value.tables.length === 4 &&
    MEMORY_KEYS.every(key => value.tables.filter(table => table?.key === key).length === 1) &&
    value.tables.every(table => typeof table.title === 'string' && Array.isArray(table.columns) && table.columns.length > 0 &&
      table.columns.length <= 16 && table.columns.every(column => typeof column === 'string') &&
      integer(table.total) && integer(table.offset) && integer(table.limit) && table.limit >= 1 && table.limit <= 100 &&
      Array.isArray(table.rows) && table.rows.length <= table.limit && Array.isArray(table.recordIds) &&
      table.rows.length === table.recordIds.length && table.recordIds.every(id => typeof id === 'string') &&
      table.rows.every(row => Array.isArray(row) && row.length === table.columns.length && row.every(cell => typeof cell === 'string')));
}

/** One subscription per renderer, regardless of native sidebar/drawer remounts. */
export function createMemoryView(doc: Document) {
  type View = { node: HTMLElement; summary: HTMLButtonElement; body: HTMLElement; render: () => void; stop: () => void };
  const views = new Set<View>();
  let source: MemorySnapshotSource | undefined, unsubscribe: (() => void) | undefined;
  let disposed = false, open = false, loading = false, exporting = false, sequence = 0, exportSequence = 0;
  let snapshot: MemorySnapshot | undefined, expected: Exclude<MemorySnapshotNotice, null> | undefined;
  let query = '', queryEpoch = 0, viewSequence = 0, selected: MemoryTableKey = 'impressions', offsets: Partial<Record<MemoryTableKey, number>> = {};
  let message = '打开聊天并选择本源后，可查看四表。';

  function render(): void { for (const view of views) view.render(); }
  function invalidate(text: string, reset = false): void {
    sequence++; exportSequence++; snapshot = undefined; loading = false; exporting = false; message = text;
    if (reset) { query = ''; queryEpoch++; offsets = {}; }
    render();
  }
  function disconnect(): void {
    try { unsubscribe?.(); } catch { /* Only our subscription, never the service's global listeners. */ }
    unsubscribe = undefined; expected = undefined;
    invalidate('打开聊天并选择本源后，可查看四表。', true);
  }
  function connect(): void {
    if (disposed || !source || !views.size || unsubscribe) return;
    const current = source;
    try {
      unsubscribe = current.subscribeMemorySnapshots(notice => {
        if (disposed || source !== current || !views.size) return;
        if (!notice) { expected = undefined; invalidate('当前聊天或本源未就绪，旧资料已清空。', true); return; }
        if (typeof notice.chat !== 'string' || typeof notice.account !== 'string' || !Number.isSafeInteger(notice.revision) || notice.revision < 0) {
          expected = undefined; invalidate('四表通知不兼容，旧资料已清空。', true); return;
        }
        const previous = expected ?? snapshot?.scope;
        const switched = !previous || previous.chat !== notice.chat || previous.account !== notice.account;
        expected = notice;
        if (switched) invalidate('聊天或本源已切换，正在读取当前四表…', true);
        if (open) void read();
      });
    } catch { invalidate('暂时无法订阅四表，请稍后重新打开。'); }
    if (open) void read();
  }
  async function read(): Promise<void> {
    if (disposed || !source || !views.size || !open) return;
    const current = source, ticket = ++sequence, request = { query, offsets: { ...offsets }, limit: 50 };
    loading = true; message = '正在读取已提交账本…'; render();
    try {
      const value = await current.readMemorySnapshot(request);
      if (disposed || source !== current || ticket !== sequence || !open || !views.size) return;
      if (!value) { invalidate('打开聊天并选择本源后，可查看四表。', true); return; }
      if (!validSnapshot(value) || value.scope.origin !== doc.location.origin) throw new Error('四表返回格式或来源不兼容');
      if (expected && (value.scope.chat !== expected.chat || value.scope.account !== expected.account || value.revision < expected.revision)) {
        invalidate('账本正在切换或更新，旧资料已清空；请刷新。'); return;
      }
      snapshot = value; expected = { chat: value.scope.chat, account: value.scope.account, revision: value.revision };
      loading = false; message = `账本版本 ${value.revision} · ${value.updatedAt}`; render();
    } catch {
      if (disposed || source !== current || ticket !== sequence) return;
      invalidate('读取期间聊天、本源或登录状态变化，旧资料已清空；请刷新。');
    }
  }
  function setOpen(value: boolean): void {
    if (disposed || !source || !views.size) return;
    open = value;
    if (open) { render(); void read(); }
    else invalidate('打开聊天并选择本源后，可查看四表。');
  }
  async function exportComplete(): Promise<void> {
    if (disposed || !source || !snapshot || loading || exporting) return;
    const current = source, ticket = ++exportSequence;
    exporting = true; render();
    try {
      await current.exportCompleteMemory();
      if (!disposed && source === current && ticket === exportSequence) { exporting = false; render(); }
    } catch {
      if (!disposed && source === current && ticket === exportSequence) invalidate('导出未完成，旧资料已清空；请确认聊天、本源和连接，再刷新重试。');
    }
  }
  function attach(anchor: Element): { node: HTMLElement; dispose: () => void } {
    const node = doc.createElement('section'); node.className = 'shiro-db-memory'; node.dataset.shiroDatabaseDecoration = 'memory';
    node.setAttribute('aria-label', '蝴蝶四表 · 实时账本');
    const summary = doc.createElement('button'); summary.type = 'button'; summary.className = 'shiro-db-memory-summary';
    const body = doc.createElement('div'); body.className = 'shiro-db-memory-body';
    body.id = `shiro-db-memory-body-${++viewSequence}`; summary.setAttribute('aria-controls', body.id);
    let lastQueryEpoch = -1;
    const listeners: (() => void)[] = [];
    const on = (target: EventTarget, event: string, listener: EventListener) => {
      target.addEventListener(event, listener); listeners.push(() => target.removeEventListener(event, listener));
    };
    const alive = () => !disposed && views.has(view) && node.isConnected;
    const button = (label: string, className: string, action: () => void) => {
      const element = doc.createElement('button'); element.type = 'button'; element.className = className; element.textContent = label;
      on(element, 'click', () => { if (alive()) action(); }); return element;
    };
    const status = doc.createElement('p'); status.className = 'shiro-db-memory-status'; status.setAttribute('role', 'status');
    const scope = doc.createElement('p'); scope.className = 'shiro-db-memory-scope';
    const form = doc.createElement('form'); form.className = 'shiro-db-memory-search';
    const input = doc.createElement('input'); input.type = 'search'; input.maxLength = 200; input.placeholder = '搜索四表完整记录'; input.setAttribute('aria-label', '搜索四表完整记录');
    const search = doc.createElement('button'); search.type = 'submit'; search.textContent = '搜索';
    form.append(input, search);
    on(form, 'submit', event => { event.preventDefault(); if (!alive()) return; query = input.value.slice(0, 200); queryEpoch++; offsets = {}; void read(); });
    const tabs = doc.createElement('div'); tabs.className = 'shiro-db-memory-tabs'; tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', '选择四表');
    const labels = ['印象', '点数', '消费与所得', '连锁反应'];
    const tabButtons = MEMORY_KEYS.map((key, index) => { const element = button(labels[index], 'shiro-db-memory-tab', () => { selected = key; render(); }); element.dataset.shiroMemoryTab = key; tabs.append(element); return element; });
    const results = doc.createElement('div'); results.className = 'shiro-db-memory-results'; results.tabIndex = 0; results.setAttribute('aria-label', '表格内容，可滚动');
    const controls = doc.createElement('div'); controls.className = 'shiro-db-memory-controls';
    const previous = button('上一页', 'shiro-db-memory-previous', () => { offsets[selected] = Math.max(0, (offsets[selected] ?? 0) - 50); void read(); });
    const next = button('下一页', 'shiro-db-memory-next', () => { offsets[selected] = (offsets[selected] ?? 0) + 50; void read(); });
    const page = doc.createElement('span'); page.className = 'shiro-db-memory-page';
    const refresh = button('刷新', 'shiro-db-memory-refresh', () => { void read(); });
    const download = button('导出完整四表', 'shiro-db-memory-export', () => { void exportComplete(); });
    controls.append(previous, page, next, refresh, download);
    const note = doc.createElement('p'); note.className = 'shiro-db-memory-note'; note.textContent = '只读本源账本；原生导入表是独立快照。本视图与完整导出不占 AI 摘要预算。';
    body.append(status, scope, form, tabs, results, controls, note); node.append(summary, body);
    const view: View = { node, summary, body, render() {
      summary.textContent = open ? '收起蝴蝶四表' : '蝴蝶四表 · 查看实时账本'; summary.setAttribute('aria-expanded', String(open));
      body.hidden = !open; node.dataset.shiroMemoryOpen = String(open); status.textContent = message;
      // A committed revision must not erase a search draft the user is still typing.
      // An identity reset or submitted query does synchronize all mounted views.
      if (lastQueryEpoch !== queryEpoch) { input.value = query; lastQueryEpoch = queryEpoch; }
      scope.textContent = snapshot ? `当前登录：${snapshot.scope.handle} · 本源：${snapshot.scope.account} · 当前聊天 ${snapshot.scope.chat}` : '';
      form.setAttribute('aria-busy', String(loading)); node.setAttribute('aria-busy', String(loading));
      tabButtons.forEach((element, index) => { element.setAttribute('aria-pressed', String(MEMORY_KEYS[index] === selected)); element.disabled = loading; });
      results.replaceChildren();
      const table = snapshot?.tables.find(value => value.key === selected);
      if (table && !loading) {
        const grid = doc.createElement('table'); grid.className = 'shiro-db-memory-table'; grid.dataset.shiroMemoryTable = table.key;
        const caption = doc.createElement('caption'); caption.textContent = table.title;
        const head = doc.createElement('thead'), header = doc.createElement('tr');
        for (const name of [...table.columns, '记录ID']) { const cell = doc.createElement('th'); cell.scope = 'col'; cell.textContent = name; header.append(cell); }
        head.append(header); const rows = doc.createElement('tbody');
        table.rows.forEach((row, index) => {
          const line = doc.createElement('tr'); line.dataset.shiroMemoryRecord = table.recordIds[index];
          for (const value of [...row, table.recordIds[index]]) { const cell = doc.createElement('td'); cell.textContent = value; line.append(cell); }
          rows.append(line);
        });
        grid.append(caption, head, rows); results.append(grid);
        if (!table.rows.length) { const empty = doc.createElement('p'); empty.textContent = table.total ? '本页没有记录，请返回上一页。' : '暂无匹配记录。'; results.append(empty); }
        page.textContent = `${table.total ? table.offset + 1 : 0}–${table.offset + table.rows.length} / ${table.total}`;
      } else page.textContent = '';
      previous.disabled = loading || !table || table.offset === 0;
      next.disabled = loading || !table || table.offset + table.rows.length >= table.total;
      refresh.disabled = loading; download.disabled = loading || exporting || !snapshot;
      download.textContent = exporting ? '正在导出…' : '导出完整四表';
    }, stop() { for (const stop of listeners.splice(0)) stop(); } };
    on(summary, 'click', () => { if (alive()) setOpen(!open); });
    views.add(view); anchor.insertAdjacentElement('afterend', node); view.render(); connect();
    let removed = false;
    return { node, dispose() {
      if (removed) return; removed = true; view.stop(); views.delete(view); node.remove();
      if (!views.size) { open = false; disconnect(); }
    } };
  }
  return {
    attach,
    open() { setOpen(true); },
    setSource(value?: MemorySnapshotSource) {
      if (disposed || source === value) return;
      disconnect(); source = value; connect();
    },
    dispose() {
      if (disposed) return; disposed = true; disconnect();
      for (const view of views) { view.stop(); view.node.remove(); } views.clear(); source = undefined;
    },
  };
}
