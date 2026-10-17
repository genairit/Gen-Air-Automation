export const createLogger = (context: string) => ({
  info: (message: string) => console.info(`[${context}] ${message}`),
  error: (message: string, details: object) => console.error(`[${context}] ${message}`, details),
});
