<script setup lang="ts">
/**
 * AdminProfilePage — admin principal self-view.
 * Data source: GET /api/admin/me (bootstrap endpoint).
 * Permission: profile.read
 * No write actions on this page — read-only view.
 */

import { computed, onMounted, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useAdminProfileStore } from '../stores/admin-profile.store'
import { formatTechnicalPreview } from '@/lib/display-identifiers'
import { resolveProfileDisplayName } from '@/lib/display-name'
import { Copy, Check, Shield, User, Mail } from 'lucide-vue-next'

const store = useAdminProfileStore()
const { t } = useI18n()
const copied = ref(false)

const principalDisplayName = computed(() => {
  const principal = store.principal
  if (!principal) return ''

  return resolveProfileDisplayName({
    displayName: principal.display_name,
    givenName: principal.given_name,
    familyName: principal.family_name,
    fallback: principal.email ?? principal.subject_id,
  })
})

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    // Fail-safe
  }
}

function avatarInitial(name: string): string {
  return name ? name.charAt(0).toUpperCase() : 'A'
}

function avatarStyle(name: string): Record<string, string> {
  // Dark-aware avatar palette lives in src/assets/tokens.css (--avatar-1..6 + -2 end).
  const palette = [
    { start: 'var(--avatar-1)', end: 'var(--avatar-1-2)' },
    { start: 'var(--avatar-2)', end: 'var(--avatar-2-2)' },
    { start: 'var(--avatar-3)', end: 'var(--avatar-3-2)' },
    { start: 'var(--avatar-4)', end: 'var(--avatar-4-2)' },
    { start: 'var(--avatar-5)', end: 'var(--avatar-5-2)' },
    { start: 'var(--avatar-6)', end: 'var(--avatar-6-2)' },
  ]
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const color = palette[Math.abs(hash) % palette.length] ?? palette[0]!
  return { background: `linear-gradient(135deg, ${color.start}, ${color.end})` }
}

onMounted(() => {
  if (store.status === 'idle') void store.load()
})
</script>

<template>
  <section
    class="admin-profile-page max-w-page mx-auto px-4 md:px-6 py-8"
    aria-labelledby="admin-profile-title"
  >
    <div class="page-heading">
      <p class="eyebrow">{{ t('profile.eyebrow') }}</p>
      <h1 id="admin-profile-title">{{ t('profile.title') }}</h1>
      <p class="page-summary">{{ t('profile.summary') }}</p>
    </div>

    <UiSkeleton v-if="store.status === 'loading'" :label="t('profile.loading')" />

    <UiStatusView
      v-else-if="store.status === 'forbidden'"
      tone="forbidden"
      eyebrow="Profil"
      :title="t('profile.forbidden_title')"
      :description="store.errorMessage ?? t('common.forbidden_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'unauthenticated'"
      tone="error"
      eyebrow="Session"
      :title="t('common.session_expired_title')"
      :description="store.errorMessage ?? t('common.session_expired_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'error'"
      tone="api"
      eyebrow="Admin API"
      :title="t('profile.error_title')"
      :description="store.errorMessage ?? t('common.error_loading_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <div v-else-if="store.principal" class="admin-profile-layout">
      <!-- Left Column: Identity card summary -->
      <article class="profile-identity-card" aria-label="Identity Summary">
        <div class="profile-avatar-wrapper">
          <div class="profile-avatar" :style="avatarStyle(principalDisplayName)" aria-hidden="true">
            {{ avatarInitial(principalDisplayName) }}
          </div>
          <span class="profile-role-badge">
            {{ store.principal.role }}
          </span>
        </div>

        <h2 class="profile-display-name">{{ principalDisplayName }}</h2>
        <p class="profile-email-sub">
          <Mail :size="14" aria-hidden="true" />
          <span>{{ store.principal.email ?? '—' }}</span>
        </p>

        <div class="profile-sec-info">
          <span class="label">Kode admin:</span>
          <div class="subject-id-row">
            <code class="font-mono text-xs break-all">{{
              formatTechnicalPreview(store.principal.subject_id)
            }}</code>
            <button
              class="copy-btn"
              type="button"
              :title="copied ? 'Copied' : 'Copy admin reference'"
              @click="copyToClipboard(formatTechnicalPreview(store.principal.subject_id))"
            >
              <Check v-if="copied" :size="12" class="text-emerald-500 animate-scale-up" />
              <Copy v-else :size="12" />
            </button>
          </div>
        </div>
      </article>

      <!-- Right Column: Personal details + Permissions -->
      <div class="profile-details-column">
        <!-- Personal Details -->
        <article class="profile-details-card" aria-labelledby="admin-profile-detail-title">
          <h2 id="admin-profile-detail-title" class="section-title">
            <User :size="18" class="text-primary" aria-hidden="true" />
            <span>{{ t('profile.detail_title') }}</span>
          </h2>

          <dl class="detail-grid">
            <div>
              <dt>{{ t('profile.label_display_name') }}</dt>
              <dd>{{ principalDisplayName }}</dd>
            </div>
            <div>
              <dt>{{ t('profile.label_given_name') }}</dt>
              <dd>{{ store.principal.given_name ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('profile.label_family_name') }}</dt>
              <dd>{{ store.principal.family_name ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('profile.label_email') }}</dt>
              <dd>{{ store.principal.email ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('profile.label_role') }}</dt>
              <dd>
                <code class="font-semibold">{{ store.principal.role ?? '—' }}</code>
              </dd>
            </div>
          </dl>
        </article>

        <!-- Permissions -->
        <article
          v-if="store.principal.permissions && store.principal.permissions.length > 0"
          class="profile-details-card"
          aria-labelledby="admin-profile-permissions-title"
        >
          <h2 id="admin-profile-permissions-title" class="section-title">
            <Shield :size="18" class="text-primary" aria-hidden="true" />
            <span>{{ t('profile.permissions_title') }}</span>
          </h2>
          <ul class="roles-perm-list" aria-label="Daftar permission aktif">
            <li v-for="perm in store.principal.permissions" :key="perm" class="roles-perm-item">
              <code>{{ perm }}</code>
            </li>
          </ul>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Page container gap spacing */
