# UAT Runbook Template — FR/UC SSO

**Requirement source:** `docs/requirements/fr_uc_sso_practical_reader.md`
**Audit source:** `docs/audits/fr-uc-sso-uat-audit.md`
**Service scope:** `services/sso-frontend`, `services/sso-backend`
**Run date:** `<YYYY-MM-DD>`
**Environment:** `<prod|staging|local>`
**Commit/SHA:** `<sha>`
**Tester:** `<name>`

## 1. Safety Rules

- Do not capture raw access tokens, refresh tokens, client secrets, password values, or full cookies.
- Redact `Authorization`, `Cookie`, `Set-Cookie`, `client_secret`, `code`, `id_token`, `access_token`, `refresh_token` in HAR/API artifacts.
- Retain `X-Request-ID`, `X-Error-Ref`, timestamps, URL path, status code, and scenario ID.
- Use dedicated UAT accounts and clients; never use personal production accounts unless explicitly approved.
- Stop on security regression: token in browser storage, raw stack trace, secret in UI/log, cross-origin credential leak, unexpected 401 loop after login.

## 2. Execution Summary

| Field | Value |
| --- | --- |
| UAT batch | `<batch-name>` |
| Requirement version | `Reader-Friendly v1.0` |
| Code baseline | `<branch>@<sha>` |
| Deploy evidence | `<CI/deploy link>` |
| Test data pack | `<users/clients/admin roles>` |
| Overall result | `<PASS|PASS-WITH-RISK|PARTIAL|BLOCKED|FAIL>` |

## 3. Smoke Gate

| ID | Scenario | Result | Evidence | Notes |
| --- | --- | --- | --- | --- |
| UAT-001 | Portal login + cookie proxy regression | `<PASS/FAIL>` | `<HAR/log link>` | Verify all auth cookies + `/api/auth/session` 200 |
| UAT-002 | OIDC metadata/JWKS | `<PASS/FAIL>` | `<curl/log>` | Issuer/endpoints/cache headers consistent |
| UAT-003 | Session hydration | `<PASS/FAIL>` | `<screenshot/HAR>` | `/home`, `/profile`, `/apps`, `/sessions` no 401 loop |
| UAT-004 | Safe error UX | `<PASS/FAIL>` | `<screenshot/request-id>` | no raw exception/secret |

## 4. Scenario Log

Copy one block per executed scenario.

### `<UAT-ID>` — `<Scenario name>`

| Field | Value |
| --- | --- |
| UC/FR | `<UC-xx / FR-xxx>` |
| Actor | `<A-01/A-02/...>` |
| Preconditions | `<state>` |
| Steps | `1. ... 2. ... 3. ...` |
| Expected | `<expected behavior>` |
| Actual | `<actual behavior>` |
| Result | `<PASS|PASS-WITH-RISK|PARTIAL|BLOCKED|FAIL>` |
| Evidence | `<links/files>` |
| Request IDs | `<X-Request-ID values>` |
| Error refs | `<X-Error-Ref values>` |
| Defects | `<issue links>` |
| Retest needed | `<yes/no>` |

## 5. UC Signoff Matrix

| UC | Result | Evidence | Defect/Risk | Signoff owner |
| --- | --- | --- | --- | --- |
| UC-01 | `<status>` | `<link>` | `<none|risk>` | `<name>` |
| UC-02 | `<status>` | `<link>` | `<none|risk>` | `<name>` |
| UC-03 | `<status>` | `<link>` | `<none|risk>` | `<name>` |
| UC-04 | `<status>` | `<link>` | `<none|risk>` | `<name>` |
| UC-05 | `<status>` | `<link>` | `<none|risk>` | `<name>` |
| UC-06 | `<status>` | `<link>` | `<none|risk>` | `<name>` |
| UC-07 | `<status>` | `<link>` | `<none|risk>` | `<name>` |
| UC-08 | `<status>` | `<link>` | `<none|risk>` | `<name>` |
| UC-09 | `<status>` | `<link>` | `<none|risk>` | `<name>` |
| UC-10–UC-21 | `<status>` | `<link>` | `<none|risk>` | `<name>` |
| UC-22–UC-33 | `<status>` | `<link>` | `<none|risk>` | `<name>` |
| UC-34–UC-42 | `<status>` | `<link>` | `<none|risk>` | `<name>` |
| UC-43–UC-50 | `<status>` | `<link>` | `<none|risk>` | `<name>` |
| UC-51–UC-65 | `<API-only/PARTIAL>` | `<link>` | `admin UI dedicated app pending` | `<name>` |
| UC-66–UC-76 | `<status>` | `<link>` | `<none|risk>` | `<name>` |
| UC-77–UC-83 | `<status>` | `<link>` | `<ops drill evidence>` | `<name>` |

## 6. Defect Register

| Defect ID | Severity | UC/FR | Area | Summary | Evidence | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `<BUG-001>` | `<Blocker/Major/Minor>` | `<UC/FR>` | `<FE/BE/Ops>` | `<summary>` | `<link>` | `<owner>` | `<open>` |

## 7. Final Signoff

| Role | Name | Decision | Date | Notes |
| --- | --- | --- | --- | --- |
| Product/BA | `<name>` | `<approve/reject>` | `<date>` | `<notes>` |
| QA/UAT Lead | `<name>` | `<approve/reject>` | `<date>` | `<notes>` |
| Security | `<name>` | `<approve/reject>` | `<date>` | `<notes>` |
| Engineering | `<name>` | `<approve/reject>` | `<date>` | `<notes>` |
| Ops | `<name>` | `<approve/reject>` | `<date>` | `<notes>` |
