import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import RoleMatrix from '../RoleMatrix.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import { buildRoleGrantMap } from '@/lib/roles/roles-matrix'
import type { AdminPermission, AdminRole } from '@/types/users.types'

// Rows read clearly as samples (Swiss: no fabricated personas). Slugs/names are
// public config; counts are small so no digit run can read as raw PII.
const PERMISSIONS: readonly AdminPermission[] = [
  { slug: 'roles.read', name: 'Read roles', description: null, category: 'Roles' },
  { slug: 'roles.write', name: 'Write roles', description: null, category: 'Roles' },
  { slug: 'users.read', name: 'Read users', description: null, category: 'Users' },
]

const ROLES: readonly AdminRole[] = [
  {
    id: 1,
    slug: 'editor',
    name: 'Editor',
    description: null,
    is_system: false,
    permissions: [{ slug: 'roles.read', name: 'Read roles', category: 'Roles' }],
    user_count: 3,
    users_count: 3,
  },
  {
    id: 2,
    slug: 'admin',
    name: 'Administrator',
    description: null,
    is_system: true,
    permissions: [
      { slug: 'roles.read', name: 'Read roles', category: 'Roles' },
      { slug: 'roles.write', name: 'Write roles', category: 'Roles' },
      { slug: 'users.read', name: 'Read users', category: 'Users' },
    ],
    user_count: 2,
    users_count: 2,
  },
]

function mountMatrix(overrides: { canWrite?: boolean; dirtyRoleSlugs?: readonly string[] } = {}) {
  return mountSuspended(RoleMatrix, {
    props: {
      roles: ROLES,
      permissions: PERMISSIONS,
      grants: buildRoleGrantMap(ROLES),
      caption: 'Matriks peran',
      permissionLabel: 'Izin',
      categoryLabel: 'Kategori',
      grantedLabel: 'Diberikan',
      deniedLabel: 'Ditolak',
      saveLabel: 'Simpan',
      canWrite: overrides.canWrite ?? true,
      dirtyRoleSlugs: overrides.dirtyRoleSlugs ?? [],
    },
  })
}

describe('RoleMatrix', () => {
  it('renders the caption, the per-role column headers, and a row per permission', async () => {
    const wrapper = await mountMatrix()
    expect(wrapper.text()).toContain('Matriks peran')
    expect(wrapper.text()).toContain('Editor')
    expect(wrapper.text()).toContain('Administrator')
    expect(wrapper.text()).toContain('Read roles')
    expect(wrapper.text()).toContain('Read users')
    // permission cell carries the category sub-label
    expect(wrapper.text()).toContain('Kategori')
  })

  it('renders an editable UiSwitch in every custom-role column cell, reflecting the grant', async () => {
    const wrapper = await mountMatrix()
    const switches = wrapper.findAllComponents(UiSwitch)
    // one switch per permission for the single custom column ('editor')
    expect(switches).toHaveLength(PERMISSIONS.length)
    // every switch belongs to the custom column, never the system column
    const ids = switches.map((s) => s.attributes('data-testid'))
    expect(ids.every((id) => id?.startsWith('role-cell-editor-'))).toBe(true)
    // a11y label names role + permission even though the column header repeats it
    const readRolesSwitch = wrapper.get('[data-testid="role-cell-editor-roles.read"]')
    expect(readRolesSwitch.get('button[role="switch"]').attributes('aria-label')).toBe(
      'Editor: Read roles',
    )
    expect(readRolesSwitch.get('button[role="switch"]').attributes('aria-checked')).toBe('true')
    expect(
      wrapper
        .get('[data-testid="role-cell-editor-roles.write"]')
        .get('button[role="switch"]')
        .attributes('aria-checked'),
    ).toBe('false')
  })

  it('renders a read-only UiStatusBadge (granted/denied) for the system-role column — never a switch', async () => {
    const wrapper = await mountMatrix()
    // no switch carries a system-column id
    const switchIds = wrapper.findAllComponents(UiSwitch).map((s) => s.attributes('data-testid'))
    expect(switchIds.some((id) => id?.startsWith('role-cell-admin-'))).toBe(false)
    // the system column renders a badge per permission, all granted here
    const badges = wrapper.findAllComponents(UiStatusBadge)
    expect(badges).toHaveLength(PERMISSIONS.length)
    expect(badges.map((b) => b.props('label'))).toEqual(['Diberikan', 'Diberikan', 'Diberikan'])
    // shape/label, never colour-alone
    expect(wrapper.get('[data-testid="role-cell-admin-users.read"]').text()).toContain('Diberikan')
  })

  it('emits toggle({ roleSlug, permissionSlug, granted }) with the inverted grant on a switch click', async () => {
    const wrapper = await mountMatrix()
    await wrapper
      .get('[data-testid="role-cell-editor-roles.write"]')
      .get('button[role="switch"]')
      .trigger('click')
    expect(wrapper.emitted('toggle')).toEqual([
      [{ roleSlug: 'editor', permissionSlug: 'roles.write', granted: true }],
    ])
  })

  it('disables custom-column switches when canWrite is false (read-only matrix)', async () => {
    const wrapper = await mountMatrix({ canWrite: false })
    const button = wrapper
      .get('[data-testid="role-cell-editor-roles.read"]')
      .get('button[role="switch"]')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('enables a per-role Save only when its slug is dirty and canWrite, and emits save(slug)', async () => {
    const dirty = await mountMatrix({ canWrite: true, dirtyRoleSlugs: ['editor'] })
    const save = dirty.get('[data-testid="role-save-editor"]')
    expect(save.attributes('disabled')).toBeUndefined()
    await save.trigger('click')
    expect(dirty.emitted('save')).toEqual([['editor']])

    const clean = await mountMatrix({ canWrite: true, dirtyRoleSlugs: [] })
    expect(clean.get('[data-testid="role-save-editor"]').attributes('disabled')).toBeDefined()
    // system roles are never editable → never get a Save affordance
    expect(clean.find('[data-testid="role-save-admin"]').exists()).toBe(false)
  })

  it('renders role/permission counts as visible folio numerals', async () => {
    const wrapper = await mountMatrix()
    expect(wrapper.get('[data-testid="role-matrix-role-folio"]').text()).toMatch(/02\s*\/\s*02/)
    expect(wrapper.get('[data-testid="role-matrix-permission-folio"]').text()).toMatch(
      /03\s*\/\s*03/,
    )
  })

  it('renders no token value/name and no raw-PII digit run (16/18/10) in its HTML', async () => {
    const html = (await mountMatrix()).html()
    expect(html).not.toMatch(/access_token|refresh_token|id_token|Bearer|SENTINEL-/)
    // role/permission slugs are public config; only an unbroken 10+ digit run is a leak.
    expect(html).not.toMatch(/\d{10,}/)
  })
})
