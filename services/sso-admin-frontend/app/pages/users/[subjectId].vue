<script setup lang="ts">
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useUserDetail } from '@/composables/useUserDetail'
import { resolveUserStatusTone } from '@/lib/users/users-view-state'
import { formatMaskedIdentifier } from '@/lib/users/user-identifiers'
import { formatTechnicalPreview } from '@/lib/display-identifiers'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import UiButton from '@/components/ui/UiButton.vue'

definePageMeta({
  name: 'admin.users.detail',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.users.read'],
})

const { t } = useI18n()
const store = useSessionStore()
const route = useRoute()

// route.params.subjectId is a path identifier (subject id), not a secret. The
// composable resolves the masked detail DTO server-side via the BFF; tokens stay
// in the Nitro event.context and never reach the page or window.__NUXT__.
const subjectId = computed<string>(() => String(route.params.subjectId ?? ''))
const { user, loginContext, sessions, viewState, requestId, refresh } = useUserDetail(subjectId)

const headerTitle = computed<string>(() => user.value?.display_name ?? t('users.title'))
const statusTone = computed(() => resolveUserStatusTone(user.value?.effective_status))

// PII fields arrive ALREADY MASKED from the backend; formatMaskedIdentifier only
// normalizes null/'' → em dash. Never render the raw value (there is none).
function bool(value: boolean | null | undefined): string {
  return value ? t('users.yes') : t('users.no')
}

const sessionColumns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'sid', label: t('users.col_session'), variant: 'id' },
  { key: 'ip', label: t('users.ip_address'), align: 'left' },
  { key: 'lastSeen', label: t('users.last_seen'), variant: 'timestamp', align: 'left' },
])

// Row key is a synthetic index, NEVER the raw session id; the displayed id is the
// masked support-reference form so the raw sid never reaches the rendered tree.
const sessionRows = computed<readonly UiDataListRow[]>(() =>
  sessions.value.map((session, index) => ({
    id: `session-${index}`,
    sid: formatTechnicalPreview(session.id),
    ip: session.ip_address ?? '—',
    lastSeen: session.last_seen_at ?? '—',
  })),
)

async function onRefresh(): Promise<void> {
  await refresh()
}

async function onBack(): Promise<void> {
  await navigateTo({ name: 'admin.users' })
}
</script>

