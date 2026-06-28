import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import UsersTable, { type UsersTableRow } from '../UsersTable.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'

// Rows read clearly as samples (Swiss: no fabricated personas). They are already
// masked + localized by the page — this component is dumb.
const rows: readonly UsersTableRow[] = [
  {
    id: 'usr_sample_001',
    displayName: 'Operator Satu',
    email: 'operator.satu@example.test',
    role: 'admin',
    status: 'Aktif',
    statusTone: 'success',
  },
  {
    id: 'usr_sample_002',
    displayName: 'Operator Dua',
    email: 'operator.dua@example.test',
    role: 'user',
    status: 'Terkunci',
    statusTone: 'danger',
  },
  {
    id: 'usr_sample_003',
    displayName: 'Operator Tiga',
    email: 'operator.tiga@example.test',
    role: 'pegawai',
    status: 'Deaktivasi',
    statusTone: 'neutral',
  },
]

function mountTable() {
  return mount(UsersTable, {
    props: {
      caption: 'Akun Pengguna',
      userLabel: 'Pengguna',
      emailLabel: 'Surel',
      roleLabel: 'Peran',
      statusLabel: 'Status',
      viewLabel: 'Lihat',
      rows,
      total: 14,
      page: 1,
      pageCount: 3,
      nextLabel: 'Berikutnya',
      previousLabel: 'Sebelumnya',
    },
  })
}

describe('UsersTable', () => {
  it("renders the caption, the column labels, and every row's fields", () => {
    const wrapper = mountTable()
    expect(wrapper.text()).toContain('Akun Pengguna')
    expect(wrapper.text()).toContain('Pengguna')
    expect(wrapper.text()).toContain('Surel')
    expect(wrapper.text()).toContain('Peran')
    expect(wrapper.text()).toContain('Status')
    expect(wrapper.text()).toContain('Operator Satu')
    expect(wrapper.text()).toContain('operator.dua@example.test')
    expect(wrapper.text()).toContain('pegawai')
  })

  it('renders account status as a UiStatusBadge per row — tone + label, never colour-alone', () => {
    const wrapper = mountTable()
    const badges = wrapper.findAllComponents(UiStatusBadge)
    expect(badges).toHaveLength(rows.length)
    expect(badges.map((b) => b.props('tone'))).toEqual(['success', 'danger', 'neutral'])
    // every badge carries a real text label (the shape/dot never stands alone)
    expect(badges.map((b) => b.props('label'))).toEqual(['Aktif', 'Terkunci', 'Deaktivasi'])
  })

  it('emits select(id) with the row subject id when the row view action is clicked', async () => {
    const wrapper = mountTable()
    const viewButtons = wrapper.findAll('[data-testid="users-row-view"]')
    expect(viewButtons).toHaveLength(rows.length)
    expect(viewButtons[0]!.text()).toBe('Lihat')
    await viewButtons[1]!.trigger('click')
    expect(wrapper.emitted('select')).toEqual([['usr_sample_002']])
  })

  it('re-emits next() / previous() from the folio pagination controls', async () => {
    const wrapper = mountTable()
    await wrapper.get('[data-testid="data-list-next"]').trigger('click')
    await wrapper.get('[data-testid="data-list-previous"]').trigger('click')
    expect(wrapper.emitted('next')).toHaveLength(1)
    expect(wrapper.emitted('previous')).toHaveLength(1)
  })

  it('renders the page position as a folio numeral (page / pageCount)', () => {
    const wrapper = mountTable()
    expect(wrapper.get('[data-testid="users-page-folio"]').text()).toMatch(/01\s*\/\s*03/)
  })

  it('omits the page folio when page / pageCount are not provided', () => {
    const wrapper = mount(UsersTable, {
      props: {
        caption: 'Akun Pengguna',
        userLabel: 'Pengguna',
        emailLabel: 'Surel',
        roleLabel: 'Peran',
        statusLabel: 'Status',
        viewLabel: 'Lihat',
        rows,
        total: 3,
      },
    })
    expect(wrapper.find('[data-testid="users-page-folio"]').exists()).toBe(false)
    // no pagination buttons without labels
    expect(wrapper.find('[data-testid="data-list-next"]').exists()).toBe(false)
  })

  it('renders no token value/name and no raw-PII digit run (16/18/10) in its HTML', () => {
    const html = mountTable().html()
    expect(html).not.toMatch(/access_token|refresh_token|id_token|Bearer|SENTINEL-/)
    // raw NIK (16) / NIP (18) / NISN (10) shapes: any unbroken 10+ digit run is a leak.
    expect(html).not.toMatch(/\d{10,}/)
  })
})