.admin-profile-page {
  display: grid;
  gap: 18px;
}

/* Master 2-column layout */
.admin-profile-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  align-items: start;
  gap: 24px;
}

/* Left Column: Identity Summary Card */
.profile-identity-card {
  padding: 30px 24px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--card);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  min-width: 0;
}

.profile-avatar-wrapper {
  position: relative;
  margin-bottom: 16px;
}

.profile-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  /* Initial over the colored avatar gradient — fixed contrast in both themes. */
  color: #ffffff;
  font-family: var(--font-display);
  font-size: 2.2rem;
  font-weight: 800;
  box-shadow: var(--shadow-md);
  border: 3px solid var(--card);
}

.profile-role-badge {
  position: absolute;
  bottom: -4px;
  left: 50%;
  transform: translateX(-50%);
  padding: 2px 10px;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0;
  background: var(--primary);
  color: var(--primary-foreground);
  border-radius: 999px;
  box-shadow: var(--shadow-sm);
  border: 1.5px solid var(--card);
}

.profile-display-name {
  margin: 12px 0 4px 0;
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 900;
  color: var(--foreground);
  letter-spacing: 0;
  line-height: 1.2;
}

.profile-email-sub {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0;
  font-size: 0.88rem;
  color: var(--muted-foreground);
  min-width: 0;
  max-width: 100%;
}

.profile-email-sub span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.profile-sec-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.profile-sec-info .label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0;
  color: var(--muted-foreground);
}

.subject-id-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
}

.subject-id-row code {
  background: var(--muted);
  border: 1px solid var(--border);
  padding: 3px 8px;
  border-radius: 6px;
  color: var(--foreground);
  max-width: 100%;
}

/* Copy button styling */
.copy-btn {
  background: var(--secondary);
  border: 1px solid var(--border);
  padding: 4px;
  cursor: pointer;
  color: var(--muted-foreground);
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
}

.copy-btn:hover {
  background-color: var(--primary);
  color: var(--primary-foreground);
  border-color: var(--primary);
  transform: scale(1.05);
}

.copy-btn:active {
  transform: scale(0.95);
}

/* Right Column Cards styling */
.profile-details-column {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.profile-details-card {
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--card);
  box-shadow: var(--shadow-md);
}

.section-title {
  margin: 0 0 18px 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--foreground);
  letter-spacing: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Detail grid for personal information metadata */
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 0;
}

.detail-grid > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-grid dt {
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0;
  color: var(--muted-foreground);
}

.detail-grid dd {
  margin: 0;
  font-size: 0.95rem;
  color: var(--foreground);
  overflow-wrap: anywhere;
}

.detail-grid dd code {
  font-family: var(--font-mono);
  background: var(--muted);
  border: 1px solid var(--border);
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 0.84rem;
}

/* Animation */
@keyframes scaleUp {
  0% {
    transform: scale(0.85);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.animate-scale-up {
  animation: scaleUp 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

/* ── Responsive ─────────────────────────────────────────────────────────── */
@media (max-width: 760px) {
  .admin-profile-layout {
    grid-template-columns: 1fr;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
