<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const session = useSessionStore()
const email = ref('')
const loading = ref(false)

const returnTo = computed(() => {
  const value = route.query.return_to
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/home'
})

function submit(): void {
  if (!email.value.trim()) return
  loading.value = true
  session.login(returnTo.value, email.value.trim())
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="text-xl">Masuk ke Dev-SSO</CardTitle>
      <CardDescription>
        Gunakan email kerja kamu untuk melanjutkan. Kami akan mengarahkanmu ke penyedia identitas.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <form class="grid gap-4" @submit.prevent="submit">
        <div class="grid gap-2">
          <Label for="login-email">Email</Label>
          <Input
            id="login-email"
            v-model="email"
            type="email"
            autocomplete="username"
            autofocus
            required
            placeholder="user@company.com"
            :disabled="loading"
          />
        </div>
        <Button type="submit" :disabled="loading || !email.trim()" class="w-full">
          <span v-if="loading">Mengalihkan…</span>
          <span v-else class="inline-flex items-center gap-2">
            Lanjutkan
            <ArrowRight class="size-4" />
          </span>
        </Button>
      </form>
    </CardContent>
    <CardFooter class="text-muted-foreground justify-center border-t pt-6 text-xs">
      Belum punya akun? Hubungi administrator organisasi kamu.
    </CardFooter>
  </Card>
</template>
