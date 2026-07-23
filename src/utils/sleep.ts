export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sleeps for a random duration between min and max milliseconds (inclusive-ish). */
export function jitterSleep(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() * Math.max(0, maxMs - minMs);
  return sleep(ms);
}
