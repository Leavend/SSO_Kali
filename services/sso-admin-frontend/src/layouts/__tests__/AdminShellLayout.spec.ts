import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import AdminShellLayout from '../AdminShellLayout.vue'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import type { AdminPrincipal } from '@/types/auth.types'

// The shell's account card links to the `admin.profile` route by name, so any
// real-router mount must register it. This wraps createRouter to guarantee that
// route is present (appended once if a test didn't declare it) — keeping the
// per-test route lists focused on what each test actually exercises.
function adminTestRouter(options: Parameters<typeof createRouter>[0]) {
  const routes = options.routes ?? []
  const hasProfile = routes.some((route) => route.name === 'admin.profile')
  return createRouter({
    ...options,
    routes: hasProfile
      ? routes
      : [
          ...routes,
          {
            path: '/profile',
            name: 'admin.profile',
            component: { template: '<section />' },
            meta: { requiresAdmin: true },
          },
        ],
  })
}

const principal: AdminPrincipal = {
  subject_id: 'sub-admin',
  email: 'admin@example.com',
  display_name: 'Admin Example',
  role: 'admin',
  last_login_at: '2026-05-27T00:00:00Z',
  auth_context: {
    auth_time: '2026-05-27T00:00:00Z',
    amr: ['pwd', 'mfa'],
    acr: 'urn:loa:2',
    mfa_enforced: true,
    mfa_verified: true,
  },
  permissions: {
    view_admin_panel: true,
    manage_sessions: false,
    permissions: ['admin.dashboard.view'],
    capabilities: { 'admin.dashboard.view': true },
    menus: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        required_permission: 'admin.dashboard.view',
        visible: true,
      },
      {
        id: 'users',
        label: 'Users',
        required_permission: 'admin.users.read',
        visible: false,
      },
    ],
  },
}

