<script setup lang="ts">
/**
 * AdminProfilePage — admin principal self-view.
 * Data source: GET /api/admin/me (bootstrap endpoint).
 * Permission: profile.read
 * No write actions on this page — read-only view.
 */

import { onMounted } from 'vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import { useAdminProfileStore } from '../stores/admin-profile.store'

const store = useAdminProfileStore()

onMounted(() => {
  if (store.status === 'idle') void store.load()
})
</script>

<template>
  <section class="admin-profile-page" aria-labelledby="admin-profile-title">
    <div class="page-heading">
      <p class="eyebrow">Akun Admin</p>
      <h1 id="admin-profile-title">Profil Admin</h1>
      <p class="page-summary">
        Informasi principal admin yang sedang login. Data dibaca dari session backend.
      </p>
    </div>

    <UiSkeleton v-if="store.status === 'loading'" label="Memuat profil" />

    <UiStatusView
      v-else-if="store.status === 'forbidden'"
      tone="forbidden"
      eyebrow="Profil"
      title="Akses ditolak"
      :description="store.errorMessage ?? 'Kamu tidak memiliki izin untuk melihat profil admin.'"
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
      title="Profil belum bisa dimuat"
      :description="store.errorMessage ?? 'Coba muat ulang halaman ini.'"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <article
      v-else-if="store.principal"
      class="detail-section"
      aria-labelledby="admin-profile-detail-title"
    >
      <h2 id="admin-profile-detail-title">Data Principal</h2>
      <dl class="detail-grid">
        <div>
          <dt>Subject ID</dt>
          <dd>{{ store.principal.subject_id }}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{{ store.principal.email ?? '—' }}</dd>
        </div>
        <div>
          <dt>Nama Tampilan</dt>
          <dd>{{ store.principal.display_name ?? '—' }}</dd>
        </div>
        <div>
          <dt>Nama Depan</dt>
          <dd>{{ store.principal.given_name ?? '—' }}</dd>
        </div>
        <div>
          <dt>Nama Belakang</dt>
          <dd>{{ store.principal.family_name ?? '—' }}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{{ store.principal.role ?? '—' }}</dd>
        </div>
      </dl>

      <section
        v-if="store.principal.permissions && store.principal.permissions.length > 0"
        class="detail-section"
        aria-labelledby="admin-profile-permissions-title"
      >
        <h2 id="admin-profile-permissions-title">Permissions Aktif</h2>
        <ul class="roles-perm-list" aria-label="Daftar permission aktif">
          <li
            v-for="perm in store.principal.permissions"
            :key="perm"
            class="roles-perm-item"
          >
            <code>{{ perm }}</code>
          </li>
        </ul>
      </section>
    </article>
  </section>
</template>
