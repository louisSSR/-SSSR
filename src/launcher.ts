export const LAUNCHER_POSITION_KEY = 'shiro-butterfly-shop:launcher-position:v1';
export const LAUNCHER_IDLE_DELAY = 5000;
type Point = { x: number; y: number };
type Bounds = { left: number; top: number; right: number; bottom: number };
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function readLauncherPosition(text: string | null): Point | null {
  try {
    const value = text ? JSON.parse(text) : null;
    return value?.version === 1 && Number.isFinite(value.x) && Number.isFinite(value.y) &&
      value.x >= 0 && value.x <= 1 && value.y >= 0 && value.y <= 1 ? { x: value.x, y: value.y } : null;
  } catch { return null; }
}
export function launcherBounds(width: number, height: number, size: number, insets = { left: 0, top: 0, right: 0, bottom: 0 }): Bounds {
  const left = Math.min(12 + insets.left, Math.max(0, width - size));
  const top = Math.min(12 + insets.top, Math.max(0, height - size));
  return { left, top, right: Math.max(left, width - size - 12 - insets.right), bottom: Math.max(top, height - size - 12 - insets.bottom) };
}
export function placeLauncher(position: Point | null, bounds: Bounds): Point {
  return position ? {
    x: bounds.left + clamp(position.x, 0, 1) * (bounds.right - bounds.left),
    y: bounds.top + clamp(position.y, 0, 1) * (bounds.bottom - bounds.top),
  } : { x: bounds.right, y: Math.max(bounds.top, bounds.bottom - 80) };
}
export function normalizeLauncher(point: Point, bounds: Bounds): Point {
  return {
    x: bounds.right === bounds.left ? 0 : clamp((point.x - bounds.left) / (bounds.right - bounds.left), 0, 1),
    y: bounds.bottom === bounds.top ? 0 : clamp((point.y - bounds.top) / (bounds.bottom - bounds.top), 0, 1),
  };
}

