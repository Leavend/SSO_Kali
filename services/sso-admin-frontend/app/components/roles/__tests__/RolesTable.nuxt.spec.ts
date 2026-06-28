import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import RolesTable from '../RolesTable.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import type { AdminRole } from '@/types/users.types'

// Sample rows: already masked + localized by the page — this component is dumb.
const roles: readonly AdminRole[] = [
  {
    id: 1,
    slug: 'platform-admin',
    name: 'Platform Admin',
    description: 'Full platform control',
    is_system: true,
    permissions: [{ slug: 'admin.roles.read', name: 'Read roles', category: 'roles' }],
    user_count: 3,
    users_count: 3,
  },
  {
    id: 2,
    slug: 'helpdesk',
    name: 'Helpdesk',
    description: null,
    is_system: false,
    permissions: [],
    user_count: 7,
    users_count: 7,
  },
  {
    id: 3,
    slug: 'auditor',
    name: 'Auditor',
    description: null,
    is_system: false,
    permissions: [],
    user_count: 0,
    users_count: 0,
  },
]

const labels = {
  caption: 'Daftar Peran',
  roleLabel: 'Peran',
  usersLabel: 'Pengguna',
  statusLabel: 'Status',
  systemLabel: 'Sistem',
  customLabel: 'Kustom',
  editLabel: 'Ubah',
  managePermissionsLabel: 'Kelola Izin',
  deleteLabel: 'Hapus',
  nextLabel: 'Berikutnya',
  previousLabel: 'Sebelumnya',
}

function mountTable(overrides: Partial<{ canWrite: boolean; canDelete: boolean }> = {}) {
  return mountSuspended(RolesTable, {
    props: {
      roles,
      ...labels,
      total: 14,
      page: 1,
      pageCount: 3,
      canWrite: true,
      canDelete: true,
      ...overrides,
    },
  })
}

describe('RolesTable', () => {
  it('renders the caption, column labels, and every role name + slug', async () => {
    const wrapper = await mountTable()
    expect(wrapper.text()).toContain('Daftar Peran')
    expect(wrapper.text()).toContain('Peran')
    expect(wrapper.text()).toContain('Pengguna')
    expect(wrapper.text()).toContain('Status')
    expect(wrapper.text()).toContain('Platform Admin')
    expect(wrapper.text()).toContain('platform-admin')
    expect(wrapper.text()).toContain('helpdesk')
  })

  it('renders System vs Custom status as a UiStatusBadge — tone + label, never colour-alone', async () => {
    const wrapper = await mountTable()
    const badges = wrapper.findAllComponents(UiStatusBadge)
    expect(badges).toHaveLength(roles.length)
    expect(badges.map((b) => b.props('tone'))).toEqual(['info', 'neutral', 'neutral'])
    expect(badges.map((b) => b.props('label'))).toEqual(['Sistem', 'Kustom', 'Kustom'])
  })

  it('renders the per-role user count as a folio numeral', async () => {
    const wrapper = await mountTable()
    const folios = wrapper.findAll('[data-testid="roles-row-users"]')
    expect(folios).toHaveLength(roles.length)
    expect(folios[1]!.text()).toMatch(/07/)
  })

  it('emits select(slug) when the role name affordance is clicked', async () => {
    const wrapper = await mountTable()
    const selects = wrapper.findAll('[data-testid="roles-row-select"]')
    expect(selects).toHaveLength(roles.length)
    await selects[1]!.trigger('click')
    expect(wrapper.emitted('select')).toEqual([['helpdesk']])
  })

  it('exposes no write trigger for system roles (no Edit, Manage, or Delete)', async () => {
    const wrapper = await mountTable()
    const rows = wrapper.findAll('tbody tr')
    const systemRow = rows[0]!
    expect(systemRow.find('[data-testid="roles-row-edit"]').exists()).toBe(false)
    expect(systemRow.find('[data-testid="roles-row-manage"]').exists()).toBe(false)
    expect(systemRow.find('[data-testid="roles-row-delete"]').exists()).toBe(false)
  })

  it('renders Edit / Manage / Delete for custom roles when canWrite && canDelete', async () => {
    const wrapper = await mountTable()
    const customRow = wrapper.findAll('tbody tr')[1]!
    expect(customRow.find('[data-testid="roles-row-edit"]').exists()).toBe(true)
    expect(customRow.find('[data-testid="roles-row-manage"]').exists()).toBe(true)
    expect(customRow.find('[data-testid="roles-row-delete"]').exists()).toBe(true)
  })

  it('hides every write action when canWrite is false', async () => {
    const wrapper = await mountTable({ canWrite: false })
    expect(wrapper.find('[data-testid="roles-row-edit"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="roles-row-manage"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="roles-row-delete"]').exists()).toBe(false)
  })

  it('hides Delete only when canDelete is false (writer without delete privilege)', async () => {
    const wrapper = await mountTable({ canDelete: false })
    const customRow = wrapper.findAll('tbody tr')[1]!
    expect(customRow.find('[data-testid="roles-row-edit"]').exists()).toBe(true)
    expect(customRow.find('[data-testid="roles-row-manage"]').exists()).toBe(true)
    expect(customRow.find('[data-testid="roles-row-delete"]').exists()).toBe(false)
  })

  it('emits edit / managePermissions / delete with the full AdminRole', async () => {
    const wrapper = await mountTable()
    const customRow = wrapper.findAll('tbody tr')[1]!
    await customRow.find('[data-testid="roles-row-edit"]').trigger('click')
    await customRow.find('[data-testid="roles-row-manage"]').trigger('click')
    await customRow.find('[data-testid="roles-row-delete"]').trigger('click')
    expect(wrapper.emitted('edit')).toEqual([[roles[1]]])
    expect(wrapper.emitted('managePermissions')).toEqual([[roles[1]]])
    expect(wrapper.emitted('delete')).toEqual([[roles[1]]])
  })

  it('re-emits next() / previous() from the UiDataList pagination controls', async () => {
    const wrapper = await mountTable()
    await wrapper.get('[data-testid="data-list-next"]').trigger('click')
    await wrapper.get('[data-testid="data-list-previous"]').trigger('click')
    expect(wrapper.emitted('next')).toHaveLength(1)
    expect(wrapper.emitted('previous')).toHaveLength(1)
  })

  it('renders the page position as a folio numeral (page / pageCount)', async () => {
    const wrapper = await mountTable()
    expect(wrapper.get('[data-testid="roles-page-folio"]').text()).toMatch(/01\s*\/\s*03/)
  })

  it('omits the page folio + pagination controls when page / pageCount + labels are absent', async () => {
    const wrapper = await mountSuspended(RolesTable, {
      props: {
        roles,
        ...labels,
        nextLabel: undefined,
        previousLabel: undefined,
        total: 3,
        canWrite: true,
        canDelete: true,
      },
    })
    expect(wrapper.find('[data-testid="roles-page-folio"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="data-list-next"]').exists()).toBe(false)
  })

  it('renders no token value/name and no raw-PII digit run in its HTML', async () => {
    const html = (await mountTable()).html()
    expect(html).not.toMatch(/access_token|refresh_token|id_token|Bearer|SENTINEL-/)
    expect(html).not.toMatch(/\d{10,}/)
  })
})
