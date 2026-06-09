<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertTriangle, AppWindow, ChevronDown, Loader2 } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import PortalPageHeader from '@/components/molecules/PortalPageHeader.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useProfileStore } from '@/stores/profile.store'
import { isApiError } from '@/lib/api/api-error'
import { presentConnectedApp } from '@/lib/connected-apps'
import { formatFriendlyClientName } from '@/lib/display-identifiers'
import { formatPortalDateTime } from '@/lib/portal-security'
import { cn } from '@/lib/utils'
import type { ConnectedApp } from '@/types/profile.types'

interface RevokeTarget {
  readonly clientId: string
  readonly name: string
}

interface PresentedConnectedApp {
  readonly app: ConnectedApp
  readonly presentation: ReturnType<typeof presentConnectedApp>
}

const profile = useProfileStore()

const load = useAsyncAction(() => profile.loadConnectedApps())
const revoke = useAsyncAction((clientId: string) => profile.revokeConnectedApp(clientId))

const apps = computed<readonly ConnectedApp[]>(() => profile.connectedApps)
const presentedApps = computed<readonly PresentedConnectedApp[]>(() =>
  apps.value.map((app) => ({ app, presentation: presentConnectedApp(app) })),
)
const isEmpty = computed<boolean>(() => !load.pending.value && apps.value.length === 0)

onMounted(() => {
  void load.run()
})

const pendingTarget = ref<RevokeTarget | null>(null)
const showDialog = ref<boolean>(false)
const expandedClientIds = ref<ReadonlySet<string>>(new Set())
/** Track which client_id is currently being revoked (per-item loading). */
const revokingClientId = ref<string | null>(null)

function askRevoke(clientId: string, name: string): void {
  pendingTarget.value = { clientId, name }
  showDialog.value = true
}

async function confirmRevoke(): Promise<void> {
  const target = pendingTarget.value
  pendingTarget.value = null
  if (!target) return

  revokingClientId.value = target.clientId
  await revoke.run(target.clientId)
  revokingClientId.value = null
}

function toggleDetails(clientId: string): void {
  const nextClientIds = new Set(expandedClientIds.value)
  if (nextClientIds.has(clientId)) nextClientIds.delete(clientId)
  else nextClientIds.add(clientId)
  expandedClientIds.value = nextClientIds
}

function isExpanded(clientId: string): boolean {
  return expandedClientIds.value.has(clientId)
}

/**
 * FE-FR026-002 / FR-026: never render the raw ApiError message — it can
 * include backend technical details (SQLSTATE, internal IDs, etc). Map
 * known statuses to safe localized copy; everything else falls back to a
 * generic message.
 */
const REVOKE_GENERIC_FAILURE = 'Gagal mencabut akses aplikasi. Coba lagi beberapa saat.'
const REVOKE_CSRF_EXPIRED = 'Sesi keamanan kedaluwarsa. Muat ulang halaman lalu coba lagi.'
const REVOKE_RATE_LIMITED = 'Terlalu banyak percobaan. Tunggu sebentar sebelum mencoba lagi.'
const REVOKE_UNAUTHORIZED = 'Sesi SSO kedaluwarsa. Silakan masuk lagi untuk mencabut aplikasi ini.'
const REVOKE_FORBIDDEN = 'Akses aplikasi ini tidak dapat dicabut dari akun ini.'
const REVOKE_NOT_FOUND = 'Aplikasi sudah tidak terhubung dengan akunmu. Muat ulang halaman.'
const REVOKE_SERVER_ERROR = 'Layanan SSO sedang tidak tersedia. Coba lagi nanti.'

const revokeErrorMessage = computed<string | null>(() => {
  const error = revoke.error.value
  if (!error) return null
  if (!isApiError(error)) return REVOKE_GENERIC_FAILURE
  if (error.status === 419) return REVOKE_CSRF_EXPIRED
  if (error.status === 429) return REVOKE_RATE_LIMITED
  if (error.status === 401) return REVOKE_UNAUTHORIZED
  if (error.status === 403) return REVOKE_FORBIDDEN
  if (error.status === 404) return REVOKE_NOT_FOUND
  if (error.status === 0 || error.status >= 500) return REVOKE_SERVER_ERROR
  return REVOKE_GENERIC_FAILURE
})
</script>

