<script setup lang="ts">
/**
 * AdminProfilePage — admin principal self-view.
 * Data source: GET /api/admin/me (bootstrap endpoint).
 * Permission: profile.read
 * No write actions on this page — read-only view.
 */

import { onMounted } from 'vue'
import { useI18n } from '@/composables/useI18n'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import { useAdminProfileStore } from '../stores/admin-profile.store'

const store = useAdminProfileStore()
const { t } = useI18n()

onMounted(() => {
  if (store.status === 'idle') void store.load()
})
</script>

<template>
  <section class="admin-profile-page" aria-labelledby="admin-profile-title">
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

    <article
      v-else-if="store.principal"
      class="detail-section"
      aria-labelledby="admin-profile-detail-title"
    >
      <h2 id="admin-profile-detail-title">{{ t('profile.detail_title') }}</h2>
      <dl class="detail-grid">
        <div>
          <dt>{{ t('profile.label_subject_id') }}</dt>
          <dd>{{ store.principal.subject_id }}</dd>
        </div>
        <div>
          <dt>{{ t('profile.label_email') }}</dt>
          <dd>{{ store.principal.email ?? '—' }}</dd>
        </div>
        <div>
          <dt>{{ t('profile.label_display_name') }}</dt>
          <dd>{{ store.principal.display_name ?? '—' }}</dd>
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
          <dt>{{ t('profile.label_role') }}</dt>
          <dd>{{ store.principal.role ?? '—' }}</dd>
        </div>
      </dl>

      <section
        v-if="store.principal.permissions && store.principal.permissions.length > 0"
        class="detail-section"
        aria-labelledby="admin-profile-permissions-title"
      >
        <h2 id="admin-profile-permissions-title">{{ t('profile.permissions_title') }}</h2>
        <ul class="roles-perm-list" aria-label="Daftar permission aktif">
          <li v-for="perm in store.principal.permissions" :key="perm" class="roles-perm-item">
            <code>{{ perm }}</code>
          </li>
        </ul>
      </section>
    </article>
  </section>
</template>
