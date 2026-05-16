<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { KeyRound } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import SsoFormField from '@/components/molecules/SsoFormField.vue'
import SsoPasswordField from '@/components/molecules/SsoPasswordField.vue'
import { usePasswordResetConfirm } from '@/composables/usePasswordLifecycle'

const route = useRoute()
const token = computed<string | null>(() => (typeof route.query['token'] === 'string' ? route.query['token'] : null))
const reset = usePasswordResetConfirm(token.value)
</script>

<template>
  <Card class="shadow-card">
    <CardHeader class="gap-2">
      <CardTitle class="text-heading-1 font-display font-semibold tracking-tight">Buat password baru</CardTitle>
      <CardDescription class="text-body-sm leading-relaxed">
        Password baru wajib kuat. Setelah berhasil, semua sesi aktif dicabut dan kamu perlu masuk ulang.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <form class="grid gap-5" novalidate @submit.prevent="reset.submit">
        <SsoAlertBanner v-if="reset.error.value" tone="error" :message="reset.error.value" />
        <SsoAlertBanner v-if="reset.success.value" tone="success" :message="reset.success.value" />
        <SsoFormField
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
        <SsoFormField
          id="reset-password-token"
          v-model="reset.form.token"
          label="Token reset"
          type="text"
          autocomplete="one-time-code"
          :required="true"
          :disabled="reset.pending.value"
          :error="reset.fieldErrors.value['token'] ?? null"
        />
        <SsoPasswordField
          id="reset-password-new"
          v-model="reset.form.password"
          label="Password baru"
          autocomplete="new-password"
          hint="Minimal 12 karakter, huruf besar/kecil, angka, karakter spesial."
          :required="true"
          :disabled="reset.pending.value"
          :error="reset.fieldErrors.value['password'] ?? null"
        />
        <p class="text-muted-foreground text-xs leading-relaxed" aria-live="polite">
          Kebutuhan tersisa: {{ reset.strengthItems.value.length > 0 ? reset.strengthItems.value.join(', ') : 'terpenuhi' }}.
        </p>
        <SsoPasswordField
          id="reset-password-confirm"
          v-model="reset.form.password_confirmation"
          label="Konfirmasi password baru"
          autocomplete="new-password"
          :required="true"
          :disabled="reset.pending.value"
          :error="reset.fieldErrors.value['password_confirmation'] ?? null"
        />
        <Button type="submit" size="lg" class="w-full" :disabled="!reset.canSubmit.value">
          <KeyRound class="size-4" aria-hidden="true" />
          {{ reset.pending.value ? 'Menyimpan…' : 'Reset Password' }}
        </Button>
      </form>
    </CardContent>
    <CardFooter class="text-muted-foreground text-caption justify-center border-t pt-6 leading-relaxed">
      Sudah reset?
      <RouterLink :to="{ name: 'auth.login' }" class="text-primary ml-1 font-medium hover:underline">Masuk</RouterLink>
    </CardFooter>
  </Card>
</template>
