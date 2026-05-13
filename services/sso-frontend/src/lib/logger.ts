/**
 * Logger — structured observability layer (standart-quality-code §13.3).
 *
 * Rules:
 *   - Tidak pernah `console.log` langsung di source code.
 *   - Semua logging lewat `logger.*` supaya bisa di-redirect ke Sentry/Datadog/etc.
 *   - Di production: hanya `warn` dan `error` yang output.
 *   - Di development: semua level output.
 *   - Setiap log entry membawa context (component, requestId, etc.).
 *
 * Integration points:
 *   - `logger.captureException(error)` → Sentry.captureException (bila tersedia).
 *   - `logger.setUser(user)` → Sentry.setUser (bila tersedia).
 *   - Fallback ke console bila Sentry tidak terinstall.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogContext = Record<string, unknown>

export type LogEntry = {
  readonly level: LogLevel
  readonly message: string
  readonly context: LogContext
  readonly timestamp: string
}

type SentryLike = {
  captureException: (error: unknown, context?: Record<string, unknown>) => void
  captureMessage: (message: string, level?: string) => void
  setUser: (user: Record<string, unknown> | null) => void
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

function getMinLevel(): number {
  if (import.meta.env.PROD) return LOG_LEVELS['warn']
  return LOG_LEVELS['debug']
}

function getSentry(): SentryLike | null {
  if (typeof window === 'undefined') return null
  const win = window as unknown as Record<string, unknown>
  const sentry = win['__SENTRY__'] as SentryLike | undefined
  return sentry ?? null
}

function formatEntry(entry: LogEntry): string {
  const ctx = Object.keys(entry.context).length > 0
    ? ` ${JSON.stringify(entry.context)}`
    : ''
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${ctx}`
}

function emit(level: LogLevel, message: string, context: LogContext = {}): void {
  if (LOG_LEVELS[level] < getMinLevel()) return

  const entry: LogEntry = {
    level,
    message,
    context,
    timestamp: new Date().toISOString(),
  }

  const sentry = getSentry()

  switch (level) {
    case 'error':
      if (sentry) sentry.captureMessage(message, 'error')
      console.error(formatEntry(entry))
      break
    case 'warn':
      if (sentry) sentry.captureMessage(message, 'warning')
      console.warn(formatEntry(entry))
      break
    case 'info':
      console.info(formatEntry(entry))
      break
    case 'debug':
      console.debug(formatEntry(entry))
      break
  }
}

export const logger = {
  debug: (message: string, context?: LogContext): void => emit('debug', message, context),
  info: (message: string, context?: LogContext): void => emit('info', message, context),
  warn: (message: string, context?: LogContext): void => emit('warn', message, context),
  error: (message: string, context?: LogContext): void => emit('error', message, context),

  /**
   * Capture exception ke Sentry (bila tersedia) + console.error.
   */
  captureException: (error: unknown, context?: LogContext): void => {
    const sentry = getSentry()
    if (sentry) {
      sentry.captureException(error, context ? { extra: context } : undefined)
    }
    const message = error instanceof Error ? error.message : String(error)
    emit('error', `Exception: ${message}`, { ...context, stack: error instanceof Error ? error.stack : undefined })
  },

  /**
   * Set user context untuk Sentry breadcrumbs.
   */
  setUser: (user: { id: number; email: string; subject_id: string } | null): void => {
    const sentry = getSentry()
    if (sentry) {
      sentry.setUser(user ? { id: String(user.id), email: user.email, username: user.subject_id } : null)
    }
  },
}
