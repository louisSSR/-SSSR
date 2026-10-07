import { reactive } from 'vue';

/** Optional bridge to the independently installed theme. Never writes either settings store. */
export function createDatabaseAppearance() {
  const key = Symbol.for('shiro-database-theme:appearance-v1');
  const event = 'shiro-database-theme:state';
  const state = reactive({ available: false, enabled: false, status: '', error: '' });
  let disposed = false;
  const service = () => {
    const value = (globalThis as any)[key];
    return value?.version === 1 && typeof value.setEnabled === 'function' && value.state ? value : undefined;
  };
  const refresh = () => {
    if (disposed) return;
    const theme = service();
    state.available = Boolean(theme); state.enabled = theme?.state.enabled === true;
    state.status = theme ? String(theme.state.status || '独立数据库主题已连接') : '未启用独立数据库主题；请另行安装并开启「白 · 空白棋局数据库主题」。';
    state.error = theme ? String(theme.state.error || '') : '';
  };
  document.addEventListener(event, refresh); refresh();
  return {
    state,
    setEnabled(next: boolean) {
      if (disposed) return;
      service()?.setEnabled(next === true); refresh();
    },
    dispose() { disposed = true; document.removeEventListener(event, refresh); },
  };
}
export type DatabaseAppearance = ReturnType<typeof createDatabaseAppearance>;
