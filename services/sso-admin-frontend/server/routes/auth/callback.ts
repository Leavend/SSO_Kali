import { handleCallback, handleCallbackSession } from '../../utils/auth-handlers'
import { methodNotAllowed, sendAppResponse } from '../../utils/response'

export default defineEventHandler(async (event) => {
  if (event.method === 'GET')
    return sendAppResponse(event, await handleCallback(event.node.req, getRequestURL(event)))
  if (event.method === 'POST')
    return sendAppResponse(event, await handleCallbackSession(event.node.req))
  sendAppResponse(event, methodNotAllowed())
})
