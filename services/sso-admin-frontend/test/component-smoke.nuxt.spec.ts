/**
 * In-process component smoke — proves the mountSuspended path works.
 *
 * Canonical pattern (b): in-process component test.
 *
 * This file is named *.nuxt.spec.ts so defineVitestConfig (see vitest.config.ts)
 * auto-routes it to the 'nuxt' environment project, where `mountSuspended` can
 * build + mount real Nuxt components in-process. Task 2a.0 and every 2b
 * component spec depend on this path; it exercises the same in-process Nuxt
 * build that broke under the dual-vite toolchain ("MagicString is not a
 * constructor") and now works with the single vite 7.x.
 *
 * Two things are asserted:
 *   1. A trivial inline component renders a Swiss token markup snapshot.
 *   2. A real Nuxt page (app/pages/index.vue) mounts and renders its text.
 */
import { describe, it, expect } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ForbiddenPage from '~/pages/forbidden.vue'

const Trivial = defineComponent({
  name: 'TrivialSwissButton',
  render() {
    return h('button', { class: 'btn btn--primary' }, 'OK')
  },
})

describe('in-process component (mountSuspended)', () => {
  it('mounts a trivial inline component', async () => {
    const wrapper = await mountSuspended(Trivial)
    expect(wrapper.text()).toBe('OK')
    expect(wrapper.html()).toContain('class="btn btn--primary"')
  })

  it('mounts an unguarded redirect-target page and renders its heading', async () => {
    const wrapper = await mountSuspended(ForbiddenPage)
    expect(wrapper.text()).toContain('Access denied')
  })
})
