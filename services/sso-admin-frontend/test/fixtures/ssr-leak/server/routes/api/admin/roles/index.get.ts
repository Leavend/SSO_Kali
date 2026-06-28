// SSR token-leak fixture: empty masked roles list so UserRoleAssignment's
// useAsyncData('admin-roles-list') resolves deterministically during the gate
// render rather than failing against the unreachable backend. No token/secret/PII.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({ roles: [] }))
