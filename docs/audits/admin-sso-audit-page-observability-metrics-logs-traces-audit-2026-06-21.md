# Audit: Rework `/audit` Menjadi SSO Observability Cockpit

**Tanggal:** 2026-06-21
**Scope:** `services/sso-admin-frontend`, `services/sso-backend`, `infra/observability`
**Status:** Diimplementasikan v1 lokal; belum menjalankan CI/build image/deploy VPS.

## Context

Halaman `/audit` sebelumnya adalah compliance evidence surface: admin audit events, authentication events, consent trail, export evidence, retention integrity, dan DSR. Kebutuhan baru adalah menjadikan `/audit` sebagai cockpit observability utama untuk SSO-Backend, SSO-Portal, dan Admin-SSO dengan sinyal Metrics, Logs, dan Traces.

Repo sudah memiliki pondasi observability, tetapi belum tersambung ke Admin UI secara aman:

- `sso-backend` memiliki `/health`, `/ready`, `/_internal/performance-metrics`, dan `/_internal/queue-metrics`.
- Internal metrics dilindungi `EnsureInternalMetricsToken`; browser tidak boleh menerima token tersebut.
- `infra/observability` sudah berisi Prometheus, Grafana dashboard, Alertmanager, blackbox exporter, Traefik metrics, dan `sso_kpi_exporter.py`.
- Belum ditemukan pipeline Loki/Tempo/OpenTelemetry Collector end-to-end untuk logs/traces.
- Admin BFF sebelumnya hanya membuka `/api/admin/ops/readiness`, belum ada `/api/admin/observability/summary`.

Keputusan implementasi v1: `/audit` menjadi observability cockpit, sedangkan compliance evidence lama dipertahankan di `/audit/compliance`.

## Issue List

### ISS-OBS1 · P1 — `/audit` masih compliance evidence, bukan observability cockpit

**Fix v1:** Route `/audit` diarahkan ke `AuditObservabilityPage.vue`. Compliance audit lama tetap hidup sebagai `/audit/compliance`, sehingga export, integrity, retention, consent, dan DSR tidak hilang.

### ISS-OBS2 · P1 — Tidak ada Admin Observability API aman untuk UI

**Fix v1:** Ditambahkan `/admin/api/observability/summary` di backend dan `/api/admin/observability/summary` di Admin BFF. Endpoint ini permission-gated, `no-store`, dan tidak mengekspos internal metrics token, Prometheus, Docker logs, Loki, atau Tempo langsung ke browser.

### ISS-OBS3 · P1 — Metrics belum mewakili tiga layanan utama

**Fix v1:** Aggregator menyajikan service cards untuk `sso-backend`, `sso-portal`, dan `admin-sso` dengan status, request rate, error rate, freshness, queue snapshot, auth funnel, dan admin activity dari sumber lokal yang tersedia.

### ISS-OBS4 · P1 — Logs belum queryable dari Admin UI

**Fix v1:** Logs v1 memakai recent correlated events dari admin/auth audit tanpa context mentah. Payload hanya membawa service, severity, message, support reference, dan timestamp.

### ISS-OBS5 · P1 — Traces belum punya pipeline nyata

**Fix v1:** Trace panel menampilkan state eksplisit `unavailable` dengan next step OpenTelemetry/Tempo. Ini mencegah UI berpura-pura punya distributed tracing sebelum pipeline benar-benar ada.

### ISS-OBS6 · P2 — UI compliance lama tidak cocok untuk dashboard observability

**Fix v1:** UI baru berisi health strip, service cards, Metrics/Logs/Traces tabs, partial telemetry banner, refresh action, auto-refresh 15 detik yang berhenti saat tab hidden, dan evidence context panel.

### ISS-OBS7 · P2 — Permission/security boundary belum tepat

**Fix v1:** Ditambahkan permission eksplisit `admin.observability.read`, migration data untuk environment existing, menu `audit` sekarang membutuhkan permission tersebut, dan frontend route meta `/audit` ikut memakai permission baru. Compliance route tetap memakai `admin.audit.read`.

## Plan Lanjutan

- Tambahkan Prometheus query adapter backend bila ingin p95 latency/error-rate aktual dari Prometheus, bukan estimasi dari audit counters.
- Tambahkan Loki/Promtail atau OpenTelemetry Collector untuk log querying penuh yang tetap ter-redact.
- Tambahkan trace propagation `traceparent` dari Admin BFF/Portal BFF ke backend, lalu export spans ke Collector/Tempo.
- Tambahkan visual QA browser setelah branch stabil untuk memastikan dashboard dense tetap clean di desktop dan mobile.

## Verifikasi Lokal yang Direncanakan

```bash
cd /Users/leavend/Project_SSO/services/sso-backend
vendor/bin/pest tests/Feature/Admin/AdminObservabilitySummaryContractTest.php

cd /Users/leavend/Project_SSO/services/sso-admin-frontend
npm run test:unit -- --run \
  src/features/observability/services/__tests__/observability.api.spec.ts \
  src/features/observability/stores/__tests__/observability.store.spec.ts \
  src/features/observability/pages/__tests__/AuditObservabilityPage.spec.ts \
  src/server/__tests__/admin-proxy.spec.ts \
  src/server/__tests__/preload-links.spec.ts \
  src/__tests__/menu-route-contract.spec.ts
```

## File Referensi

| File | Peran |
|---|---|
| `services/sso-backend/app/Services/Admin/AdminObservabilitySummaryService.php` | Aggregator Metrics/Logs/Traces v1 |
| `services/sso-backend/app/Http/Controllers/Admin/ObservabilitySummaryController.php` | Admin API read-only boundary |
| `services/sso-admin-frontend/src/features/observability/pages/AuditObservabilityPage.vue` | Cockpit `/audit` baru |
| `services/sso-admin-frontend/src/features/audit/pages/AuditPage.vue` | Compliance evidence lama, kini `/audit/compliance` |
| `services/sso-admin-frontend/src/server/admin-proxy.ts` | BFF allowlist endpoint observability |
| `infra/observability/*` | Sumber lanjutan Prometheus/Grafana/Alertmanager |