<template>
  <section class="grid gap-6 sm:gap-8">
    <PortalPageHeader
      eyebrow="Aplikasi Terhubung"
      title="Aplikasi Terhubung"
      description="Aplikasi yang saat ini memiliki akses ke akunmu melalui Dev-SSO. Cabut akses kapan saja jika kamu tidak lagi menggunakan aplikasi tersebut."
      :icon="AppWindow"
    />

    <div v-if="load.pending.value" class="grid gap-3">
      <Skeleton v-for="i in 3" :key="i" class="h-24 w-full" />
    </div>

    <Card v-else-if="isEmpty" class="px-5 py-2">
      <CardHeader data-testid="connected-apps-empty-state" class="items-center text-center">
        <span
          data-testid="connected-apps-empty-icon"
          class="sso-glass-pill mx-auto grid size-12 place-items-center text-white"
        >
          <AppWindow class="size-5" />
        </span>
        <CardTitle class="text-base">Belum ada aplikasi yang terhubung.</CardTitle>
        <CardDescription data-testid="connected-apps-empty-copy" class="mx-auto max-w-[18rem]">
          Aplikasi yang kamu otorisasi melalui Dev-SSO akan muncul di sini.
        </CardDescription>
      </CardHeader>
    </Card>

    <div v-else class="grid gap-3">
      <Card
        v-for="item in presentedApps"
        :key="item.app.client_id"
        data-testid="connected-app-card"
        :class="
          cn(
            'grid min-w-0 gap-4 overflow-hidden px-5 py-4 transition-all sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:px-6',
            item.presentation.isActive && 'border-primary/30 bg-primary/5',
          )
        "
      >
        <div
          data-testid="connected-app-avatar"
          :class="
            cn(
              'grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-sm font-bold text-white shadow-[var(--shadow-glass-sm)]',
              item.presentation.accentClass,
            )
          "
          aria-hidden="true"
        >
          {{ item.presentation.initials }}
        </div>

        <div data-testid="connected-app-content" class="grid min-w-0 gap-3">
          <div class="grid gap-1">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <strong class="text-sm">{{ item.app.display_name }}</strong>
              <Badge v-if="item.presentation.isActive" variant="default" class="text-[10px]">
                Sedang dipakai
              </Badge>
              <Badge
                v-if="item.presentation.isDormant"
                variant="outline"
                class="rounded-full text-[10px]"
              >
                Tidak aktif {{ item.presentation.relativeLastUsed }}
              </Badge>
              <Badge variant="secondary" class="text-[10px]">{{
                item.presentation.category
              }}</Badge>
            </div>
            <p class="text-muted-foreground text-xs">{{ item.presentation.description }}</p>
          </div>

          <div class="grid gap-2 text-xs sm:grid-cols-2">
            <div class="grid gap-0.5">
              <span class="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
                Terhubung
              </span>
              <time :datetime="item.app.first_connected_at" class="tabular-nums">
                {{ formatPortalDateTime(item.app.first_connected_at) }}
              </time>
            </div>
            <div class="grid gap-0.5">
              <span class="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
                Terakhir Dipakai
              </span>
              <time :datetime="item.app.last_used_at" class="tabular-nums">
                {{ formatPortalDateTime(item.app.last_used_at) }}
                <span class="text-muted-foreground">{{ item.presentation.relativeLastUsed }}</span>
              </time>
            </div>
          </div>

          <div class="flex flex-wrap gap-1.5" data-testid="connected-app-scopes">
            <Badge
              v-for="scope in item.presentation.scopes"
              :key="scope"
              :variant="item.presentation.isSensitive ? 'outline' : 'secondary'"
              class="font-mono text-[10px]"
            >
              {{ scope }}
            </Badge>
          </div>

          <p
            v-if="item.presentation.warning"
            data-testid="connected-app-sensitive-warning"
            class="text-warning-800 flex items-start gap-1 text-xs"
          >
            <AlertTriangle class="mt-0.5 size-3.5" aria-hidden="true" />
            {{ item.presentation.warning }}
          </p>

          <div
            v-if="isExpanded(item.app.client_id)"
            data-testid="connected-app-details"
            class="grid gap-2 rounded-[var(--radius-glass-xl)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-primary)] p-3 text-xs"
          >
            <div class="grid gap-1 sm:grid-cols-2">
              <p>
                <span class="text-muted-foreground">Aplikasi:</span>
                <code>{{ formatFriendlyClientName(item.app.client_id) }}</code>
              </p>
              <p>
                <span class="text-muted-foreground">Token berakhir:</span>
                {{ formatPortalDateTime(item.app.expires_at) }}
              </p>
            </div>
            <p v-if="item.presentation.isDormant" class="text-warning-800">
              Pertimbangkan untuk mencabut akses aplikasi yang sudah lama tidak digunakan.
            </p>
          </div>
        </div>

        <div class="flex flex-col gap-2 sm:items-end">
          <button
            type="button"
            data-testid="connected-app-detail-toggle"
            class="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
            :aria-expanded="isExpanded(item.app.client_id)"
            @click="toggleDetails(item.app.client_id)"
          >
            <ChevronDown class="size-4" aria-hidden="true" />
            Lihat Detail
          </button>
          <Button
            variant="outline"
            size="sm"
            :disabled="revokingClientId === item.app.client_id"
            @click="askRevoke(item.app.client_id, item.app.display_name)"
          >
            <Loader2 v-if="revokingClientId === item.app.client_id" class="size-4 animate-spin" />
            {{ revokingClientId === item.app.client_id ? 'Mencabut…' : 'Cabut Akses' }}
          </Button>
        </div>
      </Card>
    </div>

    <p
      v-if="revokeErrorMessage"
      data-testid="connected-app-revoke-error"
      role="alert"
      class="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
    >
      {{ revokeErrorMessage }}
    </p>

    <ConfirmDialog
      v-model:open="showDialog"
      :title="`Cabut akses ${pendingTarget?.name ?? 'aplikasi'}?`"
      description="Aplikasi tidak bisa lagi mengakses akun kamu sampai kamu otorisasi ulang."
      confirm-label="Ya, Cabut Akses"
      destructive
      @confirm="confirmRevoke"
    />
  </section>
</template>
