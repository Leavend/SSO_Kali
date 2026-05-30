import { ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { ssoErrorTemplatesApi } from '../services/sso-error-templates.api'
import type { SsoErrorTemplate, UpsertSsoErrorTemplatePayload } from '../types'

export type TemplatesStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'unauthenticated'
  | 'forbidden'
  | 'error'
export type ActionStatus = 'idle' | 'loading' | 'success' | 'step_up_required' | 'error'

export const useSsoErrorTemplatesStore = defineStore('admin-sso-error-templates', () => {
  const status = ref<TemplatesStatus>('idle')
  const actionStatus = ref<ActionStatus>('idle')
  const templates = ref<readonly SsoErrorTemplate[]>([])
  const selectedTemplate = ref<SsoErrorTemplate | null>(null)
  const errorMessage = ref<string | null>(null)
  const requestId = ref<string | null>(null)

  async function load(): Promise<void> {
    status.value = 'loading'
    errorMessage.value = null

    try {
      const response = await ssoErrorTemplatesApi.list()
      templates.value = response.templates
      requestId.value = getLastRequestId()
      status.value = 'success'
    } catch (error) {
      templates.value = []
      handleLoadError(error)
    }
  }

  async function upsert(errorCode: string, payload: UpsertSsoErrorTemplatePayload): Promise<void> {
    actionStatus.value = 'loading'
    errorMessage.value = null

    try {
      const response = await ssoErrorTemplatesApi.update(errorCode, payload)
      selectedTemplate.value = response.template
      mergeTemplate(response.template)
      requestId.value = getLastRequestId()
      actionStatus.value = 'success'
    } catch (error) {
      handleActionError(error)
    }
  }

  async function resetTemplate(errorCode: string, locale?: string): Promise<void> {
    actionStatus.value = 'loading'
    errorMessage.value = null

    try {
      const response = await ssoErrorTemplatesApi.reset(errorCode, locale)
      selectedTemplate.value = response.template
      mergeTemplate(response.template)
      requestId.value = getLastRequestId()
      actionStatus.value = 'success'
    } catch (error) {
      handleActionError(error)
    }
  }

  function mergeTemplate(next: SsoErrorTemplate): void {
    templates.value = templates.value.some(
      (t) => t.error_code === next.error_code && t.locale === next.locale,
    )
      ? templates.value.map((t) =>
          t.error_code === next.error_code && t.locale === next.locale ? next : t,
        )
      : [next, ...templates.value]
  }

  function handleLoadError(error: unknown): void {
    if (error instanceof ApiError) {
      requestId.value = error.requestId ?? getLastRequestId()

      if (error.status === 401) {
        status.value = 'unauthenticated'
        errorMessage.value = 'Sesi admin berakhir. Login ulang untuk melanjutkan.'
        return
      }

      if (error.status === 403) {
        status.value = 'forbidden'
        errorMessage.value = 'Kamu tidak memiliki izin untuk melihat SSO error templates.'
        return
      }
    } else {
      requestId.value = getLastRequestId()
    }

    status.value = 'error'
    errorMessage.value = requestId.value
      ? `SSO error templates belum bisa dimuat. Gunakan request ID ${requestId.value} untuk investigasi.`
      : 'SSO error templates belum bisa dimuat. Coba lagi beberapa saat lagi.'
  }

  function handleActionError(error: unknown): void {
    requestId.value =
      error instanceof ApiError ? (error.requestId ?? getLastRequestId()) : getLastRequestId()

    if (error instanceof ApiError && (error.status === 428 || error.status === 412)) {
      actionStatus.value = 'step_up_required'
      errorMessage.value =
        'Aksi ini membutuhkan fresh-auth atau MFA assurance. Ulangi login admin lalu coba lagi.'
      return
    }

    actionStatus.value = 'error'
    errorMessage.value = requestId.value
      ? `Operasi template gagal. Gunakan request ID ${requestId.value} untuk investigasi.`
      : 'Operasi template gagal. Coba lagi beberapa saat lagi.'
  }

  return {
    status,
    actionStatus,
    templates,
    selectedTemplate,
    errorMessage,
    requestId,
    load,
    upsert,
    resetTemplate,
  }
})
