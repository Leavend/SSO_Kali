<script setup lang="ts">
import { onMounted } from 'vue'
import { Inbox, RefreshCw } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import { useAdminStore } from '@/stores/admin'
import { formatDateTime } from '@shared/format'

const admin = useAdminStore()

onMounted(() => {
  admin.loadUsers()
})
</script>

<template>
  <section class="content-stack">
    <PageHeader eyebrow="Identity" title="Users" description="Manajemen pengguna admin dan konteks risiko terkini." />

    <div class="toolbar">
      <button class="button button--secondary" type="button" @click="admin.loadUsers">
        <RefreshCw :size="18" aria-hidden="true" />
        Refresh
      </button>
    </div>

    <div v-if="admin.users.length > 0" class="data-table">
      <div class="data-row data-row--head">
        <span>Pengguna</span>
        <span>Role</span>
        <span>Risiko</span>
        <span>Login Terakhir</span>
      </div>
      <RouterLink v-for="user in admin.users" :key="user.subject_id" class="data-row" :to="`/users/${user.subject_id}`">
        <span>
          <strong>{{ user.display_name }}</strong>
          <small>{{ user.email }}</small>
        </span>
        <span>{{ user.role }}</span>
        <span>{{ user.login_context?.risk_score ?? 0 }}</span>
        <span>{{ formatDateTime(user.last_login_at) }}</span>
      </RouterLink>
    </div>

    <div v-else class="panel panel-empty--large">
      <Inbox :size="32" aria-hidden="true" />
      <h3>Belum ada pengguna</h3>
      <p>Data pengguna akan muncul setelah ada aktivitas login melalui SSO.</p>
    </div>
  </section>
</template>
