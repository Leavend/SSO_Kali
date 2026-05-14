<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Download, Inbox, RefreshCw, ShieldOff } from 'lucide-vue-next'
import PageHeader from '@/web/components/PageHeader.vue'
import DataTable from '@/web/components/ui/DataTable.vue'
import FilterBar from '@/web/components/ui/FilterBar.vue'
import BulkActionBar from '@/web/components/ui/BulkActionBar.vue'
import TablePagination from '@/web/components/ui/TablePagination.vue'
import Badge from '@/web/components/ui/Badge.vue'
import ConfirmDialog from '@/web/components/ui/ConfirmDialog.vue'
import { useAdminStore } from '@/web/stores/admin'
import { formatDateTime } from '@shared/format'

const admin = useAdminStore()
const isLoading = computed(() => admin.status === 'loading')

// Filter & Pagination state
const searchQuery = ref('')
const activeFilters = ref<Record<string, string[]>>({})
const selectedUsers = ref<string[]>([])
const currentPage = ref(1)
const pageSize = ref(10)
const bulkConfirmOpen = ref(false)
const pendingBulkAction = ref<string | null>(null)
const bulkActions = [
  { label: 'Export CSV', icon: Download, action: 'export' },
  { label: 'Cabut Sesi', icon: ShieldOff, variant: 'danger' as const, action: 'revoke-sessions' },
]

// Filter config
const filters = ref([
  {
    key: 'role',
    label: 'Role',
    options: [
      { value: 'admin', label: 'Admin' },
      { value: 'user', label: 'User' },
    ],
    selected: [] as string[],
  },
  {
    key: 'risk',
    label: 'Risiko',
    options: [
      { value: 'high', label: 'Tinggi' },
      { value: 'medium', label: 'Sedang' },
      { value: 'low', label: 'Rendah' },
    ],
    selected: [] as string[],
  },
])

// Columns config
const columns = [
  { key: 'display_name', label: 'Pengguna', sortable: true },
  { key: 'role', label: 'Role', sortable: true },
  { key: 'risk_score', label: 'Risiko', sortable: true },
  { key: 'last_login_at', label: 'Login Terakhir', sortable: true },
]

// Filtered & paginated data
const filteredUsers = computed(() => {
  let result = [...admin.users]

  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(user =>
      user.display_name.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query)
    )
  }

  // Role filter
  if (activeFilters.value.role?.length) {
    result = result.filter(user => activeFilters.value.role.includes(user.role))
  }

  // Risk filter
  if (activeFilters.value.risk?.length) {
    result = result.filter(user => {
      const score = user.login_context?.risk_score ?? 0
      return activeFilters.value.risk.some(risk => {
        if (risk === 'high') return score >= 7
        if (risk === 'medium') return score >= 4 && score < 7
        if (risk === 'low') return score < 4
        return false
      })
    })
  }

  return result
})

const paginatedUsers = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredUsers.value.slice(start, start + pageSize.value)
})

const totalPages = computed(() => Math.ceil(filteredUsers.value.length / pageSize.value))

onMounted(() => {
  admin.loadUsers()
})

function handleSearch(value: string) {
  searchQuery.value = value
  currentPage.value = 1
}

function handleFilterUpdate(newFilters: Record<string, string[]>) {
  activeFilters.value = newFilters
  currentPage.value = 1
}

function handleSort() {
  currentPage.value = 1
}

function handleSelect(selected: string[]) {
  selectedUsers.value = selected
}

function handleBulkAction(action: string) {
  if (action === 'revoke-sessions') {
    pendingBulkAction.value = action
    bulkConfirmOpen.value = true
  } else if (action === 'export') {
    exportSelectedUsers()
    selectedUsers.value = []
  }
}

async function confirmBulkAction() {
  if (pendingBulkAction.value === 'revoke-sessions') {
    await Promise.all(selectedUsers.value.map((subjectId) => admin.revokeUserSessions(subjectId)))
    selectedUsers.value = []
  }
  pendingBulkAction.value = null
  bulkConfirmOpen.value = false
}

