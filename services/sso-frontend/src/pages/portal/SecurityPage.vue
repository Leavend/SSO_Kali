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
import SecurityPasswordForm from '@/components/molecules/SecurityPasswordForm.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useProfileStore } from '@/stores/profile.store'
import { profileApi } from '@/services/profile.api'
import type { ChangePasswordPayload } from '@/services/profile.api'
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

type PasswordFormState = {
  -readonly [Key in keyof ChangePasswordPayload]: ChangePasswordPayload[Key]
}

// --- Change Password Form (FR-047 / UC-36) ---
const showPasswordForm = ref(false)
const passwordForm = reactive<PasswordFormState>({
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

function openPasswordForm(): void {
  passwordSuccess.value = null
  showPasswordForm.value = true
}

function closePasswordForm(): void {
  showPasswordForm.value = false
}

function updatePasswordField(field: keyof ChangePasswordPayload, value: string): void {
  passwordForm[field] = value
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
  <section class="grid gap-6 sm:gap-8">
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Keamanan</h1>
      <p class="text-muted-foreground text-sm">
        Status keamanan akun dan kontrol tambahan yang akan datang.
      </p>
    </header>

    <div v-if="load.pending.value" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton v-for="i in 3" :key="i" class="h-44 rounded-xl" />
    </div>

    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <!-- MFA Card -->
      <Card class="relative overflow-hidden">
        <CardHeader class="flex flex-row items-start gap-3 space-y-0">
          <span
            class="grid size-10 shrink-0 place-items-center rounded-lg"
            :class="mfaEnabled ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-primary/10 text-primary'"
          >
            <ShieldCheck class="size-5" />
          </span>
          <div class="grid gap-1">
            <CardTitle class="text-sm font-semibold">Multi-Factor Auth</CardTitle>
            <CardDescription>
              <Badge :variant="mfaEnabled ? 'default' : 'secondary'" class="text-[10px]">
                {{ mfaEnabled ? 'Aktif' : 'Belum diaktifkan' }}
              </Badge>
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent class="grid gap-3">
          <p class="text-muted-foreground text-xs">
            {{ mfaEnabled
              ? 'Akun dilindungi verifikasi dua langkah.'
              : 'Aktifkan MFA untuk keamanan ekstra.'
            }}
          </p>
          <RouterLink :to="{ name: 'portal.mfa-settings' }">
            <Button variant="outline" size="sm" class="w-fit">
              <ShieldCheck class="size-4" />
              {{ mfaEnabled ? 'Kelola MFA' : 'Aktifkan MFA' }}
            </Button>
          </RouterLink>
        </CardContent>
      </Card>

      <!-- Risk Score Card -->
      <Card class="relative overflow-hidden">
        <CardHeader class="flex flex-row items-start gap-3 space-y-0">
          <span class="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg">
            <Fingerprint class="size-5" />
          </span>
          <div class="grid gap-1">
            <CardTitle class="text-sm font-semibold">Risiko Login</CardTitle>
            <CardDescription>
              Skor risiko: <strong class="text-foreground">{{ riskScore }}</strong>
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent class="text-muted-foreground text-xs">
          Dihitung dari pola login terbaru dan device fingerprint.
        </CardContent>
      </Card>

      <!-- Password Card -->
      <Card class="relative overflow-hidden sm:col-span-2 lg:col-span-1">
        <CardHeader class="flex flex-row items-start gap-3 space-y-0">
          <span class="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg">
            <KeyRound class="size-5" />
          </span>
          <div class="grid gap-1">
            <CardTitle class="text-sm font-semibold">Password</CardTitle>
            <CardDescription class="text-xs">
              Terakhir aktif: {{ lastSeen ? new Date(lastSeen).toLocaleString('id-ID') : '—' }}
            </CardDescription>
          </div>
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
            data-testid="password-form-toggle"
            class="w-full sm:w-fit"
            @click="openPasswordForm"
          >
            <KeyRound class="size-4" />
            Ganti Password
          </Button>

          <SecurityPasswordForm
            v-if="showPasswordForm"
            :form="passwordForm"
            :errors="passwordErrors"
            :is-pending="passwordPending"
            @update:field="updatePasswordField"
            @submit="submitPasswordChange"
            @cancel="closePasswordForm"
          />
        </CardContent>
      </Card>
    </div>

    <!-- Hak Akses (FR-003 — user transparency) -->
    <Card v-if="!load.pending.value && profile.profile">
      <CardHeader>
        <CardTitle class="text-base font-semibold">Hak Akses</CardTitle>
        <CardDescription>Role dan izin yang diberikan ke akun kamu oleh administrator.</CardDescription>
      </CardHeader>
      <CardContent class="grid gap-4 sm:grid-cols-3">
        <div class="grid gap-1.5">
          <span class="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">Roles</span>
          <div class="flex flex-wrap gap-1.5">
            <Badge v-for="role in userRoles" :key="role" variant="default" class="text-xs">
              {{ role }}
            </Badge>
            <span v-if="userRoles.length === 0" class="text-muted-foreground text-xs italic">Tidak ada role.</span>
          </div>
        </div>
        <div class="grid gap-1.5">
          <span class="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">Permissions</span>
          <div class="flex flex-wrap gap-1.5">
            <Badge v-for="perm in userPermissions" :key="perm" variant="secondary" class="text-xs font-mono">
              {{ perm }}
            </Badge>
            <span v-if="userPermissions.length === 0" class="text-muted-foreground text-xs italic">Tidak ada permission khusus.</span>
          </div>
        </div>
        <div class="grid gap-1.5">
          <span class="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">OAuth Scope</span>
          <p class="text-xs font-mono leading-relaxed break-all">{{ userScope || '—' }}</p>
        </div>
      </CardContent>
    </Card>

    <!-- Audit Trail (UC-46 partial — user-facing) -->
    <Card>
      <CardHeader>
        <CardTitle class="text-base font-semibold">Riwayat Keamanan Terakhir</CardTitle>
        <CardDescription>Aktivitas login, logout, dan perubahan keamanan akun.</CardDescription>
      </CardHeader>
      <CardContent>
        <div v-if="auditLoad.pending.value" class="grid gap-2">
          <Skeleton v-for="i in 3" :key="i" class="h-10 w-full rounded-lg" />
        </div>
        <div v-else-if="auditEvents.length === 0" class="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center text-sm">
          <ShieldCheck class="text-muted-foreground/50 size-8" />
          Belum ada riwayat keamanan.
        </div>
        <ul v-else data-testid="audit-events-list" class="grid min-w-0 gap-2">
          <li
            v-for="event in auditEvents"
            :key="event.id"
            class="grid min-w-0 gap-2 rounded-lg border px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
          >
            <div data-testid="audit-event-meta" class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <Badge
                data-testid="audit-event-badge"
                variant="outline"
                class="max-w-full min-w-0 truncate text-[10px] font-mono"
              >
                {{ event.event }}
              </Badge>
              <span
                data-testid="audit-event-ip-address"
                class="text-muted-foreground min-w-0 truncate whitespace-nowrap font-mono text-xs tabular-nums"
              >
                {{ event.ip_address ?? '—' }}
              </span>
            </div>
            <time class="text-muted-foreground shrink-0 text-[11px] tabular-nums sm:text-xs" :datetime="event.created_at">
              {{ formatAuditDate(event.created_at) }}
            </time>
          </li>
        </ul>
      </CardContent>
    </Card>
  </section>
</template>


