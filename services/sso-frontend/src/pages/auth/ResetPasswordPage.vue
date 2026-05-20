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

const route = useRoute()
const token = computed<string | null>(() =>
  typeof route.query['token'] === 'string' ? route.query['token'] : null,
)
const reset = usePasswordResetConfirm(token.value)
</script>

<template>
  <section aria-labelledby="reset-title" class="flex flex-col items-center gap-8">
    <header class="flex flex-col items-center gap-3 text-center">
      <h1
        id="reset-title"
        class="text-balance text-4xl font-light leading-[1.05] tracking-tight text-foreground sm:text-5xl"
        style="font-family: var(--font-serif)"
      >
        Atur password baru
      </h1>
      <p class="max-w-sm text-sm font-medium leading-relaxed text-muted-foreground">
        Setelah berhasil, semua sesi aktif dicabut dan kamu perlu masuk ulang.
      </p>
    </header>

    <form class="flex w-full max-w-md flex-col items-stretch gap-4" novalidate @submit.prevent="reset.submit">
      <SsoAlertBanner v-if="reset.error.value" tone="error" :message="reset.error.value" />
      <SsoAlertBanner v-if="reset.success.value" tone="success" :message="reset.success.value" />

      <SsoGlassFormField
        id="reset-password-email"
        v-model="reset.form.email"
        label="Email"
        type="email"
        autocomplete="email"
        inputmode="email"
        placeholder="email@company.com"
        :required="true"
        :disabled="reset.pending.value"
        :error="reset.fieldErrors.value['email'] ?? null"
        :hide-label="true"
      />

      <SsoGlassFormField
        id="reset-password-token"
        v-model="reset.form.token"
        label="Token reset"
        type="text"
        autocomplete="one-time-code"
        placeholder="Token reset"
        :required="true"
        :disabled="reset.pending.value"
        :error="reset.fieldErrors.value['token'] ?? null"
        :hide-label="true"
      />

      <SsoGlassFormField
        id="reset-password-new"
        v-model="reset.form.password"
        label="Password baru"
        type="password"
        autocomplete="new-password"
        placeholder="Password baru"
        hint="Minimal 12 karakter, huruf besar/kecil, angka, karakter spesial."
        :required="true"
        :disabled="reset.pending.value"
        :error="reset.fieldErrors.value['password'] ?? null"
        :hide-label="true"
      />

      <p class="text-center text-xs leading-relaxed text-muted-foreground" aria-live="polite">
        Kebutuhan tersisa:
        {{
          reset.strengthItems.value.length > 0 ? reset.strengthItems.value.join(', ') : 'terpenuhi'
        }}.
      </p>

      <SsoGlassFormField
        id="reset-password-confirm"
        v-model="reset.form.password_confirmation"
        label="Konfirmasi password baru"
        type="password"
        autocomplete="new-password"
        placeholder="Konfirmasi password baru"
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
        {{ reset.pending.value ? 'Menyimpan…' : 'Reset password' }}
      </SsoGlassButton>
    </form>

    <RouterLink
      :to="{ name: 'auth.login' }"
      class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      <ArrowLeft class="size-3.5" aria-hidden="true" />
      Kembali ke halaman masuk
    </RouterLink>
  </section>
</template>
