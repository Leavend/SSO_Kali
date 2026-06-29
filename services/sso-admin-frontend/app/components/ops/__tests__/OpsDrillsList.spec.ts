// app/components/ops/__tests__/OpsDrillsList.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OpsDrillsList from '@/components/ops/OpsDrillsList.vue'
import { OPS_RUNBOOK_BASE_URL, type OpsDrill } from '@/lib/ops/ops-drills'

const DRILLS: readonly OpsDrill[] = [
  {
    key: 'with-evidence',
    title: 'Drill A',
    summary: 'Summary A',
    systemOfRecord: 'CI workflow A',
    runbookPath: 'docs/runbooks/a.md',
    evidenceRef: 'docs/ops/evidence/a.md',
  },
  {
    key: 'no-evidence',
    title: 'Drill B',
    summary: 'Summary B',
    systemOfRecord: 'CI workflow B',
    runbookPath: 'docs/runbooks/b.md',
  },
]

function mountList() {
  return mount(OpsDrillsList, {
    props: {
      drills: DRILLS,
      runbookCtaLabel: 'Open runbook',
      evidenceCtaLabel: 'View evidence',
      systemOfRecordLabel: 'System of record',
    },
  })
}

describe('OpsDrillsList', () => {
  it('renders a card per drill with title, summary, and system of record', () => {
    const w = mountList()
    expect(w.find('[data-testid="ops-drill-with-evidence"]').exists()).toBe(true)
    expect(w.find('[data-testid="ops-drill-no-evidence"]').exists()).toBe(true)
    expect(w.text()).toContain('Drill A')
    expect(w.text()).toContain('Summary A')
    expect(w.text()).toContain('System of record')
    expect(w.text()).toContain('CI workflow A')
  })

  it('renders the runbook link as an absolute URL opening safely in a new tab', () => {
    const w = mountList()
    const link = w.find('[data-testid="ops-drill-runbook-with-evidence"]')
    expect(link.attributes('href')).toBe(`${OPS_RUNBOOK_BASE_URL}/docs/runbooks/a.md`)
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
  })

  it('renders the evidence link only when evidenceRef is set', () => {
    const w = mountList()
    expect(w.find('[data-testid="ops-drill-evidence-with-evidence"]').exists()).toBe(true)
    expect(w.find('[data-testid="ops-drill-evidence-no-evidence"]').exists()).toBe(false)
  })
})
