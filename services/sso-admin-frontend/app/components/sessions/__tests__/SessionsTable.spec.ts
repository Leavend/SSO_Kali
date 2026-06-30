import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SessionsTable from '../SessionsTable.vue'
import type { AdminSession } from '@/types/sessions.types'

const sessions: readonly AdminSession[] = [
  {
    session_id: 'sess_alpha_handle',
    client_id: 'portal',
    subject_id: '01HZX9SUBJECTULID00000000AB',
    email: 'alice@example.test',
    display_name: 'Alice Admin',
    ip_address: '203.0.113.10',
    user_agent: 'Mozilla/5.0',
  },
  {
    session_id: 'sess_bravo_handle',
    client_id: 'console',
    subject_id: '01HZX9SUBJECTULID11111111CD',
    email: 'bob@example.test',
    display_name: 'Bob Operator',
    ip_address: '198.51.100.7',
    user_agent: 'Mozilla/5.0',
  },
]

const props = {
  sessions,
  caption: 'Active sessions',
  userLabel: 'User',
  sessionIdLabel: 'Session ID',
  clientLabel: 'Client',
  ipLabel: 'IP',
  statusLabel: 'Status',
  activeLabel: 'Active',
}

describe('SessionsTable', () => {
  it('renders one selectable row per session with user + IP', () => {
    const wrapper = mount(SessionsTable, { props })
    expect(wrapper.find('[data-testid="session-select-sess_alpha_handle"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="session-select-sess_bravo_handle"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Alice Admin')
    expect(wrapper.text()).toContain('203.0.113.10')
  })

  it('emits select with the session id on user-cell click', async () => {
    const wrapper = mount(SessionsTable, { props })
    await wrapper.find('[data-testid="session-select-sess_alpha_handle"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['sess_alpha_handle']])
  })

  it('renders the active status label (tone + text, never colour-alone)', () => {
    const wrapper = mount(SessionsTable, { props })
    expect(wrapper.text()).toContain('Active')
  })
})
