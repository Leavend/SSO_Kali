<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Fingerprint, KeyRound, ShieldCheck } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useProfileStore } from '@/stores/profile.store'
import { profileApi } from '@/services/profile.api'
import type { AuditEvent } from '@/types/audit.types'

const profile = useProfileStore()
const load = useAsyncAction(() => profile.loadProfile())
const auditLoad = useAsyncAction(() => profileApi.getAuditEvents(undefined, 10))

const auditEvents = computed<readonly AuditEvent[]>(() => auditLoad.lastResult.value?.events ?? [])

onMounted(() => {
  if (!profile.profile) void load.run()
  void auditLoad.run()
})

const mfaEnabled = computed<boolean>(() => Boolean(profile.profile?.security.mfa_required))
const riskScore = computed<number>(() => profile.profile?.security.risk_score ?? 0)
const lastSeen = computed<string | null>(() => profile.profile?.security.last_seen_at ?? null)

/** User roles from profile (FR-003 transparency). */
const userRoles = computed<readonly string[]>(() => profile.profile?.authorization.roles ?? [])
/** User permissions from profile (FR-003 transparency). */
const userPermissions = computed<readonly string[]>(() => profile.profile?.authorization.permissions ?? [])
/** OAuth scope granted to this session. */
const userScope = computed<string>(() => profile.profile?.authorization.scope ?? '')

// --- Change Password Form (FR-047 / UC-36) ---
const showPasswordForm = ref(false)
const passwordForm = reactive({
  current_password: '',
  new_password: '',
  new_password_confirmation: '',
})
const passwordErrors = ref<Record<string, string[]>>({})
const passwordSuccess = ref<string | null>(null)
const passwordPending = ref(false)

async function submitPasswordChange(): Promise<void> {
  passwordErrors.value = {}
  passwordSuccess.value = null
  passwordPending.value = true

  try {
    const result = await profileApi.changePassword(passwordForm)
    passwordSuccess.value = result.message
    passwordForm.current_password = ''
    passwordForm.new_password = ''
    passwordForm.new_password_confirmation = ''
    showPasswordForm.value = false
  } catch (err: unknown) {
    const apiErr = err as { status?: number; body?: { errors?: Record<string, string[]>; message?: string } }
    if (apiErr.body?.errors) {
      passwordErrors.value = apiErr.body.errors
    } else {
      passwordErrors.value = { _general: [apiErr.body?.message ?? 'Terjadi kesalahan.'] }
    }
  } finally {
    passwordPending.value = false
  }
}

function formatAuditDate(value: string): string {
  try {
    return new Date(value).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return value
  }
}
</script>

