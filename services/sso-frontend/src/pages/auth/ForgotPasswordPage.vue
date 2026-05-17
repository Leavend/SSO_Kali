<script setup lang="ts">
/**
 * ForgotPasswordPage — reset password request.
 *
 * REDESIGN: Liquid Glass × Austere Precision
 * Changed: visual shell only — SsoGlassCard + SsoGlassFormField + SsoGlassButton.
 * Frozen:  usePasswordResetRequest composable, anti-enumeration response copy,
 *          all error mapping, autocomplete, redirect logic.
 * WCAG:    AA compliant.
 */

import { Mail, ArrowLeft } from 'lucide-vue-next'
import SsoGlassButton from '@/components/atoms/SsoGlassButton.vue'
import SsoGlassCard from '@/components/molecules/SsoGlassCard.vue'
import SsoGlassFormField from '@/components/molecules/SsoGlassFormField.vue'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import { usePasswordResetRequest } from '@/composables/usePasswordLifecycle'

const reset = usePasswordResetRequest()
</script>

<template>
  <SsoGlassCard aria-labelledby="forgot-title">
    <template #header>
      <h2
        id="forgot-title"
        class="text-heading-1 font-display font-semibold tracking-tight text-[var(--text-primary)]"
      >
        Reset password
      </h2>
      <p class="text-body-sm leading-relaxed text-[var(--text-secondary)]">
        Masukkan email akun. Jika terdaftar, instruksi reset akan dikirim tanpa membuka status akun.
      </p>
    </template>

    <form class="grid gap-5" novalidate @submit.prevent="reset.submit">
      <SsoAlertBanner v-if="reset.error.value" tone="error" :message="reset.error.value" />
      <SsoAlertBanner v-if="reset.success.value" tone="success" :message="reset.success.value" />

      <SsoGlassFormField
        id="forgot-password-email"
        v-model="reset.form.email"
        label="Email"
        type="email"
        autocomplete="email"
        inputmode="email"
        placeholder="email@company.com"
        :required="true"
        :disabled="reset.pending.value"
        :error="reset.fieldErrors.value['email'] ?? null"
      >
        <template #leading>
          <Mail class="size-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
        </template>
      </SsoGlassFormField>

      <SsoGlassButton
        type="submit"
        variant="primary"
        size="fullWidth"
        :loading="reset.pending.value"
        :disabled="!reset.canSubmit.value"
      >
        <template v-if="!reset.pending.value" #leading>
          <Mail class="size-4" aria-hidden="true" />
        </template>
        {{ reset.pending.value ? 'Mengirim…' : 'Kirim Instruksi Reset' }}
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
