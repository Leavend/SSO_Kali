<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { AlertTriangle, KeyRound, Pause, Play, Plus, RefreshCw, Save, Tags, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  adminClientsApi,
  type AdminClient,
  type ClientDraft,
} from '@/services/admin-clients.api'

const clients = ref<readonly AdminClient[]>([])
const loading = ref(false)
const busyClient = ref<string | null>(null)
const errorMessage = ref('')
const successMessage = ref('')
const oneTimeSecret = ref('')

const draft = reactive({
  clientId: '',
  displayName: '',
  redirectUris: '',
})

const lifecycleDraft = reactive<Record<string, { reason: string; scopes: string }>>({})

onMounted(loadClients)

function ensureLifecycleDraft(clientId: string, scopes: readonly string[] | undefined): { reason: string; scopes: string } {
  if (!lifecycleDraft[clientId]) {
    lifecycleDraft[clientId] = { reason: '', scopes: (scopes ?? []).join(' ') }
  }
  return lifecycleDraft[clientId]
}

async function loadClients(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    clients.value = await adminClientsApi.list()
    for (const client of clients.value) {
      ensureLifecycleDraft(client.client_id, client.scopes)
    }
  } catch {
    errorMessage.value = 'Daftar client tidak dapat dimuat. Silakan coba lagi.'
  } finally {
    loading.value = false
  }
}

async function createClient(): Promise<void> {
  errorMessage.value = ''
  successMessage.value = ''
  try {
    await adminClientsApi.create(toDraft())
    successMessage.value = 'Registrasi client berhasil dibuat.'
    draft.clientId = ''
    draft.displayName = ''
    draft.redirectUris = ''
    await loadClients()
  } catch {
    errorMessage.value = 'Client tidak dapat dibuat. Periksa data lalu coba lagi.'
  }
}

async function updateClient(client: AdminClient): Promise<void> {
  await clientAction(client.client_id, async () => {
    await adminClientsApi.update(client.client_id, {
      redirect_uris: client.redirect_uris,
      backchannel_logout_uri: client.backchannel_logout_uri,
      backchannel_logout_internal: client.backchannel_logout_internal,
    })
    successMessage.value = 'Client berhasil diperbarui.'
    await loadClients()
  })
}

async function rotateSecret(client: AdminClient): Promise<void> {
  await clientAction(client.client_id, async () => {
    const result = await adminClientsApi.rotateSecret(client.client_id)
    oneTimeSecret.value = result.client_secret
    successMessage.value = 'Secret baru dibuat. Salin sekarang; nilai ini hanya ditampilkan sekali.'
  })
}

async function decommissionClient(client: AdminClient): Promise<void> {
  if (!window.confirm('Konfirmasi: dekomisioning akan mencabut semua token aktif client ini. Lanjutkan?')) return
  await clientAction(client.client_id, async () => {
    await adminClientsApi.decommission(client.client_id)
    successMessage.value = 'Client didekomisioning dan token terkait dicabut.'
    await loadClients()
  })
}

async function suspendClient(client: AdminClient): Promise<void> {
  const draftEntry = ensureLifecycleDraft(client.client_id, client.scopes)
  if (draftEntry.reason.trim().length < 5) {
    errorMessage.value = 'Tulis alasan suspend minimal 5 karakter sebelum melanjutkan.'
    return
  }
  if (!window.confirm('Konfirmasi: suspend akan mencabut token aktif dan menutup sesi RP.')) return
  await clientAction(client.client_id, async () => {
    const response = await adminClientsApi.suspend(client.client_id, draftEntry.reason.trim())
    successMessage.value = formatLifecycleSummary('Client di-suspend.', response)
    draftEntry.reason = ''
    await loadClients()
  })
}

async function activateClient(client: AdminClient): Promise<void> {
  await clientAction(client.client_id, async () => {
    await adminClientsApi.activate(client.client_id)
    successMessage.value = 'Client diaktifkan kembali.'
    await loadClients()
  })
}