<template>
  <section class="grid gap-6">
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-bold tracking-tight">Keamanan</h1>
      <p class="text-muted-foreground text-sm">
        Status keamanan akun dan kontrol tambahan yang akan datang.
      </p>
    </header>

    <div v-if="load.pending.value" class="grid gap-4 md:grid-cols-3">
      <Skeleton v-for="i in 3" :key="i" class="h-40" />
    </div>

    <div v-else class="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <span class="bg-primary/10 text-primary grid size-10 place-items-center rounded-lg">
            <ShieldCheck class="size-5" />
          </span>
          <CardTitle>Multi-Factor Auth</CardTitle>
          <CardDescription>
            <Badge :variant="mfaEnabled ? 'default' : 'secondary'">
              {{ mfaEnabled ? 'Aktif' : 'Belum diaktifkan' }}
            </Badge>
          </CardDescription>
        </CardHeader>
        <CardContent class="text-muted-foreground text-xs">
          Manajemen MFA akan tersedia di rilis berikutnya.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <span class="bg-primary/10 text-primary grid size-10 place-items-center rounded-lg">
            <Fingerprint class="size-5" />
          </span>
          <CardTitle>Risiko Login</CardTitle>
          <CardDescription>Skor risiko: <strong>{{ riskScore }}</strong></CardDescription>
        </CardHeader>
        <CardContent class="text-muted-foreground text-xs">
          Dihitung dari pola login terbaru dan device fingerprint.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <span class="bg-primary/10 text-primary grid size-10 place-items-center rounded-lg">
            <KeyRound class="size-5" />
          </span>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Terakhir aktif: {{ lastSeen ? new Date(lastSeen).toLocaleString('id-ID') : '—' }}
          </CardDescription>
        </CardHeader>
        <CardContent class="grid gap-3">
          <p class="text-muted-foreground text-xs">
            Ganti password secara berkala untuk menjaga keamanan akun.
          </p>

          <!-- Success banner -->
          <div
            v-if="passwordSuccess"
            class="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
            role="status"
          >
            {{ passwordSuccess }}
          </div>

          <!-- Toggle button -->
          <Button
            v-if="!showPasswordForm"
            variant="outline"
            size="sm"
            class="w-fit"
            @click="showPasswordForm = true; passwordSuccess = null"
          >
            <KeyRound class="size-4" />
            Ganti Password
          </Button>

          <!-- Inline form -->
          <form
            v-if="showPasswordForm"
            class="grid gap-3"
            @submit.prevent="submitPasswordChange"
          >
            <div class="grid gap-1">
              <label for="current_password" class="text-xs font-medium">Password Saat Ini</label>
              <input
                id="current_password"
                v-model="passwordForm.current_password"
                type="password"
                autocomplete="current-password"
                class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1"
                required
              />
              <p v-if="passwordErrors.current_password" class="text-destructive text-xs">
                {{ passwordErrors.current_password[0] }}
              </p>
            </div>

            <div class="grid gap-1">
              <label for="new_password" class="text-xs font-medium">Password Baru</label>
              <input
                id="new_password"
                v-model="passwordForm.new_password"
                type="password"
                autocomplete="new-password"
                class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1"
                required
                minlength="8"
              />
              <p v-if="passwordErrors.new_password" class="text-destructive text-xs">
                {{ passwordErrors.new_password[0] }}
              </p>
            </div>

            <div class="grid gap-1">
              <label for="new_password_confirmation" class="text-xs font-medium">Konfirmasi Password Baru</label>
              <input
                id="new_password_confirmation"
                v-model="passwordForm.new_password_confirmation"
                type="password"
                autocomplete="new-password"
                class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1"
                required
                minlength="8"
              />
            </div>

            <p v-if="passwordErrors._general" class="text-destructive text-xs">
              {{ passwordErrors._general[0] }}
            </p>

            <div class="flex gap-2">
              <Button type="submit" size="sm" :disabled="passwordPending">
                {{ passwordPending ? 'Menyimpan...' : 'Simpan' }}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                @click="showPasswordForm = false"
              >
                Batal
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>

    <!-- Hak Akses (FR-003 — user transparency) -->
    <Card v-if="!load.pending.value && profile.profile">
      <CardHeader>
        <CardTitle class="text-base">Hak Akses</CardTitle>
        <CardDescription>Role dan izin yang diberikan ke akun kamu oleh administrator.</CardDescription>
      </CardHeader>
      <CardContent class="grid gap-3">
        <div class="grid gap-1">
          <span class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Roles</span>
          <div class="flex flex-wrap gap-1">
            <Badge v-for="role in userRoles" :key="role" variant="default" class="text-xs">
              {{ role }}
            </Badge>
            <span v-if="userRoles.length === 0" class="text-muted-foreground text-xs italic">Tidak ada role.</span>
          </div>
        </div>
        <div class="grid gap-1">
          <span class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Permissions</span>
          <div class="flex flex-wrap gap-1">
            <Badge v-for="perm in userPermissions" :key="perm" variant="secondary" class="text-xs font-mono">
              {{ perm }}
            </Badge>
            <span v-if="userPermissions.length === 0" class="text-muted-foreground text-xs italic">Tidak ada permission khusus.</span>
          </div>
        </div>
        <div class="grid gap-1">
          <span class="text-muted-foreground text-xs font-medium uppercase tracking-wide">OAuth Scope</span>
          <p class="text-xs font-mono">{{ userScope || '—' }}</p>
        </div>
      </CardContent>
    </Card>

    <!-- Audit Trail (UC-46 partial — user-facing) -->
    <Card>
      <CardHeader>
        <CardTitle class="text-base">Riwayat Keamanan Terakhir</CardTitle>
        <CardDescription>Aktivitas login, logout, dan perubahan keamanan akun.</CardDescription>
      </CardHeader>
      <CardContent>
        <div v-if="auditLoad.pending.value" class="grid gap-2">
          <Skeleton v-for="i in 3" :key="i" class="h-8 w-full" />
        </div>
        <div v-else-if="auditEvents.length === 0" class="text-muted-foreground text-sm text-center py-4">
          Belum ada riwayat keamanan.
        </div>
        <ul v-else class="grid gap-2">
          <li
            v-for="event in auditEvents"
            :key="event.id"
            class="flex items-center justify-between rounded-md border px-3 py-2 text-xs"
          >
            <div class="flex items-center gap-2">
              <Badge variant="outline" class="text-[10px] font-mono">{{ event.event }}</Badge>
              <span class="text-muted-foreground">{{ event.ip_address ?? '—' }}</span>
            </div>
            <time class="text-muted-foreground" :datetime="event.created_at">
              {{ formatAuditDate(event.created_at) }}
            </time>
          </li>
        </ul>
      </CardContent>
    </Card>
  </section>
</template>
