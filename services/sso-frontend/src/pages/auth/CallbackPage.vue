<script setup lang="ts">
/**
 * CallbackPage — UC-13 + UC-14 OIDC Authorization Code callback.
 *
 * Hanya aktif bila portal dikonfigurasi sebagai OIDC client (env VITE_OIDC_*).
 * Proses:
 *   1. Baca `?code`, `?state`, `?error` dari route.
 *   2. `useOidcCallback.handle()` → validasi + exchange + claims.
 *   3. Sukses: redirect ke `post_login_redirect`.
 *   4. Gagal: tampilkan error state dengan tombol kembali ke login.
 */

import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Loader2, ShieldAlert } from 'lucide-vue-next'
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
import { useOidcCallback } from '@/composables/useOidcCallback'

const route = useRoute()
const router = useRouter()
const callback = useOidcCallback()

const title = computed<string>(() =>
  callback.pending.value ? 'Memverifikasi login…' : callback.error.value ? 'Login gagal' : 'Selesai',
)

onMounted(async (): Promise<void> => {
  const result = await callback.handle({
    code: readString('code'),
    state: readString('state'),
    error: readString('error'),
    error_description: readString('error_description'),
  })

  if (result) {
    await router.replace(result.post_login_redirect || '/home')
  }
})

function readString(key: string): string | undefined {
  const value = route.query[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
</script>

<template>
  <Card class="shadow-card">
    <CardHeader class="items-center text-center">
      <span
        class="bg-brand-50 text-brand-600 grid size-12 place-items-center rounded-full"
        aria-hidden="true"
      >
        <Loader2 v-if="callback.pending.value" class="size-6 animate-spin" />
        <ShieldAlert v-else-if="callback.error.value" class="size-6 text-error-700" />
        <ShieldAlert v-else class="size-6" />
      </span>
      <CardTitle class="text-heading-2 font-display">{{ title }}</CardTitle>
      <CardDescription>
        Memproses respons OIDC dan menyiapkan sesi aman untuk kamu.
      </CardDescription>
    </CardHeader>

    <CardContent class="grid gap-4">
      <SsoAlertBanner
        v-if="callback.error.value"
        tone="error"
        :message="callback.errorDescription.value ?? 'Tidak dapat memproses callback login.'"
      />

      <p v-if="callback.pending.value" class="text-muted-foreground text-center text-sm" aria-live="polite">
        Mohon tunggu sebentar.
      </p>
    </CardContent>

    <CardFooter v-if="callback.error.value" class="justify-center">
      <Button as-child variant="outline" size="sm">
        <router-link to="/">
          <ArrowLeft class="size-4" aria-hidden="true" />
          Kembali ke login
        </router-link>
      </Button>
    </CardFooter>
  </Card>
</template>
