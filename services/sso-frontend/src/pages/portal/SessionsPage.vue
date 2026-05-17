<script setup lang="ts">
/**
 * SessionsPage — UC-27 (revoke per sesi) + UC-32 (logout semua perangkat).
 *
 * Logic revocation diekstrak ke `useSessionRevocation` composable supaya
 * halaman hanya berperan sebagai orchestration + presentation.
 */

import { computed, onMounted } from 'vue'
import { LogOut, Monitor } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import SessionCard from '@/components/molecules/SessionCard.vue'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useSessionRevocation } from '@/composables/useSessionRevocation'
import { useProfileStore } from '@/stores/profile.store'
import { presentSafeError } from '@/lib/api/safe-error-presenter'

const profile = useProfileStore()
const load = useAsyncAction(() => profile.loadSessions())

const revocation = useSessionRevocation()

const sessions = computed(() => profile.sessions)
const isEmpty = computed<boolean>(() => !load.pending.value && sessions.value.length === 0)
const safeLoadError = computed<string | null>(() => safeError(load.error.value))
const safeRevokeOneError = computed<string | null>(() => safeError(revocation.revokeOne.error.value))
const safeRevokeAllError = computed<string | null>(() => safeError(revocation.revokeAll.error.value))

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
</script>

<template>
  <section class="grid gap-6">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-heading-1 font-display font-semibold tracking-tight">Sesi Aktif</h1>
        <p class="text-muted-foreground text-sm leading-relaxed">
          Daftar sesi login aktif pada perangkat dan aplikasi terhubung. Kamu dapat mencabut sesi satu per satu atau keluar dari semuanya sekaligus.
        </p>
      </div>
      <Button
        variant="destructive"
        size="lg"
        :disabled="revocation.pendingGlobalLogout.value || sessions.length === 0"
        aria-label="Logout dari semua perangkat"
        class="w-full sm:w-fit"
        @click="revocation.askRevokeAll()"
      >
        <LogOut class="size-4" aria-hidden="true" />
        {{ revocation.pendingGlobalLogout.value ? 'Memproses…' : 'Logout Semua Perangkat' }}
      </Button>
    </header>

    <div v-if="load.pending.value" class="grid gap-3" aria-live="polite" aria-busy="true">
      <Skeleton v-for="i in 3" :key="i" class="h-24 w-full" />
    </div>

    <SsoAlertBanner
      v-else-if="safeLoadError"
      tone="error"
      :message="safeLoadError"
    />

    <Card v-else-if="isEmpty">
      <CardHeader class="items-center text-center">
        <span
          class="bg-muted text-muted-foreground grid size-10 place-items-center rounded-full"
          aria-hidden="true"
        >
          <Monitor class="size-5" />
        </span>
        <CardTitle class="text-base">Tidak ada sesi lain</CardTitle>
        <CardDescription>
          Kamu hanya aktif di perangkat ini. Sesi lain akan tampil di sini.
        </CardDescription>
      </CardHeader>
    </Card>

    <div v-else data-testid="sessions-list" class="grid w-full min-w-0 gap-3 xl:grid-cols-2">
      <SessionCard
        v-for="item in sessions"
        :key="item.session_id"
        :session="item"
        :pending="revocation.pendingSingleRevocation.value"
        @revoke="revocation.askRevokeSession"
      />
    </div>

    <SsoAlertBanner
      v-if="safeRevokeOneError"
      tone="error"
      :message="safeRevokeOneError"
    />
    <SsoAlertBanner
      v-if="safeRevokeAllError"
      tone="error"
      :message="safeRevokeAllError"
    />

    <ConfirmDialog
      v-model:open="confirmSingleOpen"
      title="Akhiri sesi ini?"
      description="Perangkat yang memakai sesi ini akan dipaksa logout dan harus autentikasi ulang."
      confirm-label="Cabut Sesi"
      destructive
      @confirm="revocation.confirmRevokeSession"
    />

    <ConfirmDialog
      v-model:open="confirmGlobalOpen"
      title="Logout dari semua perangkat?"
      description="Semua sesi aktif akan direvoke dan kamu akan diarahkan ke halaman login."
      confirm-label="Logout Semua"
      destructive
      @confirm="revocation.confirmRevokeAll"
    />
  </section>
</template>
