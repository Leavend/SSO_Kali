import { computed, onMounted, reactive, ref, type ComputedRef, type Reactive, type Ref } from 'vue'
import { profileApi } from '@/services/profile.api'
import { presentSafeError, supportReferenceCopy } from '@/lib/api/safe-error-presenter'
import type {
  CreateDataSubjectRequestPayload,
  DataSubjectRequestSummary,
  DataSubjectRequestType,
} from '@/types/profile.types'

type MutableDataSubjectRequestPayload = {
  type: DataSubjectRequestType
  reason: string
}

export type UseDataSubjectRequestsReturn = {
  readonly form: Reactive<MutableDataSubjectRequestPayload>
  readonly requests: Ref<readonly DataSubjectRequestSummary[]>
  readonly pending: Ref<boolean>
  readonly submitting: Ref<boolean>
  readonly error: Ref<string | null>
  readonly supportReference: Ref<string | null>
  readonly supportReferenceText: ComputedRef<string | null>
  readonly success: Ref<string | null>
  readonly canSubmit: ComputedRef<boolean>
  load: () => Promise<void>
  submit: () => Promise<void>
  setType: (type: DataSubjectRequestType) => void
}

export function useDataSubjectRequests(): UseDataSubjectRequestsReturn {
  const requests = ref<readonly DataSubjectRequestSummary[]>([])
  const pending = ref(false)
  const submitting = ref(false)
  const error = ref<string | null>(null)
  const supportReference = ref<string | null>(null)
  const success = ref<string | null>(null)
  const form = reactive<MutableDataSubjectRequestPayload>({ type: 'export', reason: '' })

  const canSubmit = computed<boolean>(() => !submitting.value && form.type.length > 0)
  const supportReferenceText = computed<string | null>(() => supportReferenceCopy(supportReference.value))

  onMounted(() => {
    void load()
  })

  async function load(): Promise<void> {
    pending.value = true
    error.value = null
    supportReference.value = null

    try {
      requests.value = await profileApi.getDataSubjectRequests()
    } catch (caught) {
      const presented = presentSafeError(caught, 'Gagal memuat permintaan privasi.')
      error.value = presented.message
      supportReference.value = presented.supportReference
    } finally {
      pending.value = false
    }
  }

  async function submit(): Promise<void> {
    if (!canSubmit.value) return
    submitting.value = true
    error.value = null
    supportReference.value = null
    success.value = null

    try {
      const created = await profileApi.createDataSubjectRequest({
        type: form.type,
        reason: normalizeReason(form.reason),
      })
      requests.value = [created, ...requests.value]
      success.value = 'Permintaan privasi diterima. Tim kami akan meninjau sesuai SLA.'
      form.reason = ''
    } catch (caught) {
      const presented = presentSafeError(caught, 'Gagal mengirim permintaan privasi.')
      error.value = presented.message
      supportReference.value = presented.supportReference
    } finally {
      submitting.value = false
    }
  }

  function setType(type: DataSubjectRequestType): void {
    form.type = type
  }

  return {
    form,
    requests,
    pending,
    submitting,
    error,
    supportReference,
    supportReferenceText,
    success,
    canSubmit,
    load,
    submit,
    setType,
  }
}

function normalizeReason(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}
