// Server logs. On Vercel these appear in the deployment's Logs tab; locally, in the terminal.

function line(level: 'warn' | 'error', message: string, data?: Record<string, unknown>) {
  const details = data
    ? Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v instanceof Error ? v.message : v]),
      )
    : undefined
  console[level](`[api] ${message}`, details ?? '')
}

export const logger = {
  warn: (message: string, data?: Record<string, unknown>) => {
    line('warn', message, data)
  },
  error: (message: string, data?: Record<string, unknown>) => {
    line('error', message, data)
  },
}
