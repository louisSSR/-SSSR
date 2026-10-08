/** Local visual reactions only: no model calls, database reads or persistent writes. */
export type PuppetPose = 'idle' | 'blink' | 'smug' | 'poke' | 'carried' | 'peek';
const POSITIONS: Record<PuppetPose, string> = {
  idle: '0% 0%', blink: '49.4% 0%', smug: '100% 0%',
  poke: '0% 100%', carried: '50% 100%', peek: '100% 100%',
};
export const PUPPET_LINES = [
  '表格好多……白的头发，都没有这么多。',
  '空白，是名字。不是让你把表格也留空。',
  '这局不用骰子。漏填一格，就会自己冒险。',
  '白在认真看。不是困了……大概。',
  '哥，拖白可以。拖进度……不行。',
] as const;
export const PUPPET_JOKE_DURATION = 4000;
const COOLDOWN = 3000;

export function setPuppetPose(sprite: HTMLElement, pose: PuppetPose): void {
  sprite.dataset.shiroPuppetPose = pose;
  sprite.style.backgroundPosition = POSITIONS[pose];
}
export function createPuppetSprite(doc: Document, imageUrl: string, className: string, pose: PuppetPose = 'idle'): HTMLSpanElement {
  const sprite = doc.createElement('span');
  sprite.className = `shiro-db-puppet ${className}`;
  sprite.setAttribute('aria-hidden', 'true');
  // Keep the complete PNG URL directly on a CSS property; large custom properties
  // failed in Chromium with the earlier self-contained image.
  sprite.style.backgroundImage = `url(${JSON.stringify(imageUrl)})`;
  setPuppetPose(sprite, pose);
  return sprite;
}

