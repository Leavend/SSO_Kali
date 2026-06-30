// app/composables/useSsoErrorTemplates.ts
import { computed, type ComputedRef, type Ref } from 'vue'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { ssoErrorTemplatesApi } from '@/services/sso-error-templates.api'
import {
  resolveSsoErrorTemplatesViewState,
  type SsoErrorTemplatesViewState,
} from '@/lib/sso-error-templates/sso-error-templates-view-state'
import type {
  SsoErrorTemplate,
  SsoErrorTemplatesResponse,
} from '@/types/sso-error-templates.types'

export type UseSsoErrorTemplatesReturn = {
  readonly templates: Ref<readonly SsoErrorTemplate[] | null>
  readonly viewState: ComputedRef<SsoErrorTemplatesViewState>
  readonly isStale: ComputedRef<boolean>
  readonly requestId: ComputedRef<string | null>
  readonly pending: Ref<boolean>
  readonly refresh: () => Promise<void>
}

export function useSsoErrorTemplates(): UseSsoErrorTemplatesReturn {
  const { data, pending, error, refresh } = useAsyncData<SsoErrorTemplatesResponse>(
    'admin-sso-error-templates',
    () => ssoErrorTemplatesApi.list(),
  )

  const templates = computed<readonly SsoErrorTemplate[] | null>(
    () => data.value?.templates ?? null,
  )

  const viewState = computed<SsoErrorTemplatesViewState>(() =>
    resolveSsoErrorTemplatesViewState({
      pending: pending.value,
      error: error.value,
      templates: templates.value,
    }),
  )

  const isStale = computed<boolean>(() => Boolean(error.value) && templates.value !== null)

  const requestId = computed<string | null>(() =>
    error.value instanceof ApiError
      ? (error.value.requestId ?? getLastRequestId())
      : getLastRequestId(),
  )

  return {
    templates,
    viewState,
    isStale,
    requestId,
    pending,
    refresh: async () => {
      await refresh()
    },
  }
}
