<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { CheckCircle2, RotateCcw, ShieldCheck } from 'lucide-vue-next'
import type {
  ClientIntegrationContract,
  ClientIntegrationDraft,
  ClientIntegrationRegistration,
} from '@shared/client-integration'

const props = defineProps<{
  draft: ClientIntegrationDraft
  contract: ClientIntegrationContract | null
  brokerReady: boolean
  errors: readonly string[]
}>()

const registrations = ref<readonly ClientIntegrationRegistration[]>([])
const lifecycleStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const lifecycleMessage = ref('')
const secretHashes = reactive<Record<string, string>>({})

const canStage = computed(() => {
  return props.brokerReady && props.contract !== null && props.errors.length === 0 && !activeDraftExists()
})

onMounted(() => {
  void refreshRegistrations()
})

async function refreshRegistrations(): Promise<void> {
  await withLifecycle('Dynamic registrations refreshed.', async () => {
    const payload = await apiGet('/api/admin/client-integrations/registrations')
    registrations.value = payload.registrations ?? []
  })
}

async function stageRegistration(): Promise<void> {
  if (!canStage.value) return

  await withLifecycle('Stage registration tersimpan untuk review admin.', async () => {
    upsertRegistration(await action('/api/admin/client-integrations/stage', { ...props.draft }))
  })
}

async function activateRegistration(registration: ClientIntegrationRegistration): Promise<void> {
  await withLifecycle('Client integration aktif dan siap dipakai broker.', async () => {
    const path = `/api/admin/client-integrations/${registration.client_id}/activate`
    upsertRegistration(await action(path, { secretHash: secretHashes[registration.client_id] ?? null }))
  })
}

async function disableRegistration(registration: ClientIntegrationRegistration): Promise<void> {
  await withLifecycle('Rollback selesai: client integration dinonaktifkan.', async () => {
    const path = `/api/admin/client-integrations/${registration.client_id}/disable`
    upsertRegistration(await action(path, {}))
  })
}

function activeDraftExists(): boolean {
  return registrations.value.some((registration) => {
    return registration.client_id === props.draft.clientId && registration.status !== 'disabled'
  })
}

async function action(path: string, body: Record<string, unknown>): Promise<ClientIntegrationRegistration> {
  const payload = await apiPost(path, body)
  if (!payload.registration) throw new Error(payload.message ?? 'Registration payload kosong.')

  return payload.registration
}

async function withLifecycle(message: string, callback: () => Promise<void>): Promise<void> {
  lifecycleStatus.value = 'loading'
  lifecycleMessage.value = ''

  try {
    await callback()
    lifecycleStatus.value = 'ready'
    lifecycleMessage.value = message
  } catch (error) {
    lifecycleStatus.value = 'error'
    lifecycleMessage.value = error instanceof Error ? error.message : 'Lifecycle action gagal.'
  }
}

async function apiGet(path: string): Promise<RegistrationPayload> {
  const response = await fetch(path, { headers: { Accept: 'application/json' } })
  return payloadOrThrow(response)
}

async function apiPost(path: string, body: Record<string, unknown>): Promise<RegistrationPayload> {
  const response = await fetch(path, jsonRequest(body))
  return payloadOrThrow(response)
}

async function payloadOrThrow(response: Response): Promise<RegistrationPayload> {
  const payload = await responsePayload(response)
  if (!response.ok) throw new Error(errorMessage(payload))

  return payload
}

async function responsePayload(response: Response): Promise<RegistrationPayload> {
  return response.json().catch(() => ({})) as Promise<RegistrationPayload>
}

function jsonRequest(body: Record<string, unknown>): RequestInit {
  return {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function errorMessage(payload: RegistrationPayload): string {
  return payload.violations?.join(' ') ?? payload.message ?? 'Client integration lifecycle gagal.'
}

function upsertRegistration(registration: ClientIntegrationRegistration): void {
  registrations.value = [
    registration,
    ...registrations.value.filter((item) => item.client_id !== registration.client_id),
  ]
}

type RegistrationPayload = Readonly<{
  registration?: ClientIntegrationRegistration
  registrations?: readonly ClientIntegrationRegistration[]
  message?: string
  violations?: readonly string[]
}>
</script>

<template>
  <section class="integration-lifecycle" aria-labelledby="client-registration-title">
    <div class="integration-lifecycle__header">
      <span class="integration-icon" aria-hidden="true">
        <ShieldCheck :size="20" />
      </span>
      <div>
        <span class="integration-eyebrow">Runtime registration lifecycle</span>
        <h4 id="client-registration-title">Dynamic registrations</h4>
        <p>
          Stage registration menyimpan artifact audit tanpa menyentuh traffic. Activate membuat client dibaca broker,
          sedangkan rollback cukup disable registration.
        </p>
      </div>
    </div>

    <div class="integration-actions">
      <button
        class="button button--primary"
        type="button"
        :disabled="!canStage || lifecycleStatus === 'loading'"
        @click="stageRegistration"
      >
        {{ lifecycleStatus === 'loading' ? 'Processing...' : 'Stage registration' }}
      </button>
      <button class="button" type="button" :disabled="lifecycleStatus === 'loading'" @click="refreshRegistrations">
        Refresh registrations
      </button>
    </div>

    <p v-if="lifecycleMessage" :class="['integration-lifecycle__message', `is-${lifecycleStatus}`]">
      {{ lifecycleMessage }}
    </p>

    <div class="integration-registration-list">
      <article
        v-for="registration in registrations"
        :key="registration.client_id"
        class="integration-registration"
      >
        <div class="integration-registration__title">
          <div>
            <strong>{{ registration.display_name }}</strong>
            <span>{{ registration.client_id }} · {{ registration.type }} · {{ registration.status }}</span>
          </div>
          <CheckCircle2 v-if="registration.status === 'active'" :size="20" aria-hidden="true" />
        </div>

        <dl>
          <div>
            <dt>Owner</dt>
            <dd>{{ registration.owner_email }}</dd>
          </div>
          <div>
            <dt>Redirect URI</dt>
            <dd>{{ registration.redirect_uris[0] }}</dd>
          </div>
        </dl>

        <label v-if="registration.status === 'staged' && registration.type === 'confidential'">
          <span>Argon2id secret hash dari Vault</span>
          <input v-model.trim="secretHashes[registration.client_id]" type="password" autocomplete="off" />
        </label>

        <div class="integration-registration__actions">
          <button
            v-if="registration.status === 'staged'"
            class="button button--primary"
            type="button"
            :disabled="lifecycleStatus === 'loading'"
            @click="activateRegistration(registration)"
          >
            Aktifkan
          </button>
          <button
            v-if="registration.status !== 'disabled'"
            class="button"
            type="button"
            :disabled="lifecycleStatus === 'loading'"
            @click="disableRegistration(registration)"
          >
            <RotateCcw :size="16" aria-hidden="true" />
            Rollback / disable
          </button>
        </div>
      </article>
    </div>
  </section>
</template>
