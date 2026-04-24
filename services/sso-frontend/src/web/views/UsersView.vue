<script setup lang="ts">
import { onMounted } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
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
    <PageHeader eyebrow="Identity" title="Users" description="Admin principals and latest risk context." />

    <div class="toolbar">
      <button class="button button--secondary" type="button" @click="admin.loadUsers">
        <RefreshCw :size="18" aria-hidden="true" />
        Refresh
      </button>
    </div>

    <div class="data-table">
      <div class="data-row data-row--head">
        <span>User</span>
        <span>Role</span>
        <span>Risk</span>
        <span>Last login</span>
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
  </section>
</template>
