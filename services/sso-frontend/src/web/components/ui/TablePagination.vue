<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
  maxVisible?: number
}>(), {
  maxVisible: 5,
})

const emit = defineEmits<{
  'update:currentPage': [page: number]
  'update:pageSize': [size: number]
}>()

const pageSizeOptions = [10, 20, 50, 100]

const startItem = computed(() => {
  return (props.currentPage - 1) * props.pageSize + 1
})

const endItem = computed(() => {
  return Math.min(props.currentPage * props.pageSize, props.totalItems)
})

const visiblePages = computed(() => {
  const pages: (number | 'ellipsis')[] = []
  const { currentPage, totalPages, maxVisible } = props

  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  // Always show first page
  pages.push(1)

  if (currentPage > 3) {
    pages.push('ellipsis')
  }

  // Show pages around current
  const start = Math.max(2, currentPage - 1)
  const end = Math.min(totalPages - 1, currentPage + 1)

  for (let i = start; i <= end; i++) {
    if (!pages.includes(i)) {
      pages.push(i)
    }
  }

  if (currentPage < totalPages - 2) {
    pages.push('ellipsis')
  }

  // Always show last page
  if (!pages.includes(totalPages)) {
    pages.push(totalPages)
  }

  return pages
})

function goToPage(page: number) {
  if (page >= 1 && page <= props.totalPages && page !== props.currentPage) {
    emit('update:currentPage', page)
  }
}

function previousPage() {
  goToPage(props.currentPage - 1)
}

function nextPage() {
  goToPage(props.currentPage + 1)
}
</script>

<template>
  <div class="table-pagination" role="navigation" :aria-label="'Pagination'">
    <div class="table-pagination__info">
      <span class="table-pagination__range">
        {{ startItem }}-{{ endItem }} dari {{ totalItems }}
      </span>
      <select
        :value="pageSize"
        class="table-pagination__select"
        aria-label="Items per page"
        @change="$emit('update:pageSize', Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="size in pageSizeOptions" :key="size" :value="size">
          {{ size }} per halaman
        </option>
      </select>
    </div>

    <div class="table-pagination__controls">
      <button
        type="button"
        class="table-pagination__btn"
        :disabled="currentPage === 1"
        aria-label="Previous page"
        @click="previousPage"
      >
        <ChevronLeft :size="18" aria-hidden="true" />
      </button>

      <template v-for="page in visiblePages" :key="page">
        <span v-if="page === 'ellipsis'" class="table-pagination__ellipsis">...</span>
        <button
          v-else
          type="button"
          class="table-pagination__page"
          :class="{ 'table-pagination__page--active': page === currentPage }"
          :aria-current="page === currentPage ? 'page' : undefined"
          :aria-label="`Page ${page}`"
          @click="goToPage(page as number)"
        >
          {{ page }}
        </button>
      </template>

      <button
        type="button"
        class="table-pagination__btn"
        :disabled="currentPage === totalPages"
        aria-label="Next page"
        @click="nextPage"
      >
        <ChevronRight :size="18" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.table-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-4);
  padding: var(--space-4);
  background: var(--admin-panel);
  border: 1px solid var(--admin-line);
  border-radius: var(--radius-lg);
}

.table-pagination__info {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.table-pagination__range {
  color: var(--admin-muted);
  font-size: var(--text-sm);
}

.table-pagination__select {
  height: 36px;
  padding: 0 var(--space-8) 0 var(--space-3);
  color: var(--admin-ink);
  background: var(--admin-panel-muted);
  border: 1px solid var(--admin-line);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  color: var(--admin-ink);
}

.table-pagination__controls {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.table-pagination__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: var(--admin-muted);
  background: var(--admin-panel-muted);
  border: 1px solid var(--admin-line);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--duration-fast) ease;
}

.table-pagination__btn:hover:not(:disabled) {
  color: var(--admin-ink);
  background: var(--admin-line);
}

.table-pagination__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.table-pagination__page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 36px;
  padding: 0 var(--space-2);
  color: var(--admin-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) ease;
}

.table-pagination__page:hover:not(:disabled) {
  color: var(--admin-ink);
  background: var(--admin-panel-muted);
}

.table-pagination__page--active {
  color: var(--admin-accent-ink);
  background: var(--admin-accent);
  border-color: var(--admin-accent);
}

.table-pagination__ellipsis {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: var(--admin-subtle);
}

@media (max-width: 640px) {
  .table-pagination {
    flex-direction: column;
    gap: var(--space-3);
  }

  .table-pagination__info {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
  }

  .table-pagination__controls {
    width: 100%;
    justify-content: center;
  }
}
</style>