import { handleAdminApiProxy } from '../../../utils/admin-proxy'
import { sendAppResponse } from '../../../utils/response'

export default defineEventHandler(async (event) => {
  sendAppResponse(
    event,
    await handleAdminApiProxy({ request: event.node.req, requestUrl: getRequestURL(event) }),
  )
})
