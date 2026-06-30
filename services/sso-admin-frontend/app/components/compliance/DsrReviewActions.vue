<script setup lang="ts">
import { computed, ref } from 'vue'
import PrivilegedActionDialog from '@/components/users/PrivilegedActionDialog.vue'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import { isReasonValid, type ReasonPolicy } from '@/lib/users/user-actions'
import { observabilityApi } from '@/services/observability.api'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import UiButton from '@/components/ui/UiButton.vue'
import type {
  DataSubjectRequest,
  DsrFulfillResponse,
  DsrReviewResponse,
} from '@/types/compliance.types'

type ReviewActionId = 'approve' | 'reject' | 'fulfill_dry' | 'fulfill_commit'

const props = defineProps<{ readonly request: DataSubjectRequest }>()
const emit = defineEmits<{ done: [] }>()

const session = useSessionStore()
const { t } = useI18n()
const action = usePrivilegedAction<DsrReviewResponse | DsrFulfillResponse>()

// Reviewer notes policy (backend: notes ≤1000; required here so every decision is justified).
const REVIEW_NOTES: ReasonPolicy = { required: true, max: 1000 }

const activeAction = ref<ReviewActionId | null>(null)
const reason = ref('')
const legalHoldNotice = ref<string | null>(null)

const canReview = computed(() => session.hasPermission('admin.dsr.review'))
const isSubmittedState = computed(() => props.request.status === 'submitted')
const isApprovedState = computed(() => props.request.status === 'approved')

const needsReason = computed(
  () => activeAction.value === 'approve' || activeAction.value === 'reject',
)
const isDanger = computed(
  () => activeAction.value === 'reject' || activeAction.value === 'fulfill_commit',
)

const TITLE: Record<ReviewActionId, string> = {
  approve: 'observability.dsr_confirm_approve_title',
  reject: 'observability.dsr_confirm_reject_title',
  fulfill_dry: 'observability.dsr_confirm_fulfill_dry_title',
  fulfill_commit: 'observability.dsr_confirm_fulfill_commit_title',
}
const DESC: Record<ReviewActionId, string> = {
  approve: 'observability.dsr_confirm_approve_desc',
  reject: 'observability.dsr_confirm_reject_desc',
  fulfill_dry: 'observability.dsr_confirm_fulfill_dry_desc',
  fulfill_commit: 'observability.dsr_confirm_fulfill_commit_desc',
}
const dialogTitle = computed(() => (activeAction.value ? t(TITLE[activeAction.value]) : ''))
const dialogDescription = computed(() => (activeAction.value ? t(DESC[activeAction.value]) : ''))
const dialogError = computed(() => (action.failure.value ? t('common.error_generic') : null))

function open(id: ReviewActionId): void {
  action.reset()
  reason.value = ''
  legalHoldNotice.value = null
  activeAction.value = id
}

function onCancel(): void {
  activeAction.value = null
  reason.value = ''
  action.reset()
}

async function run(): Promise<void> {
  const id = activeAction.value
  if (!id) return
  const requestId = props.request.request_id

  if (id === 'approve' || id === 'reject') {
    if (!isReasonValid(REVIEW_NOTES, reason.value)) return
    const decision = id === 'approve' ? 'approved' : 'rejected'
    const result = await action.run(() =>
      observabilityApi.reviewDsr(requestId, { decision, notes: reason.value.trim() }),
    )
    if (result === null) return
  } else {
    const dryRun = id === 'fulfill_dry'
    const result = await action.run(() =>
      observabilityApi.fulfillDsr(requestId, { dry_run: dryRun }),
    )
    if (result === null) return
    if ('legal_hold_status' in result && result.legal_hold_status === 'active') {
      legalHoldNotice.value = t('observability.dsr_legal_hold_notice')
    }
  }

  activeAction.value = null
  reason.value = ''
  emit('done')
}

function onConfirm(): void {
  void run()
}
</script>

<template>
  <div v-if="canReview" class="dsr-review" data-testid="dsr-review-actions">
    <div class="dsr-review__buttons" role="group">
      <UiButton
        data-action="approve"
        variant="secondary"
        :disabled="!isSubmittedState || action.isSubmitting.value"
        @click="open('approve')"
      >
        {{ t('observability.dsr_btn_approve') }}
      </UiButton>
      <UiButton
        data-action="reject"
        variant="danger"
        :disabled="!isSubmittedState || action.isSubmitting.value"
        @click="open('reject')"
      >
        {{ t('observability.dsr_btn_reject') }}
      </UiButton>
      <UiButton
        data-action="fulfill_dry"
        variant="secondary"
        :disabled="!isApprovedState || action.isSubmitting.value"
        @click="open('fulfill_dry')"
      >
        {{ t('observability.dsr_btn_fulfill_dry') }}
      </UiButton>
      <UiButton
        data-action="fulfill_commit"
        variant="danger"
        :disabled="!isApprovedState || action.isSubmitting.value"
        @click="open('fulfill_commit')"
      >
        {{ t('observability.dsr_btn_fulfill_commit') }}
      </UiButton>
    </div>

    <p v-if="legalHoldNotice" data-testid="dsr-legal-hold" class="dsr-review__notice">
      {{ legalHoldNotice }}
    </p>

    <PrivilegedActionDialog
      :open="activeAction !== null"
      :title="dialogTitle"
      :description="dialogDescription"
      :danger="isDanger"
      :reason-label="needsReason ? t('observability.dsr_review_notes_label') : ''"
      :reason-required="needsReason"
      :reason-min="1"
      :reason-max="1000"
      :reason="reason"
      :submitting="action.isSubmitting.value"
      :step-up-url="action.stepUpUrl.value"
      :step-up-label="t('observability.dsr_step_up_label')"
      :error-message="dialogError"
      :request-id="action.requestId.value"
      @update:reason="reason = $event"
      @confirm="onConfirm"
      @cancel="onCancel"
    />
  </div>
</template>

<style scoped>
.dsr-review {
  display: grid;
  gap: 12px;
}
.dsr-review__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.dsr-review__notice {
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--danger);
}
</style>
