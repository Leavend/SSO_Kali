<script setup lang="ts">
import { onMounted } from 'vue'
import { Inbox, RefreshCw } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import { useAdminStore } from '@/stores/admin'

const admin = useAdminStore()

onMounted(() => {
  admin.loadClients()
})
</script>

<template>
  <section class="content-stack">
    <PageHeader eyebrow="OIDC" title="Aplikasi" description="Client terdaftar yang dilayani melalui SSO broker." />

    <div class="toolbar">
      <button class="button button--secondary" type="button" @click="admin.loadClients">
        <RefreshCw :size="18" aria-hidden="true" />
        Refresh
      </button>
    </div>

    <div v-if="admin.clients.length > 0" class="apps-grid">
      <article v-for="client in admin.clients" :key="client.client_id" class="panel">
        <div class="panel-title">
          <h2>{{ client.client_id }}</h2>
          <span class="pill">{{ client.type }}</span>
        </div>
        <div class="detail-grid">
          <span>Redirect URI</span>
          <strong>{{ client.redirect_uris.length }}</strong>
          <span>Backchannel</span>
          <strong>{{ client.backchannel_logout_internal ? 'Internal' : 'External' }}</strong>
          <span>Logout URI</span>
          <strong>{{ client.backchannel_logout_uri ?? '-' }}</strong>
        </div>
      </article>
    </div>

    <div v-else class="panel panel-empty--large">
      <Inbox :size="32" aria-hidden="true" />
      <h3>Belum ada aplikasi terdaftar</h3>
      <p>Gunakan prosedur integrasi client di dashboard untuk mendaftarkan aplikasi baru.</p>
    </div>
  </section>
</template>
