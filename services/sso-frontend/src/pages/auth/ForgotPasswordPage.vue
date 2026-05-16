<script setup lang="ts">
import { Mail } from 'lucide-vue-next'
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
import { usePasswordResetRequest } from '@/composables/usePasswordLifecycle'

const reset = usePasswordResetRequest()
</script>

<template>
  <Card class="shadow-card">
    <CardHeader class="gap-2">
      <CardTitle class="text-heading-1 font-display font-semibold tracking-tight">Reset password</CardTitle>
      <CardDescription class="text-body-sm leading-relaxed">
        Masukkan email akun. Jika terdaftar, instruksi reset akan dikirim tanpa membuka status akun.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <form class="grid gap-5" novalidate @submit.prevent="reset.submit">
        <SsoAlertBanner v-if="reset.error.value" tone="error" :message="reset.error.value" />
        <SsoAlertBanner v-if="reset.success.value" tone="success" :message="reset.success.value" />
        <SsoFormField
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
        />
        <Button type="submit" size="lg" class="w-full" :disabled="!reset.canSubmit.value">
          <Mail class="size-4" aria-hidden="true" />
          {{ reset.pending.value ? 'Mengirim…' : 'Kirim Instruksi Reset' }}
        </Button>
      </form>
    </CardContent>
    <CardFooter class="text-muted-foreground text-caption justify-center border-t pt-6 leading-relaxed">
      Ingat password?
      <RouterLink :to="{ name: 'auth.login' }" class="text-primary ml-1 font-medium hover:underline">Masuk</RouterLink>
    </CardFooter>
  </Card>
</template>
