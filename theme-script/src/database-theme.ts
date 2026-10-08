import themeCss from './database-theme.css';
import { createPuppetPresentation, type PuppetCompanion } from './puppet';
import { createMemoryView, type MemorySnapshotSource } from './memory-view';

/** Public DOM decoration and optional read-only shop projection; never native database stores. */
export interface DatabaseThemeOptions {
  /** Directory containing the independent shiro-puppet-sheet.png. */
  assetBase: string;
  /** Optional self-contained PNG for the helper-script delivery; never arbitrary data: HTML/SVG. */
  embeddedPng?: string;
  enabled: boolean;
  onStatus?: (status: string) => void;
  /** Opens the shop's task page; no native database stores are accessed. */
  onNavigate?: (tab: 'memory' | 'quests') => void;
  /** Optional bounded read-only view of the shop's committed ledger. */
  memorySource?: MemorySnapshotSource;
  /** Useful for an explicitly supplied host document and isolated DOM tests. */
  hostDocument?: Document;
}

export interface DatabaseThemeMount {
  setEnabled(enabled: boolean): void;
  setNavigate(navigate?: (tab: 'memory' | 'quests') => void): void;
  setMemorySource(source?: MemorySnapshotSource): void;
  getStatus(): string;
  dispose(): void;
}

const MARKER = 'data-shiro-database-theme';
const VERSION = 'blank-chess-v1';
const OWNER = Symbol.for('shiro-database-theme:renderer');
const ROOT = '.acu-v2-app';
const COMPANION = '.acu-desk-pet-layer';
const COMPANION_MARKER = 'data-shiro-database-companion';
const NOTICE_MARKER = 'data-shiro-database-notices';
const NOTICE_DOCK_MARKER = 'data-shiro-database-notice-dock';
type OwnedDocument = Document & { [OWNER]?: DatabaseThemeMount };
type Decoration = { root: Element; nodes: Set<HTMLElement> };

/** Assets stay on the extension's host; an arbitrary URL cannot become a tracking image. */
export function databaseThemeAsset(base: string, documentUrl: string): string {
  const host = new URL(documentUrl);
  const directory = new URL(base, host);
  if (directory.username || directory.password || directory.search || directory.hash ||
      directory.origin !== host.origin || !['http:', 'https:', 'file:'].includes(directory.protocol) ||
      (directory.protocol === 'file:' && host.protocol !== 'file:')) {
    throw new Error('白主题图片目录必须位于当前酒馆来源');
  }
  if (!directory.pathname.endsWith('/')) directory.pathname += '/';
  return new URL('shiro-puppet-sheet.png', directory).href;
}

export function databaseThemeEmbeddedPng(value: string): string {
  if (value.length > 8 * 1024 * 1024 || !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value) ||
      (value.length - 'data:image/png;base64,'.length) % 4 !== 0) {
    throw new Error('内嵌白主题图片必须是 8 MiB 以内的 PNG Base64');
  }
  return value;
}

/** Recognise both original v2 workbench and original database editor; unknown layouts stay untouched. */
export function inspectDatabaseThemeRoot(root: Element): { headers: Element[]; sidebars: Element[] } | null {
  if (!root.matches(ROOT)) return null;
  const shell = root.querySelector(':scope > .acu-v2-app__shell');
  const body = shell?.querySelector(':scope > .acu-v2-app__body');
  const content = body?.querySelector(':scope > .acu-v2-app__content');
  if (!shell || !body || !content) return null;
  const header = content.querySelector(':scope > .acu-v2-app__header');
  const editor = content.querySelector(':scope > .acu-visualizer-surface');
  if (header && header.querySelector('.acu-v2-app__header-left') && header.querySelector('.acu-v2-app__header-right') &&
      body.querySelector(':scope > .acu-v2-sidebar')) {
    return { headers: [header], sidebars: [...root.querySelectorAll('.acu-v2-sidebar')] };
  }
  const editorHeader = editor?.querySelector('.acu-visualizer-surface__main > .acu-visualizer-surface__topbar');
  const editorNav = editor?.querySelector('.acu-visualizer-surface__sidebar > .acu-visualizer-nav');
  if (editorHeader && editorNav) {
    return { headers: [editorHeader], sidebars: [...editor!.querySelectorAll('.acu-visualizer-nav')] };
  }
  return null;
}

