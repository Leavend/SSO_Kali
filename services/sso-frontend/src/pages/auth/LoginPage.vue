<script setup lang="ts">
/**
 * LoginPage — UC-08 native login ke `/api/auth/login`.
 *
 * Logic dipindahkan ke `useLoginForm`. Page hanya orchestration + presentation.
 */

import { ArrowRight } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import SsoFormField from '@/components/molecules/SsoFormField.vue'
import SsoPasswordField from '@/components/molecules/SsoPasswordField.vue'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import { useLoginForm } from '@/composables/useLoginForm'

const login = useLoginForm()
</script>

<template>
  <Card class="shadow-card">
    <CardHeader class="gap-2">
      <CardTitle class="text-heading-1 font-display font-semibold tracking-tight">
        Masuk ke akunmu
      </CardTitle>
      <CardDescription class="text-body-sm leading-relaxed">
        Gunakan kredensial SSO-mu untuk mengakses semua aplikasi kerja.
      </CardDescription>
    </CardHeader>

    <CardContent>
      <form class="grid gap-5" novalidate @submit.prevent="login.submit">
        <SsoAlertBanner
          v-if="login.bannerError.value"
          tone="error"
          :message="login.bannerError.value"
        />

        <SsoFormField
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
        />

        <SsoPasswordField
          id="login-password"
          v-model="login.form.password"
          label="Password"
          autocomplete="current-password"
          :required="true"
          :disabled="login.pending.value"
          :error="login.fieldErrors.value['password'] ?? null"
        />

        <p v-if="login.retryAfterSeconds.value > 0" class="text-muted-foreground text-caption" aria-live="polite">
          Tombol masuk aktif kembali dalam {{ login.retryAfterSeconds.value }} detik.
        </p>

        <Button
          type="submit"
          size="lg"
          class="w-full"
          :disabled="!login.canSubmit.value"
          :aria-busy="login.pending.value || undefined"
        >
          <span v-if="login.pending.value">Memproses…</span>
          <span v-else class="inline-flex items-center gap-2">
            Masuk
            <ArrowRight class="size-4" aria-hidden="true" />
          </span>
        </Button>
      </form>
    </CardContent>

    <CardFooter class="text-muted-foreground text-caption justify-center border-t pt-6 leading-relaxed">
      Belum punya akun?
      <RouterLink :to="{ name: 'auth.register' }" class="text-primary ml-1 font-medium hover:underline">
        Daftar sekarang
      </RouterLink>
    </CardFooter>
  </Card>
</template>
