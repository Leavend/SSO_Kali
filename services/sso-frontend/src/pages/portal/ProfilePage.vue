<script setup lang="ts">
import { computed, onMounted, reactive, watch } from 'vue'
import { Save } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useProfileStore } from '@/stores/profile.store'
import { presentSafeError, validationErrors } from '@/lib/api/safe-error-presenter'

const profile = useProfileStore()

const form = reactive({
  display_name: '',
  given_name: '',
  family_name: '',
})

const load = useAsyncAction(() => profile.loadProfile())
const save = useAsyncAction(() => profile.updateProfile({ ...form }))
const fieldErrors = computed<Record<string, string>>(() => validationErrors(save.error.value))
const safeLoadError = computed<string | null>(() => load.error.value ? presentSafeError(load.error.value).message : null)
const safeSaveError = computed<string | null>(() => save.error.value ? presentSafeError(save.error.value).message : null)
const accountSummary = computed(() => profile.profile?.profile)

const isDirty = computed<boolean>(() => {
  const current = accountSummary.value
  if (!current) return false
  return (
    form.display_name !== (current.display_name ?? '') ||
    form.given_name !== (current.given_name ?? '') ||
    form.family_name !== (current.family_name ?? '')
  )
})

onMounted(() => {
  void load.run()
})

watch(
  () => profile.profile,
  (value) => {
    if (!value) return
    form.display_name = value.profile.display_name ?? ''
    form.given_name = value.profile.given_name ?? ''
    form.family_name = value.profile.family_name ?? ''
  },
  { immediate: true },
)

function formatOptionalDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString('id-ID') : 'Belum tersedia'
}
</script>

<template>
  <section class="grid gap-6">
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-bold tracking-tight">Profil</h1>
      <p class="text-muted-foreground text-sm">
        Kelola informasi akun minimum yang boleh ditampilkan di portal SSO.
      </p>
    </header>

    <SsoAlertBanner v-if="safeLoadError" tone="error" :message="safeLoadError" />

    <div class="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Ringkasan Akun</CardTitle>
          <CardDescription>Hanya field minimum yang disetujui untuk portal pengguna.</CardDescription>
        </CardHeader>
        <CardContent>
          <div v-if="load.pending.value" class="grid gap-3">
            <Skeleton class="h-4 w-2/3" />
            <Skeleton class="h-4 w-full" />
            <Skeleton class="h-4 w-1/2" />
          </div>
          <dl v-else class="grid gap-3 text-sm" data-testid="profile-approved-fields">
            <div class="grid gap-1">
              <dt class="text-muted-foreground text-xs uppercase tracking-wide">Nama Tampilan</dt>
              <dd>{{ accountSummary?.display_name ?? 'Belum tersedia' }}</dd>
            </div>
            <Separator />
            <div class="grid gap-1">
              <dt class="text-muted-foreground text-xs uppercase tracking-wide">Email</dt>
              <dd>{{ accountSummary?.email ?? 'Belum tersedia' }}</dd>
            </div>
            <Separator />
            <div class="grid gap-1">
              <dt class="text-muted-foreground text-xs uppercase tracking-wide">Status</dt>
              <dd><Badge variant="secondary">{{ accountSummary?.status ?? 'unknown' }}</Badge></dd>
            </div>
            <Separator />
            <div class="grid gap-1">
              <dt class="text-muted-foreground text-xs uppercase tracking-wide">Login Terakhir</dt>
              <dd>{{ formatOptionalDate(accountSummary?.last_login_at) }}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Perbarui Profil</CardTitle>
          <CardDescription>Perubahan terbatas pada nama; email dan identifier tidak dapat diubah dari portal.</CardDescription>
        </CardHeader>
        <CardContent>
          <form class="grid gap-4" novalidate @submit.prevent="save.run()">
            <div class="grid gap-2">
              <Label for="profile-display-name">Nama tampilan</Label>
              <Input
                id="profile-display-name"
                v-model="form.display_name"
                type="text"
                autocomplete="name"
                :disabled="load.pending.value || save.pending.value"
                :class="fieldErrors['display_name'] ? 'border-destructive' : ''"
              />
              <span v-if="fieldErrors['display_name']" class="text-destructive text-xs">{{ fieldErrors['display_name'] }}</span>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="grid gap-2">
                <Label for="profile-given-name">Nama depan</Label>
                <Input id="profile-given-name" v-model="form.given_name" type="text" autocomplete="given-name" :disabled="load.pending.value || save.pending.value" />
                <span v-if="fieldErrors['given_name']" class="text-destructive text-xs">{{ fieldErrors['given_name'] }}</span>
              </div>
              <div class="grid gap-2">
                <Label for="profile-family-name">Nama belakang</Label>
                <Input id="profile-family-name" v-model="form.family_name" type="text" autocomplete="family-name" :disabled="load.pending.value || save.pending.value" />
                <span v-if="fieldErrors['family_name']" class="text-destructive text-xs">{{ fieldErrors['family_name'] }}</span>
              </div>
            </div>

            <SsoAlertBanner v-if="safeSaveError" tone="error" :message="safeSaveError" />
            <SsoAlertBanner v-else-if="save.lastResult.value && !isDirty" tone="success" message="Profil berhasil diperbarui." />

            <div class="flex justify-end">
              <Button type="submit" :disabled="save.pending.value || !isDirty">
                <Save class="size-4" />
                {{ save.pending.value ? 'Menyimpan…' : 'Simpan Perubahan' }}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  </section>
</template>