export function mountDatabaseTheme(options: DatabaseThemeOptions): DatabaseThemeMount {
  const doc = (options.hostDocument ?? document) as OwnedDocument;
  doc[OWNER]?.dispose();
  const win = doc.defaultView!;
  if (!win) throw new Error('数据库主题需要已挂载的文档');
  let enabled = Boolean(options.enabled), disposed = false, queued = false;
  let status = '', imageUrl = '', assetError = '';
  let navigate = options.onNavigate;
  let memorySource = options.memorySource;
  try { imageUrl = options.embeddedPng === undefined ? databaseThemeAsset(options.assetBase, doc.baseURI) : databaseThemeEmbeddedPng(options.embeddedPng); }
  catch (error) { assetError = error instanceof Error ? error.message : '图片目录无效'; }
  const decorated = new Map<Element, Decoration>();
  const companions = new Map<Element, PuppetCompanion>();
  const brandDisposers = new Map<HTMLElement, () => void>();
  const memory = createMemoryView(doc);
  memory.setSource(memorySource);
  const puppet = createPuppetPresentation(doc, imageUrl, quiet => {
    for (const { root } of decorated.values()) root.setAttribute('data-shiro-puppet-quiet', String(quiet));
  });
  const style = doc.createElement('style');
  style.dataset.shiroDatabaseStyle = VERSION;
  style.textContent = themeCss;
  const layoutStyle = doc.createElement('style');
  layoutStyle.dataset.shiroDatabaseLayout = VERSION;
  let noticesOpen = false;
  let dockedNoticeLayer: Element | null = null;
  const viewport = win.visualViewport;

  function clearNoticeDock(): void {
    if (dockedNoticeLayer?.getAttribute(NOTICE_DOCK_MARKER) === VERSION) dockedNoticeLayer.removeAttribute(NOTICE_DOCK_MARKER);
    dockedNoticeLayer = null;
  }
  function updateViewport(): void {
    if (disposed || !enabled || !decorated.size) { clearNoticeDock(); layoutStyle.remove(); return; }
    const narrow = win.innerWidth <= 767 || (win.innerWidth <= 1024 && win.matchMedia?.('(pointer: coarse)').matches);
    // Do not counteract browser pinch zoom. The visual viewport differs from dvh when
    // a software keyboard pans/shrinks a page without resizing its layout viewport.
    if (!narrow || !viewport || Math.abs(viewport.scale - 1) > .01) { clearNoticeDock(); layoutStyle.remove(); return; }
    const values = [viewport.width, viewport.height, viewport.offsetTop, viewport.offsetLeft];
    if (values.some(value => !Number.isFinite(value)) || viewport.width <= 0 || viewport.height <= 0) { clearNoticeDock(); layoutStyle.remove(); return; }
    const [width, height, viewportTop, viewportLeft] = values.map(value => Math.round(value * 100) / 100);
    // ST's html transform/perspective can own fixed descendants. In that case
    // window scrolling shifts the whole native shell; compensate inside our scope.
    const htmlStyle = win.getComputedStyle(doc.documentElement);
    const documentFixed = (htmlStyle.transform && htmlStyle.transform !== 'none') || (htmlStyle.perspective && htmlStyle.perspective !== 'none');
    const top = viewportTop + (documentFixed ? win.scrollY : 0), left = viewportLeft + (documentFixed ? win.scrollX : 0);
    const open = [...decorated.keys()].some(root => {
      const shell = root.querySelector(':scope > .acu-v2-app__shell');
      return shell && win.getComputedStyle(shell).display !== 'none';
    });
    // Warning tone may contain a generic carousel sentence for a real warning.
    // Preserve it instead of inferring origin from words; reserve actual space.
    const notices = open ? [...companions.keys()].flatMap(layer => [...layer.querySelectorAll(':scope > .acu-notice-bubble')].filter(bubble =>
      win.getComputedStyle(bubble).display !== 'none' &&
      (layer.getAttribute(NOTICE_MARKER) !== 'quiet' || bubble.matches('.acu-notice-bubble--warning, .acu-notice-bubble--error') || bubble.querySelector('.acu-notice-bubble__action')))) : [];
    // Dock only one visible notice; multiple visible notices keep native geometry.
    // The base mobile viewport layout remains independent of this single-notice dock.
    const notice = notices.length === 1 ? notices[0] : null;
    const layer = notice?.parentElement;
    const canDock = layer && (!layer.hasAttribute(NOTICE_DOCK_MARKER) || layer.getAttribute(NOTICE_DOCK_MARKER) === VERSION);
    const measured = canDock ? notice!.getBoundingClientRect().height : 0;
    const noticeMaxHeight = Math.max(44, Math.min(160, height * .25));
    const reserve = measured > 0 && Number.isFinite(measured) ? Math.min(Math.ceil(measured), noticeMaxHeight) + 16 : 0;
    if (dockedNoticeLayer !== layer || !reserve) clearNoticeDock();
    if (reserve) { layer!.setAttribute(NOTICE_DOCK_MARKER, VERSION); dockedNoticeLayer = layer!; }
    const available = Math.max(1, height - reserve);
    let next = `.acu-v2-app[${MARKER}="${VERSION}"],#acu-app-v2:has(> .acu-v2-app[${MARKER}="${VERSION}"]){--shiro-db-viewport-width:${width}px;--shiro-db-viewport-height:${available}px;--shiro-db-viewport-top:${top + reserve}px;--shiro-db-viewport-left:${left}px;--shiro-db-masthead-display:${available < 460 ? 'none' : 'flex'};}`;
    if (reserve) next += `.acu-desk-pet-layer[${COMPANION_MARKER}="${VERSION}"][${NOTICE_DOCK_MARKER}="${VERSION}"]{--shiro-db-notice-top:${top + 8}px;--shiro-db-notice-left:${left + 8}px;--shiro-db-notice-width:${Math.max(1, width - 16)}px;--shiro-db-notice-max-height:${noticeMaxHeight}px;}`;
    if (layoutStyle.textContent !== next) layoutStyle.textContent = next;
    if (!layoutStyle.isConnected) (doc.head ?? doc.documentElement).append(layoutStyle);
  }

  function report(next: string): void {
    if (next === status) return;
    status = next;
    // A consumer's status view must not break host lifecycle or leave partial decoration behind.
    try { options.onStatus?.(next); } catch { /* external UI callback */ }
  }
  function text(tag: string, className: string, value: string): HTMLElement {
    const node = doc.createElement(tag);
    node.className = className;
    node.textContent = value;
    return node;
  }
  function makeBrand(kind: 'masthead' | 'portrait'): HTMLElement {
    const node = doc.createElement('div');
    node.className = `shiro-db-${kind}`;
    node.dataset.shiroDatabaseDecoration = kind;
    const sprite = puppet.sprite('shiro-db-avatar');
    let avatar: HTMLElement = sprite;
    if (kind === 'portrait') {
      const button = doc.createElement('button'); button.type = 'button'; button.className = 'shiro-db-puppet-avatar-button';
      button.setAttribute('aria-label', '和木偶白开个玩笑'); button.append(sprite); avatar = button;
    }
    const copy = text('div', 'shiro-db-copy', '');
    copy.append(text('span', 'shiro-db-eyebrow', '「　」 BLANK'),
      text('strong', 'shiro-db-name', kind === 'masthead' ? '白 · 空白棋局' : '白 · SHIRO'),
      text('span', 'shiro-db-caption', kind === 'masthead' ? '木偶白，正在看守这盘记忆。' : '小小木偶，也会认真吐槽。'));
    const pieces = text('span', 'shiro-db-pieces', '♔  ♟');
    pieces.setAttribute('aria-hidden', 'true');
    node.append(avatar, copy, pieces);
    if (kind === 'portrait') brandDisposers.set(node, puppet.portrait(node, sprite, avatar as HTMLButtonElement));
    return node;
  }
  function makeShortcuts(): HTMLElement {
    const node = doc.createElement('div');
    node.className = 'shiro-db-shortcuts';
    node.dataset.shiroDatabaseDecoration = 'shortcuts';
    node.setAttribute('role', 'group');
    node.setAttribute('aria-label', '蝴蝶效应账本入口');
    const entries: ['memory' | 'quests', string][] = [];
    if (memorySource) entries.push(['memory', '蝴蝶四表']);
    if (navigate) entries.push(['quests', '白的委托']);
    for (const [tab, label] of entries) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'shiro-db-shortcut';
      button.dataset.shiroTab = tab;
      button.textContent = label;
      button.addEventListener('click', () => {
        if (disposed || !enabled || !node.isConnected) return;
        if (tab === 'memory') memory.open();
        else navigate?.(tab);
      });
      node.append(button);
    }
    return node;
  }
  function makeNoticeToggle(): HTMLButtonElement {
    const button = doc.createElement('button');
    button.type = 'button'; button.className = 'shiro-db-notices';
    button.dataset.shiroDatabaseDecoration = 'notices';
    button.addEventListener('click', () => {
      if (disposed || !enabled || !button.isConnected) return;
      noticesOpen = !noticesOpen;
      refresh();
    });
    return button;
  }
  function clear(record: Decoration): void {
    for (const node of record.nodes) { brandDisposers.get(node)?.(); brandDisposers.delete(node); node.remove(); }
    if (record.root.getAttribute(MARKER) === VERSION) record.root.removeAttribute(MARKER);
    record.root.removeAttribute('data-shiro-puppet-quiet');
    decorated.delete(record.root);
  }
  function clearCompanion(layer: Element): void {
    if (dockedNoticeLayer === layer) clearNoticeDock();
    companions.get(layer)?.dispose();
    if (layer.getAttribute(COMPANION_MARKER) === VERSION) layer.removeAttribute(COMPANION_MARKER);
    layer.removeAttribute(NOTICE_MARKER);
    companions.delete(layer);
  }
  function refreshCompanions(): void {
    // Upstream DeskPetLayer teleports this exact public layer to body. Never decorate arbitrary overlays.
    const candidates = decorated.size ? [...doc.querySelectorAll(`body > ${COMPANION}`)].filter(layer => {
      const bodyImage = layer.querySelector(':scope > .acu-desk-pet > .acu-desk-pet__body > .acu-desk-pet__flip > img.acu-desk-pet__img');
      const peekImage = layer.querySelector(':scope > .acu-desk-pet > .acu-desk-pet__peek > img.acu-desk-pet__peek-img');
      const noticeBody = layer.querySelector(':scope > .acu-notice-bubble > .acu-notice-bubble__body');
      return bodyImage || peekImage || noticeBody;
    }) : [];
    for (const layer of [...companions.keys()]) if (!candidates.includes(layer)) clearCompanion(layer);
    for (const layer of candidates) {
      if (layer.hasAttribute(COMPANION_MARKER) && layer.getAttribute(COMPANION_MARKER) !== VERSION) continue;
      layer.setAttribute(COMPANION_MARKER, VERSION);
      const open = [...decorated.keys()].some(root => {
        const shell = root.querySelector(':scope > .acu-v2-app__shell');
        return shell && win.getComputedStyle(shell).display !== 'none';
      });
      if (open && !noticesOpen) layer.setAttribute(NOTICE_MARKER, 'quiet');
      else layer.removeAttribute(NOTICE_MARKER);
      if (!companions.has(layer)) companions.set(layer, puppet.companion(layer));
      else companions.get(layer)!.sync();
    }
    for (const record of decorated.values()) for (const node of record.nodes) {
      if (node.dataset.shiroDatabaseDecoration !== 'notices') continue;
      node.textContent = noticesOpen ? '收起数据库提示' : '显示数据库提示';
      node.setAttribute('aria-pressed', String(noticesOpen));
    }
  }
  function own(record: Decoration, anchor: Element, kind: 'masthead' | 'portrait' | 'shortcuts' | 'notices'): void {
    const parent = kind === 'masthead' ? anchor.parentElement : anchor;
    if (!parent) return;
    const exists = [...record.nodes].find(node => node.dataset.shiroDatabaseDecoration === kind && node.parentElement === parent);
    if (exists) return;
    const node = kind === 'shortcuts' ? makeShortcuts() : kind === 'notices' ? makeNoticeToggle() : makeBrand(kind);
    record.nodes.add(node);
    const portrait = [...record.nodes].find(item => item.dataset.shiroDatabaseDecoration === 'portrait' && item.parentElement === parent);
    parent.insertBefore(node, kind === 'masthead' ? anchor : kind === 'shortcuts' || kind === 'notices' ? (portrait?.nextSibling ?? parent.firstChild) : parent.firstChild);
  }
  function ownMemory(record: Decoration, header: Element): void {
    if (!header.parentElement || [...record.nodes].some(node => node.dataset.shiroDatabaseDecoration === 'memory' && node.parentElement === header.parentElement)) return;
    const view = memory.attach(header);
    record.nodes.add(view.node); brandDisposers.set(view.node, view.dispose);
  }
  function clearShortcuts(): void {
    for (const record of decorated.values()) for (const node of [...record.nodes]) {
      if (node.dataset.shiroDatabaseDecoration !== 'shortcuts') continue;
      node.remove(); record.nodes.delete(node);
    }
  }
  function observe(): void {
    if (!disposed && enabled && !assetError) observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  }
  function refresh(): void {
    if (disposed) return;
    observer.disconnect();
    try {
      const roots = [...doc.querySelectorAll(ROOT)];
      const matches = new Map(roots.map(root => [root, inspectDatabaseThemeRoot(root)]));
      if (!enabled || assetError) {
        for (const record of [...decorated.values()]) clear(record);
        for (const layer of [...companions.keys()]) clearCompanion(layer);
        style.remove();
        layoutStyle.remove();
        report(!enabled ? '白主题已关闭，使用数据库原生外观' : `白主题暂停：${assetError}`);
        return;
      }
      for (const record of [...decorated.values()]) {
        if (!record.root.isConnected || !matches.get(record.root)) clear(record);
      }
      for (const [root, structure] of matches) {
        if (!structure) continue;
        // A foreign marker is not ours to overwrite or restore.
        if (root.hasAttribute(MARKER) && root.getAttribute(MARKER) !== VERSION) continue;
        let record = decorated.get(root);
        if (!record) { record = { root, nodes: new Set() }; decorated.set(root, record); root.setAttribute(MARKER, VERSION); }
        const parents = new Set([...structure.headers.map(node => node.parentElement), ...structure.sidebars]);
        for (const node of [...record.nodes]) {
          if (!node.isConnected || !parents.has(node.parentElement) || (!navigate && !memorySource && node.dataset.shiroDatabaseDecoration === 'shortcuts') || (!memorySource && node.dataset.shiroDatabaseDecoration === 'memory')) { brandDisposers.get(node)?.(); brandDisposers.delete(node); node.remove(); record.nodes.delete(node); }
        }
        for (const header of structure.headers) { own(record, header, 'masthead'); if (memorySource) ownMemory(record, header); }
        for (const sidebar of structure.sidebars) {
          own(record, sidebar, 'portrait');
          own(record, sidebar, 'notices');
          if (navigate || memorySource) own(record, sidebar, 'shortcuts');
        }
      }
      refreshCompanions();
      updateViewport();
      if (decorated.size) {
        if (!style.isConnected) (doc.head ?? doc.documentElement).appendChild(style);
        report('白 · 空白棋局主题已启用，数据库原有功能保留');
      } else {
        style.remove();
        report(roots.length ? '数据库界面结构暂不兼容，已停止装饰并保留原生外观' : '白主题已开启，等待数据库新 UI');
      }
    } finally { observe(); }
  }
  const observer = new win.MutationObserver(records => {
    const relevant = records.some(record => {
      const target = record.target as Element;
      // Our bounded table renders do not represent upstream layout changes.
      if (target.nodeType === 1 && target.closest?.('.shiro-db-memory')) return false;
      // Only upstream v-show ownership matters; pet dragging/input styles must not trigger layout scans.
      if (record.type === 'attributes' && record.attributeName === 'style') return target.matches(`${ROOT}, ${ROOT} > .acu-v2-app__shell, ${COMPANION} > .acu-desk-pet > .acu-desk-pet__peek > img.acu-desk-pet__peek-img`) ||
        (target.matches(`${COMPANION} > .acu-notice-bubble`) && target.parentElement?.getAttribute(COMPANION_MARKER) === VERSION);
      if ([...decorated.keys(), ...companions.keys()].some(root => root === target || root.contains(target))) return true;
      const surface = `${ROOT}, ${COMPANION}`;
      if (target.nodeType === 1 && (target.matches?.(surface) || target.closest?.(surface))) return true;
      if (record.type !== 'childList') return false;
      return [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 &&
        ((node as Element).matches(surface) || (node as Element).querySelector(surface)));
    });
    if (!relevant || queued || disposed) return;
    queued = true;
    // Coalesce Vue's batch without a perpetual animation/timer loop.
    queueMicrotask(() => { queued = false; if (!disposed) refresh(); });
  });
  const api: DatabaseThemeMount = {
    setEnabled(value) { if (!disposed) { enabled = Boolean(value); refresh(); } },
    setNavigate(value) { if (!disposed && navigate !== value) { navigate = value; clearShortcuts(); refresh(); } },
    setMemorySource(value) { if (!disposed && memorySource !== value) { memorySource = value; memory.setSource(value); clearShortcuts(); refresh(); } },
    getStatus() { return status; },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      win.removeEventListener('resize', updateViewport);
      win.removeEventListener('scroll', updateViewport);
      for (const record of [...decorated.values()]) clear(record);
      for (const layer of [...companions.keys()]) clearCompanion(layer);
      puppet.dispose();
      memory.dispose();
      style.remove();
      layoutStyle.remove();
      if (doc[OWNER] === api) delete doc[OWNER];
    },
  };
  doc[OWNER] = api;
  viewport?.addEventListener('resize', updateViewport);
  viewport?.addEventListener('scroll', updateViewport);
  win.addEventListener('resize', updateViewport);
  win.addEventListener('scroll', updateViewport);
  refresh();
  return api;
}
