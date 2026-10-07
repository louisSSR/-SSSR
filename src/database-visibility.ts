/** Shop-only courtesy: observe native visibility without injecting a database skin. */
export function observeDatabaseVisibility(onVisibility: (visible: boolean) => void, doc: Document = document): () => void {
  const win = doc.defaultView;
  if (!win) throw new Error('数据库可见性观察需要已挂载的文档');
  const selector = '.acu-v2-app';
  let disposed = false, queued = false, visible = false;
  function report(next: boolean): void {
    if (next === visible) return;
    visible = next;
    try { onVisibility(next); } catch { /* External surface must not break the host observer. */ }
  }
  function refresh(): void {
    if (disposed) return;
    const next = [...doc.querySelectorAll(selector)].some(root => {
      const shell = root.querySelector(':scope > .acu-v2-app__shell');
      const body = shell?.querySelector(':scope > .acu-v2-app__body');
      const content = body?.querySelector(':scope > .acu-v2-app__content');
      if (!shell || !content) return false;
      const header = content.querySelector(':scope > .acu-v2-app__header');
      const editor = content.querySelector(':scope > .acu-visualizer-surface');
      const workbench = header?.querySelector('.acu-v2-app__header-left') && header.querySelector('.acu-v2-app__header-right') && body!.querySelector(':scope > .acu-v2-sidebar');
      const visualizer = editor?.querySelector('.acu-visualizer-surface__main > .acu-visualizer-surface__topbar') && editor.querySelector('.acu-visualizer-surface__sidebar > .acu-visualizer-nav');
      return Boolean((workbench || visualizer) && win!.getComputedStyle(root).display !== 'none' && win!.getComputedStyle(shell).display !== 'none');
    });
    report(next);
  }
  const observer = new win.MutationObserver(records => {
    if (disposed || queued || !records.some(record => {
      const target = record.target as Element;
      if (record.type === 'attributes') return target.matches(`${selector}, ${selector} > .acu-v2-app__shell`) || record.attributeName === 'class' && Boolean(target.closest(selector));
      if (target.nodeType === 1 && target.closest?.(selector)) return true;
      return [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && ((node as Element).matches(selector) || (node as Element).querySelector(selector)));
    })) return;
    queued = true;
    queueMicrotask(() => { queued = false; if (!disposed) refresh(); });
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  refresh();
  return () => { if (disposed) return; disposed = true; observer.disconnect(); report(false); };
}
