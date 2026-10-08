export const logger = {
  info(message: string): void { console.log(`[info] ${message}`); },
  error(message: string): void { console.error(`[error] ${message}`); },
};
