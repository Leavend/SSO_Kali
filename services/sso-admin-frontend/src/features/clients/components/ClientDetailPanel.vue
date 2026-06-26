<script setup lang="ts">
import { computed, nextTick, ref, watch, type Component } from 'vue'
import { useI18n } from '@/composables/useI18n'
import { useDateFormat } from '@/composables/useDateFormat'
import { useTabPill } from '@/composables/useTabPill'
import UiButton from '@/components/ui/UiButton.vue'
import { buttonVariants } from '@/components/ui/button'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import { useClientsStore } from '../stores/clients.store'
import { formatFriendlyClientName } from '@/lib/display-identifiers'
import {
  AlertTriangle,
  Copy,
  Globe,
  Key,
  LayoutDashboard,
  Settings,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-vue-next'
import type { AdminClient } from '../types'

/**
 * Right-hand detail surface of the Clients master–detail page (Bontang DS).
 *
 * Rendered once and hosted either inline (wide viewport, inside the page grid)
 * or inside `UiDetailDrawer` (≤920px). All orchestration state and handlers are
 * owned by the page and passed in, so behaviour (save / rotate / lifecycle) is
 * identical in both placements. The selected client is read from the Pinia
 * singleton — selecting a row never refetches here.
 */
type DetailTab = 'overview' | 'uris' | 'scopes' | 'security' | 'lifecycle'

type ClientEditForm = {
  display_name: string
  owner_email: string
  redirect_uris: string
  post_logout_redirect_uris: string
  backchannel_logout_uri: string
  allowed_scopes: string
}
type ClientLifecycleForm = {
  disable_reason: string
  decommission_confirmation: string
  delete_confirmation: string
}

const props = defineProps<{
  readonly client: AdminClient
  readonly canWriteClients: boolean
  readonly canManageClientLifecycle: boolean
  /**
   * Page-owned edit buffers (reactive objects). They are shared by reference,
   * so in-panel inputs write straight through to the page's reactive state via
   * the local `form` / `lifecycleForm` aliases below — the page reconciles them
   * with the store on save.
   */
  readonly form: ClientEditForm
  readonly lifecycleForm: ClientLifecycleForm
  readonly selectedScopes: string[]
  readonly allAvailableScopes: ReadonlyArray<{
    name: string
    description: string
    claims: readonly string[]
    default_allowed: boolean
  }>
  readonly scopeParityWarnings: readonly string[]
  readonly uriValidationMessage: string
  readonly lifecycleMessage: string | null
  readonly deleteMessage: string | null
  readonly successMessage: string | null
  readonly isSaving: boolean
  readonly showContract: boolean
  readonly contractEnvLines: readonly string[]
  readonly docsBaseUrl: string
}>()

const emit = defineEmits<{
  (event: 'update:selectedScopes', value: string[]): void
  (event: 'save-metadata'): void
  (event: 'save-uri-policy'): void
  (event: 'save-scope-policy'): void
  (event: 'rotate-secret'): void
  (event: 'clear-rotation-secret'): void
  (event: 'copy-all-config'): void
  (event: 'disable-client'): void
  (event: 'decommission-client'): void
  (event: 'delete-client'): void
  (event: 'copy', value: string): void
}>()

// Local aliases to the shared reactive buffers. Mutating a field here mutates
// the page's reactive object in place (same reference) — no prop reassignment,
// so `vue/no-mutating-props` is satisfied while two-way binding still works.
const form: ClientEditForm = props.form
const lifecycleForm: ClientLifecycleForm = props.lifecycleForm

const store = useClientsStore()
const { t } = useI18n()
const dateFormat = useDateFormat()

const scopesProxy = computed<string[]>({
  get: () => props.selectedScopes,
  set: (value) => emit('update:selectedScopes', value),
})

function displayClientType(type: string | null | undefined): string {
  const normalized = type?.trim().toLowerCase()
  if (normalized === 'public') return 'public'
  if (normalized === 'confidential') return 'confidential'
  return t('clients.val_unknown')
}

function categoryLabel(category: AdminClient['category']): string {
  if (category === 'kepegawaian') return t('clients.category_staff')
  if (category === 'publik') return t('clients.category_public')
  return t('clients.val_unknown')
}

const categoryTone = computed<'brand' | 'neutral'>(() =>
  props.client.category === 'kepegawaian' ? 'brand' : 'neutral',
)

const activeDetailTab = ref<DetailTab>('overview')

const detailTabs = computed<Array<{ key: DetailTab; label: string; icon: Component }>>(() => {
  const tabs: Array<{ key: DetailTab; label: string; icon: Component }> = [
    { key: 'overview', label: t('clients.tab_overview'), icon: LayoutDashboard },
    { key: 'uris', label: t('clients.tab_uris'), icon: Globe },
    { key: 'scopes', label: t('clients.tab_scopes'), icon: Key },
  ]
  if (props.canWriteClients) {
    tabs.push({ key: 'security', label: t('clients.tab_security'), icon: ShieldAlert })
  }
  if (props.canManageClientLifecycle) {
    tabs.push({ key: 'lifecycle', label: t('clients.tab_lifecycle'), icon: Settings })
  }
  return tabs
})

const tabsContainerRef = ref<HTMLElement | null>(null)
const { pillStyle, updatePillPosition, schedulePillUpdate } = useTabPill({
  containerRef: tabsContainerRef,
  activeSelector: '.client-detail-tab--active',
})

watch(activeDetailTab, () => {
  void nextTick(() => {
    updatePillPosition()
  })
})

// Re-anchoring the pill is required whenever the hosted client swaps out.
watch(
  () => props.client.client_id,
  () => {
    activeDetailTab.value = 'overview'
    void nextTick(() => {
      updatePillPosition()
    })
    schedulePillUpdate()
  },
)

function selectDetailTab(key: DetailTab): void {
  activeDetailTab.value = key
}

function onTabKeydown(event: KeyboardEvent, index: number): void {
  const tabs = detailTabs.value
  let nextIndex = index
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    nextIndex = (index + 1) % tabs.length
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    nextIndex = (index - 1 + tabs.length) % tabs.length
  } else if (event.key === 'Home') {
    nextIndex = 0
  } else if (event.key === 'End') {
    nextIndex = tabs.length - 1
  } else {
    return
  }
  event.preventDefault()
  const next = tabs[nextIndex]
  if (!next) return
  selectDetailTab(next.key)
  void nextTick(() => {
    document.getElementById(`client-tab-${next.key}`)?.focus()
  })
}

