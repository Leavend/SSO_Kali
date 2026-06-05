<script setup lang="ts">
/**
 * RolesPage — FR-053 / UC-51, UC-56–UC-57, UC-73.
 * Lists roles & permission matrix. Read-only surface.
 * Permission: admin.roles.read
 */

import { computed, onMounted } from 'vue'
import { useI18n } from '@/composables/useI18n'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import { useRolesStore } from '../stores/roles.store'
import { Shield, Key, Users } from 'lucide-vue-next'

const store = useRolesStore()
const { t } = useI18n()

const permissionsByGroup = computed<ReadonlyMap<string, readonly string[]>>(() => {
  const map = new Map<string, string[]>()
  for (const perm of store.permissions) {
    const group = perm.group ?? 'General'
    const existing = map.get(group) ?? []
    map.set(group, [...existing, perm.key])
  }
  return map
})

const hasData = computed<boolean>(() => store.roles.length > 0 || store.permissions.length > 0)

onMounted(() => {
  if (store.status === 'idle') void store.load()
})
</script>

<template>
  <section class="roles-page" aria-labelledby="roles-title">
    <div class="page-heading">
      <p class="eyebrow">{{ t('roles.eyebrow') }}</p>
      <h1 id="roles-title">{{ t('roles.title') }}</h1>
      <p class="page-summary">{{ t('roles.summary') }}</p>
    </div>

    <UiSkeleton v-if="store.status === 'loading'" :label="t('roles.loading')" />

    <UiStatusView
      v-else-if="store.status === 'forbidden'"
      tone="forbidden"
      eyebrow="RBAC"
      :title="t('roles.forbidden_title')"
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
      :title="t('roles.error_title')"
      :description="store.errorMessage ?? t('common.error_loading_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiEmptyState
      v-else-if="!hasData"
      :title="t('roles.empty_title')"
      :description="t('roles.empty_desc')"
    />

    <div v-else class="roles-layout">
      <section class="detail-section" aria-labelledby="roles-list-title">
        <h2 id="roles-list-title">
          <Shield :size="20" />
          <span>{{ t('roles.list_title') }}</span>
        </h2>
        <p class="page-summary">{{ t('roles.matrix_desc') }}</p>
        <div class="roles-grid">
          <article
            v-for="role in store.roles"
            :key="role.slug"
            class="ui-card roles-card"
            :aria-label="`Role: ${role.label}`"
          >
            <header class="roles-card__header">
              <strong class="roles-card__label">{{ role.label }}</strong>
              <code class="roles-card__slug">{{ role.slug }}</code>
              <span v-if="role.user_count != null" class="ui-badge roles-badge">
                <Users :size="12" />
                <span>{{ role.user_count }} {{ role.user_count === 1 ? 'user' : 'users' }}</span>
              </span>
            </header>

            <section :aria-labelledby="`perm-heading-${role.slug}`">
              <h3 :id="`perm-heading-${role.slug}`" class="sr-only">
                Permissions untuk role {{ role.label }}
              </h3>
              <ul class="roles-perm-list" aria-label="Permissions">
                <li v-for="perm in role.permissions" :key="perm" class="roles-perm-item">
                  <code>{{ perm }}</code>
                </li>
              </ul>
              <p v-if="role.permissions.length === 0" class="muted">
                {{ t('roles.no_permissions') }}
              </p>
            </section>
          </article>
        </div>
      </section>

      <section class="detail-section" aria-labelledby="permissions-matrix-title">
        <h2 id="permissions-matrix-title">
          <Key :size="20" />
          <span>{{ t('roles.matrix_title') }}</span>
        </h2>
        <p class="page-summary">{{ t('roles.matrix_desc') }}</p>
        <div v-for="[group, perms] in permissionsByGroup" :key="group" class="roles-perm-group">
          <h3 class="roles-perm-group__label">{{ group }}</h3>
          <ul class="roles-perm-list" :aria-label="`Permissions group ${group}`">
            <li v-for="perm in perms" :key="perm" class="roles-perm-item">
              <code>{{ perm }}</code>
            </li>
          </ul>
        </div>
      </section>
    </div>
  </section>
</template>
