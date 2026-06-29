import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import IpAccessRulesTable from '@/components/ip-access/IpAccessRulesTable.vue'
import type { IpAccessRule } from '@/types/ip-access.types'

const RULES: readonly IpAccessRule[] = [
  {
    id: 7,
    cidr: '203.0.113.0/24',
    mode: 'block',
    reason: 'Maintenance window',
    expires_at: null,
    actor_subject_id: 'sub-admin',
    created_at: '2026-06-20T10:00:00Z',
    updated_at: '2026-06-20T10:00:00Z',
  },
]

function mountTable() {
  return mount(IpAccessRulesTable, {
    props: {
      rules: RULES,
      caption: 'IP access rules',
      cidrLabel: 'CIDR',
      modeLabel: 'Mode',
      reasonLabel: 'Reason',
      createdLabel: 'Created',
      allowText: 'Allow',
      blockText: 'Block',
    },
  })
}

describe('IpAccessRulesTable', () => {
  it('renders the cidr, reason, and a labelled mode badge', () => {
    const html = mountTable().html()
    expect(html).toContain('203.0.113.0/24')
    expect(html).toContain('Maintenance window')
    expect(html).toContain('Block') // mode label, not colour-alone
  })

  it('emits select(id) as a NUMBER when the cidr button is clicked', async () => {
    const wrapper = mountTable()
    await wrapper.find('[data-testid="ip-access-select-7"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual([7])
  })
})
