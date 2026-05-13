<script setup lang="ts">
/**
 * ClientSecretStatus — displays secret lifecycle status for a confidential client.
 *
 * FR-009 / ISSUE-04: Shows rotation date, expiry date, and status badge.
 */

import { computed } from 'vue'
import { KeyRound, AlertTriangle, CheckCircle2, XCircle } from 'lucide-vue-next'

export type SecretLifecycle = {
  readonly secret_rotated_at: string | null
  readonly secret_expires_at: string | null
  readonly type: string
}

const props = defineProps<{ client: SecretLifecycle }>()

const isConfidential = computed(() => props.client.type === 'confidential')

const expiresAt = computed(() => {
  if (!props.client.secret_expires_at) return null
  return new Date(props.client.secret_expires_at)
})

const rotatedAt = computed(() => {
  if (!props.client.secret_rotated_at) return null
  return new Date(props.client.secret_rotated_at)
})

const daysUntilExpiry = computed(() => {
  if (!expiresAt.value) return null
  const diff = expiresAt.value.getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
})

const status = computed<'healthy' | 'warning' | 'expired' | 'none'>(() => {
  if (!isConfidential.value) return 'none'
  if (daysUntilExpiry.value === null) return 'none'
  if (daysUntilExpiry.value <= 0) return 'expired'
  if (daysUntilExpiry.value <= 14) return 'warning'
  return 'healthy'
})

function formatDate(date: Date | null): string {
  if (!date) return '—'
  return date.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatRelative(date: Date | null): string {
  if (!date) return ''
  const days = Math.ceil((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (days === 0) return 'hari ini'
  if (days === 1) return 'kemarin'
  return `${days} hari lalu`
}
</script>

<template>
  <div v-if="isConfidential" class="secret-status">
    <div class="secret-status__header">
      <KeyRound :size="16" aria-hidden="true" />
      <span class="secret-status__title">Client Secret Lifecycle</span>
    </div>

    <div class="secret-status__grid">
      <div class="secret-status__item">
        <span class="secret-status__label">Status</span>
        <span :class="['secret-status__badge', `is-${status}`]">
          <CheckCircle2 v-if="status === 'healthy'" :size="14" aria-hidden="true" />
          <AlertTriangle v-else-if="status === 'warning'" :size="14" aria-hidden="true" />
          <XCircle v-else-if="status === 'expired'" :size="14" aria-hidden="true" />
          {{ status === 'healthy' ? 'Active' : status === 'warning' ? 'Expiring Soon' : status === 'expired' ? 'Expired' : 'No Expiry Set' }}
        </span>
      </div>

      <div class="secret-status__item">
        <span class="secret-status__label">Expires</span>
        <span class="secret-status__value">
          {{ formatDate(expiresAt) }}
          <small v-if="daysUntilExpiry !== null && daysUntilExpiry > 0">({{ daysUntilExpiry }}d)</small>
        </span>
      </div>

      <div class="secret-status__item">
        <span class="secret-status__label">Last Rotated</span>
        <span class="secret-status__value">
          {{ formatDate(rotatedAt) }}
          <small v-if="rotatedAt">({{ formatRelative(rotatedAt) }})</small>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.secret-status {
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  padding: 16px;
  margin-top: 12px;
}

.secret-status__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-weight: 600;
  font-size: 0.875rem;
}

.secret-status__title {
  color: var(--color-text-primary, #1a202c);
}

.secret-status__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.secret-status__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.secret-status__label {
  font-size: 0.6875rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted, #718096);
}

.secret-status__value {
  font-size: 0.8125rem;
  color: var(--color-text-primary, #1a202c);
}

.secret-status__value small {
  color: var(--color-text-muted, #718096);
  font-size: 0.75rem;
}

.secret-status__badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 9999px;
  width: fit-content;
}

.secret-status__badge.is-healthy {
  background: #c6f6d5;
  color: #22543d;
}

.secret-status__badge.is-warning {
  background: #fefcbf;
  color: #744210;
}

.secret-status__badge.is-expired {
  background: #fed7d7;
  color: #742a2a;
}

.secret-status__badge.is-none {
  background: #e2e8f0;
  color: #4a5568;
}
</style>
