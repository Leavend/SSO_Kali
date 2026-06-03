<script setup lang="ts">
/**
 * RolesPage — FR-053 / UC-51, UC-56–UC-57, UC-73.
 * Lists roles & permission matrix. Read-only surface.
 * Permission: admin.roles.read
 */

import { computed, onMounted } from 'vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import { useRolesStore } from '../stores/roles.store'

const store = useRolesStore()

const permissionsByGroup = computed<ReadonlyMap<string, readonly string[]>>(() => {
  const map = new Map<string, string[]>()
  for (const perm of store.permissions) {
    const group = perm.group ?? 'General'
    const existing = map.get(group) ?? []
    map.set(group, [...existing, perm.key])
  }
  return map
})

const hasData = computed<boolean>(
  () => store.roles.length > 0 || store.permissions.length > 0,
)

onMounted(() => {
  if (store.status === 'idle') void store.load()
})
</script>

<template>
  <section class="roles-page" aria-labelledby="roles-title">
    <div class="page-heading">
      <p class="eyebrow">RBAC</p>
      <h1 id="roles-title">Roles &amp; Permissions</h1>
      <p class="page-summary">
        Daftar role, permission matrix, dan assignee untuk setiap role admin.
        Perubahan role memerlukan permission <code>admin.roles.write</code>.
      </p>
    </div>

    <UiSkeleton v-if="store.status === 'loading'" label="Memuat roles" />

    <UiStatusView
      v-else-if="store.status === 'forbidden'"
      tone="forbidden"
      eyebrow="RBAC"
      title="Akses ditolak"
      :description="store.errorMessage ?? 'Kamu tidak memiliki izin untuk melihat roles & permissions.'"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'unauthenticated'"
      tone="error"
      eyebrow="Session"
      title="Sesi admin berakhir"
      :description="store.errorMessage ?? 'Login ulang dari portal untuk melanjutkan.'"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'error'"
      tone="api"
      eyebrow="Admin API"
      title="Roles belum bisa dimuat"
      :description="store.errorMessage ?? 'Coba muat ulang halaman ini.'"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiEmptyState
      v-else-if="!hasData"
      title="Belum ada data roles"
      description="Tidak ada role atau permission yang ditemukan."
    />

    <div v-else class="roles-layout">
      <section class="detail-section" aria-labelledby="roles-list-title">
        <h2 id="roles-list-title">Daftar Role</h2>
        <p class="page-summary">
          Setiap role memiliki set permission yang dikonfigurasi di backend. Permission string
          mengikuti kontrak backend — bukan nama ad-hoc frontend.
        </p>
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
              <span v-if="role.user_count != null" class="ui-badge">
                {{ role.user_count }} user
              </span>
            </header>

            <section aria-labelledby="`perm-heading-${role.slug}`">
              <h3 :id="`perm-heading-${role.slug}`" class="sr-only">
                Permissions untuk role {{ role.label }}
              </h3>
              <ul class="roles-perm-list" aria-label="Permissions">
                <li
                  v-for="perm in role.permissions"
                  :key="perm"
                  class="roles-perm-item"
                >
                  <code>{{ perm }}</code>
                </li>
              </ul>
              <p v-if="role.permissions.length === 0" class="muted">
                Role ini belum memiliki permission.
              </p>
            </section>
          </article>
        </div>
      </section>

      <section class="detail-section" aria-labelledby="permissions-matrix-title">
        <h2 id="permissions-matrix-title">Permission Matrix</h2>
        <p class="page-summary">
          Seluruh permission yang terdaftar di backend, dikelompokkan per domain.
        </p>
        <div
          v-for="[group, perms] in permissionsByGroup"
          :key="group"
          class="roles-perm-group"
        >
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
