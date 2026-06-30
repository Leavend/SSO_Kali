import { handleLogout } from '../../utils/auth-handlers'
import { methodNotAllowed, sendAppResponse } from '../../utils/response'

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') return sendAppResponse(event, methodNotAllowed())
  sendAppResponse(event, await handleLogout(event.node.req))
})
