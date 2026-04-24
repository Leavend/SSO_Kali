# Admin Auth Funnel Synthetic Monitoring

## Purpose
Probe ini memverifikasi funnel admin tanpa mengirim kredensial sungguhan:
- landing page `Secure Admin Sign-In` tetap tampil
- `/auth/login` tetap mengarah ke broker `/authorize`
- broker tetap meneruskan `prompt=login` dan `max_age=0` ke upstream authorize
- halaman status aman tetap tersedia

## Command
```bash
REPORT_DIR=/tmp/admin-auth-funnel \
BASE_URL=https://dev-sso.timeh.my.id \
EXPORTER_METRICS_URL=http://127.0.0.1:9108/metrics \
bash /Users/leavend/Desktop/Project_SSO/infra/sre/probe-admin-auth-funnel.sh
```

## Evidence
- `landing.html`
- `login.headers`
- `broker-authorize.headers`
- `access-denied.html`
- `invalid-credentials.html`
- `reauth-required.html`
- `metrics.prom` when `EXPORTER_METRICS_URL` is provided
- `summary.md`

## Expected Outcome
- exit code `0`
- summary shows all probe stages as `PASS`
- broker authorize response still forwards `prompt=login` and `max_age=0`
