<script setup lang="ts">
import { computed, reactive } from 'vue'
import { GitBranch, RotateCcw, ShieldCheck, Siren, Wrench } from 'lucide-vue-next'
import {
  createClientIntegrationContract,
  defaultIntegrationDraft,
  suggestClientId,
  validateClientIntegrationDraft,
} from '@shared/client-integration'
import type { ClientEnvironment, ClientIntegrationDraft, ClientType, ProvisioningMode } from '@shared/client-integration'

type MutableIntegrationDraft = {
  -readonly [Key in keyof ClientIntegrationDraft]: ClientIntegrationDraft[Key]
}

type IntegrationStep = Readonly<{
  title: string
  detail: string
}>

type IntegrationTrack = Readonly<{
  badge: string
  title: string
  description: string
  steps: readonly IntegrationStep[]
}>

const tracks: readonly IntegrationTrack[] = [
  {
    badge: 'Live / Exist',
    title: 'Integrasi aplikasi yang sudah berjalan',
    description: 'Gunakan canary agar autentikasi lama tetap hidup sampai SSO terbukti stabil.',
    steps: [
      {
        title: 'Petakan trust dan data',
        detail: 'Catat domain, owner, callback, logout URI, atribut minimum, dan consent/terms sesuai RFC 7642.',
      },
      {
        title: 'Daftarkan client secara ketat',
        detail: 'Gunakan redirect allowlist eksak, PKCE untuk public client, dan secret vault untuk confidential client.',
      },
      {
        title: 'Pilih provisioning',
        detail: 'Mulai dari just-in-time profile; naikkan ke SCIM saat butuh create, update, deactivate, atau group sync.',
      },
      {
        title: 'Canary lalu cutover',
        detail: 'Aktifkan untuk cohort admin/tester, pantau audit log, lalu perluas trafik setelah callback dan logout valid.',
      },
    ],
  },
  {
    badge: 'Development',
    title: 'Integrasi aplikasi yang sedang dibangun',
    description: 'Pisahkan credential dev dari production agar eksperimen tidak menyentuh sesi live.',
    steps: [
      {
        title: 'Buat client dev',
        detail: 'Gunakan redirect URI dev, sample user, dan scope minimum tanpa memakai secret production.',
      },
      {
        title: 'Bangun callback aman',
        detail: 'Selesaikan authorization code flow, validasi state/nonce, dan simpan sesi di HttpOnly secure cookie.',
      },
      {
        title: 'Sambungkan lifecycle sesi',
        detail: 'Wajib mendukung refresh rotation, idle/absolute timeout, dan back-channel logout berbasis sid.',
      },
      {
        title: 'Promote lewat gates',
        detail: 'Naikkan ke live hanya setelah typecheck, test, scanner, audit log, dan health check hijau.',
      },
    ],
  },
]

const draft = reactive<MutableIntegrationDraft>({ ...defaultIntegrationDraft() })
const validationErrors = computed(() => validateClientIntegrationDraft(draft))
const contract = computed(() => validationErrors.value.length === 0 ? createClientIntegrationContract(draft) : null)

function setEnvironment(environment: ClientEnvironment): void {
  draft.environment = environment
}

function setClientType(clientType: ClientType): void {
  draft.clientType = clientType
}

function setProvisioning(provisioning: ProvisioningMode): void {
  draft.provisioning = provisioning
}

function syncClientId(): void {
  draft.clientId = suggestClientId(draft.appName)
}
</script>