defineExpose({ activeDetailTab })
</script>

<template>
  <article class="client-detail">
    <!-- Hero -->
    <header class="client-profile-hero">
      <div class="client-profile-hero__avatar" aria-hidden="true">
        {{ (client.display_name ?? client.client_id).charAt(0).toUpperCase() }}
      </div>
      <div class="client-profile-hero__content">
        <div class="client-profile-hero__header-row">
          <h2 class="break-anywhere">
            {{ client.display_name ?? client.client_id }}
          </h2>
          <UiStatusBadge
            class="client-profile-hero__status-badge"
            :status="client.status ?? 'active'"
          />
          <UiStatusBadge
            class="client-profile-hero__category-badge"
            :tone="categoryTone"
            :label="categoryLabel(client.category)"
          />
        </div>
        <p class="client-profile-hero__env">
          {{ client.environment ?? t('clients.val_unknown') }}
        </p>
        <p class="client-profile-hero__client-id stat-value--with-copy">
          <span class="stat-value stat-value--mono break-anywhere" title="Kode aplikasi">
            {{ formatFriendlyClientName(client.client_id) }}
          </span>
          <button
            class="pill__copy"
            type="button"
            :aria-label="(t('common.copy') || 'Copy') + ' kode aplikasi'"
            :title="t('common.copy') || 'Copy'"
            @click="emit('copy', formatFriendlyClientName(client.client_id))"
          >
            <Copy :size="14" />
          </button>
        </p>
      </div>
      <div class="client-profile-hero__actions">
        <RouterLink
          :class="buttonVariants({ variant: 'secondary' })"
          :to="{
            name: 'admin.observability.compliance',
            query: { consent: '1', client_id: client.client_id },
          }"
        >
          {{ t('clients.btn_consent_trail') }}
        </RouterLink>
      </div>
    </header>

    <!-- Tabs Navigation -->
    <nav
      ref="tabsContainerRef"
      class="client-detail-tabs scroll-edge-indicator"
      role="tablist"
      :aria-label="t('clients.detail_tabs_label')"
    >
      <div class="client-detail-tabs__pill" :style="pillStyle"></div>
      <button
        v-for="(tab, index) in detailTabs"
        :id="`client-tab-${tab.key}`"
        :key="tab.key"
        class="client-detail-tab"
        :class="{ 'client-detail-tab--active': activeDetailTab === tab.key }"
        role="tab"
        :aria-selected="activeDetailTab === tab.key"
        :aria-controls="`client-panel-${tab.key}`"
        :tabindex="activeDetailTab === tab.key ? 0 : -1"
        type="button"
        @click="selectDetailTab(tab.key)"
        @keydown="onTabKeydown($event, index)"
      >
        <component :is="tab.icon" :size="16" aria-hidden="true" />
        {{ tab.label }}
      </button>
    </nav>

    <!-- Cross-tab status (errors + success message stay visible). -->
    <div v-if="store.errorMessage || successMessage" class="client-detail-status" aria-live="polite">
      <p v-if="store.errorMessage" class="ui-action-message ui-action-message--error" role="alert">
        {{ store.errorMessage }}
      </p>
      <p v-if="successMessage" class="ui-action-message ui-action-message--success" role="status">
        {{ successMessage }}
      </p>
    </div>

    <!-- Tab 1: Ikhtisar (overview) -->
    <div
      v-show="activeDetailTab === 'overview'"
      id="client-panel-overview"
      role="tabpanel"
      aria-labelledby="client-tab-overview"
      class="tab-panel"
    >
      <dl class="detail-grid">
        <div>
          <dt>{{ t('clients.ov_type') }}</dt>
          <dd data-test="client-overview-type">{{ displayClientType(client.type) }}</dd>
        </div>
        <div>
          <dt>{{ t('clients.label_category') }}</dt>
          <dd>{{ categoryLabel(client.category) }}</dd>
        </div>
        <div>
          <dt>{{ t('clients.ov_owner') }}</dt>
          <dd>{{ client.owner_email ?? t('clients.val_not_set') }}</dd>
        </div>
        <div>
          <dt>{{ t('common.status') }}</dt>
          <dd>
            <UiStatusBadge :status="client.status ?? 'active'" />
          </dd>
        </div>
      </dl>

      <section v-if="canWriteClients" class="detail-section" aria-labelledby="metadata-title">
        <h3 id="metadata-title">{{ t('clients.metadata_title') }}</h3>
        <form class="client-form" @submit.prevent="emit('save-metadata')">
          <div class="user-form-grid user-form-grid-2">
            <UiFormField id="edit_display_name" :label="t('clients.label_display_name')">
              <UiInput
                id="edit_display_name"
                v-model="form.display_name"
                name="display_name"
                autocomplete="off"
              />
            </UiFormField>
            <UiFormField id="edit_owner_email" :label="t('clients.label_owner_email')">
              <UiInput
                id="edit_owner_email"
                v-model="form.owner_email"
                name="owner_email"
                autocomplete="email"
              />
            </UiFormField>
          </div>
          <div class="user-detail-card__actions">
            <UiButton variant="primary" type="submit" :disabled="isSaving">
              {{ isSaving ? t('clients.btn_saving') : t('clients.btn_save_metadata') }}
            </UiButton>
          </div>
        </form>
      </section>
    </div>

    <!-- Tab 2: URI -->
    <div
      v-show="activeDetailTab === 'uris'"
      id="client-panel-uris"
      role="tabpanel"
      aria-labelledby="client-tab-uris"
      class="tab-panel"
    >
      <section class="detail-section" aria-labelledby="redirect-uris-title">
        <h3 id="redirect-uris-title">{{ t('clients.redirect_uris_title') }}</h3>
        <ul v-if="client.redirect_uris.length > 0">
          <li v-for="uri in client.redirect_uris" :key="uri">
            <code class="client-uri-value break-anywhere">{{ uri }}</code>
          </li>
        </ul>
        <p v-else class="text-muted">{{ t('clients.no_redirect_uris') }}</p>
      </section>

      <section class="detail-section" aria-labelledby="logout-uris-title">
        <h3 id="logout-uris-title">{{ t('clients.logout_uris_title') }}</h3>
        <ul v-if="(client.post_logout_redirect_uris ?? []).length > 0">
          <li v-for="uri in client.post_logout_redirect_uris ?? []" :key="uri">
            <code class="client-uri-value break-anywhere">{{ uri }}</code>
          </li>
        </ul>
        <p v-else class="text-muted">{{ t('clients.no_logout_uris') }}</p>
      </section>

      <section class="detail-section" aria-labelledby="backchannel-logout-uri-title">
        <h3 id="backchannel-logout-uri-title">{{ t('clients.backchannel_uri_title') }}</h3>
        <p>
          <code class="client-uri-value break-anywhere">{{
            client.backchannel_logout_uri ?? t('clients.val_no_evidence')
          }}</code>
        </p>
      </section>

      <section v-if="canWriteClients" class="detail-section" aria-labelledby="uri-policy-title">
        <h3 id="uri-policy-title">{{ t('clients.uri_policy_title') }}</h3>
        <form class="client-form" data-test="uri-policy-form" @submit.prevent="emit('save-uri-policy')">
          <p v-if="uriValidationMessage" class="ui-action-message ui-action-message--error" role="alert">
            {{ uriValidationMessage }}
          </p>
          <div class="user-form-grid">
            <UiFormField id="redirect_uris" :label="t('clients.label_redirect_uris')">
              <UiTextarea id="redirect_uris" v-model="form.redirect_uris" name="redirect_uris" :rows="4" />
            </UiFormField>
            <UiFormField id="post_logout_redirect_uris" :label="t('clients.label_post_logout_uris')">
              <UiTextarea
                id="post_logout_redirect_uris"
                v-model="form.post_logout_redirect_uris"
                name="post_logout_redirect_uris"
                :rows="4"
              />
            </UiFormField>
            <UiFormField id="backchannel_logout_uri" :label="t('clients.label_backchannel_uri')">
              <UiInput
                id="backchannel_logout_uri"
                v-model="form.backchannel_logout_uri"
                name="backchannel_logout_uri"
                autocomplete="url"
              />
            </UiFormField>
          </div>
          <div class="user-detail-card__actions">
            <UiButton variant="primary" type="submit" :disabled="isSaving">
              {{ isSaving ? t('clients.btn_saving') : t('clients.btn_save_uri_policy') }}
            </UiButton>
          </div>
        </form>
      </section>
    </div>

    <!-- Tab 3: Scope -->
    <div
      v-show="activeDetailTab === 'scopes'"
      id="client-panel-scopes"
      role="tabpanel"
      aria-labelledby="client-tab-scopes"
      class="tab-panel"
    >
      <section class="detail-section">
        <h3>{{ t('clients.allowed_scopes_title') }}</h3>
        <div v-if="(client.allowed_scopes ?? []).length > 0" class="scope-badges">
          <span v-for="scope in client.allowed_scopes" :key="scope" class="scope-badge">
            <Key :size="12" aria-hidden="true" />
            {{ scope }}
          </span>
        </div>
        <p v-else class="text-muted">{{ t('clients.no_scopes') }}</p>
      </section>

      <section v-if="canWriteClients" class="detail-section" aria-labelledby="scope-policy-title">
        <h3 id="scope-policy-title">{{ t('clients.scope_policy_title') }}</h3>
        <p v-if="scopeParityWarnings.length > 0" class="ui-action-message ui-action-message--warning" role="status">
          {{ t('clients.scope_parity_warning') }} {{ scopeParityWarnings.join(', ') }}
        </p>
        <form class="client-form" data-test="scope-policy-form" @submit.prevent="emit('save-scope-policy')">
          <div class="scope-checkboxes-grid">
            <label
              v-for="scope in allAvailableScopes"
              :key="scope.name"
              :class="[
                'scope-checkbox-label',
                scopesProxy.includes(scope.name) ? 'scope-checkbox-label--selected' : '',
              ]"
            >
              <input
                v-model="scopesProxy"
                type="checkbox"
                :value="scope.name"
                :disabled="scope.name === 'openid'"
                class="scope-checkbox-input"
              />
              <div class="scope-checkbox-content">
                <span class="scope-checkbox-name">
                  {{ scope.name }}
                  <span v-if="scope.name === 'openid'" class="scope-required-tag">required</span>
                </span>
                <p class="scope-checkbox-desc">{{ scope.description }}</p>
              </div>
            </label>
          </div>
          <div class="user-detail-card__actions client-scope-actions">
            <UiButton variant="primary" type="submit" :disabled="isSaving">
              {{ isSaving ? t('clients.btn_saving') : t('clients.btn_save_scope_policy') }}
            </UiButton>
          </div>
        </form>
      </section>
    </div>

    <!-- Tab 4: Keamanan (security) -->
    <div
      v-show="activeDetailTab === 'security'"
      id="client-panel-security"
      role="tabpanel"
      aria-labelledby="client-tab-security"
      class="tab-panel"
    >
      <dl class="detail-grid">
        <div>
          <dt>{{ t('clients.ov_secret_hash') }}</dt>
          <dd>
            {{ client.has_secret_hash ? t('clients.val_stored') : t('clients.val_not_available') }}
          </dd>
        </div>
        <div>
          <dt>{{ t('clients.ov_secret_rotated') }}</dt>
          <dd>{{ dateFormat.smart(client.secret_rotated_at) }}</dd>
        </div>
      </dl>

      <section
        v-if="canWriteClients"
        class="detail-section detail-section--danger"
        aria-labelledby="secret-title"
      >
        <h3 id="secret-title">{{ t('clients.secret_title') }}</h3>
        <p class="detail-section__lead">{{ t('clients.secret_hint') }}</p>
        <div class="user-detail-card__actions">
          <UiButton
            variant="danger"
            type="button"
            data-test="rotate-secret"
            :disabled="isSaving"
            @click="emit('rotate-secret')"
          >
            {{ isSaving ? t('clients.btn_processing') : t('clients.btn_rotate_secret') }}
          </UiButton>
        </div>

        <div v-if="store.rotationSecret" class="secret-reveal" role="status">
          <div class="secret-reveal__header">
            <AlertTriangle :size="16" aria-hidden="true" />
            <strong>{{ t('clients.secret_reveal_title') }} {{ store.rotationClientId }}</strong>
          </div>
          <p class="secret-reveal__warning">{{ t('clients.secret_reveal_warning') }}</p>
          <div class="secret-reveal__code-wrapper">
            <code id="revealed-secret" class="secret-code-value break-anywhere">{{
              store.rotationSecret
            }}</code>
            <button
              class="secret-reveal__copy-btn"
              type="button"
              :aria-label="t('clients.btn_copy_secret')"
              @click="emit('copy', store.rotationSecret!)"
            >
              <ShieldCheck :size="14" />
              {{ t('clients.btn_copy_secret') }}
            </button>
          </div>

          <div v-if="showContract && contractEnvLines.length > 0" class="contract-block">
            <h4 class="contract-block__title">{{ t('clients.config_block_title') }}</h4>
            <pre
              class="contract-block__pre"
            ><code class="break-anywhere">{{ contractEnvLines.join('\n') }}</code></pre>
            <div class="user-detail-card__actions contract-block__actions">
              <UiButton variant="secondary" size="sm" type="button" @click="emit('copy-all-config')">
                <ShieldCheck :size="14" />
                {{ t('clients.btn_copy_all_config') }}
              </UiButton>
            </div>
          </div>

          <div class="user-detail-card__actions secret-reveal__actions">
            <UiButton
              variant="secondary"
              size="sm"
              data-test="clear-rotation-secret"
              type="button"
              @click="emit('clear-rotation-secret')"
            >
              {{ t('clients.btn_clear_secret') }}
            </UiButton>
          </div>
        </div>
      </section>
    </div>

    <!-- Tab 5: Siklus (lifecycle) -->
    <div
      v-show="activeDetailTab === 'lifecycle'"
      id="client-panel-lifecycle"
      role="tabpanel"
      aria-labelledby="client-tab-lifecycle"
      class="tab-panel"
    >
      <dl class="detail-grid">
        <div>
          <dt>{{ t('clients.lc_activated') }}</dt>
          <dd>{{ dateFormat.smart(client.activated_at) }}</dd>
        </div>
        <div>
          <dt>{{ t('clients.lc_disabled') }}</dt>
          <dd>{{ client.disabled_at ? dateFormat.smart(client.disabled_at) : t('clients.val_not_set') }}</dd>
        </div>
        <div>
          <dt>{{ t('clients.lc_secret_expires') }}</dt>
          <dd>
            {{ client.secret_expires_at ? dateFormat.smart(client.secret_expires_at) : t('clients.val_not_set') }}
          </dd>
        </div>
        <div>
          <dt>{{ t('clients.lc_provisioning') }}</dt>
          <dd>{{ client.provisioning ?? t('clients.val_not_set') }}</dd>
        </div>
      </dl>

      <section
        v-if="canManageClientLifecycle"
        class="detail-section detail-section--danger"
        aria-labelledby="lifecycle-title"
      >
        <h3 id="lifecycle-title">{{ t('clients.lifecycle_title') }}</h3>
        <p class="detail-section__lead">{{ t('clients.lifecycle_impact') }}</p>
        <p v-if="lifecycleMessage" class="ui-action-message ui-action-message--error" role="alert">
          {{ lifecycleMessage }}
        </p>

        <div class="user-detail__sub-actions">
          <h4 class="user-detail__sub-actions-title">{{ t('clients.sub_disable_title') }}</h4>
          <p class="user-detail-card__hint">{{ t('clients.disable_hint') }}</p>
          <UiFormField id="client_disable_reason" :label="t('clients.label_disable_reason')">
            <UiTextarea
              id="client_disable_reason"
              v-model="lifecycleForm.disable_reason"
              name="client_disable_reason"
              :rows="2"
              :placeholder="t('clients.disable_placeholder')"
            />
          </UiFormField>
          <div class="user-detail-card__actions">
            <UiButton
              variant="danger"
              data-test="disable-client"
              type="button"
              :disabled="isSaving"
              @click="emit('disable-client')"
            >
              {{ isSaving ? t('clients.btn_processing') : t('clients.btn_disable_client') }}
            </UiButton>
          </div>
        </div>

        <div class="user-detail__sub-actions">
          <h4 class="user-detail__sub-actions-title">{{ t('clients.sub_decommission_title') }}</h4>
          <p class="user-detail-card__hint">{{ t('clients.decommission_hint') }}</p>
          <UiFormField
            id="decommission_confirmation"
            :label="`${t('clients.label_decommission')} (${client.client_id})`"
          >
            <UiInput
              id="decommission_confirmation"
              v-model="lifecycleForm.decommission_confirmation"
              name="decommission_confirmation"
              autocomplete="off"
              :placeholder="t('clients.decommission_placeholder')"
            />
          </UiFormField>
          <div class="user-detail-card__actions">
            <UiButton
              variant="danger"
              data-test="decommission-client"
              type="button"
              :disabled="isSaving"
              @click="emit('decommission-client')"
            >
              {{ isSaving ? t('clients.btn_processing') : t('clients.btn_decommission_client') }}
            </UiButton>
          </div>
        </div>

        <div class="user-detail__sub-actions">
          <h4 class="user-detail__sub-actions-title client-delete-title">
            {{ t('clients.sub_delete_title') }}
          </h4>
          <p class="user-detail-card__hint">{{ t('clients.delete_hint') }}</p>
          <p v-if="deleteMessage" class="ui-action-message ui-action-message--error" role="alert">
            {{ deleteMessage }}
          </p>
          <UiFormField
            id="delete_confirmation"
            :label="`${t('clients.label_delete_confirmation')} (${client.client_id})`"
          >
            <UiInput
              id="delete_confirmation"
              v-model="lifecycleForm.delete_confirmation"
              name="delete_confirmation"
              autocomplete="off"
              :placeholder="t('clients.delete_placeholder')"
            />
          </UiFormField>
          <div class="user-detail-card__actions">
            <UiButton
              variant="danger"
              data-test="delete-client"
              type="button"
              :disabled="isSaving"
              @click="emit('delete-client')"
            >
              {{ isSaving ? t('clients.btn_processing') : t('clients.btn_delete_client') }}
            </UiButton>
          </div>
        </div>
      </section>
    </div>
  </article>
</template>