/** UI preference only. The ledger, account settings and database are never touched. */
export function createLauncherPosition(surface: HTMLElement, shadow: ShadowRoot, suppliedStorage?: StoragePort | null) {
  const win = surface.ownerDocument.defaultView!;
  let storage: StoragePort | null = suppliedStorage ?? null;
  if (suppliedStorage === undefined) { try { storage = win.localStorage; } catch { /* Position remains usable in memory. */ } }
  let preferred: Point | null = null;
  try { preferred = readLauncherPosition(storage?.getItem(LAUNCHER_POSITION_KEY) ?? null); } catch { /* Optional persistence. */ }
  let disposed = false, suppressClick = false, current: Point = { x: 0, y: 0 };
  let idleTimer: number | undefined, tucked = false, editing = false, ownedButton: HTMLButtonElement | null = null;
  let drag: { id: number; x: number; y: number; origin: Point; button: HTMLButtonElement; moved: boolean } | undefined;
  const button = () => shadow.querySelector<HTMLButtonElement>('.launcher');
  function clearIdle(): void { if (idleTimer !== undefined) win.clearTimeout(idleTimer); idleTimer = undefined; }
  function expand(): void {
    clearIdle(); tucked = false;
    const item = button(); item?.classList.remove('is-tucked'); item?.removeAttribute('data-dock-edge');
  }
  function scheduleIdle(): void {
    clearIdle();
    if (disposed || editing || drag || !button()) return;
    idleTimer = win.setTimeout(() => {
      idleTimer = undefined;
      if (disposed || editing || drag) return;
      const item = button(); if (!item) return;
      const bounds = geometry(), edge = current.x - bounds.left <= bounds.right - current.x ? 'left' : 'right';
      paint({ x: edge === 'left' ? bounds.left : bounds.right, y: clamp(current.y, bounds.top, bounds.bottom) });
      tucked = true; item.classList.add('is-tucked'); item.dataset.dockEdge = edge;
      persist();
    }, LAUNCHER_IDLE_DELAY);
  }
  function geometry(): Bounds {
    const item = button(), box = surface.getBoundingClientRect();
    const css = item ? win.getComputedStyle(item) : undefined;
    const safe = (side: string) => Math.max(0, Number.parseFloat(css?.getPropertyValue(`--launcher-safe-${side}`) ?? '') || 0);
    return launcherBounds(box.width || surface.clientWidth, box.height || surface.clientHeight,
      item?.offsetWidth || 48, { left: safe('left'), top: safe('top'), right: safe('right'), bottom: safe('bottom') });
  }
  function paint(point: Point): void {
    current = point;
    surface.style.setProperty('--shiro-launcher-x', `${point.x}px`);
    surface.style.setProperty('--shiro-launcher-y', `${point.y}px`);
  }
  function persist(): void {
    preferred = normalizeLauncher(current, geometry());
    try { storage?.setItem(LAUNCHER_POSITION_KEY, JSON.stringify({ version: 1, ...preferred })); } catch { /* Dragging still works without storage permission. */ }
  }
  function clearDrag(cancelled: boolean): void {
    const prior = drag; if (!prior) return;
    drag = undefined;
    prior.button.classList.remove('is-dragging');
    if (prior.moved) { suppressClick = true; if (!cancelled) persist(); }
    try { if (prior.button.hasPointerCapture?.(prior.id)) prior.button.releasePointerCapture(prior.id); } catch { /* Removed Vue node. */ }
    if (cancelled) paint(placeLauncher(preferred, geometry()));
    scheduleIdle();
  }
  function eventButton(event: Event): HTMLButtonElement | undefined {
    return event.composedPath().find(node => node instanceof win.HTMLButtonElement && node.classList.contains('launcher')) as HTMLButtonElement | undefined;
  }
  function pointerDown(event: Event): void {
    const e = event as PointerEvent, item = eventButton(e);
    if (disposed || drag || !item || e.button !== 0 || e.isPrimary === false) return;
    expand();
    suppressClick = false;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, origin: { ...current }, button: item, moved: false };
    try { item.setPointerCapture(e.pointerId); } catch { /* Synthetic/unsupported pointer capture. */ }
  }
  function pointerMove(event: Event): void {
    const e = event as PointerEvent;
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true; drag.button.classList.add('is-dragging'); e.preventDefault();
    const bounds = geometry();
    paint({ x: clamp(drag.origin.x + dx, bounds.left, bounds.right), y: clamp(drag.origin.y + dy, bounds.top, bounds.bottom) });
  }
  function pointerUp(event: Event): void { if (drag && (event as PointerEvent).pointerId === drag.id) clearDrag(false); }
  function pointerCancel(event: Event): void { if (drag && (event as PointerEvent).pointerId === drag.id) clearDrag(true); }
  function click(event: Event): void {
    if (suppressClick && eventButton(event) && (event as MouseEvent).detail !== 0) {
      suppressClick = false; event.preventDefault(); event.stopImmediatePropagation();
      return;
    }
    if (eventButton(event)) { expand(); scheduleIdle(); }
  }
  function reset(): void {
    clearDrag(true); expand(); preferred = null;
    try { storage?.removeItem(LAUNCHER_POSITION_KEY); } catch { /* Optional preference. */ }
    paint(placeLauncher(null, geometry()));
    scheduleIdle();
  }
  function keyDown(event: Event): void {
    const e = event as KeyboardEvent; if (!eventButton(e)) return;
    expand();
    if (e.key === 'Home') { e.preventDefault(); e.stopPropagation(); reset(); return; }
    const directions: Record<string, readonly [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const delta = directions[e.key];
    if (!delta) { scheduleIdle(); return; }
    e.preventDefault(); e.stopPropagation(); clearDrag(true);
    const step = e.shiftKey ? 24 : 8, bounds = geometry();
    paint({ x: clamp(current.x + delta[0] * step, bounds.left, bounds.right), y: clamp(current.y + delta[1] * step, bounds.top, bounds.bottom) }); persist(); scheduleIdle();
  }
  function inputChanged(): void {
    if (disposed) return;
    let active = surface.ownerDocument.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    const next = Boolean(active?.matches('textarea,select,input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]),[contenteditable="true"]'));
    if (next === editing) return;
    editing = next; clearDrag(true); expand();
    surface.toggleAttribute('data-shiro-input-active', editing);
    if (!editing) scheduleIdle();
  }
  function focusOut(): void { queueMicrotask(inputChanged); }
  function refresh(): void {
    if (disposed) return;
    const item = button();
    if (drag && drag.button !== item) clearDrag(true);
    const changed = item !== ownedButton; ownedButton = item;
    if (item) {
      item.title = '打开白·蝶翼商店；拖动可移动，方向键微调，Home 复位';
      item.setAttribute('aria-label', '打开白·蝶翼商店（可拖动）');
      item.querySelectorAll('img').forEach(image => { image.draggable = false; });
    }
    if (!drag) paint(placeLauncher(preferred, geometry()));
    if (item && tucked) { item.classList.add('is-tucked'); item.dataset.dockEdge = preferred?.x === 0 ? 'left' : 'right'; }
    if (changed) { expand(); scheduleIdle(); }
    inputChanged();
  }
  function reflow(): void { if (!disposed) { clearDrag(true); expand(); refresh(); scheduleIdle(); } }
  const listeners: [string, EventListener][] = [
    ['pointerdown', pointerDown], ['pointermove', pointerMove], ['pointerup', pointerUp],
    ['pointercancel', pointerCancel], ['lostpointercapture', pointerCancel], ['click', click], ['keydown', keyDown],
  ];
  for (const [name, listener] of listeners) shadow.addEventListener(name, listener, { capture: true });
  win.addEventListener('blur', reflow);
  win.addEventListener('resize', reflow); win.addEventListener('orientationchange', reflow);
  win.visualViewport?.addEventListener('resize', reflow);
  surface.ownerDocument.addEventListener('focusin', inputChanged); surface.ownerDocument.addEventListener('focusout', focusOut);
  refresh();
  return { refresh, reflow, reset, dispose() {
    if (disposed) return; clearDrag(true); expand(); disposed = true; clearIdle();
    for (const [name, listener] of listeners) shadow.removeEventListener(name, listener, { capture: true });
    win.removeEventListener('blur', reflow);
    win.removeEventListener('resize', reflow); win.removeEventListener('orientationchange', reflow);
    win.visualViewport?.removeEventListener('resize', reflow);
    surface.ownerDocument.removeEventListener('focusin', inputChanged); surface.ownerDocument.removeEventListener('focusout', focusOut);
    surface.removeAttribute('data-shiro-input-active');
    surface.style.removeProperty('--shiro-launcher-x'); surface.style.removeProperty('--shiro-launcher-y');
  } };
}
