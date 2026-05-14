<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AppWindow, Loader2, Trash2 } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useProfileStore } from '@/stores/profile.store'

const profile = useProfileStore()

const load = useAsyncAction(() => profile.loadConnectedApps())
const revoke = useAsyncAction((clientId: string) => profile.revokeConnectedApp(clientId))

const apps = computed(() => profile.connectedApps)
const isEmpty = computed<boolean>(() => !load.pending.value && apps.value.length === 0)

onMounted(() => {
  void load.run()
})

const pendingTarget = ref<{ clientId: string; name: string } | null>(null)
const showDialog = ref<boolean>(false)
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

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString('id-ID')
  } catch {
    return value
  }
}
</script>

<template>
  <section class="grid gap-6">
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-bold tracking-tight">Aplikasi Terhubung</h1>
      <p class="text-muted-foreground text-sm">
        Aplikasi yang pernah kamu otorisasi via Dev-SSO. Cabut akses kapan saja untuk mengakhiri sesi OAuth di aplikasi tersebut.
      </p>
    </header>

    <div v-if="load.pending.value" class="grid gap-3">
      <Skeleton v-for="i in 3" :key="i" class="h-24 w-full" />
    </div>

    <Card v-else-if="isEmpty" class="min-w-0 px-5 py-7">
      <CardHeader data-testid="connected-apps-empty-state" class="items-center gap-3 px-0 text-center">
        <span
          data-testid="connected-apps-empty-icon"
          class="bg-primary/10 text-primary mx-auto grid size-12 place-items-center rounded-2xl"
          aria-hidden="true"
        >
          <AppWindow class="size-5" />
        </span>
        <CardTitle class="text-base">Belum ada aplikasi terhubung</CardTitle>
        <CardDescription data-testid="connected-apps-empty-copy" class="mx-auto max-w-[18rem] text-xs leading-relaxed">
          Aplikasi yang kamu authorize akan muncul di sini.
        </CardDescription>
      </CardHeader>
    </Card>

    <div v-else class="grid min-w-0 gap-3">
      <Card
        v-for="app in apps"
        :key="app.client_id"
        data-testid="connected-app-card"
        class="min-w-0 gap-4 px-4 py-4 sm:flex-row sm:items-center sm:px-6"
      >
        <span class="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg">
          <AppWindow class="size-5" />
        </span>
        <div data-testid="connected-app-content" class="grid min-w-0 flex-1 gap-1">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <strong class="min-w-0 truncate text-sm">{{ app.display_name }}</strong>
            <Badge
              data-testid="connected-app-client-id"
              variant="outline"
              class="max-w-full min-w-0 truncate font-mono text-[10px]"
            >
              {{ app.client_id }}
            </Badge>
          </div>
          <p class="text-muted-foreground min-w-0 text-xs leading-relaxed sm:truncate">
            Terhubung sejak {{ formatDate(app.first_connected_at) }} · Terakhir dipakai {{ formatDate(app.last_used_at) }}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          class="w-full shrink-0 sm:w-fit"
          :disabled="revokingClientId === app.client_id"
          @click="askRevoke(app.client_id, app.display_name)"
        >
          <Loader2 v-if="revokingClientId === app.client_id" class="size-4 animate-spin" />
          <Trash2 v-else class="size-4" />
          {{ revokingClientId === app.client_id ? 'Mencabut…' : 'Cabut Akses' }}
        </Button>
      </Card>
    </div>

    <p
      v-if="revoke.error.value"
      role="alert"
      class="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
    >
      {{ revoke.error.value.message }}
    </p>

    <ConfirmDialog
      v-model:open="showDialog"
      :title="`Cabut akses ${pendingTarget?.name ?? 'aplikasi'}?`"
      description="Semua sesi aplikasi ini akan dihentikan dan user di perangkat terkait akan logout."
      confirm-label="Cabut Akses"
      destructive
      @confirm="confirmRevoke"
    />
  </section>
</template>
