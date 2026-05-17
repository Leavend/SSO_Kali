<script setup lang="ts">
/**
 * ConsentPage — UC-13 explicit OAuth consent decision.
 *
 * REDESIGN: Liquid Glass × Austere Precision
 * Changed: visual shell only — SsoGlassCard + SsoGlassSurface (subtle) for client
 *          info & scope items + SsoGlassButton for Deny/Allow.
 *          DOM ORDER PRESERVED: Deny rendered FIRST as <button>, Allow SECOND —
 *          existing ConsentPage.spec relies on `button:not([disabled]) + button`.
 * Frozen:  fetchConsentDetails / submitConsentDecision API calls,
 *          safeConsentErrorCopy mapping (419/429/401/403/5xx),
 *          window.location.assign redirect on success,
 *          unknown-scope warning, scope merging logic, all error copy strings,
 *          PKCE / authorization code flow.
 * SSO UX:  Deny dan Allow visually equal (size + width) — design.md §10.5.
 * WCAG:    AA compliant.
 */

import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { AlertTriangle, Check, ShieldAlert, ShieldCheck, X } from 'lucide-vue-next'
import SsoGlassButton from '@/components/atoms/SsoGlassButton.vue'
import SsoGlassCard from '@/components/molecules/SsoGlassCard.vue'
import SsoGlassSurface from '@/components/atoms/SsoGlassSurface.vue'
import {
  hasUnknownScopes,
  mergeBackendScopes,
  resolveScopeList,
  type ScopeDescriptor,
} from '@/lib/oidc/scope-labels'
import {
  fetchConsentDetails,
  submitConsentDecision,
  type ConsentDecision,
  type ConsentDetails,
} from '@/services/consent.api'
import { isApiError } from '@/lib/api/api-error'

const LOAD_FAILURE_COPY = 'Data persetujuan tidak dapat dimuat. Coba lagi beberapa saat.'
const CSRF_EXPIRED_COPY = 'Sesi keamanan kedaluwarsa. Muat ulang halaman lalu coba lagi.'
const RATE_LIMITED_COPY = 'Terlalu banyak percobaan. Tunggu sebentar sebelum mencoba lagi.'
const SUBMIT_FAILURE_COPY = 'Keputusan persetujuan gagal diproses. Coba lagi beberapa saat.'

function safeConsentErrorCopy(error: unknown, fallback: string): string {
  if (!isApiError(error)) return fallback
  if (error.status === 419) return CSRF_EXPIRED_COPY
  if (error.status === 429) return RATE_LIMITED_COPY
  if (error.status === 401) return 'Sesi SSO kedaluwarsa. Silakan masuk lagi.'
  if (error.status === 403) return 'Akses ke halaman persetujuan tidak diizinkan untuk akun ini.'
  if (error.status === 0 || error.status >= 500)
    return 'Layanan SSO sedang tidak tersedia. Coba lagi nanti.'
  return fallback
}

const route = useRoute()

const consent = ref<ConsentDetails | null>(null)
const loading = ref(true)
const submitting = ref<ConsentDecision | null>(null)
const errorMessage = ref('')

const clientId = computed<string>(
  () => consent.value?.client.display_name ?? String(route.query['client_id'] ?? ''),
)
const state = computed<string>(() => String(route.query['state'] ?? ''))
const rawScope = computed<string>(() => String(route.query['scope'] ?? 'openid'))

const scopes = computed<readonly ScopeDescriptor[]>(() => {
  const requested = (rawScope.value || 'openid').split(/\s+/u).filter((token) => token !== '')
  const backendScopes = consent.value?.scopes ?? []

  if (requested.length === 0 && backendScopes.length === 0) return resolveScopeList(rawScope.value)

  const requestedNames = requested.length > 0 ? requested : backendScopes.map((scope) => scope.name)
  const backendDescriptions = new Map<string, string>(
    backendScopes.map((scope) => [scope.name, scope.description]),
  )

  return mergeBackendScopes(requestedNames, backendDescriptions)
})

const containsUnknown = computed<boolean>(() => hasUnknownScopes(scopes.value))
const canDecide = computed<boolean>(
  () => Boolean(consent.value?.state) && !loading.value && !submitting.value,
)

onMounted(async () => {
  const requestedClientId = String(route.query['client_id'] ?? '')
  if (!requestedClientId || !state.value) {
    loading.value = false
    errorMessage.value = 'Permintaan persetujuan tidak lengkap. Silakan ulangi proses otorisasi.'
    return
  }

  try {
    consent.value = await fetchConsentDetails({
      clientId: requestedClientId,
      scope: rawScope.value,
      state: state.value,
    })
  } catch (error) {
    errorMessage.value = safeConsentErrorCopy(error, LOAD_FAILURE_COPY)
  } finally {
    loading.value = false
  }
})

