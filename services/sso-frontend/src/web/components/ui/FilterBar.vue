<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { Search, X, Filter } from 'lucide-vue-next'

export interface FilterOption {
  value: string
  label: string
}

export interface FilterConfig {
  key: string
  label: string
  options: FilterOption[]
  selected: string[]
}

const props = withDefaults(defineProps<{
  filters: FilterConfig[]
  searchPlaceholder?: string
  showSearch?: boolean
}>(), {
  searchPlaceholder: 'Cari...',
  showSearch: true,
})

const emit = defineEmits<{
  'update:search': [value: string]
  'update:filters': [filters: Record<string, string[]>]
}>()

const searchValue = ref('')
const openDropdown = ref<string | null>(null)
const localFilters = ref<FilterConfig[]>([])

function cloneFilters(filters: FilterConfig[]): FilterConfig[] {
  return filters.map(f => ({
    key: f.key,
    label: f.label,
    options: f.options,
    selected: [...f.selected],
  }))
}

watch(() => props.filters, (filters) => {
  localFilters.value = cloneFilters(filters)
}, { immediate: true, deep: true })

// Debounced search
let searchTimeout: number | undefined
watch(searchValue, (value) => {
  clearTimeout(searchTimeout)
  searchTimeout = window.setTimeout(() => {
    emit('update:search', value)
  }, 300)
})

const activeFilterCount = computed(() => {
  return localFilters.value.reduce((count, filter) => count + filter.selected.length, 0)
})

function toggleDropdown(key: string) {
  openDropdown.value = openDropdown.value === key ? null : key
}

function toggleOption(filterKey: string, value: string) {
  const filterIndex = localFilters.value.findIndex(f => f.key === filterKey)
  if (filterIndex === -1) return

  const filter = localFilters.value[filterIndex]
  const index = filter.selected.indexOf(value)
  if (index > -1) {
    filter.selected.splice(index, 1)
  } else {
    filter.selected.push(value)
  }

  emitFilters()
}

function isSelected(filterKey: string, value: string): boolean {
  const filter = localFilters.value.find(f => f.key === filterKey)
  return filter?.selected.includes(value) ?? false
}

function clearAll() {
  localFilters.value.forEach(f => { f.selected = [] })
  searchValue.value = ''
  emitFilters()
  emit('update:search', '')
}

function emitFilters() {
  const result: Record<string, string[]> = {}
  localFilters.value.forEach(f => {
    if (f.selected.length > 0) {
      result[f.key] = [...f.selected]
    }
  })
  emit('update:filters', result)
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.filter-bar__dropdown')) {
    openDropdown.value = null
  }
}

watch(openDropdown, (isOpen) => {
  if (isOpen) {
    document.addEventListener('click', handleClickOutside)
  } else {
    document.removeEventListener('click', handleClickOutside)
  }
})

onUnmounted(() => {
  clearTimeout(searchTimeout)
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="filter-bar">
    <div class="filter-bar__left">
      <!-- Search input -->
      <div v-if="showSearch" class="filter-bar__search">
        <Search :size="18" class="filter-bar__search-icon" aria-hidden="true" />
        <input
          v-model="searchValue"
          type="search"
          class="filter-bar__search-input"
          :placeholder="searchPlaceholder"
          aria-label="Search"
        />
        <button
          v-if="searchValue"
          type="button"
          class="filter-bar__clear-search"
          aria-label="Clear search"
          @click="searchValue = ''; emit('update:search', '')"
        >
          <X :size="16" aria-hidden="true" />
        </button>
      </div>

      <!-- Filter dropdowns -->
      <div
        v-for="filter in localFilters"
        :key="filter.key"
        class="filter-bar__dropdown"
      >
        <button
          type="button"
          class="filter-bar__filter-btn"
          :class="{ 'filter-bar__filter-btn--active': filter.selected.length > 0 }"
          :aria-expanded="openDropdown === filter.key"
          @click="toggleDropdown(filter.key)"
        >
          <Filter :size="16" aria-hidden="true" />
          {{ filter.label }}
          <span v-if="filter.selected.length > 0" class="filter-bar__count">
            {{ filter.selected.length }}
          </span>
        </button>

        <Transition name="dropdown">
          <div
            v-if="openDropdown === filter.key"
            class="filter-bar__menu"
            role="menu"
          >
            <button
              v-for="option in filter.options"
              :key="option.value"
              type="button"
              class="filter-bar__option"
              :class="{ 'filter-bar__option--selected': isSelected(filter.key, option.value) }"
              role="menuitemcheckbox"
              :aria-checked="isSelected(filter.key, option.value)"
              @click="toggleOption(filter.key, option.value)"
            >
              <span class="filter-bar__checkbox">
                <svg v-if="isSelected(filter.key, option.value)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              {{ option.label }}
            </button>
          </div>
        </Transition>
      </div>
    </div>

    <div class="filter-bar__right">
      <!-- Clear all -->
      <button
        v-if="activeFilterCount > 0 || searchValue"
        type="button"
        class="button button--ghost button--sm"
        @click="clearAll"
      >
        <X :size="16" aria-hidden="true" />
        Clear all
      </button>

      <!-- Active filters indicator -->
      <span v-if="activeFilterCount > 0" class="filter-bar__active-count">
        {{ activeFilterCount }} filter aktif
      </span>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--admin-panel);
  border: 1px solid var(--admin-line);
  border-radius: var(--radius-lg);
}

