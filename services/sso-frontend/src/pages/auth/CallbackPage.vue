<script setup lang="ts">
/**
 * CallbackPage — UC-13 + UC-14 OIDC Authorization Code callback.
 *
 * REDESIGN: Liquid Glass × Austere Precision
 * Changed: visual shell only — SsoGlassCard + SsoGlassButton.
 * Frozen:  useOidcCallback composable, FE-FR028-001 (no error_description echo),
 *          extractSupportReference, formatSupportReference, redirect logic.
 * WCAG:    AA compliant; SsoSpinner aria-hidden, status text aria-live="polite".
 */

import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ShieldAlert } from 'lucide-vue-next'
import SsoGlassButton from '@/components/atoms/SsoGlassButton.vue'
import SsoGlassCard from '@/components/molecules/SsoGlassCard.vue'
import SsoSpinner from '@/components/atoms/SsoSpinner.vue'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import { useOidcCallback } from '@/composables/useOidcCallback'
import { extractSupportReference, formatSupportReference } from '@/lib/oidc/oauth-error-message'

const route = useRoute()
const router = useRouter()
const callback = useOidcCallback()

const FALLBACK_ERROR_COPY =
  'Login tidak dapat diselesaikan. Mulai ulang dari halaman login atau kembali ke aplikasi awal.'

const title = computed<string>(() =>
  callback.pending.value
    ? 'Memverifikasi login…'
    : callback.error.value
      ? 'Login gagal'
      : 'Selesai',
)

const safeErrorCopy = computed<string>(() => callback.errorMessage.value ?? FALLBACK_ERROR_COPY)

const supportReference = computed<string | null>(() => {
  if (!callback.error.value) return null
  const ref = extractSupportReference({
    error: readString('error'),
    error_description: readString('error_description'),
    error_ref: readString('error_ref'),
    request_id: readString('request_id'),
  })
  return formatSupportReference(ref)
})

onMounted(async (): Promise<void> => {
  const result = await callback.handle({
    code: readString('code'),
    state: readString('state'),
    error: readString('error'),
    error_description: readString('error_description'),
  })

  if (result) {
    await router.replace(result.post_login_redirect || '/home')
  }
})

function readString(key: string): string | undefined {
  const value = route.query[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
</script>

<template>
  <SsoGlassCard aria-labelledby="callback-title">
    <template #header>
      <div class="flex flex-col items-center gap-3 text-center">
        <span
          class="grid size-12 place-items-center rounded-[var(--radius-glass-xl)] border bg-[var(--glass-bg-elevated)]"
          :class="
            callback.error.value
              ? 'border-[var(--glass-border-error)] text-error-700'
              : 'border-[var(--glass-border-subtle)] text-brand-600'
          "
          aria-hidden="true"
        >
          <SsoSpinner v-if="callback.pending.value" size="md" />
          <ShieldAlert v-else class="size-6" />
        </span>
        <h2
          id="callback-title"
          class="text-heading-2 font-display font-semibold tracking-tight text-[var(--text-primary)]"
        >
          {{ title }}
        </h2>
        <p class="text-body-sm leading-relaxed text-[var(--text-secondary)]">
          Memproses respons OIDC dan menyiapkan sesi aman untuk kamu.
        </p>
      </div>
    </template>

    <div class="grid gap-4">
      <SsoAlertBanner
        v-if="callback.error.value"
        data-testid="oidc-callback-error"
        tone="error"
        :message="safeErrorCopy"
      />

      <p
        v-if="supportReference"
        data-testid="oidc-callback-support-ref"
        class="text-center font-mono text-xs text-[var(--text-muted)] select-all"
      >
        {{ supportReference }}
      </p>

      <p
        v-if="callback.pending.value"
        class="text-center text-sm text-[var(--text-secondary)] leading-relaxed"
        aria-live="polite"
      >
        Mohon tunggu sebentar.
      </p>
    </div>

    <template v-if="callback.error.value" #footer>
      <SsoGlassButton variant="glass" size="sm" class="mx-auto" @click="router.push('/')">
        <template #leading>
          <ArrowLeft class="size-3.5" aria-hidden="true" />
        </template>
        Kembali ke halaman masuk
      </SsoGlassButton>
    </template>
  </SsoGlassCard>
</template>