describe('AdminShellLayout', () => {
  // Unmount each test's wrapper so layout instances (and their duplicate
  // `#admin-menu-search` ids / document listeners) do not bleed into later tests.
  enableAutoUnmount(afterEach)

  beforeEach(() => {
    setActivePinia(createPinia())
    useSessionStore().setPrincipal(principal)
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
    document.body.style.overflow = ''
  })

  it('renders only visible backend-computed admin menus', () => {
    const wrapper = mount(AdminShellLayout, {
      global: {
        stubs: {
          RouterLink: { template: '<a :href="to"><slot /></a>', props: ['to'] },
          RouterView: { template: '<section>Route content</section>' },
        },
      },
    })

    expect(wrapper.get('nav').text()).toContain('Dashboard')
    expect(wrapper.text()).not.toContain('Users')
  })

  it('resyncs the active sidebar item when shell-first menus arrive after route render', async () => {
    const router = adminTestRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/dashboard',
          component: { template: '<section>Dashboard</section>' },
          meta: { requiresAdmin: true },
        },
        {
          path: '/clients',
          component: { template: '<section>Clients</section>' },
          meta: { requiresAdmin: true },
        },
      ],
    })
    await router.push('/clients')
    await router.isReady()

    const session = useSessionStore()
    session.clear()

    const wrapper = mount(AdminShellLayout, {
      global: {
        plugins: [router],
        stubs: {
          RouterView: true,
        },
      },
    })

    expect(wrapper.find('.admin-nav__link--active').exists()).toBe(false)

    session.setPrincipal({
      ...principal,
      permissions: {
        ...principal.permissions,
        menus: [
          {
            id: 'dashboard',
            label: 'Dashboard',
            required_permission: 'admin.dashboard.view',
            visible: true,
          },
          {
            id: 'clients',
            label: 'Clients',
            required_permission: 'admin.clients.read',
            visible: true,
          },
        ],
      },
    })
    await nextTick()
    await nextTick()

    expect(wrapper.get('.admin-nav__link--active').text()).toContain('Clients')
    expect(wrapper.get('[aria-label="Breadcrumb"]').text()).toContain('Clients')
    expect(document.title).toContain('Clients')
  })

  it('shows principal identity without exposing tokens', () => {
    const wrapper = mount(AdminShellLayout, {
      global: {
        stubs: {
          RouterLink: { template: '<a :href="to"><slot /></a>', props: ['to'] },
          RouterView: true,
        },
      },
    })

    expect(wrapper.text()).toContain('Admin Example')
    expect(wrapper.text()).toContain('admin@example.com')
    expect(wrapper.text()).not.toMatch(/accessToken|refreshToken|idToken|Bearer/i)
  })

  it('renders refreshed shell landmarks topbar breadcrumb and logout action', () => {
    const wrapper = mount(AdminShellLayout, {
      global: {
        stubs: {
          RouterLink: { template: '<a :href="to"><slot /></a>', props: ['to'] },
          RouterView: true,
        },
      },
    })

    expect(wrapper.find('[data-testid="admin-topbar"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sso-account-bar"]').exists()).toBe(true)
    expect(wrapper.get('[aria-label="Breadcrumb"]').text()).toContain('Control Plane')
    expect(
      wrapper.get('[data-testid="admin-mobile-menu-toggle"]').attributes('aria-expanded'),
    ).toBe('false')
    // The logout link MUST point at the admin BFF's own same-origin /auth/logout
    // route — the only handler that revokes the admin's tokens, deletes the
    // server-side session record, clears the session cookie, and triggers IdP
    // single sign-out. It must NOT point at the portal origin (ssoBaseUrl/logout),
    // which leaves the admin BFF session fully intact.
    expect(wrapper.get('[data-testid="admin-logout-action"]').attributes('href')).toBe(
      '/auth/logout',
    )
  })

  it('opens the mobile drawer with backdrop and closes it from the backdrop', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })

    const wrapper = mount(AdminShellLayout, {
      global: {
        stubs: {
          RouterLink: { template: '<a :href="to"><slot /></a>', props: ['to'] },
          RouterView: true,
        },
      },
    })

    await wrapper.get('[data-testid="admin-mobile-menu-toggle"]').trigger('click')

    expect(wrapper.classes()).toContain('admin-control-plane--nav-open')
    expect(wrapper.find('.admin-sidebar__backdrop').exists()).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')

    await wrapper.get('.admin-sidebar__backdrop').trigger('click')

    expect(wrapper.classes()).not.toContain('admin-control-plane--nav-open')
    expect(document.body.style.overflow).toBe('')
  })

  it('closes the mobile drawer with Escape', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })

    const wrapper = mount(AdminShellLayout, {
      global: {
        stubs: {
          RouterLink: { template: '<a :href="to"><slot /></a>', props: ['to'] },
          RouterView: true,
        },
      },
    })

    await wrapper.get('[data-testid="admin-mobile-menu-toggle"]').trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()

    expect(wrapper.classes()).not.toContain('admin-control-plane--nav-open')
    expect(document.body.style.overflow).toBe('')
  })

  it('does not clear another component body scroll lock on resize while drawer is closed', async () => {
    document.body.style.overflow = 'hidden'

    mount(AdminShellLayout, {
      global: {
        stubs: {
          RouterLink: { template: '<a :href="to"><slot /></a>', props: ['to'] },
          RouterView: true,
        },
      },
    })

    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })
    window.dispatchEvent(new Event('resize'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(document.body.style.overflow).toBe('hidden')
  })

  it('highlights the parent menu item for sub-routes (prefix-based matching)', async () => {
    const router = adminTestRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/dashboard',
          component: { template: '<section>Dashboard</section>' },
          meta: { requiresAdmin: true },
        },
        {
          path: '/clients',
          component: { template: '<section>Clients</section>' },
          meta: { requiresAdmin: true },
        },
        {
          path: '/clients/new',
          component: { template: '<section>New Client</section>' },
          meta: { requiresAdmin: true },
        },
      ],
    })
    await router.push('/clients/new')
    await router.isReady()

    const session = useSessionStore()
    session.setPrincipal({
      ...principal,
      permissions: {
        ...principal.permissions,
        menus: [
          {
            id: 'dashboard',
            label: 'Dashboard',
            required_permission: 'admin.dashboard.view',
            visible: true,
          },
          {
            id: 'clients',
            label: 'Clients',
            required_permission: 'admin.clients.read',
            visible: true,
          },
        ],
      },
    })

    const wrapper = mount(AdminShellLayout, {
      global: {
        plugins: [router],
        stubs: {
          RouterView: true,
        },
      },
    })

    await nextTick()
    await nextTick()

    expect(wrapper.get('.admin-nav__link--active').text()).toContain('Clients')
    expect(wrapper.get('[aria-label="Breadcrumb"]').text()).toContain('Clients')
  })

  it('navigates to parent route when active menu is clicked from a sub-route, but returns early if already on parent route', async () => {
    const router = adminTestRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/dashboard',
          component: { template: '<section>Dashboard</section>' },
          meta: { requiresAdmin: true },
        },
        {
          path: '/clients',
          component: { template: '<section>Clients</section>' },
          meta: { requiresAdmin: true },
        },
        {
          path: '/clients/new',
          component: { template: '<section>New Client</section>' },
          meta: { requiresAdmin: true },
        },
      ],
    })

    const pushSpy = vi.spyOn(router, 'push')
    await router.push('/clients/new')
    await router.isReady()

    const session = useSessionStore()
    session.setPrincipal({
      ...principal,
      permissions: {
        ...principal.permissions,
        menus: [
          {
            id: 'dashboard',
            label: 'Dashboard',
            required_permission: 'admin.dashboard.view',
            visible: true,
          },
          {
            id: 'clients',
            label: 'Clients',
            required_permission: 'admin.clients.read',
            visible: true,
          },
        ],
      },
    })

    const wrapper = mount(AdminShellLayout, {
      global: {
        plugins: [router],
        stubs: {
          RouterLink: {
            template: '<a class="admin-nav__link"><slot /></a>',
          },
          RouterView: true,
        },
      },
    })

    await nextTick()
    await nextTick()

    const activeLink = wrapper.get('.admin-nav__link--active')
    pushSpy.mockClear()
    await activeLink.trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(pushSpy).toHaveBeenCalledWith('/clients')

    pushSpy.mockClear()
    await activeLink.trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('resyncs the active sidebar item when shell-first menus arrive after route render on a sub-route', async () => {
    const router = adminTestRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/dashboard',
          component: { template: '<section>Dashboard</section>' },
          meta: { requiresAdmin: true },
        },
        {
          path: '/clients',
          component: { template: '<section>Clients</section>' },
          meta: { requiresAdmin: true },
        },
        {
          path: '/clients/new',
          component: { template: '<section>New Client</section>' },
          meta: { requiresAdmin: true },
        },
      ],
    })
    await router.push('/clients/new')
    await router.isReady()

    const session = useSessionStore()
    session.clear()

    const wrapper = mount(AdminShellLayout, {
      global: {
        plugins: [router],
        stubs: {
          RouterView: true,
        },
      },
    })

    expect(wrapper.find('.admin-nav__link--active').exists()).toBe(false)

    session.setPrincipal({
      ...principal,
      permissions: {
        ...principal.permissions,
        menus: [
          {
            id: 'dashboard',
            label: 'Dashboard',
            required_permission: 'admin.dashboard.view',
            visible: true,
          },
          {
            id: 'clients',
            label: 'Clients',
            required_permission: 'admin.clients.read',
            visible: true,
          },
        ],
      },
    })
    await nextTick()
    await nextTick()

    expect(wrapper.get('.admin-nav__link--active').text()).toContain('Clients')
    expect(wrapper.get('[aria-label="Breadcrumb"]').text()).toContain('Clients')
    expect(document.title).toContain('Clients')
  })

  it('does not match /authentication-audit to /audit menu', async () => {
    const router = adminTestRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/audit',
          component: { template: '<section>Audit</section>' },
          meta: { requiresAdmin: true },
        },
        {
          path: '/authentication-audit',
          component: { template: '<section>Auth Audit</section>' },
          meta: { requiresAdmin: true },
        },
      ],
    })
    await router.push('/authentication-audit')
    await router.isReady()

    const session = useSessionStore()
    session.setPrincipal({
      ...principal,
      permissions: {
        ...principal.permissions,
        menus: [
          {
            id: 'audit',
            label: 'Audit',
            required_permission: 'admin.audit.read',
            visible: true,
          },
          {
            id: 'authentication-audit',
            label: 'Authentication Audit',
            required_permission: 'admin.authentication-audit.read',
            visible: true,
          },
        ],
      },
    })

    const wrapper = mount(AdminShellLayout, {
      global: {
        plugins: [router],
        stubs: {
          RouterView: true,
        },
      },
    })

    await nextTick()
    await nextTick()

    expect(wrapper.get('.admin-nav__link--active').text()).toContain('Authentication Audit')
  })

  it('does not highlight Audit when path is /authentication-audit and only Audit menu exists', async () => {
    const router = adminTestRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/audit',
          component: { template: '<section>Audit</section>' },
          meta: { requiresAdmin: true },
        },
        {
          path: '/authentication-audit',
          component: { template: '<section>Auth Audit</section>' },
          meta: { requiresAdmin: true },
        },
      ],
    })
    await router.push('/authentication-audit')
    await router.isReady()

    const session = useSessionStore()
    session.setPrincipal({
      ...principal,
      permissions: {
        ...principal.permissions,
        menus: [
          {
            id: 'audit',
            label: 'Audit',
            required_permission: 'admin.audit.read',
            visible: true,
          },
        ],
      },
    })

    const wrapper = mount(AdminShellLayout, {
      global: {
        plugins: [router],
        stubs: {
          RouterView: true,
        },
      },
    })

    await nextTick()
    await nextTick()

    expect(wrapper.find('.admin-nav__link--active').exists()).toBe(false)
  })

  it('positions the active menu pill correctly when menus are loaded asynchronously (TDD for cold refresh)', async () => {
    const router = adminTestRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/dashboard',
          component: { template: '<section>Dashboard</section>' },
          meta: { requiresAdmin: true },
        },
        {
          path: '/clients',
          component: { template: '<section>Clients</section>' },
          meta: { requiresAdmin: true },
        },
      ],
    })
    await router.push('/clients')
    await router.isReady()

    const session = useSessionStore()
    session.clear()

    const offsetTopSpy = vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockReturnValue(120)
    const offsetHeightSpy = vi
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockReturnValue(45)

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })

    const wrapper = mount(AdminShellLayout, {
      global: {
        plugins: [router],
        stubs: {
          RouterView: true,
        },
      },
    })

    expect(wrapper.find('.admin-nav__pill').attributes('style')).toContain('opacity: 0')

    session.setPrincipal({
      ...principal,
      permissions: {
        ...principal.permissions,
        menus: [
          {
            id: 'dashboard',
            label: 'Dashboard',
            required_permission: 'admin.dashboard.view',
            visible: true,
          },
          {
            id: 'clients',
            label: 'Clients',
            required_permission: 'admin.clients.read',
            visible: true,
          },
        ],
      },
    })

    await nextTick()
    await nextTick()

    const pill = wrapper.find('.admin-nav__pill')
    expect(pill.attributes('style')).toContain('top: 120px')
    expect(pill.attributes('style')).toContain('height: 45px')
    expect(pill.attributes('style')).toContain('opacity: 1')

    offsetTopSpy.mockRestore()
    offsetHeightSpy.mockRestore()
    rafSpy.mockRestore()
  })

  it('filters sidebar menus by translated label, hides the pill while filtering, and clears back to all', async () => {
    // Pin the locale so the rendered (translated) labels are deterministic — the
    // i18n active locale is module-global and can leak from other suites. `id` is
    // statically bundled, so its menu labels ("Dasbor"/"Klien") are always present.
    await useI18n().setLocale('id')
    await flushPromises()

    // Use a real router (like the pill tests) so RouterLink renders genuine <a>
    // elements that honour `v-show` — a previously installed router plugin makes
    // an object RouterLink stub unreliable across this suite.
    const router = adminTestRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/dashboard',
          component: { template: '<section />' },
          meta: { requiresAdmin: true },
        },
        { path: '/clients', component: { template: '<section />' }, meta: { requiresAdmin: true } },
      ],
    })
    await router.push('/dashboard')
    await router.isReady()

    const session = useSessionStore()
    session.setPrincipal({
      ...principal,
      permissions: {
        ...principal.permissions,
        menus: [
          {
            id: 'dashboard',
            label: 'Dashboard',
            required_permission: 'admin.dashboard.view',
            visible: true,
          },
          {
            id: 'clients',
            label: 'Clients',
            required_permission: 'admin.clients.read',
            visible: true,
          },
        ],
      },
    })

    const wrapper = mount(AdminShellLayout, {
      global: {
        plugins: [router],
        stubs: {
          RouterView: true,
        },
      },
    })

    await flushPromises()

    const search = wrapper.get('#admin-menu-search')
    // Accessible name via real <label for>, and a native keyboard-focusable search input.
    expect(wrapper.get('label[for="admin-menu-search"]').text()).toBeTruthy()
    expect(search.attributes('type')).toBe('search')

    // A link is shown when `v-show` has NOT set inline `display: none` (jsdom's
    // computed style does not always reflect inline display, so assert on the
    // style attribute that v-show writes rather than on isVisible()).
    const isHidden = (style: string | undefined) => (style ?? '').includes('display: none')
    const shownLabels = () =>
      wrapper
        .findAll('.admin-nav .admin-nav__link')
        .filter((link) => !isHidden(link.attributes('style')))
        .map((link) => link.text())
    const pillHidden = () => isHidden(wrapper.find('.admin-nav__pill').attributes('style'))

    // Empty filter shows all visible menus ("Dasbor", "Klien" under `id`).
    expect(shownLabels()).toHaveLength(2)
    expect(pillHidden()).toBe(false)

    // Filter narrows the list (case-insensitive) to just the matching menu.
    await search.setValue('KLI')
    await flushPromises()
    expect(shownLabels()).toEqual(['Klien'])
    // Pill must not point at a hidden item while a filter is active.
    expect(pillHidden()).toBe(true)

    // No-match shows the muted hint.
    await search.setValue('zzz-no-such-menu')
    await flushPromises()
    expect(shownLabels()).toHaveLength(0)
    expect(wrapper.find('.admin-nav__empty').exists()).toBe(true)

    // Clearing restores the full list and the pill.
    await search.setValue('')
    await flushPromises()
    expect(shownLabels()).toHaveLength(2)
    expect(wrapper.find('.admin-nav__empty').exists()).toBe(false)
    expect(pillHidden()).toBe(false)
  })

  it('positions the active menu pill correctly when menus are already loaded before mount (TDD for loaded state)', async () => {
    const router = adminTestRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/dashboard',
          component: { template: '<section>Dashboard</section>' },
          meta: { requiresAdmin: true },
        },
        {
          path: '/clients',
          component: { template: '<section>Clients</section>' },
          meta: { requiresAdmin: true },
        },
      ],
    })
    await router.push('/clients')
    await router.isReady()

    const session = useSessionStore()
    session.setPrincipal({
      ...principal,
      permissions: {
        ...principal.permissions,
        menus: [
          {
            id: 'dashboard',
            label: 'Dashboard',
            required_permission: 'admin.dashboard.view',
            visible: true,
          },
          {
            id: 'clients',
            label: 'Clients',
            required_permission: 'admin.clients.read',
            visible: true,
          },
        ],
      },
    })

    const offsetTopSpy = vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockReturnValue(120)
    const offsetHeightSpy = vi
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockReturnValue(45)

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })

    const wrapper = mount(AdminShellLayout, {
      global: {
        plugins: [router],
        stubs: {
          RouterView: true,
        },
      },
    })

    await nextTick()
    await nextTick()

    const pill = wrapper.find('.admin-nav__pill')
    expect(pill.attributes('style')).toContain('top: 120px')
    expect(pill.attributes('style')).toContain('height: 45px')
    expect(pill.attributes('style')).toContain('opacity: 1')

    offsetTopSpy.mockRestore()
    offsetHeightSpy.mockRestore()
    rafSpy.mockRestore()
  })

  it('renders a brand logomark alongside the brand text block', () => {
    const wrapper = mount(AdminShellLayout, {
      global: {
        stubs: {
          RouterLink: { template: '<a :href="to"><slot /></a>', props: ['to'] },
          RouterView: true,
        },
      },
    })

    const text = wrapper.find('.admin-brand__text')
    expect(wrapper.find('.admin-brand__mark').exists()).toBe(true)
    expect(text.exists()).toBe(true)
    // Eyebrow label and the brand title both live inside the text block, next to
    // the logomark — not as a standalone chip above a heading.
    expect(text.find('.eyebrow').exists()).toBe(true)
    expect(text.find('strong').text()).toContain('Control Plane')
  })

  it('groups menus under section labels and pins the pill to the active link even when the section order reorders the backend menu list', async () => {
    // Backend order interleaves groups (dashboard=utama, roles=keamanan,
    // clients=utama). Section grouping renders utama before keamanan, so the
    // DOM link order (dashboard, clients, roles) no longer matches the
    // visibleMenus index order. A positional `links[currentIndex]` lookup would
    // point the pill at roles; the active link must be resolved by its stable
    // menu index instead.
    const router = adminTestRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/dashboard',
          component: { template: '<section />' },
          meta: { requiresAdmin: true },
        },
        { path: '/clients', component: { template: '<section />' }, meta: { requiresAdmin: true } },
        { path: '/roles', component: { template: '<section />' }, meta: { requiresAdmin: true } },
      ],
    })
    await router.push('/clients')
    await router.isReady()

    const session = useSessionStore()
    session.setPrincipal({
      ...principal,
      permissions: {
        ...principal.permissions,
        menus: [
          {
            id: 'dashboard',
            label: 'Dashboard',
            required_permission: 'admin.dashboard.view',
            visible: true,
          },
          { id: 'roles', label: 'Roles', required_permission: 'admin.roles.read', visible: true },
          {
            id: 'clients',
            label: 'Clients',
            required_permission: 'admin.clients.read',
            visible: true,
          },
        ],
      },
    })

    // offsetTop encodes the stable menu index so the pill position proves which
    // link was measured: dashboard(0)=100, roles(1)=200, clients(2)=300.
    const offsetTopSpy = vi
      .spyOn(HTMLElement.prototype, 'offsetTop', 'get')
      .mockImplementation(function (this: HTMLElement) {
        const menuIndex = this.getAttribute?.('data-menu-index')
        return menuIndex != null ? (Number(menuIndex) + 1) * 100 : 0
      })
    const offsetHeightSpy = vi
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockReturnValue(44)
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })

    const wrapper = mount(AdminShellLayout, {
      global: { plugins: [router], stubs: { RouterView: true } },
    })

    await nextTick()
    await nextTick()

    // Grouping renders at least the 'utama' and 'keamanan' section labels.
    expect(wrapper.findAll('.admin-nav__group').length).toBeGreaterThanOrEqual(2)

    // The active link is clients — index 2 in the backend menu list.
    const active = wrapper.get('.admin-nav__link--active')
    expect(active.attributes('data-menu-index')).toBe('2')

    // The pill tracks the clients link (offsetTop 300), NOT the positional
    // links[2] which would be roles (offsetTop 200).
    expect(wrapper.find('.admin-nav__pill').attributes('style')).toContain('top: 300px')

    offsetTopSpy.mockRestore()
    offsetHeightSpy.mockRestore()
    rafSpy.mockRestore()
  })

  it('exposes each nav section as an accessible group labelled by its section header', async () => {
    const router = adminTestRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/dashboard',
          component: { template: '<section />' },
          meta: { requiresAdmin: true },
        },
        { path: '/roles', component: { template: '<section />' }, meta: { requiresAdmin: true } },
      ],
    })
    await router.push('/dashboard')
    await router.isReady()

    const session = useSessionStore()
    session.setPrincipal({
      ...principal,
      permissions: {
        ...principal.permissions,
        menus: [
          {
            id: 'dashboard',
            label: 'Dashboard',
            required_permission: 'admin.dashboard.view',
            visible: true,
          },
          { id: 'roles', label: 'Roles', required_permission: 'admin.roles.read', visible: true },
        ],
      },
    })

    const wrapper = mount(AdminShellLayout, {
      global: { plugins: [router], stubs: { RouterView: true } },
    })

    await nextTick()
    await nextTick()

    // dashboard → utama, roles → keamanan: two semantic groups.
    const sections = wrapper.findAll('.admin-nav [role="group"]')
    expect(sections.length).toBeGreaterThanOrEqual(2)

    // Each group is named by its visible header element (screen readers announce
    // the section, not stray paragraph text).
    for (const section of sections) {
      const labelledBy = section.attributes('aria-labelledby')
      expect(labelledBy).toBeTruthy()
      expect(wrapper.find(`#${labelledBy}`).exists()).toBe(true)
      expect(wrapper.get(`#${labelledBy}`).classes()).toContain('admin-nav__group')
    }
  })

  it('renders nav links in grouped display order — the permutation the pill animation steps along', async () => {
    const router = adminTestRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/dashboard',
          component: { template: '<section />' },
          meta: { requiresAdmin: true },
        },
        { path: '/roles', component: { template: '<section />' }, meta: { requiresAdmin: true } },
        { path: '/clients', component: { template: '<section />' }, meta: { requiresAdmin: true } },
        {
          path: '/observability',
          component: { template: '<section />' },
          meta: { requiresAdmin: true },
        },
      ],
    })
    await router.push('/dashboard')
    await router.isReady()

    const session = useSessionStore()
    session.setPrincipal({
      ...principal,
      permissions: {
        ...principal.permissions,
        menus: [
          {
            id: 'dashboard',
            label: 'Dashboard',
            required_permission: 'admin.dashboard.view',
            visible: true,
          },
          { id: 'roles', label: 'Roles', required_permission: 'admin.roles.read', visible: true },
          {
            id: 'clients',
            label: 'Clients',
            required_permission: 'admin.clients.read',
            visible: true,
          },
          {
            id: 'audit',
            label: 'Observability',
            required_permission: 'admin.audit.read',
            visible: true,
          },
        ],
      },
    })

    const wrapper = mount(AdminShellLayout, {
      global: { plugins: [router], stubs: { RouterView: true } },
    })
    await nextTick()
    await nextTick()

    // Backend order dashboard(0), roles(1), clients(2), audit(3) renders grouped:
    // Utama[dashboard 0, clients 2] → Keamanan[roles 1] → Observabilitas[audit 3].
    // The pill steps along THIS sequence, so it must be the grouped permutation,
    // not the raw 0,1,2,3 index order (PILL1 regression guard).
    const renderOrder = wrapper
      .findAll('.admin-nav__link[data-menu-index]')
      .map((link) => Number(link.attributes('data-menu-index')))

    expect(renderOrder).toEqual([0, 2, 1, 3])
    // A permutation of every visible index — each menu rendered exactly once.
    expect([...renderOrder].sort((a, b) => a - b)).toEqual([0, 1, 2, 3])
  })

  it('keeps Profile out of the nav and reachable only via the account-card link (FIX2 + FIX3 coupled)', async () => {
    const router = adminTestRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/dashboard',
          name: 'admin.dashboard',
          component: { template: '<section />' },
          meta: { requiresAdmin: true },
        },
        {
          path: '/profile',
          name: 'admin.profile',
          component: { template: '<section />' },
          meta: { requiresAdmin: true },
        },
      ],
    })
    await router.push('/dashboard')
    await router.isReady()

    const session = useSessionStore()
    session.setPrincipal({
      ...principal,
      permissions: {
        ...principal.permissions,
        menus: [
          {
            id: 'dashboard',
            label: 'Dashboard',
            required_permission: 'admin.dashboard.view',
            visible: true,
          },
          {
            id: 'profile',
            label: 'My Profile',
            required_permission: 'profile.read',
            visible: true,
          },
        ],
      },
    })

    const wrapper = mount(AdminShellLayout, {
      global: { plugins: [router], stubs: { RouterView: true } },
    })
    await nextTick()
    await nextTick()

    // Profile is NOT rendered as a nav link (FIX2 drops it from the layout).
    expect(wrapper.findAll('.admin-nav__link[data-menu-index]')).toHaveLength(1)

    // FIX3: the account card IS the Profile affordance — a link to admin.profile.
    // (Guards MA-COUPLE: dropping the nav item without this would orphan Profile.)
    const card = wrapper.get('.admin-principal__meta')
    expect(card.element.tagName).toBe('A')
    expect(card.attributes('href')).toBe('/profile')
  })

  it('resolves no active nav pill on the Profile route (Profile is not a nav item)', async () => {
    const router = adminTestRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/dashboard',
          name: 'admin.dashboard',
          component: { template: '<section />' },
          meta: { requiresAdmin: true },
        },
        {
          path: '/profile',
          name: 'admin.profile',
          component: { template: '<section />' },
          meta: { requiresAdmin: true },
        },
      ],
    })
    await router.push('/profile')
    await router.isReady()

    const session = useSessionStore()
    session.setPrincipal({
      ...principal,
      permissions: {
        ...principal.permissions,
        menus: [
          {
            id: 'dashboard',
            label: 'Dashboard',
            required_permission: 'admin.dashboard.view',
            visible: true,
          },
          {
            id: 'profile',
            label: 'My Profile',
            required_permission: 'profile.read',
            visible: true,
          },
        ],
      },
    })

    const wrapper = mount(AdminShellLayout, {
      global: { plugins: [router], stubs: { RouterView: true } },
    })
    await nextTick()
    await nextTick()

    // getMenuIndexByPath must ignore non-rendered menus (Profile), so currentIndex
    // is -1 here — no active link and the pill stays hidden (no offscreen rAF hunt).
    expect(wrapper.find('.admin-nav__link--active').exists()).toBe(false)
    expect(wrapper.find('.admin-nav__pill').attributes('style')).toContain('opacity: 0')
  })
})