.filter-bar__left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.filter-bar__right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

/* Search */
.filter-bar__search {
  position: relative;
  display: flex;
  align-items: center;
}

.filter-bar__search-icon {
  position: absolute;
  left: var(--space-3);
  color: var(--admin-muted);
  pointer-events: none;
}

.filter-bar__search-input {
  width: 240px;
  height: 40px;
  padding: 0 var(--space-10) 0 var(--space-10);
  color: var(--admin-ink);
  background: var(--admin-panel-muted);
  border: 1px solid var(--admin-line);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  transition: border-color var(--duration-fast) ease;
}

.filter-bar__search-input::placeholder {
  color: var(--admin-muted);
}

.filter-bar__search-input:focus {
  outline: none;
  border-color: var(--admin-accent);
}

.filter-bar__clear-search {
  position: absolute;
  right: var(--space-2);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  color: var(--admin-muted);
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.filter-bar__clear-search:hover {
  color: var(--admin-ink);
  background: var(--admin-panel-muted);
}

/* Dropdown */
.filter-bar__dropdown {
  position: relative;
}

.filter-bar__filter-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: 40px;
  padding: 0 var(--space-3);
  color: var(--admin-muted);
  background: var(--admin-panel-muted);
  border: 1px solid var(--admin-line);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) ease;
}

.filter-bar__filter-btn:hover {
  color: var(--admin-ink);
  border-color: var(--admin-line-strong);
}

.filter-bar__filter-btn--active {
  color: var(--admin-accent);
  border-color: var(--admin-accent);
  background: var(--admin-accent-soft);
}

.filter-bar__count {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 var(--space-1-5);
  color: var(--admin-accent-ink);
  background: var(--admin-accent);
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 700;
}

.filter-bar__menu {
  position: absolute;
  top: calc(100% + var(--space-2));
  left: 0;
  z-index: 50;
  min-width: 200px;
  padding: var(--space-2);
  background: var(--admin-panel);
  border: 1px solid var(--admin-line);
  border-radius: var(--radius-lg);
  box-shadow: 0 10px 40px var(--admin-shadow-lg);
}

.filter-bar__option {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 40px;
  padding: var(--space-2) var(--space-3);
  color: var(--admin-muted);
  background: transparent;
  border: 0;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--duration-fast) ease;
}

.filter-bar__option:hover {
  color: var(--admin-ink);
  background: var(--admin-panel-muted);
}

.filter-bar__option--selected {
  color: var(--admin-accent);
}

.filter-bar__checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 2px solid var(--admin-line);
  border-radius: var(--radius-sm);
  transition: all var(--duration-fast) ease;
}

.filter-bar__option--selected .filter-bar__checkbox {
  color: var(--admin-accent-ink);
  background: var(--admin-accent);
  border-color: var(--admin-accent);
}

.filter-bar__checkbox svg {
  width: 12px;
  height: 12px;
}

/* Active count */
.filter-bar__active-count {
  color: var(--admin-subtle);
  font-size: var(--text-sm);
}

/* Transition */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 640px) {
  .filter-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-bar__left {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-bar__right {
    justify-content: flex-end;
  }

  .filter-bar__search-input {
    width: 100%;
  }

  .filter-bar__menu {
    left: 0;
    right: 0;
  }
}
</style>
