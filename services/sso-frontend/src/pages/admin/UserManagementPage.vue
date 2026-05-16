<script setup lang="ts">
import { onMounted } from 'vue'
import { Lock, RefreshCw, RotateCcw, Save, UserPlus } from 'lucide-vue-next'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import SsoFormField from '@/components/molecules/SsoFormField.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAdminUsers } from '@/composables/useAdminUsers'
import { useAdminConsoleStore } from '@/stores/admin-console.store'
import type { AdminUser } from '@/types/admin.types'

const users = useAdminUsers()
const admin = useAdminConsoleStore()

onMounted((): void => {
  void users.load()
})

function statusTone(user: AdminUser): 'secondary' | 'outline' | 'destructive' {
  if (user.locked_at) return 'destructive'
  return user.status === 'active' ? 'secondary' : 'outline'
}
</script>

<template>
  <section class="grid gap-6" aria-labelledby="admin-users-title">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="grid gap-2">
        <p class="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          Admin · User Lifecycle
        </p>
        <h1 id="admin-users-title" class="text-2xl font-bold tracking-tight">Manajemen User</h1>
        <p class="text-muted-foreground max-w-3xl text-sm leading-relaxed">
          Create, update, lock, deactivate, reactivate, dan reset password dengan reason/konfirmasi
          untuk aksi destruktif.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        class="min-h-11"
        :disabled="users.loading.value"
        @click="users.load"
      >
        <RefreshCw class="size-4" aria-hidden="true" />
        Muat ulang
      </Button>
    </header>

    <SsoAlertBanner v-if="users.error.value" tone="error" :message="users.error.value" />
    <SsoAlertBanner v-if="users.success.value" tone="success" :message="users.success.value" />
    <p v-if="users.supportReference.value" class="text-muted-foreground text-xs">
      {{ users.supportReference.value }}
    </p>

    <Card v-if="users.passwordReset.value" class="border-amber-300 bg-amber-50">
      <CardHeader>
        <CardTitle>Token Reset Password</CardTitle>
        <CardDescription
          >Salin sekarang. Token ini hanya ditampilkan sekali dan tidak disimpan di
          browser.</CardDescription
        >
      </CardHeader>
      <CardContent class="grid gap-2">
        <code class="break-all rounded bg-white p-3 text-xs">{{
          users.passwordReset.value.token
        }}</code>
        <p class="text-muted-foreground text-xs">
          Kedaluwarsa: {{ users.passwordReset.value.expires_at }}
        </p>
      </CardContent>
    </Card>

    <Card v-if="admin.can('admin.users.write')">
      <CardHeader>
        <CardTitle>Tambah User</CardTitle>
        <CardDescription
          >Gunakan password sementara kuat atau kirim reset token setelah user
          dibuat.</CardDescription
        >
      </CardHeader>
      <CardContent>
        <form class="grid gap-4 md:grid-cols-2" @submit.prevent="users.create">
          <SsoFormField
            id="new-email"
            v-model="users.draft.email"
            label="Email"
            type="email"
            autocomplete="email"
            required
          />
          <SsoFormField
            id="new-name"
            v-model="users.draft.display_name"
            label="Nama Tampilan"
            required
          />
          <SsoFormField id="new-given" v-model="users.draft.given_name" label="Nama Depan" />
          <SsoFormField id="new-family" v-model="users.draft.family_name" label="Nama Belakang" />
          <SsoFormField
            id="new-password"
            v-model="users.draft.password"
            label="Password Sementara"
            type="password"
            autocomplete="new-password"
          />
          <label class="grid gap-1.5 text-sm font-medium">
            Role
            <select
              v-model="users.draft.role"
              class="border-input bg-background min-h-11 rounded-md border px-3"
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <label class="flex min-h-11 items-center gap-2 text-sm">
            <input v-model="users.draft.local_account_enabled" type="checkbox" />
            Aktifkan login lokal
          </label>
          <Button type="submit" class="min-h-11 md:col-span-2" :disabled="users.loading.value">
            <UserPlus class="size-4" aria-hidden="true" />
            Buat User
          </Button>
        </form>
      </CardContent>
    </Card>

    <div class="grid gap-4">
      <Card v-for="user in users.users.value" :key="user.subject_id">
        <CardHeader>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <CardTitle class="break-words">{{ user.display_name }}</CardTitle>
              <CardDescription class="break-all">{{ user.email }}</CardDescription>
            </div>
            <Badge :variant="statusTone(user)">{{ user.locked_at ? 'locked' : user.status }}</Badge>
          </div>
        </CardHeader>
        <CardContent class="grid gap-4">
          <dl class="grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt class="text-muted-foreground">Subject</dt>
              <dd class="break-all">{{ user.subject_id }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Role</dt>
              <dd>{{ user.role }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Login terakhir</dt>
              <dd>{{ user.last_login_at ?? 'Belum ada' }}</dd>
            </div>
          </dl>

          <form
            v-if="admin.can('admin.users.write')"
            class="grid gap-3 md:grid-cols-4"
            @submit.prevent="users.saveProfile(user)"
          >
            <Button
              v-if="users.editingSubject.value !== user.subject_id"
              type="button"
              variant="outline"
              class="min-h-11 md:col-span-4"
              @click="users.startEdit(user)"
            >
              <Save class="size-4" />Edit Profil
            </Button>
            <template v-else>
              <Input v-model="users.editDraft.email" placeholder="Email" />
              <Input v-model="users.editDraft.display_name" placeholder="Nama tampilan" />
              <Input v-model="users.editDraft.given_name" placeholder="Nama depan" />
              <Button type="submit" variant="outline" class="min-h-11"
                ><Save class="size-4" />Simpan</Button
              >
            </template>
          </form>

          <div class="flex flex-wrap gap-2">
            <Button
              v-if="admin.can('admin.users.lock')"
              type="button"
              variant="outline"
              class="min-h-11"
              @click="users.startAction('lock', user)"
              ><Lock class="size-4" />Lock</Button
            >
            <Button
              v-if="admin.can('admin.users.lock')"
              type="button"
              variant="outline"
              class="min-h-11"
              @click="users.startAction('unlock', user)"
              >Unlock</Button
            >
            <Button
              v-if="admin.can('admin.users.write')"
              type="button"
              variant="outline"
              class="min-h-11"
              @click="users.startAction('password-reset', user)"
              ><RotateCcw class="size-4" />Reset Password</Button
            >
            <Button
              v-if="admin.can('admin.users.write') && user.status === 'active'"
              type="button"
              variant="destructive"
              class="min-h-11"
              @click="users.startAction('deactivate', user)"
              >Deactivate</Button
            >
            <Button
              v-if="admin.can('admin.users.write') && user.status !== 'active'"
              type="button"
              variant="outline"
              class="min-h-11"
              @click="users.startAction('reactivate', user)"
              >Reactivate</Button
            >
          </div>
        </CardContent>
      </Card>
    </div>

    <ConfirmDialog
      :open="users.confirmOpen.value"
      title="Konfirmasi aksi user"
      description="Aksi lifecycle memerlukan alasan yang dapat diaudit. Pastikan identitas dan dampak sudah diverifikasi."
      confirm-label="Konfirmasi"
      destructive
      @update:open="users.cancelAction"
      @confirm="users.confirmPendingAction"
    />

    <Card v-if="users.pendingAction.value" class="border-amber-300">
      <CardHeader><CardTitle>Alasan Aksi</CardTitle></CardHeader>
      <CardContent class="grid gap-3 md:grid-cols-2">
        <SsoFormField id="action-reason" v-model="users.reason.value" label="Reason" required />
        <SsoFormField
          v-if="users.pendingAction.value.action === 'lock'"
          id="locked-until"
          v-model="users.lockedUntil.value"
          label="Locked until"
          type="text"
          placeholder="2026-05-20T10:00:00Z"
        />
        <Button type="button" class="min-h-11 md:col-span-2" @click="users.requestConfirm"
          >Buka Konfirmasi</Button
        >
      </CardContent>
    </Card>
  </section>
</template>