export interface PuppetCompanion { sync(): void; dispose(): void }
export function createPuppetPresentation(doc: Document, imageUrl: string, onQuiet?: (quiet: boolean) => void) {
  const win = doc.defaultView!;
  let disposed = false, quiet = false, lineIndex = 0, lastJoke = -Infinity;
  const portraits = new Set<{ node: HTMLElement; sprite: HTMLElement; joke: HTMLElement; jokeButton: HTMLButtonElement; avatarButton: HTMLButtonElement; quietButton: HTMLButtonElement; timer?: number; dispose(): void }>();
  const companions = new Set<PuppetCompanion>();
  function resetPortrait(record: typeof portraits extends Set<infer T> ? T : never): void {
    if (record.timer !== undefined) win.clearTimeout(record.timer);
    record.timer = undefined; record.joke.hidden = true; record.joke.textContent = '';
    setPuppetPose(record.sprite, 'idle');
  }
  function joke(): void {
    if (disposed || quiet || Date.now() - lastJoke < COOLDOWN) return;
    lastJoke = Date.now();
    const line = PUPPET_LINES[lineIndex++ % PUPPET_LINES.length];
    for (const record of portraits) {
      if (!record.node.isConnected) continue;
      resetPortrait(record);
      record.joke.textContent = line; record.joke.hidden = false;
      // A second joke can arrive after the 3s cooldown while the prior 4s CSS
      // fade still runs. Commit a stopped frame before restarting its clock.
      record.joke.style.animationName = 'none';
      void record.joke.offsetWidth;
      record.joke.style.removeProperty('animation-name');
      setPuppetPose(record.sprite, 'smug');
      record.timer = win.setTimeout(() => resetPortrait(record), PUPPET_JOKE_DURATION);
    }
  }
  function setQuiet(value: boolean): void {
    quiet = value;
    onQuiet?.(quiet);
    for (const record of portraits) {
      record.node.dataset.shiroPuppetQuiet = String(quiet);
      record.quietButton.textContent = quiet ? '让白说话' : '安静一会儿';
      record.quietButton.setAttribute('aria-pressed', String(quiet));
      record.jokeButton.disabled = quiet; record.avatarButton.disabled = quiet;
      if (quiet) resetPortrait(record);
    }
    for (const companion of companions) companion.sync();
  }
  function portrait(node: HTMLElement, sprite: HTMLElement, avatarButton: HTMLButtonElement): () => void {
    const controls = doc.createElement('div'); controls.className = 'shiro-db-puppet-controls';
    const jokeButton = doc.createElement('button'); jokeButton.type = 'button'; jokeButton.className = 'shiro-db-puppet-joke-button'; jokeButton.textContent = '和白开个玩笑';
    const quietButton = doc.createElement('button'); quietButton.type = 'button'; quietButton.className = 'shiro-db-puppet-quiet';
    const line = doc.createElement('p'); line.className = 'shiro-db-puppet-line'; line.hidden = true;
    line.setAttribute('role', 'status'); line.setAttribute('aria-live', 'polite');
    controls.append(jokeButton, quietButton); node.append(controls, line);
    const toggleQuiet = () => { if (!disposed && node.isConnected) setQuiet(!quiet); };
    const tellJoke = () => { if (!disposed && node.isConnected) joke(); };
    const record = { node, sprite, joke: line, jokeButton, avatarButton, quietButton, timer: undefined as number | undefined,
      dispose() {
        resetPortrait(record); portraits.delete(record);
        avatarButton.removeEventListener('click', tellJoke); jokeButton.removeEventListener('click', tellJoke); quietButton.removeEventListener('click', toggleQuiet);
        controls.remove(); line.remove(); node.removeAttribute('data-shiro-puppet-quiet');
      } };
    portraits.add(record);
    avatarButton.addEventListener('click', tellJoke); jokeButton.addEventListener('click', tellJoke); quietButton.addEventListener('click', toggleQuiet);
    setQuiet(quiet);
    return record.dispose;
  }
  function companion(layer: Element): PuppetCompanion {
    let stopped = false, pose: PuppetPose = 'idle', reactionTimer: number | undefined;
    let drag: { id: number; x: number; y: number; moved: boolean } | undefined;
    const sprites = new Map<'body' | 'peek', { anchor: Element; node: HTMLElement }>();
    function render(): void {
      for (const [kind, item] of sprites) {
        item.node.dataset.shiroPuppetQuiet = String(quiet);
        setPuppetPose(item.node, quiet ? (kind === 'peek' ? 'peek' : 'idle') : kind === 'peek' && pose !== 'carried' ? 'peek' : pose);
      }
    }
    function cancelReaction(): void {
      if (reactionTimer !== undefined) win.clearTimeout(reactionTimer);
      reactionTimer = undefined;
    }
    function reset(): void { cancelReaction(); drag = undefined; pose = 'idle'; render(); }
    function down(event: PointerEvent): void {
      if (stopped || disposed || event.isPrimary === false || event.button > 0) return;
      const target = event.target as Element;
      if (!target.closest?.('.acu-desk-pet') || target.closest('.acu-desk-pet-layer') !== layer) return;
      cancelReaction(); drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    }
    function move(event: PointerEvent): void {
      if (!drag || drag.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 6) drag.moved = true;
      if (drag.moved) { pose = 'carried'; render(); }
    }
    function up(event: PointerEvent): void {
      if (!drag || drag.id !== event.pointerId) return;
      const moved = drag.moved || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 6;
      drag = undefined;
      pose = moved ? 'smug' : 'poke'; render();
      reactionTimer = win.setTimeout(() => { reactionTimer = undefined; pose = 'idle'; render(); }, moved ? 900 : 1200);
    }
    function cancel(event: PointerEvent): void { if (drag?.id === event.pointerId) reset(); }
    const api: PuppetCompanion = {
      sync() {
        if (stopped || disposed) return;
        for (const kind of ['body', 'peek'] as const) {
          const anchor = layer.querySelector(kind === 'body'
            ? ':scope > .acu-desk-pet > .acu-desk-pet__body > .acu-desk-pet__flip:has(> img.acu-desk-pet__img)'
            : ':scope > .acu-desk-pet > .acu-desk-pet__peek:has(> img.acu-desk-pet__peek-img)');
          const current = sprites.get(kind);
          if (current && (current.anchor !== anchor || !current.node.isConnected)) { current.node.remove(); sprites.delete(kind); }
          if (anchor && !sprites.has(kind)) {
            const node = createPuppetSprite(doc, imageUrl, `shiro-db-puppet-${kind}`, kind === 'peek' ? 'peek' : pose);
            anchor.append(node); sprites.set(kind, { anchor, node });
          }
          if (kind === 'peek' && anchor) {
            const nativeImage = anchor.querySelector(':scope > img.acu-desk-pet__peek-img') as HTMLElement;
            const node = sprites.get(kind)!.node;
            // The native peek viewport clips a square image. Mirror only its
            // public geometry onto our span so a narrow dock never squashes it.
            for (const key of ['width', 'height', 'top', 'bottom', 'left', 'right', 'transform']) {
              const value = nativeImage.style.getPropertyValue(key);
              if (value) node.style.setProperty(key, value); else node.style.removeProperty(key);
            }
          }
        }
        if (quiet) { cancelReaction(); pose = 'idle'; }
        render();
      },
      dispose() {
        if (stopped) return; stopped = true; reset();
        layer.removeEventListener('pointerdown', down as EventListener, true);
        doc.removeEventListener('pointermove', move as EventListener, true); doc.removeEventListener('pointerup', up as EventListener, true); doc.removeEventListener('pointercancel', cancel as EventListener, true);
        win.removeEventListener('resize', reset); win.removeEventListener('blur', reset);
        win.visualViewport?.removeEventListener('resize', reset);
        for (const item of sprites.values()) item.node.remove(); sprites.clear(); companions.delete(api);
      },
    };
    companions.add(api);
    layer.addEventListener('pointerdown', down as EventListener, { capture: true, passive: true });
    doc.addEventListener('pointermove', move as EventListener, { capture: true, passive: true }); doc.addEventListener('pointerup', up as EventListener, { capture: true, passive: true }); doc.addEventListener('pointercancel', cancel as EventListener, { capture: true, passive: true });
    win.addEventListener('resize', reset); win.addEventListener('blur', reset); win.visualViewport?.addEventListener('resize', reset);
    api.sync(); return api;
  }
  return { sprite: (className: string, pose?: PuppetPose) => createPuppetSprite(doc, imageUrl, className, pose), portrait, companion,
    dispose() { if (disposed) return; disposed = true; for (const record of [...portraits]) record.dispose(); for (const record of [...companions]) record.dispose(); } };
}
