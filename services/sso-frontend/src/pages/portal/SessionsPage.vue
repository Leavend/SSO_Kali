<script setup lang="ts">
/**
 * SessionsPage — UC-27 (revoke per sesi) + UC-32 (logout semua perangkat).
 *
 * Logic revocation diekstrak ke `useSessionRevocation` composable supaya
 * halaman hanya berperan sebagai orchestration + presentation.
 */

import { computed, onMounted } from 'vue'
import { Activity, Monitor } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import SessionCard from '@/components/molecules/SessionCard.vue'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import PortalPageHeader from '@/components/molecules/PortalPageHeader.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useSessionRevocation } from '@/composables/useSessionRevocation'
import { useProfileStore } from '@/stores/profile.store'
import { presentSafeError } from '@/lib/api/safe-error-presenter'

const profile = useProfileStore()
const load = useAsyncAction(() => profile.loadSessions())

const revocation = useSessionRevocation()

const sortedSessions = computed(() => [...profile.sessions].sort(compareSessions))
const sessions = computed(() => sortedSessions.value)
const currentSession = computed(() => sessions.value.find((session) => session.is_current) ?? null)
const otherSessions = computed(() => sessions.value.filter((session) => !session.is_current))
const currentIp = computed<string | null>(() => currentSession.value?.ip_address ?? null)
const isEmpty = computed<boolean>(() => !load.pending.value && sessions.value.length === 0)
const safeLoadError = computed<string | null>(() => safeError(load.error.value))
const safeRevokeOneError = computed<string | null>(() =>
  safeError(revocation.revokeOne.error.value),
)
const safeRevokeAllError = computed<string | null>(() =>
  safeError(revocation.revokeAll.error.value),
)

const confirmSingleOpen = computed({
  get: () => revocation.confirmSingleOpen.value,
  set: (value: boolean): void => {
    revocation.confirmSingleOpen.value = value
  },
})

const confirmGlobalOpen = computed({
  get: () => revocation.confirmGlobalOpen.value,
  set: (value: boolean): void => {
    revocation.confirmGlobalOpen.value = value
  },
})

onMounted(() => {
  void load.run()
})

function safeError(error: unknown): string | null {
  return error ? presentSafeError(error).message : null
}

function compareSessions(
  left: { is_current?: boolean; last_used_at: string },
  right: { is_current?: boolean; last_used_at: string },
): number {
  if (left.is_current && !right.is_current) return -1
  if (!left.is_current && right.is_current) return 1
  return new Date(right.last_used_at).getTime() - new Date(left.last_used_at).getTime()
}
</script>

<template>
  <section class="grid gap-6 sm:gap-8">
    <PortalPageHeader
      eyebrow="Keamanan Perangkat"
      title="Sesi Aktif"
      description="Pantau semua perangkat yang sedang login ke akun kamu. Akhiri sesi dari perangkat yang tidak kamu kenal untuk menjaga keamanan akun."
      :icon="Activity"
    />

    <div v-if="load.pending.value" class="grid gap-3" aria-live="polite" aria-busy="true">
      <Skeleton v-for="i in 3" :key="i" class="h-24 w-full" />
    </div>

    <SsoAlertBanner v-else-if="safeLoadError" tone="error" :message="safeLoadError" />

    <Card v-else-if="isEmpty">
      <CardHeader class="items-center text-center">
        <span class="sso-glass-pill grid size-10 place-items-center text-white" aria-hidden="true">
          <Monitor class="size-5" />
        </span>
        <CardTitle class="text-base">Belum ada sesi aktif</CardTitle>
        <CardDescription>Sesi aktif akan tampil di sini setelah kamu login.</CardDescription>
      </CardHeader>
    </Card>

    <div v-else class="grid gap-4">
      <div data-testid="sessions-list" class="grid w-full min-w-0 gap-3">
        <SessionCard
          v-for="item in sessions"
          :key="item.session_id"
          :session="item"
          :pending="revocation.pendingSingleRevocation.value"
          :current-ip="currentIp"
          @revoke="revocation.askRevokeSession"
        />
      </div>

      <Card
        v-if="otherSessions.length === 0"
        data-testid="sessions-other-empty"
        class="border-dashed"
      >
        <CardHeader class="items-center text-center">
          <span
            class="sso-glass-pill grid size-10 place-items-center text-white"
            aria-hidden="true"
          >
            <Monitor class="size-5" />
          </span>
          <CardTitle class="text-base">Tidak ada sesi aktif lainnya</CardTitle>
          <CardDescription> Akun kamu hanya diakses dari perangkat ini. </CardDescription>
        </CardHeader>
      </Card>

      <div class="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          :disabled="revocation.pendingGlobalLogout.value || sessions.length === 0"
          aria-label="Akhiri semua sesi"
          class="w-full sm:w-fit"
          @click="revocation.askRevokeAll()"
        >
          {{ revocation.pendingGlobalLogout.value ? 'Memproses…' : 'Akhiri Semua Sesi' }}
        </Button>
      </div>
    </div>

    <SsoAlertBanner v-if="safeRevokeOneError" tone="error" :message="safeRevokeOneError" />
    <SsoAlertBanner v-if="safeRevokeAllError" tone="error" :message="safeRevokeAllError" />
    <SsoAlertBanner
      v-if="revocation.partialFailureWarning.value"
      data-testid="sessions-partial-failure"
      tone="warning"
      :message="revocation.partialFailureWarning.value"
    />

    <ConfirmDialog
      v-model:open="confirmSingleOpen"
      title="Akhiri sesi ini?"
      description="Perangkat yang memakai sesi ini akan dipaksa logout dan harus autentikasi ulang."
      confirm-label="Akhiri Sesi"
      destructive
      @confirm="revocation.confirmRevokeSession"
    />

    <ConfirmDialog
      v-model:open="confirmGlobalOpen"
      title="Akhiri semua sesi?"
      description="Semua perangkat akan dikeluarkan, termasuk perangkat ini. Kamu harus login ulang. Lanjutkan?"
      confirm-label="Akhiri Semua Sesi"
      destructive
      @confirm="revocation.confirmRevokeAll"
    />
  </section>
</template>
