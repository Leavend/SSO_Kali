import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf8')

function cssBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 's'))?.[1] ?? ''
}

describe('audit table layout contract', () => {
  it('keeps audit table headers sticky by giving audit viewports internal scroll', () => {
    const wrapper = cssBlock('.audit-table-wrapper')
    const viewport = cssBlock('.audit-table-wrapper .ui-data-list__viewport')
    const header = cssBlock('.audit-table-wrapper .ui-data-list thead')

    expect(wrapper).toContain('min-height: 220px')
    expect(viewport).toContain('max-height: min(560px, 64vh)')
    expect(viewport).toContain('min-height: 220px')
    expect(viewport).toContain('overflow: auto')
    expect(header).toContain('position: sticky')
    expect(header).toContain('top: 0')
    expect(header).toContain('z-index: 2')
    expect(header).toContain('background: var(--card)')
  })

  it('keeps admin mobile layout controls responsive and internally scrollable', () => {
    const actionHeading = cssBlock('.page-heading--with-action')
    const createRole = cssBlock('.create-role-btn')
    const clientTabs = cssBlock('.client-detail-tabs')
    const auditTabs = cssBlock('.audit-tabs-container')

    expect(actionHeading).toContain('display: flex')
    expect(actionHeading).toContain('justify-content: space-between')
    expect(createRole).toContain('white-space: nowrap')
    expect(clientTabs).toContain('overflow-x: auto')
    expect(auditTabs).toContain('overflow-x: auto')
    expect(css).toContain('.scroll-edge-indicator')
    expect(css).toContain('.client-uri-value')
    expect(css).toContain('overflow-wrap: anywhere')
    expect(css).toContain('.page-heading--with-action')
    expect(css).toContain('flex-direction: column')
    expect(css).toContain('.client-detail')
    expect(css).toContain('min-width: 0')
  })

  it('reserves stable audit loading table space with row-sized skeletons', () => {
    const skeleton = cssBlock('.audit-table-skeleton')
    const row = cssBlock('.audit-table-skeleton__row')
    const empty = cssBlock('.audit-table-empty-state')

    expect(skeleton).toContain('min-height: 220px')
    expect(row).toContain('min-height: 49px')
    expect(empty).toContain('min-height: 140px')
    expect(empty).not.toContain('position: absolute')
    expect(cssBlock('.audit-consent-idle-prompt')).toContain('min-height: 140px')
    expect(css).toContain('min-height: 128px')
  })

  it('prioritizes key audit table columns on mobile without changing desktop tables', () => {
    expect(css).toContain('.audit-table-wrapper--mobile-priority')
    expect(css).toContain('@media (max-width: 640px)')
    expect(css).toContain('.audit-table-wrapper--mobile-priority th:nth-child(2)')
    expect(css).toContain('.audit-table-wrapper--mobile-priority td:nth-child(2)')
    expect(css).toContain('.audit-table-wrapper--mobile-priority th:nth-child(4)')
    expect(css).toContain('.audit-table-wrapper--mobile-priority td:nth-child(4)')
    expect(css).toContain('display: none')
    expect(css).toContain('min-width: 24rem')
  })

  it('honors reduced motion for animated tab pill indicators', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('.audit-tabs__pill')
    expect(css).toContain('.user-detail-tabs__pill')
    expect(css).toContain('.client-detail-tabs__pill')
    expect(css).toContain('transition: none')
  })
})
