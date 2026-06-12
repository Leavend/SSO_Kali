<script setup lang="ts">
/**
 * CallbackPage — UC-13 + UC-14 OIDC Authorization Code callback, Aurora redesign.
 *
 * Single-step page that renders its own status (spinner / error / support ref).
 *
 * Frozen behaviour: useOidcCallback composable, FE-FR028-001 (no
 * error_description echo), extractSupportReference, formatSupportReference,
 * redirect logic.
 */

import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ShieldAlert } from 'lucide-vue-next'
import SsoGlassButton from '@/components/atoms/SsoGlassButton.vue'
import SsoSpinner from '@/components/atoms/SsoSpinner.vue'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import { useOidcCallback } from '@/composables/useOidcCallback'
import { extractSupportReference, formatSupportReference } from '@/lib/oidc/oauth-error-message'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const callback = useOidcCallback()

const headline = computed<string>(() =>
  callback.pending.value
    ? t('auth.callback.title_loading')
    : callback.error.value
      ? t('auth.callback.title_error')
      : t('auth.callback.title_done'),
)

const safeErrorCopy = computed<string>(
  () => callback.errorMessage.value ?? t('oauth.errors._generic'),
)

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
  <section aria-labelledby="callback-title" class="flex flex-col items-center gap-8 text-center">
    <span
      class="grid size-14 place-items-center rounded-full border border-border bg-background/40 backdrop-blur-md"
      :class="callback.error.value ? 'text-destructive' : 'text-foreground'"
      aria-hidden="true"
    >
      <SsoSpinner v-if="callback.pending.value" size="md" />
      <ShieldAlert v-else class="size-6" />
    </span>

    <header class="flex flex-col items-center gap-3 text-center">
      <h1
        id="callback-title"
        class="text-balance text-4xl font-light leading-[1.05] tracking-tight text-foreground sm:text-5xl"
        style="font-family: var(--font-serif)"
      >
        {{ headline }}
      </h1>
      <p class="max-w-sm text-sm font-medium leading-relaxed text-muted-foreground">
        {{ t('auth.callback.description') }}
      </p>
    </header>

    <SsoAlertBanner
      v-if="callback.error.value"
      data-testid="oidc-callback-error"
      tone="error"
      :message="safeErrorCopy"
    />

    <p
      v-if="supportReference"
      data-testid="oidc-callback-support-ref"
      class="select-all font-mono text-xs text-muted-foreground"
    >
      {{ supportReference }}
    </p>

    <p
      v-if="callback.pending.value"
      class="text-sm leading-relaxed text-muted-foreground"
      aria-live="polite"
    >
      {{ t('auth.callback.wait') }}
    </p>

    <SsoGlassButton v-if="callback.error.value" variant="glass" size="sm" @click="router.push('/')">
      <template #leading>
        <ArrowLeft class="size-3.5" aria-hidden="true" />
      </template>
      {{ t('auth.back_to_login') }}
    </SsoGlassButton>
  </section>
</template>
