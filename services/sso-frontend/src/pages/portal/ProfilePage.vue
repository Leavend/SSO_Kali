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
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useProfileStore } from '@/stores/profile.store'
import { isValidationError } from '@/lib/api/api-error'
import type { ApiError } from '@/lib/api/api-error'

const profile = useProfileStore()

const form = reactive({
  display_name: '',
  given_name: '',
  family_name: '',
})

const load = useAsyncAction(() => profile.loadProfile())
const save = useAsyncAction(() => profile.updateProfile({ ...form }))

/** Field-level validation errors from ApiError violations (UC-25). */
const fieldErrors = computed<Record<string, string>>(() => {
  const err = save.error.value
  if (!err || !isValidationError(err)) return {}
  return (err as ApiError).violationsByField()
})

/** Dirty tracking — disable submit if nothing changed. */
const isDirty = computed<boolean>(() => {
  const p = profile.profile?.profile
  if (!p) return false
  return (
    form.display_name !== (p.display_name ?? '') ||
    form.given_name !== (p.given_name ?? '') ||
    form.family_name !== (p.family_name ?? '')
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
</script>

<template>
  <section class="grid gap-6">
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-bold tracking-tight">Profil</h1>
      <p class="text-muted-foreground text-sm">
        Kelola informasi akun SSO-mu. Data ini dipakai seluruh aplikasi yang terhubung.
      </p>
    </header>

    <div class="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Ringkasan Akun</CardTitle>
          <CardDescription>Informasi dasar dari identity provider.</CardDescription>
        </CardHeader>
        <CardContent>
          <div v-if="load.pending.value" class="grid gap-3">
            <Skeleton class="h-4 w-2/3" />
            <Skeleton class="h-4 w-full" />
            <Skeleton class="h-4 w-1/2" />
          </div>
          <dl v-else class="grid gap-3 text-sm">
            <div class="grid gap-1">
              <dt class="text-muted-foreground text-xs uppercase tracking-wide">Subject ID</dt>
              <dd class="font-mono text-xs">{{ profile.profile?.profile.subject_id ?? '—' }}</dd>
            </div>
            <Separator />
            <div class="grid gap-1">
              <dt class="text-muted-foreground text-xs uppercase tracking-wide">Email</dt>
              <dd>{{ profile.profile?.profile.email ?? '—' }}</dd>
            </div>
            <Separator />
            <div class="grid gap-1">
              <dt class="text-muted-foreground text-xs uppercase tracking-wide">Status</dt>
              <dd>
                <Badge variant="secondary">
                  {{ profile.profile?.profile.status ?? 'unknown' }}
                </Badge>
              </dd>
            </div>
            <Separator />
            <div class="grid gap-1">
              <dt class="text-muted-foreground text-xs uppercase tracking-wide">Login Terakhir</dt>
              <dd>
                {{
                  profile.profile?.profile.last_login_at
                    ? new Date(profile.profile.profile.last_login_at).toLocaleString('id-ID')
                    : '—'
                }}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Perbarui Profil</CardTitle>
          <CardDescription>Perubahan tersinkron ke seluruh aplikasi terhubung.</CardDescription>
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
              <span v-if="fieldErrors['display_name']" class="text-destructive text-xs">
                {{ fieldErrors['display_name'] }}
              </span>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="grid gap-2">
                <Label for="profile-given-name">Nama depan</Label>
                <Input
                  id="profile-given-name"
                  v-model="form.given_name"
                  type="text"
                  autocomplete="given-name"
                  :disabled="load.pending.value || save.pending.value"
                  :class="fieldErrors['given_name'] ? 'border-destructive' : ''"
                />
                <span v-if="fieldErrors['given_name']" class="text-destructive text-xs">
                  {{ fieldErrors['given_name'] }}
                </span>
              </div>
              <div class="grid gap-2">
                <Label for="profile-family-name">Nama belakang</Label>
                <Input
                  id="profile-family-name"
                  v-model="form.family_name"
                  type="text"
                  autocomplete="family-name"
                  :disabled="load.pending.value || save.pending.value"
                  :class="fieldErrors['family_name'] ? 'border-destructive' : ''"
                />
                <span v-if="fieldErrors['family_name']" class="text-destructive text-xs">
                  {{ fieldErrors['family_name'] }}
                </span>
              </div>
            </div>

            <p
              v-if="save.error.value"
              role="alert"
              class="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
            >
              {{ save.error.value.message }}
            </p>
            <p
              v-else-if="save.lastResult.value && !isDirty"
              class="border-primary/40 bg-primary/10 text-primary rounded-md border px-3 py-2 text-sm"
              role="status"
            >
              Profil berhasil diperbarui.
            </p>

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
