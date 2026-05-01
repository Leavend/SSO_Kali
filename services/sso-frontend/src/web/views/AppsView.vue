<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Inbox, RefreshCw } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import { useAdminStore } from '@/stores/admin'

const admin = useAdminStore()
const isLoading = computed(() => admin.status === 'loading')

onMounted(() => {
  admin.loadClients()
})
</script>

<template>
  <section class="content-stack" aria-labelledby="oidc-title">
    <PageHeader eyebrow="OIDC" title="Aplikasi" description="Client terdaftar yang dilayani melalui SSO broker." />

    <div class="toolbar" role="toolbar" aria-label="Aksi aplikasi">
      <button
        class="button button--secondary"
        type="button"
        :disabled="isLoading"
        :aria-busy="isLoading"
        @click="admin.loadClients"
      >
        <RefreshCw :size="18" aria-hidden="true" />
        Refresh
      </button>
    </div>

    <div v-if="admin.clients.length > 0" class="apps-grid">
      <article
        v-for="client in admin.clients"
        :key="client.client_id"
        class="panel"
        :aria-label="`Client: ${client.client_id}`"
      >
        <div class="panel-title">
          <h2>{{ client.client_id }}</h2>
          <span class="pill" role="status">{{ client.type }}</span>
        </div>
        <dl class="detail-grid" aria-label="Detail client">
          <dt>Redirect URI</dt>
          <dd>{{ client.redirect_uris.length }}</dd>
          <dt>Backchannel</dt>
          <dd>{{ client.backchannel_logout_internal ? 'Internal' : 'External' }}</dd>
          <dt>Logout URI</dt>
          <dd>{{ client.backchannel_logout_uri ?? '-' }}</dd>
        </dl>
      </article>
    </div>

    <div v-else class="panel panel-empty--large" role="status">
      <Inbox :size="32" aria-hidden="true" />
      <h3>Belum ada aplikasi terdaftar</h3>
      <p>Gunakan prosedur integrasi client di dashboard untuk mendaftarkan aplikasi baru.</p>
    </div>
  </section>
</template>

<style scoped>
.detail-grid {
  margin: 0;
}

.detail-grid dt {
  color: var(--admin-subtle, #64748b);
  font-size: var(--text-sm, 13px);
  font-weight: 600;
}

.detail-grid dd {
  margin: 0;
  overflow-wrap: anywhere;
  font-weight: 600;
  color: var(--admin-ink, #0f172a);
}
</style>
