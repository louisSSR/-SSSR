import { mountDatabaseTheme, type DatabaseThemeMount } from './database-theme';

export type ListenButton = (name: string, listener: () => void) => { stop: () => void };
export const SCRIPT_OWNER_KEY = 'shiro-database-theme:helper-script-owner';
const THEME_KEY = 'shiro-database-theme:appearance-v1';
const THEME_EVENT = 'shiro-database-theme:state';
const SHOP_KEY = 'shiro-butterfly-shop:ui-v1';
const SHOP_EVENT = 'shiro-butterfly-shop:availability';
const CONFLICT = '请先关闭旧「白 · 空白棋局数据库主题」扩展或升级带内置主题的旧商店，再点「切换白主题」；本脚本不会替你停用其它扩展。';

/** Owns only host appearance. All state is transient; no settings, variables or database data writes. */
export function startThemeScript(frame: Window, embeddedPng: string, listenButton: ListenButton, embeddedPeekPng?: string) {
  if (frame === frame.parent) throw new Error('请将 JSON 导入酒馆助手脚本库运行。');
  const host = frame.parent as Window & typeof globalThis;
  const doc = host.document;
  // Accessing the parent's document itself verifies the unsandboxed same-origin execution surface.
  if (!doc.documentElement) throw new Error('酒馆宿主页面尚未就绪。');
  const registry = host as any, ownerKey = Symbol.for(SCRIPT_OWNER_KEY), themeKey = Symbol.for(THEME_KEY);
  const old = registry[ownerKey];
  if (old?.provider === 'helper-script' && typeof old.dispose === 'function') old.dispose();
  let renderer: DatabaseThemeMount | undefined, panel: HTMLElement | undefined;
  let disposed = false, publishing = false;
  let connectedShop: unknown;
  const stops: (() => void)[] = [];
  const state = { enabled: false, status: '等待数据库界面', error: '' };
  const service = { version: 1, provider: 'helper-script', state, setEnabled };
  const owner = { provider: 'helper-script', version: '1.3.1', state, dispose };
  registry[ownerKey] = owner;

  function inform(): void {
    const message = state.error || state.status;
    const toast = registry.toastr;
    if (state.error && typeof toast?.warning === 'function') toast.warning(message, '白主题脚本');
    else if (typeof toast?.info === 'function') toast.info(message, '白主题脚本');
  }
  function publish(): void {
    if (panel) panel.textContent = `白 · 空白棋局（酒馆助手脚本）｜${state.error || state.status}`;
    if (!publishing) { publishing = true; try { doc.dispatchEvent(new host.CustomEvent(THEME_EVENT)); } finally { publishing = false; } }
  }
  function foreignTheme(): boolean {
    const exposed = registry[themeKey];
    return Boolean(registry[Symbol.for('shiro-database-theme:active-mount')] ||
      (exposed && exposed !== service && exposed.provider !== 'helper-script') ||
      (doc as any)[Symbol.for('shiro-butterfly-shop:database-theme')]);
  }
  function blockConflict(): void {
    renderer?.dispose(); renderer = undefined;
    connectedShop = undefined;
    state.enabled = false; state.error = CONFLICT; state.status = '主题脚本待命';
    if (registry[themeKey] === service) delete registry[themeKey];
    publish();
  }
  function refreshShop(): void {
    if (disposed) return;
    const shop = registry[Symbol.for(SHOP_KEY)];
    if (!renderer || connectedShop === shop) return;
    connectedShop = shop;
    renderer?.setNavigate(shop?.version === 1 && typeof shop.open === 'function'
      ? tab => { const live = registry[Symbol.for(SHOP_KEY)]; if (!disposed && live?.version === 1 && typeof live.open === 'function') live.open(tab); }
      : undefined);
  }
  function setEnabled(next: boolean): void {
    if (disposed) return;
    if (foreignTheme()) { blockConflict(); inform(); return; }
    state.error = ''; state.enabled = next === true;
    registry[themeKey] = service;
    if (!renderer) {
      renderer = mountDatabaseTheme({ assetBase: '', embeddedPng, embeddedPeekPng, enabled: state.enabled, hostDocument: doc,
        onStatus: value => { state.status = value; publish(); } });
      refreshShop();
    } else renderer.setEnabled(state.enabled);
    publish();
  }
  function externalThemeChanged(): void {
    if (!disposed && !publishing && foreignTheme()) blockConflict();
  }
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    frame.removeEventListener('pagehide', dispose);
    doc.removeEventListener(SHOP_EVENT, refreshShop);
    doc.removeEventListener(THEME_EVENT, externalThemeChanged);
    for (const stop of stops.splice(0)) { try { stop(); } catch { /* Helper may already have unloaded its own listener. */ } }
    renderer?.dispose(); renderer = undefined;
    panel?.remove(); panel = undefined;
    if (registry[themeKey] === service) { delete registry[themeKey]; doc.dispatchEvent(new host.CustomEvent(THEME_EVENT)); }
    if (registry[ownerKey] === owner) delete registry[ownerKey];
  }
  frame.addEventListener('pagehide', dispose);
  doc.addEventListener(SHOP_EVENT, refreshShop);
  doc.addEventListener(THEME_EVENT, externalThemeChanged);
  try {
    const anchor = doc.querySelector('#extensions_settings2,#extensions_settings');
    if (anchor) {
      panel = doc.createElement('p'); panel.id = 'shiro-database-theme-script-status'; panel.setAttribute('role', 'status');
      anchor.append(panel);
    }
    stops.push(listenButton('切换白主题', () => { if (!disposed) { setEnabled(!state.enabled); inform(); } }).stop);
    stops.push(listenButton('主题状态', () => { if (!disposed) inform(); }).stop);
    setEnabled(true);
  } catch (error) { dispose(); throw error; }
  return owner;
}

