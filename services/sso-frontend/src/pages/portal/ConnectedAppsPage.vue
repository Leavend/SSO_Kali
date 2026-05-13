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

    <Card v-else-if="isEmpty">
      <CardHeader class="items-center text-center">
        <span class="bg-muted text-muted-foreground grid size-10 place-items-center rounded-full">
          <AppWindow class="size-5" />
        </span>
        <CardTitle class="text-base">Belum ada aplikasi terhubung</CardTitle>
        <CardDescription>Aplikasi yang kamu authorize akan muncul di sini.</CardDescription>
      </CardHeader>
    </Card>

    <div v-else class="grid gap-3">
      <Card
        v-for="app in apps"
        :key="app.client_id"
        class="flex flex-row items-center gap-4 px-6 py-4"
      >
        <span class="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg">
          <AppWindow class="size-5" />
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <strong class="text-sm">{{ app.display_name }}</strong>
            <Badge variant="outline" class="font-mono text-[10px]">{{ app.client_id }}</Badge>
          </div>
          <p class="text-muted-foreground mt-1 text-xs">
            Terhubung sejak {{ formatDate(app.first_connected_at) }} · Terakhir dipakai {{ formatDate(app.last_used_at) }}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
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
