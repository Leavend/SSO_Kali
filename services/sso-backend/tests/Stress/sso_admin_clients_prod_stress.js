import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'https://api-sso.timeh.my.id';
const CLIENT_ID = __ENV.STRESS_CLIENT_ID_PARAM || 'client_stress_sso_prod';
const RATE = Number(__ENV.STRESS_RATE || 8);
const DURATION = __ENV.STRESS_DURATION || '45s';

export const options = {
  scenarios: {
    admin_clients_index: scenario('adminClientsIndex', 0),
    admin_clients_store: scenario('adminClientsStore', 50),
    admin_clients_show: scenario('adminClientsShow', 100),
    admin_clients_update: scenario('adminClientsUpdate', 150),
    admin_clients_destroy: scenario('adminClientsDestroy', 200),
    admin_clients_scopes_sync: scenario('adminClientsScopesSync', 250),
  },
  thresholds: {
    checks: ['rate>0.99'],
    'http_req_duration{name:admin-clients-index}': ['p(95)<500', 'p(99)<1500'],
    'http_req_duration{name:admin-clients-store}': ['p(95)<500', 'p(99)<1500'],
    'http_req_duration{name:admin-clients-show}': ['p(95)<500', 'p(99)<1500'],
    'http_req_duration{name:admin-clients-update}': ['p(95)<500', 'p(99)<1500'],
    'http_req_duration{name:admin-clients-destroy}': ['p(95)<500', 'p(99)<1500'],
    'http_req_duration{name:admin-clients-scopes-sync}': ['p(95)<500', 'p(99)<1500'],
  },
};

function scenario(exec, startSeconds) {
  return {
    executor: 'constant-arrival-rate',
    rate: RATE,
    timeUnit: '1s',
    duration: DURATION,
    preAllocatedVUs: 8,
    maxVUs: 30,
    startTime: `${startSeconds}s`,
    exec,
  };
}

function params(name, prefix) {
  return {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Request-ID': `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    redirects: 0,
    tags: { name },
  };
}

function assertAdminGuard(response, label) {
  check(response, {
    [`${label} rejects without bearer token`]: (r) => [401, 405, 429].includes(r.status),
    [`${label} is not 5xx`]: (r) => r.status < 500,
    [`${label} does not expose sensitive material`]: (r) => !String(r.body || '').match(/"(?:access_token|id_token|refresh_token|client_secret|password|private_key)"\s*:|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/i),
  });
}

function jsonBody() {
  return JSON.stringify({});
}

export function adminClientsIndex() {
  assertAdminGuard(
    http.get(`${BASE_URL}/admin/api/clients`, params('admin-clients-index', 'stress-admin-clients-index')),
    'admin clients index',
  );
}

export function adminClientsStore() {
  assertAdminGuard(
    http.post(`${BASE_URL}/admin/api/clients`, jsonBody(), params('admin-clients-store', 'stress-admin-clients-store')),
    'admin clients store',
  );
}

export function adminClientsShow() {
  assertAdminGuard(
    http.get(`${BASE_URL}/admin/api/clients/${CLIENT_ID}`, params('admin-clients-show', 'stress-admin-clients-show')),
    'admin clients show',
  );
}

export function adminClientsUpdate() {
  assertAdminGuard(
    http.put(`${BASE_URL}/admin/api/clients/${CLIENT_ID}`, jsonBody(), params('admin-clients-update', 'stress-admin-clients-update')),
    'admin clients update',
  );
}

export function adminClientsDestroy() {
  assertAdminGuard(
    http.del(`${BASE_URL}/admin/api/clients/${CLIENT_ID}`, jsonBody(), params('admin-clients-destroy', 'stress-admin-clients-destroy')),
    'admin clients destroy',
  );
}

export function adminClientsScopesSync() {
  assertAdminGuard(
    http.put(
      `${BASE_URL}/admin/api/clients/${CLIENT_ID}/scopes`,
      jsonBody(),
      params('admin-clients-scopes-sync', 'stress-admin-clients-scopes-sync'),
    ),
    'admin clients scopes sync',
  );
}