<template>
  <section class="panel integration-runbook" aria-labelledby="client-integration-title">
    <div class="integration-header">
      <span class="integration-icon" aria-hidden="true">
        <GitBranch :size="20" />
      </span>
      <div>
        <span class="integration-eyebrow">RFC 7642 onboarding</span>
        <h2 id="client-integration-title">Prosedur Integrasi Client SSO</h2>
        <p>
          Runbook admin untuk aplikasi live dan development, mencakup trust, provisioning, callback, sesi, audit,
          canary, dan rollback.
        </p>
      </div>
    </div>

    <div class="integration-tracks">
      <article v-for="track in tracks" :key="track.badge" class="integration-track">
        <span class="pill">{{ track.badge }}</span>
        <h3>{{ track.title }}</h3>
        <p>{{ track.description }}</p>
        <ol class="integration-steps">
          <li v-for="step in track.steps" :key="step.title">
            <strong>{{ step.title }}</strong>
            <span>{{ step.detail }}</span>
          </li>
        </ol>
      </article>
    </div>

    <div class="integration-wizard" aria-labelledby="client-stitch-title">
      <div class="integration-wizard__intro">
        <span class="integration-icon" aria-hidden="true">
          <Wrench :size="20" />
        </span>
        <div>
          <span class="integration-eyebrow">Client stitching wizard</span>
          <h3 id="client-stitch-title">Jahit aplikasi ke SSO broker</h3>
          <p>
            Isi metadata aplikasi, lalu gunakan contract ini sebagai artifact review untuk konfigurasi OIDC,
            provisioning, session lifecycle, canary, dan rollback.
          </p>
        </div>
      </div>

      <div class="integration-form" aria-label="Client integration metadata">
        <label>
          <span>Nama aplikasi</span>
          <input v-model.trim="draft.appName" type="text" @blur="syncClientId" />
        </label>

        <label>
          <span>Client ID</span>
          <input v-model.trim="draft.clientId" type="text" />
        </label>

        <label>
          <span>Base URL aplikasi</span>
          <input v-model.trim="draft.appBaseUrl" type="url" />
        </label>

        <label>
          <span>Owner email</span>
          <input v-model.trim="draft.ownerEmail" type="email" />
        </label>

        <label>
          <span>Callback path</span>
          <input v-model.trim="draft.callbackPath" type="text" />
        </label>

        <label>
          <span>Back-channel logout path</span>
          <input v-model.trim="draft.logoutPath" type="text" />
        </label>

        <fieldset>
          <legend>Status aplikasi</legend>
          <button
            :class="{ 'is-active': draft.environment === 'live' }"
            type="button"
            @click="setEnvironment('live')"
          >
            Live / Exist
          </button>
          <button
            :class="{ 'is-active': draft.environment === 'development' }"
            type="button"
            @click="setEnvironment('development')"
          >
            Development
          </button>
        </fieldset>

        <fieldset>
          <legend>Jenis client</legend>
          <button
            :class="{ 'is-active': draft.clientType === 'public' }"
            type="button"
            @click="setClientType('public')"
          >
            Public + PKCE
          </button>
          <button
            :class="{ 'is-active': draft.clientType === 'confidential' }"
            type="button"
            @click="setClientType('confidential')"
          >
            Confidential
          </button>
        </fieldset>

        <fieldset>
          <legend>Provisioning</legend>
          <button
            :class="{ 'is-active': draft.provisioning === 'jit' }"
            type="button"
            @click="setProvisioning('jit')"
          >
            JIT
          </button>
          <button
            :class="{ 'is-active': draft.provisioning === 'scim' }"
            type="button"
            @click="setProvisioning('scim')"
          >
            SCIM
          </button>
        </fieldset>
      </div>

      <div v-if="validationErrors.length > 0" class="integration-errors" role="alert">
        <strong>Contract belum bisa dipromosikan</strong>
        <ul>
          <li v-for="error in validationErrors" :key="error">{{ error }}</li>
        </ul>
      </div>

      <div v-else-if="contract" class="integration-contract" aria-label="Generated SSO integration contract">
        <article>
          <h4>OIDC contract</h4>
          <dl>
            <div>
              <dt>Client ID</dt>
              <dd>{{ contract.clientId }}</dd>
            </div>
            <div>
              <dt>Redirect URI</dt>
              <dd>{{ contract.redirectUri }}</dd>
            </div>
            <div>
              <dt>Logout URI</dt>
              <dd>{{ contract.backchannelLogoutUri }}</dd>
            </div>
            <div>
              <dt>Scopes</dt>
              <dd>{{ contract.scopes.join(' ') }}</dd>
            </div>
          </dl>
        </article>

        <article>
          <h4>Env handoff</h4>
          <pre>{{ contract.env.join('\n') }}</pre>
        </article>

        <article>
          <h4>Provisioning</h4>
          <ol>
            <li v-for="step in contract.provisioningSteps" :key="step">{{ step }}</li>
          </ol>
        </article>

        <article>
          <h4>Lifecycle rollout</h4>
          <ol>
            <li v-for="step in contract.rolloutSteps" :key="step">{{ step }}</li>
          </ol>
        </article>

        <article>
          <h4>Rollback</h4>
          <ol>
            <li v-for="step in contract.rollbackSteps" :key="step">{{ step }}</li>
          </ol>
        </article>

        <article>
          <h4>Audit findings</h4>
          <ol>
            <li v-for="finding in contract.findings" :key="finding">{{ finding }}</li>
          </ol>
        </article>
      </div>
    </div>

    <div class="integration-guardrails" aria-label="Lifecycle guardrails">
      <span><ShieldCheck :size="16" aria-hidden="true" /> Zero-downtime canary</span>
      <span><RotateCcw :size="16" aria-hidden="true" /> Rollback client toggle</span>
      <span><Siren :size="16" aria-hidden="true" /> Audit log dan alert</span>
    </div>
  </section>
</template>
