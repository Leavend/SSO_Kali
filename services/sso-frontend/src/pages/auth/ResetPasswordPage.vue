<script setup lang="ts">
/**
 * ResetPasswordPage — confirm reset using one-time token, Aurora redesign.
 *
 * Frozen behaviour: usePasswordResetConfirm composable, password strength
 * logic, token query handling, error mapping.
 */

import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, KeyRound } from 'lucide-vue-next'
import SsoGlassButton from '@/components/atoms/SsoGlassButton.vue'
import SsoGlassFormField from '@/components/molecules/SsoGlassFormField.vue'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import { usePasswordResetConfirm } from '@/composables/usePasswordLifecycle'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
const route = useRoute()
const token = computed<string | null>(() => {
  const q = route.query['token']
  if (typeof q === 'string') {
    const trimmed = q.trim()
    return trimmed !== '' ? trimmed : null
  }
  return null
})
const reset = usePasswordResetConfirm(token.value)
const hasTokenFromUrl = computed<boolean>(() => token.value !== null)
</script>

<template>
  <section aria-labelledby="reset-title" class="flex flex-col items-center gap-8">
    <header class="flex flex-col items-center gap-3 text-center">
      <h1
        id="reset-title"
        class="text-balance text-4xl font-light leading-[1.05] tracking-tight text-foreground sm:text-5xl"
        style="font-family: var(--font-serif)"
      >
        {{ t('auth.reset.title') }}
      </h1>
      <p class="max-w-sm text-sm font-medium leading-relaxed text-muted-foreground">
        {{ t('auth.reset.description') }}
      </p>
    </header>

    <form
      class="flex w-full max-w-md flex-col items-stretch gap-4"
      novalidate
      @submit.prevent="reset.submit"
    >
      <SsoAlertBanner v-if="reset.error.value" tone="error" :message="reset.error.value" />
      <SsoAlertBanner v-if="reset.success.value" tone="success" :message="reset.success.value" />

      <SsoGlassFormField
        id="reset-password-email"
        v-model="reset.form.email"
        :label="t('portal.profile.email')"
        type="email"
        autocomplete="email"
        inputmode="email"
        placeholder="email@company.com"
        :required="true"
        :disabled="reset.pending.value"
        :error="reset.fieldErrors.value['email'] ?? null"
        :hide-label="true"
      />

      <div v-if="hasTokenFromUrl" class="rounded-lg border border-border/40 bg-background/20 px-3.5 py-2.5 text-xs text-muted-foreground backdrop-blur-sm flex items-center gap-2">
        <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
        {{ t('auth.reset.token_verified') }}
      </div>

      <SsoGlassFormField
        v-else
        id="reset-password-token"
        v-model="reset.form.token"
        :label="t('auth.reset.token')"
        type="text"
        autocomplete="one-time-code"
        :placeholder="t('auth.reset.token')"
        :required="true"
        :disabled="reset.pending.value"
        :error="reset.fieldErrors.value['token'] ?? null"
        :hide-label="true"
      />

      <SsoGlassFormField
        id="reset-password-new"
        v-model="reset.form.password"
        :label="t('portal.security.new_password')"
        type="password"
        autocomplete="new-password"
        :placeholder="t('portal.security.new_password')"
        :hint="t('auth.reset.password_hint')"
        :required="true"
        :disabled="reset.pending.value"
        :error="reset.fieldErrors.value['password'] ?? null"
        :hide-label="true"
      />

      <p class="text-center text-xs leading-relaxed text-muted-foreground" aria-live="polite">
        {{
          t('portal.security.remaining_requirements', {
            items:
              reset.strengthItems.value.length > 0
                ? reset.strengthItems.value.join(', ')
                : t('portal.security.fulfilled'),
          })
        }}
      </p>

      <SsoGlassFormField
        id="reset-password-confirm"
        v-model="reset.form.password_confirmation"
        :label="t('portal.security.confirm_password')"
        type="password"
        autocomplete="new-password"
        :placeholder="t('portal.security.confirm_password')"
        :required="true"
        :disabled="reset.pending.value"
        :error="reset.fieldErrors.value['password_confirmation'] ?? null"
        :hide-label="true"
      />

      <SsoGlassButton
        type="submit"
        variant="vibrant"
        size="fullWidth"
        :loading="reset.pending.value"
        :disabled="!reset.canSubmit.value"
      >
        <template v-if="!reset.pending.value" #leading>
          <KeyRound class="size-4" aria-hidden="true" />
        </template>
        {{ reset.pending.value ? t('common.saving') : t('auth.reset.submit') }}
      </SsoGlassButton>
    </form>

    <RouterLink
      :to="{ name: 'auth.login' }"
      class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      <ArrowLeft class="size-3.5" aria-hidden="true" />
      {{ t('auth.back_to_login') }}
    </RouterLink>
  </section>
</template>