function exportSelectedUsers() {
  const selected = admin.users.filter(user => selectedUsers.value.includes(user.subject_id))
  const rows = selected.map(user => [
    user.subject_id,
    user.display_name,
    user.email,
    user.role,
    String(user.login_context?.risk_score ?? 0),
    user.last_login_at,
  ])
  const csv = [
    ['subject_id', 'display_name', 'email', 'role', 'risk_score', 'last_login_at'],
    ...rows,
  ].map(row => row.map(escapeCsvCell).join(',')).join('\n')

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `sso-users-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function escapeCsvCell(value: string | null | undefined) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function getUserRow(row: unknown) {
  return row as typeof admin.users[number]
}

function getRiskScore(row: unknown) {
  return getUserRow(row).login_context?.risk_score ?? 0
}
</script>

<template>
  <section class="content-stack" aria-labelledby="identity-title">
    <PageHeader eyebrow="Identity" title="Users" description="Manajemen pengguna admin dan konteks risiko terkini." />

    <!-- Toolbar -->
    <div class="toolbar" role="toolbar" aria-label="Aksi pengguna">
      <button
        class="button button--secondary"
        type="button"
        :disabled="isLoading"
        :aria-busy="isLoading"
        @click="admin.loadUsers"
      >
        <RefreshCw :size="18" aria-hidden="true" :class="{ 'animate-spin': isLoading }" />
        Refresh
      </button>
    </div>

    <!-- Filter Bar -->
    <FilterBar
      :filters="filters"
      search-placeholder="Cari pengguna..."
      @update:search="handleSearch"
      @update:filters="handleFilterUpdate"
    />

    <!-- Bulk Action Bar -->
    <BulkActionBar
      :selected-count="selectedUsers.length"
      :actions="bulkActions"
      @action="handleBulkAction"
      @clear="selectedUsers = []"
    />

    <!-- Data Table -->
    <DataTable
      :columns="columns"
      :data="paginatedUsers"
      :loading="isLoading"
      :selectable="true"
      row-key="subject_id"
      @sort="handleSort"
      @select="handleSelect"
    >
      <template #empty>
        <Inbox :size="32" aria-hidden="true" />
        <h3>Belum ada pengguna</h3>
        <p>Data pengguna akan muncul setelah ada aktivitas login melalui SSO.</p>
      </template>

      <template #cell-display_name="{ row }">
        <div class="user-cell">
          <strong>{{ getUserRow(row).display_name }}</strong>
          <small>{{ getUserRow(row).email }}</small>
        </div>
      </template>

      <template #cell-role="{ row }">
        <Badge :variant="getUserRow(row).role === 'admin' ? 'info' : 'neutral'" size="sm">
          {{ getUserRow(row).role }}
        </Badge>
      </template>

      <template #cell-risk_score="{ row }">
        <Badge
          :variant="getRiskScore(row) >= 7 ? 'danger' : getRiskScore(row) >= 4 ? 'warning' : 'success'"
          size="sm"
        >
          {{ getRiskScore(row) }}
        </Badge>
      </template>

      <template #cell-last_login_at="{ row }">
        {{ formatDateTime(getUserRow(row).last_login_at) }}
      </template>
    </DataTable>

    <!-- Pagination -->
    <TablePagination
      v-if="filteredUsers.length > 0"
      :current-page="currentPage"
      :total-pages="totalPages"
      :total-items="filteredUsers.length"
      :page-size="pageSize"
      @update:current-page="currentPage = $event"
      @update:page-size="pageSize = $event; currentPage = 1"
    />

    <!-- Bulk Delete Confirmation -->
    <ConfirmDialog
      v-model="bulkConfirmOpen"
      title="Cabut Sesi Pengguna?"
      :message="`Apakah Anda yakin ingin mencabut semua sesi untuk ${selectedUsers.length} pengguna terpilih? Pengguna yang terdampak perlu login ulang.`"
      confirm-label="Ya, Cabut Sesi"
      cancel-label="Batal"
      danger
      @confirm="confirmBulkAction"
    />
  </section>
</template>

<style scoped>
.user-cell {
  display: grid;
  gap: 2px;
}

.user-cell strong {
  color: var(--admin-ink);
  font-weight: 600;
}

.user-cell small {
  color: var(--admin-subtle);
  font-size: var(--text-xs);
}

/* Toolbar enhancement */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin: var(--space-4) 0;
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .animate-spin {
    animation: none;
  }
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .button {
    border-width: 2px;
  }
}
</style>
