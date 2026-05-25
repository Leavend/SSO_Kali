<script setup lang="ts">
/**
 * ForgotPasswordPage — reset password request, Aurora redesign.
 *
 * Single-step page (no stepper) so it renders its own serif headline
 * + tagline. Frozen behaviour: usePasswordResetRequest, anti-enumeration
 * copy, error mapping, redirect logic.
 */

import { ArrowLeft, Mail } from 'lucide-vue-next'
import SsoGlassButton from '@/components/atoms/SsoGlassButton.vue'
import SsoGlassFormField from '@/components/molecules/SsoGlassFormField.vue'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import { usePasswordResetRequest } from '@/composables/usePasswordLifecycle'

const reset = usePasswordResetRequest()
</script>

<template>
  <section aria-labelledby="forgot-title" class="flex flex-col items-center gap-8">
    <header class="flex flex-col items-center gap-3 text-center">
      <h1
        id="forgot-title"
        class="text-balance text-4xl font-light leading-[1.05] tracking-tight text-foreground sm:text-5xl"
        style="font-family: var(--font-serif)"
      >
        Lupa password kamu?
      </h1>
      <p class="max-w-sm text-sm font-medium leading-relaxed text-muted-foreground">
        Masukkan email akun. Jika terdaftar, kami akan mengirimkan instruksi reset tanpa membuka
        status akun.
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
        :hide-label="true"
      >
        <template #leading>
          <Mail class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </template>
      </SsoGlassFormField>

      <SsoGlassButton
        type="submit"
        variant="vibrant"
        size="fullWidth"
        :loading="reset.pending.value"
        :disabled="!reset.canSubmit.value"
      >
        <template v-if="!reset.pending.value" #leading>
          <Mail class="size-4" aria-hidden="true" />
        </template>
        {{ reset.pending.value ? 'Mengirim…' : 'Kirim instruksi reset' }}
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