async function decide(decision: ConsentDecision): Promise<void> {
  if (!consent.value || submitting.value) return

  submitting.value = decision
  errorMessage.value = ''

  try {
    const result = await submitConsentDecision({
      state: consent.value.state,
      decision,
    })
    window.location.assign(result.redirect_uri)
  } catch (error) {
    errorMessage.value = safeConsentErrorCopy(error, SUBMIT_FAILURE_COPY)
  } finally {
    submitting.value = null
  }
}

function scopeLevelClass(level: ScopeDescriptor['level']): string {
  switch (level) {
    case 'unknown':
      return 'border-[var(--glass-border-error)] text-error-700'
    case 'sensitive':
      return 'border-warning-800/40 text-warning-800'
    default:
      return 'border-[var(--glass-border-subtle)] text-brand-600'
  }
}
</script>

<template>
  <SsoGlassCard size="wide" aria-labelledby="consent-title">
    <template #header>
      <div class="flex flex-col items-center gap-3 text-center">
        <span
          class="grid size-12 place-items-center rounded-[var(--radius-glass-xl)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-elevated)] text-brand-600"
          aria-hidden="true"
        >
          <ShieldCheck class="size-6" />
        </span>
        <h2
          id="consent-title"
          class="text-heading-1 font-display font-semibold tracking-tight text-[var(--text-primary)]"
        >
          Otorisasi Aplikasi
        </h2>
        <p class="text-body-sm leading-relaxed text-[var(--text-secondary)]">
          Aplikasi <strong>{{ clientId || 'Unknown' }}</strong> meminta akses ke akun SSO-mu.
        </p>
      </div>
    </template>

    <div class="grid gap-5">
      <p
        v-if="errorMessage"
        role="alert"
        class="flex items-start gap-2 rounded-[var(--radius-glass-lg)] border border-[var(--glass-border-error)] bg-[color-mix(in_oklch,var(--color-error-50)_40%,transparent)] px-3 py-2 text-xs text-error-700 leading-relaxed"
      >
        <AlertTriangle class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{{ errorMessage }}</span>
      </p>

      <p
        v-if="containsUnknown"
        role="alert"
        class="flex items-start gap-2 rounded-[var(--radius-glass-lg)] border border-[var(--glass-border-error)] bg-[color-mix(in_oklch,var(--color-error-50)_40%,transparent)] px-3 py-2 text-xs text-error-700 leading-relaxed"
      >
        <ShieldAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Permintaan ini berisi scope yang tidak dikenal. Jangan menyetujui jika kamu tidak yakin
          aplikasi ini tepercaya.
        </span>
      </p>

      <p v-if="loading" class="text-center text-sm text-[var(--text-secondary)]" aria-live="polite">
        Memuat data persetujuan…
      </p>

      <div v-else-if="scopes.length > 0" class="grid gap-3">
        <p class="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Izin yang diminta:
        </p>
        <ul class="grid gap-2">
          <li v-for="scope in scopes" :key="scope.name">
            <SsoGlassSurface
              variant="subtle"
              :class="['flex items-start gap-3 px-4 py-3', scopeLevelClass(scope.level)]"
            >
              <span class="mt-1.5 size-2.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
              <div class="grid min-w-0 gap-0.5">
                <p class="text-sm font-medium text-[var(--text-primary)]">{{ scope.label }}</p>
                <p class="text-xs leading-relaxed text-[var(--text-secondary)]">
                  {{ scope.description }}
                </p>
                <code class="font-mono text-[10px] text-[var(--text-muted)]">{{ scope.name }}</code>
              </div>
            </SsoGlassSurface>
          </li>
        </ul>
      </div>

      <SsoGlassSurface
        variant="subtle"
        class="px-4 py-3 text-center text-xs leading-relaxed text-[var(--text-secondary)]"
      >
        Pilih Izinkan hanya jika kamu mempercayai aplikasi ini. Kamu dapat mencabut akses dari
        halaman Aplikasi Terhubung.
      </SsoGlassSurface>

      <!--
        DOM ORDER: Deny first, Allow second.
        ConsentPage.spec.ts depends on `wrapper.get('button')` returning Deny
        and `button:not([disabled]) + button` returning Allow.
        Both buttons receive the SAME visual weight (size + width) per design.md §10.5.
      -->
      <div class="grid gap-3 sm:grid-cols-2">
        <SsoGlassButton
          variant="ghost"
          size="lg"
          class="w-full"
          :disabled="!canDecide"
          :loading="submitting === 'deny'"
          @click="decide('deny')"
        >
          <template v-if="submitting !== 'deny'" #leading>
            <X class="size-4" aria-hidden="true" />
          </template>
          {{ submitting === 'deny' ? 'Memproses…' : 'Tolak' }}
        </SsoGlassButton>

        <SsoGlassButton
          variant="primary"
          size="lg"
          class="w-full"
          :disabled="!canDecide"
          :loading="submitting === 'allow'"
          @click="decide('allow')"
        >
          <template v-if="submitting !== 'allow'" #leading>
            <Check class="size-4" aria-hidden="true" />
          </template>
          {{ submitting === 'allow' ? 'Memproses…' : 'Izinkan' }}
        </SsoGlassButton>
      </div>
    </div>
  </SsoGlassCard>
</template>
