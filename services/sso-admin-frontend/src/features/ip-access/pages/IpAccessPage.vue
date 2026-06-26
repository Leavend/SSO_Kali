<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import UiDataList, { type UiDataListRow } from '@/components/ui/UiDataList.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useSessionStore } from '@/stores/session.store'
import { useIpAccessStore } from '../stores/ip-access.store'
import type { IpAccessRuleCreatePayload } from '../types'
import { PlusCircle, ShieldAlert } from 'lucide-vue-next'

const store = useIpAccessStore()
const session = useSessionStore()
const { t } = useI18n()
const canWriteAccess = computed(() => session.hasPermission('admin.ip-access.write'))

const cidr = ref('')
const mode = ref<'allow' | 'block'>('block')
const reason = ref('')
const expiresAt = ref('')
const pendingDeleteRuleId = ref<number | null>(null)
const modeOptions = [
  { value: 'allow', label: 'Allow' },
  { value: 'block', label: 'Block' },
] as const
const ruleColumns = [
  { key: 'cidr', label: 'CIDR' },
  { key: 'mode', label: 'Mode' },
  { key: 'reason', label: 'Reason' },
  { key: 'created_at', label: 'Created' },
] as const
const ruleRows = computed<readonly UiDataListRow[]>(() =>
  store.rules.map((rule) => ({
    id: String(rule.id),
    cidr: rule.cidr,
    mode: rule.mode,
    reason: rule.reason ?? 'No reason evidence',
    created_at: rule.created_at ?? 'No timestamp',
  })),
)

async function submitCreate(): Promise<void> {
  const payload: IpAccessRuleCreatePayload = {
    cidr: cidr.value.trim(),
    mode: mode.value,
    reason: reason.value.trim(),
    ...(expiresAt.value && { expires_at: expiresAt.value }),
  }
  await store.create(payload)
  cidr.value = ''
  mode.value = 'block'
  reason.value = ''
  expiresAt.value = ''
}

onMounted(() => {
  if (store.status === 'idle') void store.load()
})

function requestDeleteRule(ruleId: number): void {
  pendingDeleteRuleId.value = ruleId
}

function cancelDeleteRule(): void {
  pendingDeleteRuleId.value = null
}

async function confirmDeleteRule(): Promise<void> {
  const ruleId = pendingDeleteRuleId.value
  pendingDeleteRuleId.value = null
  if (ruleId !== null) await store.destroy(ruleId)
}

const confirmDescription = computed<string>(() => {
  const rule = store.rules.find((item) => item.id === pendingDeleteRuleId.value)
  return rule
    ? `This will remove ${rule.mode} rule ${rule.cidr} from admin IP access control.`
    : 'Review the impact before continuing.'
})
</script>

