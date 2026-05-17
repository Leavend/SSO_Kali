<script setup lang="ts">
/**
 * LoginPage — UC-08 native login ke `/api/auth/login`.
 *
 * REDESIGN: Liquid Glass × Austere Precision
 * Changed: visual shell only — SsoGlassCard + SsoGlassFormField + SsoGlassButton.
 * Frozen:  useLoginForm composable, validation, error messages, autocomplete,
 *          form submission handler, retry-after countdown, advisory CTA.
 * WCAG:    AA compliant (autocomplete, aria-busy, aria-describedby via SsoGlassInput).
 */

import { ArrowRight, AtSign } from 'lucide-vue-next'
import SsoGlassButton from '@/components/atoms/SsoGlassButton.vue'
import SsoGlassCard from '@/components/molecules/SsoGlassCard.vue'
import SsoGlassFormField from '@/components/molecules/SsoGlassFormField.vue'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import { useLoginForm } from '@/composables/useLoginForm'

const login = useLoginForm()
</script>

<template>
  <SsoGlassCard aria-labelledby="login-title">
    <template #header>
      <h2
        id="login-title"
        class="text-heading-1 font-display font-semibold tracking-tight text-[var(--text-primary)]"
      >
        Masuk ke akunmu
      </h2>
      <p class="text-body-sm leading-relaxed text-[var(--text-secondary)]">
        Gunakan kredensial SSO-mu untuk mengakses semua aplikasi kerja.
      </p>
    </template>

    <form class="grid gap-5" novalidate @submit.prevent="login.submit">
      <SsoAlertBanner
        v-if="login.bannerError.value"
        tone="error"
        :message="login.bannerError.value"
      />

      <a
        v-if="login.advisoryAction.value"
        data-testid="login-advisory-cta"
        :href="login.advisoryAction.value.href"
        class="text-sm font-medium text-brand-600 hover:underline"
      >
        {{ login.advisoryAction.value.label }} →
      </a>

      <SsoGlassFormField
        id="login-identifier"
        v-model="login.form.identifier"
        label="Email atau username"
        type="text"
        autocomplete="username"
        inputmode="email"
        placeholder="user@company.com"
        :required="true"
        :autofocus="true"
        :disabled="login.pending.value"
        :error="login.fieldErrors.value['identifier'] ?? null"
      >
        <template #leading>
          <AtSign class="size-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
        </template>
      </SsoGlassFormField>

      <SsoGlassFormField
        id="login-password"
        v-model="login.form.password"
        label="Password"
        type="password"
        autocomplete="current-password"
        :required="true"
        :disabled="login.pending.value"
        :error="login.fieldErrors.value['password'] ?? null"
      />

      <p
        v-if="login.retryAfterSeconds.value > 0"
        class="text-caption text-[var(--text-muted)]"
        aria-live="polite"
      >
        Tombol masuk aktif kembali dalam {{ login.retryAfterSeconds.value }} detik.
      </p>

      <SsoGlassButton
        type="submit"
        variant="primary"
        size="fullWidth"
        :loading="login.pending.value"
        :disabled="!login.canSubmit.value"
      >
        <template v-if="!login.pending.value" #trailing>
          <ArrowRight class="size-4" aria-hidden="true" />
        </template>
        {{ login.pending.value ? 'Memproses…' : 'Masuk' }}
      </SsoGlassButton>

      <RouterLink
        :to="{ name: 'auth.forgot-password' }"
        class="text-caption text-center text-[var(--text-muted)] hover:text-brand-600 transition-colors"
      >
        Lupa password?
      </RouterLink>
    </form>

    <template #footer>
      Belum punya akun?
      <RouterLink
        :to="{ name: 'auth.register' }"
        class="ml-1 font-medium text-brand-600 hover:underline"
      >
        Daftar sekarang
      </RouterLink>
    </template>
  </SsoGlassCard>
</template>
