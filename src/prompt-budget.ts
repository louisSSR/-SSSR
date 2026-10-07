export const utf8Size = (text: string) => new TextEncoder().encode(text).length;
export function clipUtf8(text: string, bytes: number): string {
  if (utf8Size(text) <= bytes) return text;
  const points = Array.from(text); let lo = 0, hi = points.length;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (utf8Size(points.slice(0, mid).join('') + '…') <= bytes) lo = mid; else hi = mid - 1; }
  return points.slice(0, lo).join('') + '…';
}
/** Failed/zero/slow tokenizer results use a conservative byte count. */
export async function countPrompt(text: string, counter?: (text: string) => Promise<number>): Promise<{count:number;method:string}> {
  if (counter) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const value = await Promise.race([counter(text), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('tokenizer timeout')), 4000); })]);
      if (Number.isFinite(value) && value > 0) return { count: Math.ceil(value), method: '宿主 Token 计数' };
    } catch { /* Never treat unavailable counts as zero. */ }
    finally { clearTimeout(timer); }
  }
  return {count:utf8Size(text),method:'UTF-8 字节保守预算'};
}