async function syncScopes(client: AdminClient): Promise<void> {
  const draftEntry = ensureLifecycleDraft(client.client_id, client.scopes)
  const scopes = draftEntry.scopes
    .split(/\s+/u)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0)
  await clientAction(client.client_id, async () => {
    await adminClientsApi.syncScopes(client.client_id, scopes)
    successMessage.value = 'Scope client diperbarui.'
    await loadClients()
  })
}

async function clientAction(clientId: string, action: () => Promise<void>): Promise<void> {
  busyClient.value = clientId
  errorMessage.value = ''
  successMessage.value = ''
  try {
    await action()
  } catch {
    errorMessage.value = 'Aksi client gagal diproses. Silakan coba lagi.'
  } finally {
    busyClient.value = null
  }
}

function toDraft(): ClientDraft {
  return {
    clientId: draft.clientId.trim(),
    displayName: draft.displayName.trim(),
    redirectUris: splitLines(draft.redirectUris),
  }
}

function splitLines(value: string): readonly string[] {
  return value.split(/\n/u).map((item) => item.trim()).filter((item) => item.length > 0)
}

function formatLifecycleSummary(message: string, response: { tokens_revoked?: number; sessions_terminated?: number }): string {
  const parts: string[] = [message]
  if (typeof response.tokens_revoked === 'number') parts.push(`Token dicabut: ${response.tokens_revoked}.`)
  if (typeof response.sessions_terminated === 'number') parts.push(`Sesi RP ditutup: ${response.sessions_terminated}.`)
  return parts.join(' ')
}

function statusBadgeClass(client: AdminClient): string {
  switch (client.status) {
    case 'active':
      return 'border-emerald-300 bg-emerald-50 text-emerald-700'
    case 'disabled':
    case 'suspended':
      return 'border-amber-300 bg-amber-50 text-amber-700'
    case 'decommissioned':
      return 'border-rose-300 bg-rose-50 text-rose-700'
    default:
      return ''
  }
}
</script>

