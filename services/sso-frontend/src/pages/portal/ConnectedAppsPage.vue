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
import { useI18n } from '@/composables/useI18n'
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
const { t } = useI18n()

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

const revokeErrorMessage = computed<string | null>(() => {
  const error = revoke.error.value
  if (!error) return null
  if (!isApiError(error)) return t('portal.apps.revoke_error_generic')
  if (error.status === 419) return t('portal.apps.revoke_error_csrf')
  if (error.status === 429) return t('portal.apps.revoke_error_rate_limit')
  if (error.status === 401) return t('portal.apps.revoke_error_unauthorized')
  if (error.status === 403) return t('portal.apps.revoke_error_forbidden')
  if (error.status === 404) return t('portal.apps.revoke_error_not_found')
  if (error.status === 0 || error.status >= 500) return t('portal.apps.revoke_error_server')
  return t('portal.apps.revoke_error_generic')
})
</script>

<template>
  <section class="grid gap-6 sm:gap-8">
    <PortalPageHeader
      :eyebrow="t('portal.apps.eyebrow')"
      :title="t('portal.apps.title')"
      :description="t('portal.apps.description')"
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
        <CardTitle class="text-base">{{ t('portal.apps.empty_title') }}</CardTitle>
        <CardDescription data-testid="connected-apps-empty-copy" class="mx-auto max-w-[18rem]">
          {{ t('portal.apps.empty_description') }}
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
                {{ t('portal.apps.currently_used') }}
              </Badge>
              <Badge
                v-if="item.presentation.isDormant"
                variant="outline"
                class="rounded-full text-[10px]"
              >
                {{ t('portal.apps.inactive', { relativeLastUsed: item.presentation.relativeLastUsed }) }}
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
                {{ t('portal.apps.connected') }}
              </span>
              <time :datetime="item.app.first_connected_at" class="tabular-nums">
                {{ formatPortalDateTime(item.app.first_connected_at) }}
              </time>
            </div>
            <div class="grid gap-0.5">
              <span class="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
                {{ t('portal.apps.last_used') }}
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
                <span class="text-muted-foreground">{{ t('portal.apps.app') }}</span>
                <code>{{ formatFriendlyClientName(item.app.client_id) }}</code>
              </p>
              <p>
                <span class="text-muted-foreground">{{ t('portal.apps.token_expires') }}</span>
                {{ formatPortalDateTime(item.app.expires_at) }}
              </p>
            </div>
            <p v-if="item.presentation.isDormant" class="text-warning-800">
              {{ t('portal.apps.dormant_warning') }}
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
            {{ t('portal.apps.view_details') }}
          </button>
          <Button
            variant="outline"
            size="sm"
            :disabled="revokingClientId === item.app.client_id"
            @click="askRevoke(item.app.client_id, item.app.display_name)"
          >
            <Loader2 v-if="revokingClientId === item.app.client_id" class="size-4 animate-spin" />
            {{ revokingClientId === item.app.client_id ? t('portal.apps.revoking') : t('portal.apps.revoke_access') }}
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
      :title="
        t('portal.apps.dialog_title', {
          name: pendingTarget?.name ?? t('portal.apps.fallback_name'),
        })
      "
      :description="t('portal.apps.dialog_description')"
      :confirm-label="t('portal.apps.dialog_confirm')"
      destructive
      @confirm="confirmRevoke"
    />
  </section>
</template>
