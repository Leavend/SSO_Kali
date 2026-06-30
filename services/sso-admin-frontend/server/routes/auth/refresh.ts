import { handleRefresh } from '../../utils/auth-handlers'
import { methodNotAllowed, sendAppResponse } from '../../utils/response'

export default defineEventHandler(async (event) => {
  if (event.method !== 'POST') return sendAppResponse(event, methodNotAllowed())
  sendAppResponse(event, await handleRefresh(event.node.req))
})
