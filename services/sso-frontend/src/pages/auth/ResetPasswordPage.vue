<script setup lang="ts">
/**
 * ResetPasswordPage — confirm reset using one-time token.
 *
 * REDESIGN: Liquid Glass × Austere Precision
 * Changed: visual shell only — SsoGlassCard + SsoGlassFormField + SsoGlassButton.
 * Frozen:  usePasswordResetConfirm composable, password strength logic,
 *          token query handling, all error mapping.
 * WCAG:    AA compliant.
 */

import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, KeyRound } from 'lucide-vue-next'
import SsoGlassButton from '@/components/atoms/SsoGlassButton.vue'
import SsoGlassCard from '@/components/molecules/SsoGlassCard.vue'
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
  <SsoGlassCard aria-labelledby="reset-title">
    <template #header>
      <h2
        id="reset-title"
        class="font-serif text-3xl font-light tracking-tight text-[var(--text-primary)] sm:text-4xl"
        style="font-family: var(--font-serif)"
      >
        Buat password baru
      </h2>
      <p class="text-body-sm leading-relaxed text-[var(--text-secondary)]">
        Password baru wajib kuat. Setelah berhasil, semua sesi aktif dicabut dan kamu perlu masuk
        ulang.
      </p>
    </template>

    <form class="grid gap-5" novalidate @submit.prevent="reset.submit">
      <SsoAlertBanner v-if="reset.error.value" tone="error" :message="reset.error.value" />
      <SsoAlertBanner v-if="reset.success.value" tone="success" :message="reset.success.value" />

      <SsoGlassFormField
        id="reset-password-email"
        v-model="reset.form.email"
        label="Email"
        type="email"
        autocomplete="email"
        inputmode="email"
        :required="true"
        :disabled="reset.pending.value"
        :error="reset.fieldErrors.value['email'] ?? null"
      />

      <SsoGlassFormField
        id="reset-password-token"
        v-model="reset.form.token"
        label="Token reset"
        type="text"
        autocomplete="one-time-code"
        :required="true"
        :disabled="reset.pending.value"
        :error="reset.fieldErrors.value['token'] ?? null"
      />

      <SsoGlassFormField
        id="reset-password-new"
        v-model="reset.form.password"
        label="Password baru"
        type="password"
        autocomplete="new-password"
        hint="Minimal 12 karakter, huruf besar/kecil, angka, karakter spesial."
        :required="true"
        :disabled="reset.pending.value"
        :error="reset.fieldErrors.value['password'] ?? null"
      />

      <p class="text-xs leading-relaxed text-[var(--text-muted)]" aria-live="polite">
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
        :required="true"
        :disabled="reset.pending.value"
        :error="reset.fieldErrors.value['password_confirmation'] ?? null"
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
        {{ reset.pending.value ? 'Menyimpan…' : 'Reset Password' }}
      </SsoGlassButton>
    </form>

    <template #footer>
      <RouterLink
        :to="{ name: 'auth.login' }"
        class="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline"
      >
        <ArrowLeft class="size-3.5" aria-hidden="true" />
        Kembali ke halaman masuk
      </RouterLink>
    </template>
  </SsoGlassCard>
</template>
