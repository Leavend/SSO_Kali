// Pure, Nuxt-free descriptor table for the client lifecycle/destructive actions.
// Each entry encodes the backend contract (extract-backend §lifecycle): the
// CLIENTS_WRITE + SESSIONS_TERMINATE permission pair (every lifecycle route lives
// in the session-management destructive group), the step-up-implied confirm, the
// reason policy, the type-to-confirm-by-client_id gate for delete, the danger
// affordance, and which statuses the action applies to. No Vue, no network, no DOM
// — unit-testable in isolation so descriptor drift is caught before the surface.
// ReasonPolicy + isReasonValid are reused from the generic users helper.
import type { ReasonPolicy } from '@/lib/users/user-actions'
import type { ClientStatus } from '@/types/clients.types'

export type ClientActionId = 'activate' | 'disable' | 'decommission' | 'delete'

export type ClientActionDescriptor = {
  readonly id: ClientActionId
  readonly permission: 'admin.clients.write'
  readonly secondaryPermission: 'admin.sessions.terminate'
  readonly confirmRequired: boolean
  readonly reason: ReasonPolicy
  readonly confirmByClientId: boolean
  readonly danger: boolean
  readonly appliesTo: readonly ClientStatus[]
}

export const CLIENT_ACTIONS: Readonly<Record<ClientActionId, ClientActionDescriptor>> = {
  activate: {
    id: 'activate',
    permission: 'admin.clients.write',
    secondaryPermission: 'admin.sessions.terminate',
    confirmRequired: true,
    reason: null,
    confirmByClientId: false,
    danger: false,
    appliesTo: ['staged'],
  },
  disable: {
    id: 'disable',
    permission: 'admin.clients.write',
    secondaryPermission: 'admin.sessions.terminate',
    confirmRequired: true,
    reason: { required: false, max: 255 },
    confirmByClientId: false,
    danger: true,
    appliesTo: ['active'],
  },
  decommission: {
    id: 'decommission',
    permission: 'admin.clients.write',
    secondaryPermission: 'admin.sessions.terminate',
    confirmRequired: true,
    reason: { required: false, max: 255 },
    confirmByClientId: false,
    danger: true,
    appliesTo: ['active', 'disabled'],
  },
  delete: {
    id: 'delete',
    permission: 'admin.clients.write',
    secondaryPermission: 'admin.sessions.terminate',
    confirmRequired: true,
    reason: null,
    confirmByClientId: true,
    danger: true,
    appliesTo: ['active', 'staged', 'disabled', 'decommissioned'],
  },
}
