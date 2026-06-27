import { handleLogin } from '../../utils/auth-handlers'
import { methodNotAllowed, sendAppResponse } from '../../utils/response'

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') return sendAppResponse(event, methodNotAllowed())
  sendAppResponse(event, await handleLogin(getRequestURL(event)))
})
