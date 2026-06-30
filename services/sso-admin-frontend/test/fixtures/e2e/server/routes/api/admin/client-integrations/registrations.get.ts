// SSR token-leak fixture: empty masked staged-registration list so
// useClientsList's parallel clientsApi.registrations() resolves deterministically
// during the gate render rather than rejecting against the unreachable backend.
// No token/secret/PII.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({ registrations: [] }))
