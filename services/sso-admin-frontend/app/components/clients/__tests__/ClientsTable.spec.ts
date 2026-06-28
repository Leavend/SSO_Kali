import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ClientsTable, { type ClientsTableRow } from '../ClientsTable.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'

// Rows read clearly as samples (Swiss: no fabricated personas/telemetry). They are
// already localized + masked by the page — this component is dumb. The badges land
// in column order per row: category, then status (name + clientId are plain cells).
const rows: readonly ClientsTableRow[] = [
  {
    id: 'portal-pegawai',
    name: 'Portal Pegawai',
    clientId: 'portal-pegawai',
    category: 'kepegawaian',
    status: 'Aktif',
    statusTone: 'success',
  },
  {
    id: 'layanan-publik',
    name: 'Layanan Publik',
    clientId: 'layanan-publik',
    category: 'publik',
    status: 'Staged',
    statusTone: 'warning',
  },
  {
    id: 'aplikasi-nonaktif',
    name: 'Aplikasi Nonaktif',
    clientId: 'aplikasi-nonaktif',
    category: 'publik',
    status: 'Nonaktif',
    statusTone: 'neutral',
  },
]

function mountTable() {
  return mount(ClientsTable, {
    props: {
      caption: 'Klien Terdaftar',
      nameLabel: 'Nama',
      clientIdLabel: 'Client ID',
      categoryLabel: 'Kategori',
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

describe('ClientsTable', () => {
  it('renders the caption, the column labels, and every row fields (incl. the mono client id)', () => {
    const wrapper = mountTable()
    expect(wrapper.text()).toContain('Klien Terdaftar')
    expect(wrapper.text()).toContain('Nama')
    expect(wrapper.text()).toContain('Client ID')
    expect(wrapper.text()).toContain('Kategori')
    expect(wrapper.text()).toContain('Status')
    expect(wrapper.text()).toContain('Portal Pegawai')
    // client_id is a public identifier and renders verbatim (the §7.3 folio/mono cell)
    expect(wrapper.text()).toContain('layanan-publik')
  })

  it('renders status AND category as UiStatusBadges — tone + label, never colour-alone', () => {
    const wrapper = mountTable()
    const badges = wrapper.findAllComponents(UiStatusBadge)
    // two badges per row (category, then status), in column order
    expect(badges).toHaveLength(rows.length * 2)
    expect(badges.map((b) => b.props('tone'))).toEqual([
      'brand', // row 0 category: kepegawaian
      'success', // row 0 status
      'neutral', // row 1 category: publik
      'warning', // row 1 status
      'neutral', // row 2 category: publik
      'neutral', // row 2 status
    ])
    // every badge carries a real text label (the shape/dot never stands alone)
    expect(badges.map((b) => b.props('label'))).toEqual([
      'kepegawaian',
      'Aktif',
      'publik',
      'Staged',
      'publik',
      'Nonaktif',
    ])
  })

  it('emits select(id) with the row client id when the row view action is clicked', async () => {
    const wrapper = mountTable()
    const viewButtons = wrapper.findAll('[data-testid="clients-row-view"]')
    expect(viewButtons).toHaveLength(rows.length)
    expect(viewButtons[0]!.text()).toBe('Lihat')
    await viewButtons[1]!.trigger('click')
    expect(wrapper.emitted('select')).toEqual([['layanan-publik']])
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
    expect(wrapper.get('[data-testid="clients-page-folio"]').text()).toMatch(/01\s*\/\s*03/)
  })

  it('omits the page folio when page / pageCount are not provided', () => {
    const wrapper = mount(ClientsTable, {
      props: {
        caption: 'Klien Terdaftar',
        nameLabel: 'Nama',
        clientIdLabel: 'Client ID',
        categoryLabel: 'Kategori',
        statusLabel: 'Status',
        viewLabel: 'Lihat',
        rows,
        total: 3,
      },
    })
    expect(wrapper.find('[data-testid="clients-page-folio"]').exists()).toBe(false)
    // no pagination buttons without labels
    expect(wrapper.find('[data-testid="data-list-next"]').exists()).toBe(false)
  })

  it('renders no client_secret (value/field name), token, or raw-PII digit run in its HTML', () => {
    const html = mountTable().html()
    expect(html).not.toMatch(
      /client_secret|clientSecret|access_token|refresh_token|id_token|Bearer|SENTINEL-/,
    )
    // raw NIK (16) / NIP (18) / NISN (10) shapes: any unbroken 10+ digit run is a leak.
    expect(html).not.toMatch(/\d{10,}/)
  })
})
