<script setup lang="ts">
/**
 * ConsentPage — UC-13 explicit OAuth consent decision, Aurora redesign.
 *
 * Single-step page that renders its own headline + scope cards + buttons.
 *
 * DOM ORDER PRESERVED: Deny rendered FIRST as <button>, Allow SECOND.
 * ConsentPage.spec relies on `wrapper.get('button')` → Deny and
 * `button:not([disabled]) + button` → Allow.
 *
 * Frozen behaviour: fetchConsentDetails / submitConsentDecision API calls,
 * safeConsentErrorCopy mapping, unknown-scope warning, scope merging,
 * all error copy, PKCE / authorization code flow.
 */

import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { AlertTriangle, Check, ShieldAlert, X } from 'lucide-vue-next'
import SsoGlassButton from '@/components/atoms/SsoGlassButton.vue'
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

const clientName = computed<string>(
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
      return 'border-destructive/50 text-destructive-foreground'
    case 'sensitive':
      return 'border-yellow-400/50 text-foreground'
    default:
      return 'border-border text-foreground'
  }
}
</script>

<template>
  <section aria-labelledby="consent-title" class="flex w-full flex-col items-center gap-7">
    <header class="flex flex-col items-center gap-3 text-center">
      <h1
        id="consent-title"
        class="text-balance text-4xl font-light leading-[1.05] tracking-tight text-foreground sm:text-5xl"
        style="font-family: var(--font-serif)"
      >
        Beri akses ke aplikasi
      </h1>
      <p class="max-w-md text-sm font-medium leading-relaxed text-muted-foreground">
        Aplikasi
        <strong class="font-semibold text-foreground">{{ clientName || 'Unknown' }}</strong>
        meminta akses ke akun SSO-mu. Tinjau izin sebelum menyetujui.
      </p>
    </header>

    <p
      v-if="errorMessage"
      role="alert"
      class="flex w-full items-start gap-2 rounded-2xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive-foreground backdrop-blur-md"
    >
      <AlertTriangle class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{{ errorMessage }}</span>
    </p>

    <p
      v-if="containsUnknown"
      role="alert"
      class="flex w-full items-start gap-2 rounded-2xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive-foreground backdrop-blur-md"
    >
      <ShieldAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        Permintaan ini berisi scope yang tidak dikenal. Jangan menyetujui jika kamu tidak yakin
        aplikasi ini tepercaya.
      </span>
    </p>

    <p v-if="loading" class="text-sm text-muted-foreground" aria-live="polite">
      Memuat data persetujuan…
    </p>

    <div v-else-if="scopes.length > 0" class="flex w-full flex-col gap-3">
      <p class="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
        Izin yang diminta
      </p>
      <ul class="flex flex-col gap-2">
        <li v-for="scope in scopes" :key="scope.name">
          <div
            :class="[
              'flex items-start gap-3 rounded-2xl border bg-card/50 px-4 py-3 backdrop-blur-md',
              scopeLevelClass(scope.level),
            ]"
          >
            <span class="mt-1.5 size-2.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
            <div class="grid min-w-0 gap-0.5">
              <p class="text-sm font-medium text-foreground">{{ scope.label }}</p>
              <p class="text-xs leading-relaxed text-muted-foreground">
                {{ scope.description }}
              </p>
              <code class="font-mono text-[10px] text-muted-foreground">{{ scope.name }}</code>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <p
      class="w-full rounded-2xl border border-border bg-card/40 px-4 py-3 text-center text-xs leading-relaxed text-muted-foreground backdrop-blur-md"
    >
      Pilih Izinkan hanya jika kamu mempercayai aplikasi ini. Kamu dapat mencabut akses dari
      halaman Aplikasi Terhubung.
    </p>

    <!--
      DOM ORDER: Deny first, Allow second.
      ConsentPage.spec.ts depends on `wrapper.get('button')` returning Deny
      and `button:not([disabled]) + button` returning Allow.
    -->
    <div class="grid w-full gap-3 sm:grid-cols-2">
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
        variant="vibrant"
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
  </section>
</template>
