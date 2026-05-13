<script setup lang="ts">
/**
 * FR-011 / ISSUE-03: OAuth Consent Prompt Page.
 *
 * Displays requested scopes and allows user to approve or deny
 * third-party client access to their data.
 */

import { onMounted, ref } from 'vue'
import { ShieldCheck, X, Check, AlertTriangle } from 'lucide-vue-next'

type ScopeDetail = {
  name: string
  description: string
  claims: string[]
}

type ConsentData = {
  client: { client_id: string; display_name: string; type: string }
  scopes: ScopeDetail[]
  state: string
}

const consentData = ref<ConsentData | null>(null)
const loading = ref(true)
const submitting = ref(false)
const error = ref('')

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)
  const clientId = params.get('client_id') ?? ''
  const scope = params.get('scope') ?? 'openid'
  const state = params.get('state') ?? ''

  if (!clientId || !state) {
    error.value = 'Parameter consent tidak lengkap.'
    loading.value = false
    return
  }

  try {
    const response = await fetch(
      `/connect/consent?client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`,
      { headers: { Accept: 'application/json' } },
    )

    if (!response.ok) {
      error.value = 'Gagal memuat data consent.'
      loading.value = false
      return
    }

    consentData.value = await response.json()
  } catch {
    error.value = 'Terjadi kesalahan jaringan.'
  } finally {
    loading.value = false
  }
})

async function submitDecision(decision: 'allow' | 'deny'): Promise<void> {
  if (!consentData.value || submitting.value) return

  submitting.value = true
  error.value = ''

  try {
    const response = await fetch('/connect/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        state: consentData.value.state,
        decision,
      }),
    })

    const data = await response.json()

    if (data.redirect_uri) {
      window.location.href = data.redirect_uri
      return
    }

    error.value = data.message ?? 'Consent gagal diproses.'
  } catch {
    error.value = 'Terjadi kesalahan jaringan.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="consent-page">
    <div v-if="loading" class="consent-card consent-card--loading">
      <div class="consent-spinner" aria-hidden="true"></div>
      <p>Memuat...</p>
    </div>

    <div v-else-if="error" class="consent-card consent-card--error">
      <AlertTriangle :size="32" aria-hidden="true" />
      <p>{{ error }}</p>
    </div>

    <div v-else-if="consentData" class="consent-card">
      <div class="consent-header">
        <ShieldCheck :size="28" aria-hidden="true" />
        <h1>Izinkan Akses</h1>
      </div>

      <p class="consent-description">
        <strong>{{ consentData.client.display_name }}</strong> meminta izin untuk mengakses data berikut dari akun Anda:
      </p>

      <ul class="consent-scopes" role="list">
        <li v-for="scope in consentData.scopes" :key="scope.name" class="consent-scope">
          <div class="consent-scope__name">{{ scope.name }}</div>
          <div class="consent-scope__description">{{ scope.description }}</div>
          <div v-if="scope.claims.length" class="consent-scope__claims">
            <span v-for="claim in scope.claims" :key="claim" class="consent-claim-badge">{{ claim }}</span>
          </div>
        </li>
      </ul>

      <div class="consent-actions">
        <button
          class="consent-btn consent-btn--allow"
          type="button"
          :disabled="submitting"
          @click="submitDecision('allow')"
        >
          <Check :size="18" aria-hidden="true" />
          {{ submitting ? 'Memproses...' : 'Izinkan' }}
        </button>
        <button
          class="consent-btn consent-btn--deny"
          type="button"
          :disabled="submitting"
          @click="submitDecision('deny')"
        >
          <X :size="18" aria-hidden="true" />
          Tolak
        </button>
      </div>

      <p class="consent-footer">
        Anda dapat mencabut akses ini kapan saja dari halaman Connected Apps.
      </p>
    </div>
  </div>
</template>

<style scoped>
.consent-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--color-background, #0f1117);
}

.consent-card {
  width: min(100%, 440px);
  border: 1px solid var(--color-border, #27272a);
  border-radius: 16px;
  padding: 32px;
  background: var(--color-surface, #18181b);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
}

.consent-card--loading,
.consent-card--error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
  color: var(--color-text-muted, #a1a1aa);
}

.consent-card--error {
  color: #f87171;
}

.consent-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid #27272a;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.consent-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  color: #f4f4f5;
}

.consent-header h1 {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
}

.consent-description {
  font-size: 0.875rem;
  color: #a1a1aa;
  line-height: 1.6;
  margin-bottom: 20px;
}

.consent-description strong {
  color: #f4f4f5;
}

.consent-scopes {
  list-style: none;
  padding: 0;
  margin: 0 0 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.consent-scope {
  padding: 12px 16px;
  border: 1px solid #27272a;
  border-radius: 10px;
  background: #09090b;
}

.consent-scope__name {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #e4e4e7;
  margin-bottom: 4px;
}

.consent-scope__description {
  font-size: 0.75rem;
  color: #71717a;
  line-height: 1.5;
}

.consent-scope__claims {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.consent-claim-badge {
  font-size: 0.6875rem;
  padding: 2px 6px;
  border-radius: 4px;
  background: #1e1b4b;
  color: #a5b4fc;
  font-family: monospace;
}

.consent-actions {
  display: flex;
  gap: 12px;
}

.consent-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  border: none;
  border-radius: 10px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.1s ease;
}

.consent-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.consent-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.consent-btn--allow {
  background: #4f46e5;
  color: white;
}

.consent-btn--allow:hover:not(:disabled) {
  background: #4338ca;
}

.consent-btn--deny {
  background: #27272a;
  color: #a1a1aa;
}

.consent-btn--deny:hover:not(:disabled) {
  background: #3f3f46;
  color: #f4f4f5;
}

.consent-footer {
  margin-top: 16px;
  font-size: 0.6875rem;
  color: #52525b;
  text-align: center;
}
</style>
