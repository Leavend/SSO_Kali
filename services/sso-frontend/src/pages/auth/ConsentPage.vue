<script setup lang="ts">
/**
 * ConsentPage — UC-13 explicit OAuth consent decision.
 */

import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { AlertTriangle, Check, ShieldAlert, ShieldCheck, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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

const LOAD_FAILURE_COPY =
  'Data persetujuan tidak dapat dimuat. Coba lagi beberapa saat.'
const CSRF_EXPIRED_COPY =
  'Sesi keamanan kedaluwarsa. Muat ulang halaman lalu coba lagi.'
const RATE_LIMITED_COPY =
  'Terlalu banyak percobaan. Tunggu sebentar sebelum mencoba lagi.'
const SUBMIT_FAILURE_COPY =
  'Keputusan persetujuan gagal diproses. Coba lagi beberapa saat.'

function safeConsentErrorCopy(error: unknown, fallback: string): string {
  if (!isApiError(error)) return fallback
  if (error.status === 419) return CSRF_EXPIRED_COPY
  if (error.status === 429) return RATE_LIMITED_COPY
  if (error.status === 401) return 'Sesi SSO kedaluwarsa. Silakan masuk lagi.'
  if (error.status === 403)
    return 'Akses ke halaman persetujuan tidak diizinkan untuk akun ini.'
  if (error.status === 0 || error.status >= 500)
    return 'Layanan SSO sedang tidak tersedia. Coba lagi nanti.'
  return fallback
}

const route = useRoute()

const consent = ref<ConsentDetails | null>(null)
const loading = ref(true)
const submitting = ref<ConsentDecision | null>(null)
const errorMessage = ref('')

const clientId = computed<string>(() => consent.value?.client.display_name ?? String(route.query['client_id'] ?? ''))
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
const canDecide = computed<boolean>(() => Boolean(consent.value?.state) && !loading.value && !submitting.value)

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
    const result = await submitConsentDecision({ state: consent.value.state, decision })
    window.location.assign(result.redirect_uri)
  } catch (error) {
    errorMessage.value = safeConsentErrorCopy(error, SUBMIT_FAILURE_COPY)
  } finally {
    submitting.value = null
  }
}

function scopeDotClass(level: ScopeDescriptor['level']): string {
  switch (level) {
    case 'unknown':
      return 'bg-destructive'
    case 'sensitive':
      return 'bg-amber-500'
    default:
      return 'bg-primary/60'
  }
}
</script>

<template>
  <section class="grid gap-6 max-w-md mx-auto">
    <Card>
      <CardHeader class="items-center text-center">
        <span class="bg-primary/10 text-primary grid size-12 place-items-center rounded-xl">
          <ShieldCheck class="size-6" />
        </span>
        <CardTitle>Otorisasi Aplikasi</CardTitle>
        <CardDescription>
          Aplikasi <strong>{{ clientId || 'Unknown' }}</strong> meminta akses ke akun SSO-mu.
        </CardDescription>
      </CardHeader>
      <CardContent class="grid gap-4">
        <div
          v-if="errorMessage"
          role="alert"
          class="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
        >
          <AlertTriangle class="size-4 shrink-0 mt-0.5" aria-hidden="true" />
          <p>{{ errorMessage }}</p>
        </div>

        <div
          v-if="containsUnknown"
          role="alert"
          class="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
        >
          <ShieldAlert class="size-4 shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            Permintaan ini berisi scope yang tidak dikenal. Jangan menyetujui jika
            kamu tidak yakin aplikasi ini tepercaya.
          </p>
        </div>

        <p v-if="loading" class="text-muted-foreground text-sm text-center">Memuat data persetujuan...</p>

        <div v-else-if="scopes.length > 0" class="grid gap-3">
          <p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Izin yang diminta:
          </p>
          <ul class="grid gap-3">
            <li
              v-for="scope in scopes"
              :key="scope.name"
              class="flex items-start gap-3 rounded-md border p-3"
            >
              <span
                :class="['size-2.5 rounded-full mt-1.5 shrink-0', scopeDotClass(scope.level)]"
                aria-hidden="true"
              />
              <div class="grid gap-0.5">
                <p class="text-sm font-medium">{{ scope.label }}</p>
                <p class="text-muted-foreground text-xs">{{ scope.description }}</p>
                <code class="text-muted-foreground/80 text-[10px] font-mono">{{ scope.name }}</code>
              </div>
            </li>
          </ul>
        </div>

        <p class="text-muted-foreground text-xs text-center border rounded-md p-3 bg-muted/50">
          Pilih Izinkan hanya jika kamu mempercayai aplikasi ini. Kamu dapat mencabut akses dari halaman Aplikasi Terhubung.
        </p>

        <div class="flex gap-3 justify-center">
          <Button variant="outline" :disabled="!canDecide" @click="decide('deny')">
            <X class="size-4" aria-hidden="true" />
            {{ submitting === 'deny' ? 'Memproses...' : 'Tolak' }}
          </Button>
          <Button :disabled="!canDecide" @click="decide('allow')">
            <Check class="size-4" aria-hidden="true" />
            {{ submitting === 'allow' ? 'Memproses...' : 'Izinkan' }}
          </Button>
        </div>
      </CardContent>
    </Card>
  </section>
</template>
