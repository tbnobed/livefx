export function clampSeekFrame(frame: number, length: number): number | null {
  if (!Number.isFinite(frame) || !Number.isFinite(length) || length < 1) return null;
  return Math.max(0, Math.min(Math.floor(length) - 1, Math.round(frame)));
}

// Keep only the latest drag position. Never overlap commands, flood the
// hardware, retry a failed mutation, or dispatch queued work after unmount.
export function createScrubQueue(
  send: (frame: number) => Promise<boolean>,
  onBusy: (busy: boolean) => void,
  intervalMs = 250,
) {
  let next: number | null = null;
  let inFlight = false;
  let stopped = false;
  let lastStarted = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pump = () => {
    if (stopped || inFlight || next === null) return;
    const wait = intervalMs - (Date.now() - lastStarted);
    if (wait > 0) {
      if (!timer) timer = setTimeout(() => { timer = undefined; pump(); }, wait);
      return;
    }
    const frame = next;
    next = null;
    inFlight = true;
    lastStarted = Date.now();
    onBusy(true);
    void (async () => {
      let ok = false;
      try { ok = await send(frame); } catch { /* Stop; never retry a mutation. */ }
      if (!ok) { stopped = true; next = null; }
      inFlight = false;
      if (!stopped && next !== null) pump();
      else onBusy(false);
    })();
  };
  return {
    enqueue(frame: number) {
      if (stopped || !Number.isFinite(frame)) return;
      next = frame;
      pump();
    },
    resume() { stopped = false; },
    cancel() {
      stopped = true;
      next = null;
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (!inFlight) onBusy(false);
    },
  };
}
