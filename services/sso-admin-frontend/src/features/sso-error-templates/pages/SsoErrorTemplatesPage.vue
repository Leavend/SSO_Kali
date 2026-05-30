<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import { useSessionStore } from '@/stores/session.store'
import { useSsoErrorTemplatesStore } from '../stores/sso-error-templates.store'
import type { SsoErrorTemplate, UpsertSsoErrorTemplatePayload } from '../types'

const store = useSsoErrorTemplatesStore()
const session = useSessionStore()
const canWriteSsoErrorTemplates = computed(() =>
  session.hasPermission('admin.sso-error-templates.write'),
)
const errorCodes = [
  'invalid_request',
  'invalid_grant',
  'access_denied',
  'login_required',
  'interaction_required',
  'temporarily_unavailable',
  'network_error',
  'server_error',
  'configuration_error',
  'session_expired',
  'csrf_failed',
]

const editingCode = ref<string | null>(null)
const draft = ref<Partial<UpsertSsoErrorTemplatePayload>>({})

const hasEvidence = computed(() => store.templates.length > 0)

onMounted(() => {
  if (store.status === 'idle') void store.load()
})

function startEdit(template: SsoErrorTemplate): void {
  editingCode.value = template.error_code
  draft.value = {
    locale: template.locale as 'id' | 'en',
    title: template.title,
    message: template.message,
    action_label: template.action_label,
    action_url: template.action_url,
    retry_allowed: template.retry_allowed,
    alternative_login_allowed: template.alternative_login_allowed,
    is_enabled: template.is_enabled,
  }
}

function cancelEdit(): void {
  editingCode.value = null
  draft.value = {}
}

async function saveTemplate(errorCode: string): Promise<void> {
  const locale = draft.value.locale ?? 'id'
  await store.upsert(errorCode, {
    locale,
    title: draft.value.title ?? '',
    message: draft.value.message ?? '',
    action_label: draft.value.action_label ?? '',
    action_url: draft.value.action_url ?? null,
    retry_allowed: draft.value.retry_allowed ?? false,
    alternative_login_allowed: draft.value.alternative_login_allowed ?? false,
    is_enabled: draft.value.is_enabled ?? false,
  })
  editingCode.value = null
  draft.value = {}
}

async function handleReset(errorCode: string, locale?: string): Promise<void> {
  await store.resetTemplate(errorCode, locale ?? 'id')
}

function templateFor(code: string): SsoErrorTemplate | undefined {
  return store.templates.find((t) => t.error_code === code && t.locale === 'id')
}
</script>

<template>
  <section class="policy-page" aria-labelledby="sso-templates-title">
    <div class="page-heading">
      <p class="eyebrow">Security Governance</p>
      <h1 id="sso-templates-title">SSO Error Templates</h1>
      <p class="page-summary">
        Kustomisasi pesan error SSO per error code. Tampilan yang akan dilihat pengguna saat terjadi
        error.
      </p>
    </div>

    <div v-if="store.status === 'loading'" class="state-card" role="status">
      Memuat SSO error templates...
    </div>

    <div
      v-else-if="store.status === 'forbidden'"
      class="state-card state-card--danger"
      role="alert"
    >
      <h2>Akses ditolak</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div
      v-else-if="store.status === 'unauthenticated'"
      class="state-card state-card--danger"
      role="alert"
    >
      <h2>Sesi admin berakhir</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div v-else-if="store.status === 'error'" class="state-card state-card--danger" role="alert">
      <h2>SSO error templates belum bisa dimuat</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div v-else-if="!hasEvidence" class="state-card" role="status">
      <h2>Belum ada SSO error templates</h2>
      <p>Katalog SSO error belum termuat.</p>
    </div>

    <div v-else class="policy-layout">
      <section class="detail-section" aria-label="SSO error template catalog">
        <div v-for="code in errorCodes" :key="code" class="state-card">
          <template v-if="editingCode === code">
            <div class="edit-form">
              <label class="reason-field">
                Title
                <input v-model="draft.title" autocomplete="off" />
              </label>
              <label class="reason-field">
                Message
                <textarea v-model="draft.message" rows="3" />
              </label>
              <label class="reason-field">
                Action label
                <input v-model="draft.action_label" autocomplete="off" />
              </label>
              <label class="reason-field">
                Action URL
                <input v-model="draft.action_url" autocomplete="off" />
              </label>
              <div class="checkbox-row">
                <label>
                  <input v-model="draft.retry_allowed" type="checkbox" />
                  Retry allowed
                </label>
                <label>
                  <input v-model="draft.alternative_login_allowed" type="checkbox" />
                  Alternative login
                </label>
                <label>
                  <input v-model="draft.is_enabled" type="checkbox" />
                  Enabled
                </label>
              </div>
              <div class="action-row compact-actions">
                <button v-if="canWriteSsoErrorTemplates" class="primary-action" type="button" @click="saveTemplate(code)">
                  Save
                </button>
                <button class="secondary-action" type="button" @click="cancelEdit()">Cancel</button>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="template-header">
              <strong>{{ code }}</strong>
              <span v-if="templateFor(code)?.is_enabled" class="status-badge status-badge--enabled"
                >enabled</span
              >
              <span v-else class="status-badge status-badge--default">default</span>
            </div>
            <p v-if="templateFor(code)">
              <strong>{{ templateFor(code)!.title }}</strong> &mdash;
              {{ templateFor(code)!.message }}
            </p>
            <p v-if="templateFor(code)">
              Action: {{ templateFor(code)!.action_label }}
              <span v-if="templateFor(code)!.action_url"
                >({{ templateFor(code)!.action_url }})</span
              >
            </p>
            <p v-else class="muted">Default catalog entry (belum di-customize).</p>
            <div v-if="canWriteSsoErrorTemplates" class="action-row compact-actions">
              <button
                class="primary-action"
                type="button"
                @click="
                  startEdit(
                    templateFor(code) ?? {
                      error_code: code,
                      locale: 'id',
                      title: '',
                      message: '',
                      action_label: '',
                      action_url: null,
                      retry_allowed: false,
                      alternative_login_allowed: false,
                      is_enabled: false,
                    },
                  )
                "
              >
                Edit
              </button>
              <button class="danger-action" type="button" @click="handleReset(code)">Reset</button>
            </div>
          </template>
        </div>
        <p
          v-if="store.actionStatus === 'error' || store.actionStatus === 'step_up_required'"
          class="action-message"
          role="alert"
        >
          {{ store.errorMessage }}
        </p>
      </section>
    </div>

    <EvidenceContextPanel title="SSO error template evidence" :request-id="store.requestId" />
  </section>
</template>

<style scoped>
.template-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.status-badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
}

.status-badge--enabled {
  color: #ccfbf1;
  background: rgb(20 184 166 / 14%);
}

.status-badge--default {
  color: #e0e7ff;
  background: rgb(99 102 241 / 14%);
}

.checkbox-row {
  display: flex;
  gap: 1rem;
  margin-block: 0.5rem;
}

.checkbox-row label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.875rem;
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
