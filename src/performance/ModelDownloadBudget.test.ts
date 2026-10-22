import { expect, it } from 'vitest';
import { ModelDownloadBudget } from './ModelDownloadBudget';
it('bounds the aggregate bytes held by overlapping downloads until decode releases them', async () => {
  const budget = new ModelDownloadBudget(100), controller = new AbortController();
  const a = await budget.acquire(60, controller.signal);
  let granted = false;
  const waiting = budget.acquire(60, controller.signal).then(release => { granted = true; return release; });
  await Promise.resolve(); expect(granted).toBe(false);
  const small = await budget.acquire(20, controller.signal);
  a(); const b = await waiting; expect(granted).toBe(true); a(); small(); b();
  const all = await budget.acquire(100, controller.signal); all();
});
it('aborts a waiting download without retaining its reservation', async () => {
  const budget = new ModelDownloadBudget(100), controller = new AbortController();
  const release = await budget.acquire(100, new AbortController().signal);
  const pending = budget.acquire(100, controller.signal); controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  release(); const next = await budget.acquire(100, new AbortController().signal); next();
});