<template>
  <section class="grid gap-6" aria-labelledby="admin-clients-title">
    <header class="grid gap-2">
      <p class="text-muted-foreground text-xs font-semibold uppercase tracking-wide">Admin · Client Management</p>
      <h1 id="admin-clients-title" class="text-2xl font-bold tracking-tight">Manajemen Client OIDC</h1>
      <p class="text-muted-foreground max-w-2xl text-sm">
        UI admin client lifecycle untuk FR-006–FR-012 dan FR-054: list, create, update,
        rotate secret, suspend, activate, edit scope, decommission. Route ini dilindungi role admin.
      </p>
    </header>

    <div
      v-if="errorMessage"
      role="alert"
      class="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
    >
      <AlertTriangle class="size-4 shrink-0 mt-0.5" aria-hidden="true" />
      <p>{{ errorMessage }}</p>
    </div>

    <div v-if="successMessage" role="status" class="rounded-md border bg-muted/60 p-3 text-sm">
      {{ successMessage }}
    </div>

    <Card v-if="oneTimeSecret" class="border-amber-300 bg-amber-50">
      <CardHeader>
        <CardTitle>Secret Baru</CardTitle>
        <CardDescription>Salin sekarang. Secret tidak akan ditampilkan lagi.</CardDescription>
      </CardHeader>
      <CardContent>
        <code class="block overflow-auto rounded bg-white p-3 text-xs">{{ oneTimeSecret }}</code>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Tambah Client</CardTitle>
        <CardDescription>Buat registrasi client baru melalui kontrak admin backend.</CardDescription>
      </CardHeader>
      <CardContent class="grid gap-4 md:grid-cols-3">
        <label class="grid gap-1 text-sm">
          Client ID
          <input v-model="draft.clientId" class="rounded-md border px-3 py-2" placeholder="customer-portal" />
        </label>
        <label class="grid gap-1 text-sm">
          Nama Tampilan
          <input v-model="draft.displayName" class="rounded-md border px-3 py-2" placeholder="Customer Portal" />
        </label>
        <label class="grid gap-1 text-sm md:row-span-2">
          Redirect URI
          <textarea
            v-model="draft.redirectUris"
            class="min-h-24 rounded-md border px-3 py-2"
            placeholder="https://app.example.com/auth/callback"
          />
        </label>
        <Button class="w-fit" :disabled="loading" @click="createClient">
          <Plus class="size-4" aria-hidden="true" />
          Buat Client
        </Button>
      </CardContent>
    </Card>

    <div class="flex justify-end">
      <Button variant="outline" :disabled="loading" @click="loadClients">
        <RefreshCw class="size-4" aria-hidden="true" />
        Refresh
      </Button>
    </div>

    <div class="grid gap-4">
      <Card v-for="client in clients" :key="client.client_id">
        <CardHeader>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{{ client.client_id }}</CardTitle>
              <CardDescription>{{ client.type }}</CardDescription>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span
                v-if="client.status"
                :class="['rounded-full border px-2 py-1 text-xs font-medium capitalize', statusBadgeClass(client)]"
              >
                {{ client.status }}
              </span>
              <span class="rounded-full border px-2 py-1 text-xs">
                {{ client.backchannel_logout_internal ? 'Internal logout' : 'External logout' }}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent class="grid gap-4">
          <div>
            <p class="text-muted-foreground text-xs font-semibold uppercase">Redirect URI</p>
            <ul class="mt-2 grid gap-1 text-sm">
              <li v-for="uri in client.redirect_uris" :key="uri" class="break-all rounded border px-2 py-1">
                {{ uri }}
              </li>
            </ul>
          </div>
          <div class="grid gap-2">
            <label class="grid gap-1 text-sm">
              Scope OIDC (pisahkan dengan spasi)
              <input
                v-model="ensureLifecycleDraft(client.client_id, client.scopes).scopes"
                class="rounded-md border px-3 py-2 font-mono text-xs"
                aria-describedby="scopes-help"
                placeholder="openid profile email"
              />
            </label>
            <p id="scopes-help" class="text-muted-foreground text-xs">
              Perubahan scope berlaku ke client_credentials, refresh_token rotation berikutnya, dan UserInfo claims.
            </p>
            <Button
              variant="outline"
              size="sm"
              class="w-fit"
              :disabled="busyClient === client.client_id"
              @click="syncScopes(client)"
            >
              <Tags class="size-4" aria-hidden="true" />
              Update Scope
            </Button>
          </div>
          <div class="grid gap-2">
            <label class="grid gap-1 text-sm">
              Alasan Suspend
              <input
                v-model="ensureLifecycleDraft(client.client_id, client.scopes).reason"
                class="rounded-md border px-3 py-2"
                placeholder="Investigasi insiden #123"
              />
            </label>
            <p class="text-muted-foreground text-xs">
              Suspend memutus token aktif dan sesi RP yang sudah login. Aktivasi kembali dapat dilakukan setelah validasi.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button variant="outline" :disabled="busyClient === client.client_id" @click="updateClient(client)">
              <Save class="size-4" aria-hidden="true" />
              Update Redirect
            </Button>
            <Button variant="outline" :disabled="busyClient === client.client_id" @click="rotateSecret(client)">
              <KeyRound class="size-4" aria-hidden="true" />
              Rotate Secret
            </Button>
            <Button
              v-if="client.status !== 'disabled' && client.status !== 'suspended'"
              variant="outline"
              :disabled="busyClient === client.client_id"
              @click="suspendClient(client)"
            >
              <Pause class="size-4" aria-hidden="true" />
              Suspend
            </Button>
            <Button
              v-else
              variant="outline"
              :disabled="busyClient === client.client_id"
              @click="activateClient(client)"
            >
              <Play class="size-4" aria-hidden="true" />
              Aktifkan Kembali
            </Button>
            <Button variant="destructive" :disabled="busyClient === client.client_id" @click="decommissionClient(client)">
              <Trash2 class="size-4" aria-hidden="true" />
              Decommission
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </section>
</template>
