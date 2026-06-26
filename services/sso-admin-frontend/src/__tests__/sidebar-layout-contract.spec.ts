import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const cssSource = readFileSync(join(process.cwd(), 'src/assets/main.css'), 'utf8')

function cssBlock(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return (
    cssSource.match(new RegExp(`(?:^|\\n)\\s*${escapedSelector}\\s*\\{([^}]*)\\}`, 's'))?.[1] ?? ''
  )
}

describe('admin sidebar layout contract', () => {
  it('keeps desktop sidebar widths tokenized from one source of truth', () => {
    const controlPlane = cssBlock('.admin-control-plane')
    const collapsedControlPlane = cssBlock('.admin-control-plane--collapsed')
    const sidebar = cssBlock('.admin-sidebar')

    expect(controlPlane).toContain('--sidebar-w: 264px;')
    expect(controlPlane).toContain('--sidebar-w-collapsed: 76px;')
    expect(controlPlane).toContain('grid-template-columns: var(--sidebar-w) minmax(0, 1fr);')
    expect(sidebar).toContain('width: var(--sidebar-w);')
    expect(collapsedControlPlane).toContain('--sidebar-w: var(--sidebar-w-collapsed);')
    expect(collapsedControlPlane).not.toContain('grid-template-columns')
  })

  it('keeps the slim collapsed rail comfortable for icon targets', () => {
    const collapsedSidebar = cssBlock('.admin-control-plane--collapsed .admin-sidebar')
    const collapsedNavLink = cssBlock('.admin-control-plane--collapsed .admin-nav__link')

    expect(collapsedSidebar).toContain('padding: 16px 8px;')
    expect(collapsedNavLink).toContain('min-width: 40px;')
    expect(collapsedNavLink).toContain('min-height: 40px;')
    expect(collapsedNavLink).toContain('padding: 10px;')
  })

  it('keeps Documentation clustered with the principal footer without a desktop gap', () => {
    const nav = cssBlock('.admin-nav')
    const externalLink = cssBlock('.admin-nav__link--external')
    const principal = cssBlock('.admin-principal')

    expect(nav).toContain('flex: 1 1 auto;')
    expect(nav).toContain('overflow-y: auto;')
    expect(externalLink).not.toContain('border-top')
    expect(principal).not.toContain('margin-top: auto;')
  })

  it('keeps collapsed desktop nav overflow visible so tooltips are not clipped', () => {
    const collapsedNav = cssBlock('.admin-control-plane--collapsed .admin-nav')

    expect(collapsedNav).toContain('overflow: visible;')
  })
})
