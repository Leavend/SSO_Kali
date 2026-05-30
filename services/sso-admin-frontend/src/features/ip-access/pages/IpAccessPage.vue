<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
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
</script>

<template>
  <section class="ip-access-page" aria-labelledby="ip-access-title">
    <div class="page-heading">
      <p class="eyebrow">Security</p>
      <h1 id="ip-access-title">IP Access Rules</h1>
      <p class="page-summary">Manage IP allow/blocklist rules untuk akses ke SSO admin.</p>
    </div>

    <div v-if="store.status === 'loading'" class="state-card" role="status">
      Memuat IP access rules...
    </div>

    <div
      v-else-if="store.status === 'forbidden'"
      class="state-card state-card--danger"
      role="alert"
    >
      <h2>Akses IP access rules ditolak</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div
      v-else-if="store.status === 'unauthenticated'"
      class="state-card state-card--danger"
      role="alert"
    >
      <h2>Sesi admin berakhir</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div v-else-if="store.status === 'error'" class="state-card state-card--danger" role="alert">
      <h2>IP access rules belum bisa dimuat</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div v-else-if="store.rules.length === 0" class="state-card" role="status">
      <h2>IP access rules belum tersedia</h2>
      <p>Belum ada aturan IP access.</p>
    </div>

    <div v-else class="ip-access-layout">
      <section v-if="canWriteAccess" class="detail-section" aria-labelledby="create-title">
        <h2 id="create-title">Tambah aturan IP</h2>
        <p class="page-summary">
          Tambah aturan allow/block untuk CIDR tertentu. Perubahan diaudit.
        </p>
        <div class="export-filters">
          <label class="reason-field">
            CIDR
            <input v-model="cidr" name="ip-cidr" autocomplete="off" placeholder="203.0.113.0/24" />
          </label>
          <label class="reason-field">
            Mode
            <select v-model="mode" name="ip-mode">
              <option value="allow">Allow</option>
              <option value="block">Block</option>
            </select>
          </label>
          <label class="reason-field">
            Reason
            <input v-model="reason" name="ip-reason" autocomplete="off" />
          </label>
          <label class="reason-field">
            Expires at
            <input v-model="expiresAt" name="ip-expires-at" type="date" />
          </label>
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
        <div v-for="rule in store.rules" :key="rule.id" class="state-card">
          <strong>{{ rule.cidr }}</strong>
          <span :class="rule.mode === 'block' ? 'status-pill--danger' : 'status-pill'">{{
            rule.mode
          }}</span>
          <p v-if="rule.reason">{{ rule.reason }}</p>
          <p v-if="rule.expires_at" class="muted">Expires: {{ rule.expires_at }}</p>
          <p class="muted">Created: {{ rule.created_at ?? 'No timestamp' }}</p>
          <button
            v-if="canWriteAccess"
            type="button"
            class="danger-action"
            @click="store.destroy(rule.id)"
          >
            Hapus
          </button>
        </div>
      </section>

      <div v-if="store.actionStatus === 'step_up_required'" class="action-message" role="alert">
        {{ store.errorMessage }}
      </div>
    </div>

    <p v-if="store.errorMessage && store.status === 'success'" class="action-message">
      {{ store.errorMessage }}
    </p>

    <EvidenceContextPanel title="IP access evidence" :request-id="store.requestId" />
  </section>
</template>
