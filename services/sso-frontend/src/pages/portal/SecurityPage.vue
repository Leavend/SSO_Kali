<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Fingerprint, KeyRound, ShieldCheck } from 'lucide-vue-next'
import { useMfaEnrollment } from '@/composables/useMfaEnrollment'
import { useChangePassword } from '@/composables/usePasswordLifecycle'
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
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useProfileStore } from '@/stores/profile.store'
import { profileApi } from '@/services/profile.api'
import type { AuditEvent } from '@/types/audit.types'
import type { ChangePasswordPayload } from '@/types/profile.types'

const profile = useProfileStore()
const load = useAsyncAction(() => profile.loadProfile())
const auditLoad = useAsyncAction(() => profileApi.getAuditEvents(undefined, 10))
const mfa = useMfaEnrollment()
const password = useChangePassword()

const auditEvents = computed<readonly AuditEvent[]>(() => auditLoad.lastResult.value?.events ?? [])
const mfaEnabled = computed<boolean>(() => mfa.isEnrolled.value || Boolean(profile.profile?.security.mfa_required))
const riskScore = computed<number>(() => profile.profile?.security.risk_score ?? 0)
const lastSeen = computed<string | null>(() => profile.profile?.security.last_seen_at ?? null)
const userRoles = computed<readonly string[]>(() => profile.profile?.authorization.roles ?? [])
const userPermissions = computed<readonly string[]>(() => profile.profile?.authorization.permissions ?? [])
const userScope = computed<string>(() => profile.profile?.authorization.scope ?? '')
const showPasswordForm = computed<boolean>(() => password.success.value === null)

onMounted(() => {
  if (!profile.profile) void load.run()
  void auditLoad.run()
  void mfa.fetchStatus()
})

function updatePasswordField(field: keyof ChangePasswordPayload, value: string): void {
  password.updateField(field, value)
}

function formatAuditDate(value: string): string {
  try {
    return new Date(value).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return value
  }
}

function formatOptionalDate(value: string | null): string {
  return value ? new Date(value).toLocaleString('id-ID') : '—'
}
</script>

<template>
  <section class="grid gap-6 sm:gap-8">
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Keamanan</h1>
      <p class="text-muted-foreground text-sm">Kelola MFA, password, dan riwayat keamanan akun.</p>
    </header>

    <div v-if="load.pending.value" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton v-for="i in 3" :key="i" class="h-44 rounded-xl" />
    </div>

    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card class="relative overflow-hidden">
        <CardHeader class="flex flex-row items-start gap-3 space-y-0">
          <span class="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg">
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
        <CardContent class="grid gap-3 text-xs">
          <p class="text-muted-foreground">Kelola TOTP authenticator dan recovery codes untuk akun kamu.</p>
          <div v-if="mfa.error.value" role="alert" class="text-destructive">{{ mfa.error.value }}</div>
          <div class="flex flex-wrap gap-2">
            <Button as-child size="sm" class="w-fit">
              <RouterLink :to="{ name: 'portal.mfa-settings' }">Kelola MFA</RouterLink>
            </Button>
            <Button v-if="!mfaEnabled" size="sm" variant="outline" class="w-fit" :disabled="mfa.pending.value" @click="mfa.startEnrollment()">
              Aktifkan MFA
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card class="relative overflow-hidden">
        <CardHeader class="flex flex-row items-start gap-3 space-y-0">
          <span class="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg">
            <Fingerprint class="size-5" />
          </span>
          <div class="grid gap-1">
            <CardTitle class="text-sm font-semibold">Risiko Login</CardTitle>
            <CardDescription>Skor risiko: <strong class="text-foreground">{{ riskScore }}</strong></CardDescription>
          </div>
        </CardHeader>
        <CardContent class="text-muted-foreground text-xs">Dihitung dari pola login terbaru dan device fingerprint.</CardContent>
      </Card>

      <Card class="relative overflow-hidden sm:col-span-2 lg:col-span-1">
        <CardHeader class="flex flex-row items-start gap-3 space-y-0">
          <span class="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg">
            <KeyRound class="size-5" />
          </span>
          <div class="grid gap-1">
            <CardTitle class="text-sm font-semibold">Password</CardTitle>
            <CardDescription class="text-xs">Terakhir aktif: {{ formatOptionalDate(lastSeen) }}</CardDescription>
          </div>
        </CardHeader>
        <CardContent class="grid gap-3">
          <p class="text-muted-foreground text-xs">Ganti password berkala. Setelah berhasil, sesi lain dicabut dan notifikasi keamanan dikirim.</p>
          <SsoAlertBanner v-if="password.success.value" tone="success" :message="password.success.value" />
          <SsoAlertBanner v-if="password.error.value" tone="error" :message="password.error.value" />
          <SecurityPasswordForm
            v-if="showPasswordForm"
            :form="password.form"
            :errors="password.fieldErrors.value"
            :strength-items="password.strengthItems.value"
            :is-pending="password.pending.value"
            @update:field="updatePasswordField"
            @submit="password.submit"
            @cancel="password.reset"
          />
          <Button v-else variant="outline" size="sm" class="w-fit" @click="password.reset">
            <KeyRound class="size-4" />
            Ganti Password Lagi
          </Button>
        </CardContent>
      </Card>
    </div>

    <Card v-if="!load.pending.value && profile.profile">
      <CardHeader>
        <CardTitle class="text-base font-semibold">Hak Akses</CardTitle>
        <CardDescription>Role dan izin yang diberikan ke akun kamu oleh administrator.</CardDescription>
      </CardHeader>
      <CardContent class="grid gap-4 sm:grid-cols-3">
        <div class="grid gap-1.5">
          <span class="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">Roles</span>
          <div class="flex flex-wrap gap-1.5">
            <Badge v-for="role in userRoles" :key="role" variant="default" class="text-xs">{{ role }}</Badge>
            <span v-if="userRoles.length === 0" class="text-muted-foreground text-xs italic">Tidak ada role.</span>
          </div>
        </div>
        <div class="grid gap-1.5">
          <span class="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">Permissions</span>
          <div class="flex flex-wrap gap-1.5">
            <Badge v-for="perm in userPermissions" :key="perm" variant="secondary" class="text-xs font-mono">{{ perm }}</Badge>
            <span v-if="userPermissions.length === 0" class="text-muted-foreground text-xs italic">Tidak ada permission khusus.</span>
          </div>
        </div>
        <div class="grid gap-1.5">
          <span class="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">OAuth Scope</span>
          <p class="text-xs font-mono leading-relaxed break-all">{{ userScope || '—' }}</p>
        </div>
      </CardContent>
    </Card>

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
        <ul v-else class="grid min-w-0 gap-2" data-testid="audit-events-list">
          <li v-for="event in auditEvents" :key="event.id" class="flex flex-col gap-1 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <div class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2" data-testid="audit-event-meta">
              <Badge variant="outline" class="truncate text-[10px] font-mono" data-testid="audit-event-badge">{{ event.event }}</Badge>
              <span class="text-muted-foreground whitespace-nowrap text-xs" data-testid="audit-event-ip-address">{{ event.ip_address ?? '—' }}</span>
            </div>
            <time class="text-muted-foreground text-[11px] tabular-nums sm:text-xs" :datetime="event.created_at">
              {{ formatAuditDate(event.created_at) }}
            </time>
          </li>
        </ul>
      </CardContent>
    </Card>
  </section>
</template>