<template>
  <section
    class="ip-access-page max-w-page mx-auto px-4 md:px-6 py-8"
    aria-labelledby="ip-access-title"
  >
    <div class="page-heading">
      <p class="eyebrow">{{ t('ip_access.eyebrow') }}</p>
      <h1 id="ip-access-title">{{ t('ip_access.title') }}</h1>
      <p class="page-summary">{{ t('ip_access.summary') }}</p>
    </div>

    <UiSkeleton v-if="store.status === 'loading'" :label="t('ip_access.loading')" />

    <UiStatusView
      v-else-if="store.status === 'forbidden'"
      tone="forbidden"
      eyebrow="Security"
      :title="t('ip_access.forbidden_title')"
      :description="store.errorMessage ?? t('common.forbidden_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'unauthenticated'"
      tone="error"
      eyebrow="Session"
      :title="t('common.session_expired_title')"
      :description="store.errorMessage ?? t('common.session_expired_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'error'"
      tone="api"
      eyebrow="Admin API"
      :title="t('ip_access.error_title')"
      :description="store.errorMessage ?? t('common.error_loading_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiEmptyState
      v-else-if="store.rules.length === 0"
      :title="t('ip_access.empty_title')"
      :description="t('ip_access.empty_desc')"
    />

    <div v-else class="ip-access-layout">
      <!-- Left Column: Create Form Card -->
      <section
        v-if="canWriteAccess"
        class="ip-access-card ip-access-form-section"
        aria-labelledby="create-title"
      >
        <h2 id="create-title" class="section-title">
          <PlusCircle :size="18" class="text-primary" aria-hidden="true" />
          <span>{{ t('ip_access.create_title') }}</span>
        </h2>
        <p class="section-desc">
          {{ t('ip_access.create_desc') }}
        </p>

        <form @submit.prevent="submitCreate" class="ip-rule-form">
          <div class="form-fields">
            <UiFormField id="ip-cidr" :label="t('ip_access.label_cidr')" required>
              <UiInput
                id="ip-cidr"
                v-model="cidr"
                name="ip-cidr"
                autocomplete="off"
                placeholder="203.0.113.0/24"
              />
            </UiFormField>
            <UiFormField id="ip-mode" :label="t('ip_access.label_mode')" required>
              <UiSelect id="ip-mode" v-model="mode" name="ip-mode" :options="modeOptions" />
            </UiFormField>
            <UiFormField id="ip-reason" :label="t('ip_access.label_reason')" required>
              <UiInput
                id="ip-reason"
                v-model="reason"
                name="ip-reason"
                autocomplete="off"
                placeholder="Internal maintenance CIDR"
              />
            </UiFormField>
            <UiFormField id="ip-expires-at" :label="t('ip_access.label_expires_at')">
              <UiInput id="ip-expires-at" v-model="expiresAt" name="ip-expires-at" type="date" />
            </UiFormField>
          </div>

          <UiButton
            type="submit"
            variant="primary"
            class="submit-btn"
            :disabled="store.actionStatus === 'loading'"
          >
            {{
              store.actionStatus === 'loading' ? t('common.creating') : t('ip_access.btn_add_rule')
            }}
          </UiButton>
        </form>
      </section>

      <!-- Right Column: Rules List Card -->
      <section class="ip-access-card ip-access-list-section" aria-labelledby="rules-title">
        <h2 id="rules-title" class="section-title">
          <ShieldAlert :size="18" class="text-primary" aria-hidden="true" />
          <span>{{ t('ip_access.rules_title') }}</span>
        </h2>

        <UiDataList caption="IP access rules" :columns="ruleColumns" :rows="ruleRows">
          <!-- Custom render for Mode column using slot -->
          <template #cell(mode)="{ row }">
            <span :class="['ui-badge', row.mode === 'allow' ? 'badge--success' : 'badge--danger']">
              {{ row.mode }}
            </span>
          </template>

          <template #actions="{ row }">
            <button
              v-if="canWriteAccess"
              type="button"
              class="ip-rule-delete-button ui-action ui-action--danger"
              @click="requestDeleteRule(Number(row.id))"
            >
              {{ t('ip_access.btn_delete') }}
            </button>
          </template>
        </UiDataList>
      </section>

      <div v-if="store.actionStatus === 'step_up_required'" class="ui-action-message" role="alert">
        {{ store.errorMessage }}
      </div>
    </div>

    <p v-if="store.errorMessage && store.status === 'success'" class="ui-action-message">
      {{ store.errorMessage }}
    </p>

    <EvidenceContextPanel title="IP access evidence" :request-id="store.requestId" />

    <ConfirmDialog
      :open="pendingDeleteRuleId !== null"
      title="Delete IP access rule?"
      :description="confirmDescription"
      confirm-label="Delete"
      cancel-label="Cancel"
      @confirm="confirmDeleteRule"
      @cancel="cancelDeleteRule"
    />
  </section>
</template>

<style scoped>
/* Page container gap spacing */
.ip-access-page {
  display: grid;
  gap: 18px;
}

/* Master 2-column layout */
.ip-access-layout {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  align-items: start;
  gap: 24px;
}

/* Common Card styles */
.ip-access-card {
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--card);
  box-shadow: var(--shadow-md);
}

.section-title {
  margin: 0 0 12px 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--foreground);
  letter-spacing: -0.01em;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-desc {
  margin: 0 0 20px 0;
  font-size: 0.88rem;
  color: var(--muted-foreground);
  line-height: 1.4;
}

.form-fields {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.submit-btn {
  width: 100%;
  margin-top: 20px;
}

/* Badge specific adjustments inside data list */
.ui-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 999px;
  letter-spacing: 0.03em;
}

.badge--success {
  background: var(--success-soft);
  color: var(--success-soft-fg);
  border: 1px solid color-mix(in oklch, var(--success) 20%, transparent);
}

.badge--danger {
  background: var(--danger-soft);
  color: var(--danger-soft-fg);
  border: 1px solid color-mix(in oklch, var(--danger) 20%, transparent);
}

/* ── Responsive ─────────────────────────────────────────────────────────── */
@media (max-width: 760px) {
  .ip-access-layout {
    grid-template-columns: 1fr;
  }
}
</style>
