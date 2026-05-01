<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Inbox, RefreshCw } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import { useAdminStore } from '@/stores/admin'
import { formatDateTime } from '@shared/format'

const admin = useAdminStore()
const isLoading = computed(() => admin.status === 'loading')

onMounted(() => {
  admin.loadUsers()
})
</script>

<template>
  <section class="content-stack" aria-labelledby="identity-title">
    <PageHeader eyebrow="Identity" title="Users" description="Manajemen pengguna admin dan konteks risiko terkini." />

    <div class="toolbar" role="toolbar" aria-label="Aksi pengguna">
      <button
        class="button button--secondary"
        type="button"
        :disabled="isLoading"
        :aria-busy="isLoading"
        @click="admin.loadUsers"
      >
        <RefreshCw :size="18" aria-hidden="true" />
        Refresh
      </button>
    </div>

    <div v-if="admin.users.length > 0" class="data-table" role="table" aria-label="Daftar pengguna">
      <div class="data-row data-row--head" role="row" aria-hidden="true">
        <span role="columnheader">Pengguna</span>
        <span role="columnheader">Role</span>
        <span role="columnheader">Risiko</span>
        <span role="columnheader">Login Terakhir</span>
      </div>
      <RouterLink
        v-for="user in admin.users"
        :key="user.subject_id"
        class="data-row"
        :to="`/users/${user.subject_id}`"
        role="row"
        :aria-label="`${user.display_name}, role ${user.role}, risiko ${user.login_context?.risk_score ?? 0}`"
      >
        <span data-label="Pengguna" role="cell">
          <strong>{{ user.display_name }}</strong>
          <small>{{ user.email }}</small>
        </span>
        <span data-label="Role" role="cell">{{ user.role }}</span>
        <span data-label="Risiko" role="cell">{{ user.login_context?.risk_score ?? 0 }}</span>
        <span data-label="Login Terakhir" role="cell">{{ formatDateTime(user.last_login_at) }}</span>
      </RouterLink>
    </div>

    <div v-else class="panel panel-empty--large" role="status">
      <Inbox :size="32" aria-hidden="true" />
      <h3>Belum ada pengguna</h3>
      <p>Data pengguna akan muncul setelah ada aktivitas login melalui SSO.</p>
    </div>
  </section>
</template>
