# RBAC + Permission Matrix

- Status: Proposed
- Date: 2026-04-05
- Owners: IAM Architecture, Security Lead

## As-Built Reality

Today, effective Admin Panel access is gated by the runtime role `admin`.
This document defines the target v2.0 role model without claiming that the full matrix is already live.

## Target Roles

| Role | Purpose |
|---|---|
| `SSO_AUDITOR` | read-only operational visibility |
| `SSO_SESSION_ADMIN` | session management operations |
| `SSO_SYSTEM_ADMIN` | platform and policy governance |
| `BREAK_GLASS_ADMIN` | emergency-only privileged recovery |

## Permission Matrix

| Capability | `SSO_AUDITOR` | `SSO_SESSION_ADMIN` | `SSO_SYSTEM_ADMIN` | `BREAK_GLASS_ADMIN` |
|---|---|---|---|---|
| Sign in to Admin Panel | Yes | Yes | Yes | Yes |
| View dashboard summary | Yes | Yes | Yes | Yes |
| View users list | Yes | Yes | Yes | Yes |
| View sessions list | Yes | Yes | Yes | Yes |
| View clients/apps list | Yes | Yes | Yes | Yes |
| View user detail | Yes | Yes | Yes | Yes |
| Revoke one session | No | Yes | Yes | Yes |
| Revoke all sessions for one user | No | Yes | Yes | Yes |
| Change security policy | No | No | Yes | Emergency only |
| Manage admin roles | No | No | Yes | Emergency only |
| Impersonation | No | No | No | No |
| Password administration in Admin Panel | No | No | No | No |

## Freshness Matrix

| Capability | Minimum role | Freshness | MFA | Audit |
|---|---|---|---|---|
| Open dashboard | `SSO_AUDITOR` | <= `15 min` | Required | login event |
| Read-only navigation | `SSO_AUDITOR` | valid session | Required at session start | standard access telemetry |
| Revoke one session | `SSO_SESSION_ADMIN` | <= `5 min` | Required | immutable audit |
| Revoke all sessions | `SSO_SESSION_ADMIN` | <= `5 min` | Required | immutable audit |
| System-level settings | `SSO_SYSTEM_ADMIN` | <= `5 min` or immediate step-up | Strong MFA | immutable audit |
| Break-glass recovery | `BREAK_GLASS_ADMIN` | immediate reauth | Strongest available | elevated immutable audit |

## UI Policy

| UI element | `SSO_AUDITOR` | `SSO_SESSION_ADMIN` | `SSO_SYSTEM_ADMIN` |
|---|---|---|---|
| Dashboard cards | visible | visible | visible |
| Session tables | visible | visible | visible |
| Revoke buttons | hidden or disabled | visible | visible |
| Revoke-all actions | hidden or disabled | visible | visible |
| Security settings navigation | hidden | hidden | visible when implemented |

## Guardrail Rules

- `SSO_AUDITOR` must never receive destructive controls
- `SSO_SESSION_ADMIN` may manage sessions but not system policy
- `SSO_SYSTEM_ADMIN` is the normal role for future policy administration
- `BREAK_GLASS_ADMIN` must not be used for daily operations
- impersonation is prohibited for all roles
- password-management features are prohibited in the Admin Panel
