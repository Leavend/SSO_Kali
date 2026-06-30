// SSR token-leak fixture: a representative masked dashboard summary so the §3.3
// gate renders the dashboard in its READY state and the existing payload
// collectors also cover the summary DTO (counters + timestamp). Values are small
// aggregates — no token, secret, identifier, or PII-shaped digit run (a more
// specific route wins over the layer's catch-all server/routes/api/admin/[...].ts).
//
// Cookie toggle: set e2e_dashboard_status=<code> (e.g. 500) to exercise the
// dashboard error view in SSR — page.route() cannot intercept SSR fetches.
import { defineEventHandler, getCookie, setResponseStatus, setResponseHeader } from 'h3'

export default defineEventHandler((event) => {
  const statusCookie = getCookie(event, 'e2e_dashboard_status')
  const statusCode = statusCookie ? parseInt(statusCookie, 10) : 0
  if (statusCode >= 400) {
    setResponseStatus(event, statusCode)
    // ponytail: stable request-id so the spec can assert REF-DASHFAIL
    setResponseHeader(event, 'x-request-id', 'e2e-dash-fail')
    return { error: 'e2e', message: 'e2e' }
  }

  return {
    generated_at: '2026-06-28T14:32:15Z',
    partial: false,
    degraded: [],
    counters: {
      users: { total: 1250, active: 1100, disabled: 50, deactivated: 100, locked: 0 },
      sessions: { portal_active: 420, rp_active: 380 },
      clients: { total: 85, active: 72, staged: 8, decommissioned: 5 },
      audit: { admin_last_24h: 2340, auth_last_24h: 18500 },
      incidents: { admin_denied_last_24h: 12 },
      data_subject_requests: { submitted: 3, approved: 7, rejected: 2, fulfilled: 18, on_hold: 1 },
    },
  }
})
