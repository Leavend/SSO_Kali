<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import UiDataList, { type UiDataListRow } from '@/components/ui/UiDataList.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import { useSessionStore } from '@/stores/session.store'
import { useIpAccessStore } from '../stores/ip-access.store'
import type { IpAccessRuleCreatePayload } from '../types'

const store = useIpAccessStore()
const session = useSessionStore()
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
  <section class="ip-access-page" aria-labelledby="ip-access-title">
    <div class="page-heading">
      <p class="eyebrow">Security</p>
      <h1 id="ip-access-title">IP Access Rules</h1>
      <p class="page-summary">Manage IP allow/blocklist rules untuk akses ke SSO admin.</p>
    </div>

    <UiSkeleton v-if="store.status === 'loading'" label="Memuat IP access rules" />

    <UiStatusView
      v-else-if="store.status === 'forbidden'"
      tone="forbidden"
      eyebrow="Security"
      title="Akses IP access rules ditolak"
      :description="store.errorMessage ?? 'Kamu tidak memiliki izin untuk melihat IP access rules.'"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'unauthenticated'"
      tone="error"
      eyebrow="Session"
      title="Sesi admin berakhir"
      :description="store.errorMessage ?? 'Login ulang dari portal untuk melanjutkan.'"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'error'"
      tone="api"
      eyebrow="Admin API"
      title="IP access rules belum bisa dimuat"
      :description="
        store.errorMessage ?? 'Coba muat ulang atau gunakan correlation ID untuk investigasi.'
      "
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiEmptyState
      v-else-if="store.rules.length === 0"
      title="IP access rules belum tersedia"
      description="Belum ada aturan IP access. Tambahkan CIDR allow/block saat permission tersedia."
    />

    <div v-else class="ip-access-layout">
      <section v-if="canWriteAccess" class="detail-section" aria-labelledby="create-title">
        <h2 id="create-title">Tambah aturan IP</h2>
        <p class="page-summary">
          Tambah aturan allow/block untuk CIDR tertentu. Perubahan diaudit.
        </p>
        <div class="export-filters">
          <UiFormField id="ip-cidr" label="CIDR" required>
            <UiInput
              id="ip-cidr"
              v-model="cidr"
              name="ip-cidr"
              autocomplete="off"
              placeholder="203.0.113.0/24"
            />
          </UiFormField>
          <UiFormField id="ip-mode" label="Mode" required>
            <UiSelect id="ip-mode" v-model="mode" name="ip-mode" :options="modeOptions" />
          </UiFormField>
          <UiFormField id="ip-reason" label="Reason" required>
            <UiInput id="ip-reason" v-model="reason" name="ip-reason" autocomplete="off" />
          </UiFormField>
          <UiFormField id="ip-expires-at" label="Expires at">
            <UiInput id="ip-expires-at" v-model="expiresAt" name="ip-expires-at" type="date" />
          </UiFormField>
        </div>
        <button
          class="primary-action"
          type="button"
          :disabled="store.actionStatus === 'loading'"
          @click="submitCreate"
        >
          {{ store.actionStatus === 'loading' ? 'Creating...' : 'Tambah aturan IP' }}
        </button>
      </section>
      <section class="detail-section" aria-labelledby="rules-title">
        <h2 id="rules-title">Rules</h2>
        <UiDataList caption="IP access rules" :columns="ruleColumns" :rows="ruleRows">
          <template #actions="{ row }">
            <button
              v-if="canWriteAccess"
              type="button"
              class="ip-rule-delete-button danger-action"
              @click="requestDeleteRule(Number(row.id))"
            >
              Hapus
            </button>
          </template>
        </UiDataList>
      </section>

      <div v-if="store.actionStatus === 'step_up_required'" class="action-message" role="alert">
        {{ store.errorMessage }}
      </div>
    </div>

    <p v-if="store.errorMessage && store.status === 'success'" class="action-message">
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