<template>
  <section class="user-detail" data-page="user-detail">
    <header class="user-detail__hero">
      <span class="user-detail__eyebrow">{{ t('users.eyebrow') }}</span>
      <h1 class="user-detail__title">{{ headerTitle }}</h1>
      <p class="user-detail__principal" data-principal-name>
        {{ t('users.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
      </p>
      <UiStatusBadge
        v-if="user"
        :tone="statusTone"
        :label="user.effective_status ?? t('users.status_unknown')"
      />
    </header>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('users.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('users.eyebrow')"
      :title="t('users.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('users.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiEmptyState
      v-else-if="viewState === 'not_found'"
      :title="t('users.not_found_title')"
      :description="t('users.not_found_desc')"
    >
      <template #action>
        <UiButton variant="secondary" size="sm" @click="onBack">
          {{ t('users.btn_back') }}
        </UiButton>
      </template>
    </UiEmptyState>

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('users.eyebrow')"
      :title="t('users.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <div v-else-if="user" class="user-detail__panels">
      <section class="user-detail__panel" data-panel="overview" aria-labelledby="overview-heading">
        <h2 id="overview-heading" class="user-detail__panel-title">
          {{ t('users.overview_title') }}
        </h2>
        <dl class="user-detail__grid">
          <div class="user-detail__field">
            <dt>{{ t('users.label_display_name') }}</dt>
            <dd>{{ user.display_name ?? '—' }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.label_email') }}</dt>
            <!-- Email is an intentionally-shown operator field (operator necessity), rendered plainly — not masked. -->
            <dd>{{ user.email ?? '—' }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.label_role') }}</dt>
            <dd>{{ user.role ?? '—' }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.field_nik') }}</dt>
            <dd>{{ formatMaskedIdentifier(user.nik) }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.field_nip') }}</dt>
            <dd>{{ formatMaskedIdentifier(user.nip) }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.field_nisn') }}</dt>
            <dd>{{ formatMaskedIdentifier(user.nisn) }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.field_birth_date') }}</dt>
            <dd>{{ formatMaskedIdentifier(user.birth_date) }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.local_account') }}</dt>
            <dd>{{ user.local_account_enabled ? t('users.enabled') : t('users.disabled') }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.email_verified') }}</dt>
            <dd>
              <UiFolio
                v-if="user.email_verified_at"
                :value="user.email_verified_at"
                variant="timestamp"
              />
              <span v-else>{{ t('users.no') }}</span>
            </dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.last_login') }}</dt>
            <dd>
              <UiFolio v-if="user.last_login_at" :value="user.last_login_at" variant="timestamp" />
              <span v-else>—</span>
            </dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.last_synced') }}</dt>
            <dd>
              <UiFolio
                v-if="user.profile_synced_at"
                :value="user.profile_synced_at"
                variant="timestamp"
              />
              <span v-else>—</span>
            </dd>
          </div>
        </dl>
      </section>

      <section class="user-detail__panel" data-panel="security" aria-labelledby="security-heading">
        <h2 id="security-heading" class="user-detail__panel-title">
          {{ t('users.security_title') }}
        </h2>
        <dl class="user-detail__grid">
          <div class="user-detail__field">
            <dt>{{ t('users.mfa_enrolled') }}</dt>
            <dd>{{ bool(user.mfa_enrolled) }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.mfa_required') }}</dt>
            <dd>{{ bool(user.mfa_mandatory || loginContext?.mfa_required) }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.mfa_methods') }}</dt>
            <dd>{{ user.mfa_methods.length ? user.mfa_methods.join(', ') : '—' }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.login_ip') }}</dt>
            <dd>{{ loginContext?.ip_address ?? '—' }}</dd>
          </div>
          <div class="user-detail__field">
            <dt>{{ t('users.last_seen') }}</dt>
            <dd>
              <UiFolio
                v-if="loginContext?.last_seen_at"
                :value="loginContext.last_seen_at"
                variant="timestamp"
              />
              <span v-else>—</span>
            </dd>
          </div>
        </dl>
      </section>

      <section class="user-detail__panel" data-panel="roles" aria-labelledby="roles-heading">
        <h2 id="roles-heading" class="user-detail__panel-title">{{ t('users.roles_title') }}</h2>
        <ul v-if="user.roles.length" class="user-detail__roles">
          <li v-for="role in user.roles" :key="role.slug">
            <UiStatusBadge :tone="role.is_system ? 'info' : 'neutral'" :label="role.name" />
          </li>
        </ul>
        <p v-else class="user-detail__muted">—</p>
      </section>

      <section class="user-detail__panel" data-panel="sessions" aria-labelledby="sessions-heading">
        <h2 id="sessions-heading" class="user-detail__panel-title">
          {{ t('users.sessions_title') }}
        </h2>
        <UiDataList
          v-if="sessionRows.length"
          :caption="t('users.sessions_title')"
          :columns="sessionColumns"
          :rows="sessionRows"
          :total="sessionRows.length"
        />
        <p v-else class="user-detail__muted">{{ t('users.no_sessions') }}</p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.user-detail {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.user-detail__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.user-detail__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.user-detail__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.user-detail__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.user-detail__panels {
  display: grid;
  gap: 20px;
}
.user-detail__panel {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
}
.user-detail__panel-title {
  margin: 0;
  font: 600 0.9375rem/1.2 var(--font-sans);
  color: var(--fg);
}
.user-detail__grid {
  display: grid;
  gap: 12px 24px;
  margin: 0;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}
.user-detail__field {
  display: grid;
  gap: 2px;
}
.user-detail__field dt {
  font: 600 0.625rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.user-detail__field dd {
  margin: 0;
  font: 400 0.875rem/1.5 var(--font-sans);
  color: var(--fg);
  overflow-wrap: anywhere;
}
.user-detail__roles {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.user-detail__muted {
  margin: 0;
  font: 400 0.875rem/1.5 var(--font-sans);
  color: var(--fg-3);
}
</style>
