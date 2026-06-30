// *.nuxt.spec.ts → 'nuxt' env: mountSuspended renders UiDialog's portal inline
// (DialogPortal is force-mounted). The dialog is pure presentational — no service
// mocks needed; it validates locally via @/lib/roles/role-form.
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import RoleFormDialog from '@/components/roles/RoleFormDialog.vue'
import type { AdminRole } from '@/types/users.types'

const labels = {
  createTitle: 'Create role',
  editTitle: 'Edit role',
  slugLabel: 'Slug',
  nameLabel: 'Name',
  descriptionLabel: 'Description',
  saveLabel: 'Save',
  cancelLabel: 'Cancel',
  stepUpLabel: 'Re-authenticate',
}

const sampleRole: AdminRole = {
  id: 7,
  slug: 'support-agent',
  name: 'Support Agent',
  description: 'Handles tickets',
  is_system: false,
  permissions: [],
  user_count: 4,
  users_count: 4,
}

describe('RoleFormDialog — create mode', () => {
  it('keeps submit disabled until slug + name are valid, then emits the create payload', async () => {
    const wrapper = await mountSuspended(RoleFormDialog, {
      props: { open: true, mode: 'create', ...labels },
    })
    expect(wrapper.find('[data-testid="role-form-submit"]').attributes('disabled')).toBeDefined()

    await wrapper.find('#role_slug').setValue('support-agent')
    await wrapper.find('#role_name').setValue('Support Agent')
    await wrapper.find('#role_description').setValue('  Handles tickets ')
    expect(wrapper.find('[data-testid="role-form-submit"]').attributes('disabled')).toBeUndefined()

    await wrapper.find('[data-testid="role-form"]').trigger('submit')
    const emitted = wrapper.emitted('submit')
    expect(emitted).toBeTruthy()
    expect(emitted![0]![0]).toEqual({
      slug: 'support-agent',
      name: 'Support Agent',
      description: 'Handles tickets',
    })
  })

  it('shows a client validation error after a submit attempt on an invalid form and emits nothing', async () => {
    const wrapper = await mountSuspended(RoleFormDialog, {
      props: { open: true, mode: 'create', ...labels },
    })
    await wrapper.find('[data-testid="role-form"]').trigger('submit')
    expect(wrapper.find('#role_slug-error').exists()).toBe(true)
    expect(wrapper.emitted('submit')).toBeFalsy()
  })
})

describe('RoleFormDialog — edit mode', () => {
  it('disables the slug field, prefills metadata, and emits an update payload without a slug', async () => {
    const wrapper = await mountSuspended(RoleFormDialog, {
      props: { open: true, mode: 'edit', role: sampleRole, ...labels },
    })
    const slugInput = wrapper.find('#role_slug').element as HTMLInputElement
    expect(slugInput.value).toBe('support-agent')
    expect(slugInput.disabled).toBe(true)
    expect((wrapper.find('#role_name').element as HTMLInputElement).value).toBe('Support Agent')

    await wrapper.find('#role_name').setValue('Senior Support Agent')
    await wrapper.find('[data-testid="role-form"]').trigger('submit')
    expect(wrapper.emitted('submit')![0]![0]).toEqual({
      name: 'Senior Support Agent',
      description: 'Handles tickets',
    })
  })
})

describe('RoleFormDialog — server failure surfaces', () => {
  it('renders server field errors passed from the page', async () => {
    const wrapper = await mountSuspended(RoleFormDialog, {
      props: {
        open: true,
        mode: 'create',
        fieldErrors: { slug: 'Slug already registered.', name: undefined, description: undefined },
        ...labels,
      },
    })
    expect(wrapper.find('#role_slug-error').text()).toContain('already registered.')
  })

  it('redacts the request id to a REF- reference and never prints it raw', async () => {
    const wrapper = await mountSuspended(RoleFormDialog, {
      props: {
        open: true,
        mode: 'create',
        errorMessage: 'Something went wrong.',
        requestId: 'admin-req-SECRET77',
        ...labels,
      },
    })
    expect(wrapper.text()).toContain('REF-')
    expect(wrapper.text()).not.toContain('admin-req-SECRET77')
  })

  it('renders the step-up re-auth link when stepUpUrl is set', async () => {
    const wrapper = await mountSuspended(RoleFormDialog, {
      props: {
        open: true,
        mode: 'create',
        stepUpUrl: '/auth/login?prompt=login&max_age=0',
        ...labels,
      },
    })
    const link = wrapper.find('[data-testid="step-up-link"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/auth/login?prompt=login&max_age=0')
  })

  it('emits cancel without emitting submit when cancel is clicked', async () => {
    const wrapper = await mountSuspended(RoleFormDialog, {
      props: { open: true, mode: 'create', ...labels },
    })
    const cancel = wrapper.findAll('button').find((b) => b.text() === 'Cancel')
    expect(cancel).toBeTruthy()
    await cancel!.trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
    expect(wrapper.emitted('submit')).toBeFalsy()
  })
})
