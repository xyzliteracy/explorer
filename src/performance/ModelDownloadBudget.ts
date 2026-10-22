/** Reserve compressed bytes before consuming response bodies. Unknown-size
 * responses reserve the entire allowance, avoiding unbounded pending GLBs. */
export class ModelDownloadBudget {
  private used = 0;
  private waiting: Array<() => void> = [];
  constructor(readonly limit: number) {}
  async acquire(bytes: number, signal: AbortSignal): Promise<() => void> {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > this.limit) throw Error('Model download exceeds the memory allowance.');
    while (this.used + bytes > this.limit) {
      await new Promise<void>((resolve, reject) => {
        const wake = () => { signal.removeEventListener('abort', abort); resolve(); };
        const abort = () => { this.waiting = this.waiting.filter(item => item !== wake); signal.removeEventListener('abort', abort); reject(new DOMException('Download interrupted', 'AbortError')); };
        if (signal.aborted) { abort(); return; }
        signal.addEventListener('abort', abort, { once: true }); this.waiting.push(wake);
      });
    }
    if (signal.aborted) throw new DOMException('Download interrupted', 'AbortError');
    this.used += bytes;
    let released = false;
    return () => { if (released) return; released = true; this.used -= bytes; const waiting = this.waiting.splice(0); waiting.forEach(wake => wake()); };
  }
}
