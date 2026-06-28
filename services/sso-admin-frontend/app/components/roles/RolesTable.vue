<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import { resolveRoleStatusTone } from '@/lib/roles/roles-view-state'
import type { StatusTone } from '@/lib/status-tone'
import type { AdminRole } from '@/types/users.types'

const props = withDefaults(
  defineProps<{
    readonly roles: readonly AdminRole[]
    readonly caption: string
    readonly roleLabel: string
    readonly usersLabel: string
    readonly statusLabel: string
    readonly systemLabel: string
    readonly customLabel: string
    readonly editLabel: string
    readonly managePermissionsLabel: string
    readonly deleteLabel: string
    readonly canWrite?: boolean
    readonly canDelete?: boolean
    // Pagination passthrough — mirrors UsersTable.vue. `total` is the page's
    // filteredTotal (drives the caption folio); page/pageCount drive the page folio.
    readonly total: number
    readonly page?: number
    readonly pageCount?: number
    readonly nextLabel?: string
    readonly previousLabel?: string
  }>(),
  {
    canWrite: false,
    canDelete: false,
    page: undefined,
    pageCount: undefined,
    nextLabel: undefined,
    previousLabel: undefined,
  },
)

const emit = defineEmits<{
  (event: 'select', slug: string): void
  (event: 'edit', role: AdminRole): void
  (event: 'managePermissions', role: AdminRole): void
  (event: 'delete', role: AdminRole): void
  (event: 'next'): void
  (event: 'previous'): void
}>()

const showFolio = computed<boolean>(() => props.page != null && props.pageCount != null)

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'role', label: props.roleLabel, align: 'left' },
  { key: 'users', label: props.usersLabel, align: 'left' },
  { key: 'status', label: props.statusLabel, align: 'left' },
])

const rolesBySlug = computed<ReadonlyMap<string, AdminRole>>(
  () => new Map(props.roles.map((role) => [role.slug, role])),
)

// ponytail: isSystem stored as 1/0 (number) so the row is UiDataListRow-safe
// (UiDataListRow values are string|number|null|undefined — boolean is excluded).
const rows = computed<readonly UiDataListRow[]>(() =>
  props.roles.map((role) => ({
    id: role.slug,
    role: role.name,
    slug: role.slug,
    users: role.user_count,
    status: role.is_system ? props.systemLabel : props.customLabel,
    statusTone: resolveRoleStatusTone(role.is_system) as string,
    isSystem: role.is_system ? 1 : 0,
  })),
)

// row.* arrives typed as string | number | null | undefined (UiDataListRow);
// the local row shape is well-formed, so narrow defensively for the slots.
function rowTone(value: unknown): StatusTone {
  return (typeof value === 'string' ? value : 'neutral') as StatusTone
}

function rowText(value: unknown): string {
  return value == null || value === '' ? '—' : String(value)
}

function rowCount(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

function emitFor(slug: unknown, event: 'edit' | 'managePermissions' | 'delete'): void {
  const role = rolesBySlug.value.get(String(slug))
  if (!role) return
  // ponytail: switch satisfies defineEmits overloads (union arg doesn't)
  switch (event) {
    case 'edit':
      emit('edit', role)
      break
    case 'managePermissions':
      emit('managePermissions', role)
      break
    case 'delete':
      emit('delete', role)
      break
  }
}
</script>

<template>
  <div class="roles-table" data-component="roles-table">
    <UiDataList
      :caption="caption"
      :columns="columns"
      :rows="rows"
      :total="total"
      :next-label="nextLabel"
      :previous-label="previousLabel"
      @next="emit('next')"
      @previous="emit('previous')"
    >
      <template #cell(role)="{ row }">
        <button
          type="button"
          class="roles-table__name"
          data-testid="roles-row-select"
          @click="emit('select', String(row.id))"
        >
          {{ rowText(row.role) }}
        </button>
        <span class="roles-table__slug"><UiFolio :value="String(row.slug)" /></span>
      </template>

      <template #cell(users)="{ row }">
        <span data-testid="roles-row-users">
          <UiFolio :index="rowCount(row.users)" variant="count" />
        </span>
      </template>

      <template #cell(status)="{ row }">
        <UiStatusBadge :tone="rowTone(row.statusTone)" :label="rowText(row.status)" />
      </template>

      <template #actions="{ row }">
        <UiButton
          v-if="canWrite && !row.isSystem"
          variant="ghost"
          size="sm"
          data-testid="roles-row-edit"
          @click="emitFor(row.id, 'edit')"
        >
          {{ editLabel }}
        </UiButton>
        <UiButton
          v-if="canWrite && !row.isSystem"
          variant="ghost"
          size="sm"
          data-testid="roles-row-manage"
          @click="emitFor(row.id, 'managePermissions')"
        >
          {{ managePermissionsLabel }}
        </UiButton>
        <UiButton
          v-if="canWrite && canDelete && !row.isSystem"
          variant="ghost"
          size="sm"
          data-testid="roles-row-delete"
          @click="emitFor(row.id, 'delete')"
        >
          {{ deleteLabel }}
        </UiButton>
      </template>
    </UiDataList>

    <div v-if="showFolio" class="roles-table__pagefolio">
      <span data-testid="roles-page-folio">
        <UiFolio :index="page" :total="pageCount" variant="count" />
      </span>
    </div>
  </div>
</template>

<style scoped>
.roles-table {
  display: grid;
  gap: 12px;
}
.roles-table__pagefolio {
  display: flex;
  justify-content: flex-end;
  color: var(--fg-3);
}
.roles-table__name {
  border: 0;
  background: none;
  padding: 0;
  color: var(--accent);
  font: inherit;
  cursor: pointer;
  text-align: left;
}
.roles-table__slug {
  display: block;
  color: var(--fg-3);
}
</style>
