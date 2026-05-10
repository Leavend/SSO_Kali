import http from 'k6/http';
import { check, fail } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'https://api-sso.timeh.my.id';
const ACCESS_TOKEN = __ENV.STRESS_ACCESS_TOKEN || '';

export const options = {
  scenarios: {
    valid_profile_read: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.STRESS_RATE || 20),
      timeUnit: '1s',
      duration: __ENV.STRESS_DURATION || '45s',
      preAllocatedVUs: Number(__ENV.STRESS_PREALLOCATED_VUS || 20),
      maxVUs: Number(__ENV.STRESS_MAX_VUS || 80),
      exec: 'validProfileRead',
    },
    valid_connected_apps_read: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.STRESS_CONNECTED_APPS_RATE || 10),
      timeUnit: '1s',
      duration: __ENV.STRESS_DURATION || '45s',
      preAllocatedVUs: Number(__ENV.STRESS_CONNECTED_APPS_PREALLOCATED_VUS || 10),
      maxVUs: Number(__ENV.STRESS_CONNECTED_APPS_MAX_VUS || 40),
      startTime: __ENV.STRESS_CONNECTED_APPS_START_TIME || '50s',
      exec: 'validConnectedAppsRead',
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
    'http_req_duration{name:valid-profile}': ['p(95)<500', 'p(99)<1500'],
    'http_req_duration{name:valid-connected-apps}': ['p(95)<500', 'p(99)<1500'],
  },
};

function requireAccessToken() {
  if (!ACCESS_TOKEN) {
    fail('STRESS_ACCESS_TOKEN is required for valid-token production stress.');
  }
}

export function setup() {
  requireAccessToken();
}

function headers() {
  return {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'X-Request-ID': `stress-valid-profile-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    redirects: 0,
  };
}

export function validProfileRead() {
  const response = http.get(`${BASE_URL}/api/profile`, {
    ...headers(),
    tags: { name: 'valid-profile' },
  });

  check(response, {
    'valid profile returns 200, 401, or throttle 429': (r) => [200, 401, 429].includes(r.status),
    'valid profile is not 5xx': (r) => r.status < 500,
    'valid profile does not expose token material': (r) => !String(r.body || '').match(/access_token|refresh_token|client_secret/i),
  });
}

export function validConnectedAppsRead() {
  const response = http.get(`${BASE_URL}/api/profile/connected-apps`, {
    ...headers(),
    tags: { name: 'valid-connected-apps' },
  });

  check(response, {
    'valid connected apps returns 200, 401, or throttle 429': (r) => [200, 401, 429].includes(r.status),
    'valid connected apps is not 5xx': (r) => r.status < 500,
    'valid connected apps does not expose token material': (r) => !String(r.body || '').match(/access_token|refresh_token|client_secret/i),
  });
}
