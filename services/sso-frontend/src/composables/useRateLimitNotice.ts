import { ApiError } from '@/lib/api/api-error'
import { useI18n } from '@/composables/useI18n'

const DEFAULT_RETRY_AFTER_SECONDS = 60

export type RateLimitNotice = {
  readonly message: string
  readonly seconds: number
}

export function useRateLimitNotice(): {
  readonly fromError: (error: unknown) => RateLimitNotice | null
} {
  const { t } = useI18n()

  function fromError(error: unknown): RateLimitNotice | null {
    if (!(error instanceof ApiError) || error.status !== 429) return null

    const seconds = Math.max(1, error.retryAfter ?? DEFAULT_RETRY_AFTER_SECONDS)

    return {
      seconds,
      message: t('api.rate_limit_retry_after', { seconds }),
    }
  }

  return { fromError }
}
