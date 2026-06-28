<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { isGranted, type RoleGrantMap } from '@/lib/roles/roles-matrix'
import type { AdminPermission, AdminRole } from '@/types/users.types'

const props = withDefaults(
  defineProps<{
    readonly roles: readonly AdminRole[]
    readonly permissions: readonly AdminPermission[]
    readonly grants: RoleGrantMap
    readonly caption: string
    readonly permissionLabel: string
    readonly categoryLabel: string
    readonly grantedLabel: string
    readonly deniedLabel: string
    readonly saveLabel: string
    readonly canWrite?: boolean
    readonly dirtyRoleSlugs?: readonly string[]
  }>(),
  {
    canWrite: false,
    dirtyRoleSlugs: () => [],
  },
)

const emit = defineEmits<{
  (event: 'toggle', payload: { roleSlug: string; permissionSlug: string; granted: boolean }): void
  (event: 'save', roleSlug: string): void
}>()

// Permissions grouped by category (stable sort: category then name) so the
// table reads as category blocks — no bespoke grouped grid needed.
const sortedPermissions = computed<readonly AdminPermission[]>(() =>
  [...props.permissions].sort(
    (a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name),
  ),
)

const permissionLookup = computed<ReadonlyMap<string, AdminPermission>>(
  () => new Map(props.permissions.map((p) => [p.slug, p])),
)

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'permission', label: props.permissionLabel, align: 'left' },
  ...props.roles.map((role) => ({ key: role.slug, label: role.name, align: 'left' as const })),
])

const rows = computed<readonly UiDataListRow[]>(() =>
  sortedPermissions.value.map((p) => ({
    id: p.slug,
    permission: p.name,
  })),
)

// System roles are protected (read-only badge, no Save); only custom roles are editable.
const editableRoles = computed<readonly AdminRole[]>(() =>
  props.roles.filter((role) => !role.is_system),
)

function cellSlotName(slug: string): string {
  return `cell(${slug})`
}

function categoryOf(rowId: string): string {
  return permissionLookup.value.get(rowId)?.category ?? '—'
}

function granted(roleSlug: string, permSlug: string): boolean {
  return isGranted(props.grants, roleSlug, permSlug)
}

function onToggle(roleSlug: string, permSlug: string, value: boolean): void {
  emit('toggle', { roleSlug, permissionSlug: permSlug, granted: value })
}

function saveEnabled(slug: string): boolean {
  return props.canWrite && props.dirtyRoleSlugs.includes(slug)
}
</script>

<template>
  <div class="role-matrix" data-component="role-matrix">
    <UiDataList :caption="caption" :columns="columns" :rows="rows">
      <template #cell(permission)="{ row }">
        <span class="role-matrix__perm">
          <span class="role-matrix__perm-name">{{ row['permission'] }}</span>
          <span class="role-matrix__perm-cat">{{ categoryLabel }}: {{ categoryOf(row.id) }}</span>
        </span>
      </template>

      <!-- ponytail: v-for + dynamic slot — one slot fn per role column. No bespoke grid. -->
      <template v-for="role in roles" :key="role.slug" #[cellSlotName(role.slug)]="{ row }">
        <UiSwitch
          v-if="!role.is_system"
          :data-testid="`role-cell-${role.slug}-${row.id}`"
          :model-value="granted(role.slug, row.id)"
          label=""
          :aria-label="`${role.name}: ${row['permission']}`"
          :disabled="!canWrite"
          @update:model-value="onToggle(role.slug, row.id, $event)"
        />
        <UiStatusBadge
          v-else
          :data-testid="`role-cell-${role.slug}-${row.id}`"
          :tone="granted(role.slug, row.id) ? 'success' : 'neutral'"
          :label="granted(role.slug, row.id) ? grantedLabel : deniedLabel"
        />
      </template>
    </UiDataList>

    <div class="role-matrix__folio">
      <span data-testid="role-matrix-role-folio">
        <UiFolio :index="roles.length" :total="roles.length" variant="count" />
      </span>
      <span data-testid="role-matrix-permission-folio">
        <UiFolio :index="permissions.length" :total="permissions.length" variant="count" />
      </span>
    </div>

    <div v-if="editableRoles.length" class="role-matrix__saves">
      <UiButton
        v-for="role in editableRoles"
        :key="role.slug"
        :data-testid="`role-save-${role.slug}`"
        variant="secondary"
        size="sm"
        :disabled="!saveEnabled(role.slug)"
        @click="emit('save', role.slug)"
      >
        {{ role.name }} · {{ saveLabel }}
      </UiButton>
    </div>
  </div>
</template>

<style scoped>
.role-matrix {
  display: grid;
  gap: 12px;
}
.role-matrix__perm {
  display: grid;
  gap: 2px;
}
.role-matrix__perm-name {
  font: 500 0.8125rem/1.2 var(--font-sans);
  color: var(--fg);
}
.role-matrix__perm-cat {
  font: 400 0.6875rem/1.2 var(--font-sans);
  color: var(--fg-3);
}
.role-matrix__folio {
  display: flex;
  justify-content: flex-end;
  gap: 16px;
  color: var(--fg-3);
}
.role-matrix__saves {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
</style>
