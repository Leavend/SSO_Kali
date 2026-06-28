// SSR token-leak fixture: empty masked scope catalog so useScopeCatalog resolves
// deterministically during the gate render rather than failing closed against the
// unreachable backend. No token/secret/PII.
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({ scopes: [] }))
