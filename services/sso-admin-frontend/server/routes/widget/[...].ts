import { proxyToSsoBackend } from '../../utils/sso-backend-proxy'
import { shouldProxyAdminWidgetPath } from '../../utils/widget-routes'
import { json, sendAppResponse } from '../../utils/response'

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  if (!shouldProxyAdminWidgetPath(url.pathname)) {
    return sendAppResponse(
      event,
      json(404, { error: 'not_found', message: 'Unknown widget path.' }),
    )
  }
  sendAppResponse(event, await proxyToSsoBackend(event.node.req, url))
})
