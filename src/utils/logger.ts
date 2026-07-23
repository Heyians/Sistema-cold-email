function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  info(msg: string, ...rest: unknown[]) {
    console.log(`[${timestamp()}] INFO  ${msg}`, ...rest);
  },
  warn(msg: string, ...rest: unknown[]) {
    console.warn(`[${timestamp()}] WARN  ${msg}`, ...rest);
  },
  error(msg: string, ...rest: unknown[]) {
    console.error(`[${timestamp()}] ERROR ${msg}`, ...rest);
  },
};
