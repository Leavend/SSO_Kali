<script setup lang="ts">
/**
 * RegisterPage — self-service registration (Nama Lengkap + Email + Password).
 *
 * Mengirim POST /api/auth/register ke backend.
 * Setelah berhasil, redirect ke login dengan pesan sukses.
 */

import { reactive, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, UserPlus } from 'lucide-vue-next'
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
import { apiClient } from '@/lib/api/api-client'
import { ApiError, isValidationError } from '@/lib/api/api-error'

const router = useRouter()

const form = reactive({
  name: '',
  email: '',
  password: '',
  password_confirmation: '',
})

const pending = ref<boolean>(false)
const bannerError = ref<string | null>(null)
const bannerSuccess = ref<string | null>(null)
const fieldErrors = ref<Record<string, string>>({})

const canSubmit = computed<boolean>(
  () =>
    !pending.value &&
    form.name.trim().length > 0 &&
    form.email.trim().length > 0 &&
    form.password.length >= 8 &&
    form.password === form.password_confirmation,
)

/** Error translation for common backend messages. */
const ERROR_TRANSLATIONS: Record<string, string> = {
  'The email has already been taken.': 'Email ini sudah terdaftar.',
  'The name field is required.': 'Nama lengkap wajib diisi.',
  'The email field is required.': 'Email wajib diisi.',
  'The email field must be a valid email address.': 'Format email tidak valid.',
  'The password field is required.': 'Password wajib diisi.',
  'The password field must be at least 8 characters.': 'Password minimal 8 karakter.',
  'The password field confirmation does not match.': 'Konfirmasi password tidak cocok.',
  'The password confirmation does not match.': 'Konfirmasi password tidak cocok.',
  'The route api/auth/register could not be found.': 'Fitur pendaftaran belum tersedia. Hubungi administrator.',
  'Not Found': 'Fitur pendaftaran belum tersedia. Hubungi administrator.',
}

function translateError(message: string): string {
  return ERROR_TRANSLATIONS[message] ?? message
}

/** Client-side validation sebelum submit. */
function validate(): boolean {
  fieldErrors.value = {}

  if (form.name.trim().length === 0) {
    fieldErrors.value['name'] = 'Nama lengkap wajib diisi.'
  }
  if (form.email.trim().length === 0) {
    fieldErrors.value['email'] = 'Email wajib diisi.'
  }
  if (form.password.length < 8) {
    fieldErrors.value['password'] = 'Password minimal 8 karakter.'
  }
  if (form.password !== form.password_confirmation) {
    fieldErrors.value['password_confirmation'] = 'Konfirmasi password tidak cocok.'
  }

  return Object.keys(fieldErrors.value).length === 0
}

async function submit(): Promise<void> {
  if (!validate()) return

  pending.value = true
  bannerError.value = null
  bannerSuccess.value = null

  try {
    await apiClient.post('/api/auth/register', {
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      password_confirmation: form.password_confirmation,
    })

    bannerSuccess.value = 'Akun berhasil dibuat! Silakan login dengan kredensial baru kamu.'
    form.name = ''
    form.email = ''
    form.password = ''
    form.password_confirmation = ''

    // Redirect ke login setelah 3 detik
    setTimeout(() => {
      void router.push({ name: 'auth.login' })
    }, 3000)
  } catch (error) {
    if (isValidationError(error) && error instanceof ApiError) {
      fieldErrors.value = error.violations.reduce<Record<string, string>>(
        (acc, v) => {
          acc[v.field] = translateError(v.message)
          return acc
        },
        {},
      )
      bannerError.value = translateError(error.message)
    } else if (error instanceof ApiError) {
      bannerError.value = translateError(error.message)
    } else {
      bannerError.value = 'Gagal mendaftarkan akun. Coba lagi beberapa saat.'
    }
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <Card class="shadow-card">
    <CardHeader class="gap-2">
      <CardTitle class="text-heading-1 font-display font-semibold tracking-tight">
        Daftar Akun Baru
      </CardTitle>
      <CardDescription class="text-body-sm leading-relaxed">
        Buat akun SSO untuk mengakses semua aplikasi organisasi.
      </CardDescription>
    </CardHeader>

    <CardContent>
      <form class="grid gap-5" novalidate @submit.prevent="submit">
        <SsoAlertBanner
          v-if="bannerError"
          tone="error"
          :message="bannerError"
        />
        <SsoAlertBanner
          v-if="bannerSuccess"
          tone="success"
          :message="bannerSuccess"
        />

        <SsoFormField
          id="register-name"
          v-model="form.name"
          label="Nama lengkap"
          type="text"
          autocomplete="name"
          placeholder="Nama Lengkap"
          :required="true"
          :autofocus="true"
          :disabled="pending"
          :error="fieldErrors['name'] ?? null"
        />

        <SsoFormField
          id="register-email"
          v-model="form.email"
          label="Email"
          type="email"
          autocomplete="email"
          inputmode="email"
          placeholder="email@company.com"
          :required="true"
          :disabled="pending"
          :error="fieldErrors['email'] ?? null"
        />

        <SsoPasswordField
          id="register-password"
          v-model="form.password"
          label="Password"
          autocomplete="new-password"
          hint="Minimal 8 karakter."
          :required="true"
          :disabled="pending"
          :error="fieldErrors['password'] ?? null"
        />

        <SsoPasswordField
          id="register-password-confirm"
          v-model="form.password_confirmation"
          label="Konfirmasi password"
          autocomplete="new-password"
          :required="true"
          :disabled="pending"
          :error="fieldErrors['password_confirmation'] ?? null"
        />

        <Button
          type="submit"
          size="lg"
          class="w-full"
          :disabled="!canSubmit"
          :aria-busy="pending || undefined"
        >
          <span v-if="pending">Mendaftarkan…</span>
          <span v-else class="inline-flex items-center gap-2">
            <UserPlus class="size-4" aria-hidden="true" />
            Daftar
            <ArrowRight class="size-4" aria-hidden="true" />
          </span>
        </Button>
      </form>
    </CardContent>

    <CardFooter class="text-muted-foreground text-caption justify-center border-t pt-6 leading-relaxed">
      Sudah punya akun?
      <RouterLink :to="{ name: 'auth.login' }" class="text-primary ml-1 font-medium hover:underline">
        Masuk
      </RouterLink>
    </CardFooter>
  </Card>
</template>
