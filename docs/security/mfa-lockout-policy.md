# MFA & Lockout Policy

- Status: Proposed
- Date: 2026-04-05
- Owners: IAM Architecture, Security Lead

## Scope

This policy governs authentication assurance for:

- Broker-mediated authentication
- hosted login security posture
- Admin Panel access
- privileged session-management actions

## Password Policy

| Control | Policy |
|---|---|
| Minimum length | `12` characters |
| Maximum accepted length | `128` characters |
| Passphrases | allowed and encouraged |
| Breached password screening | required |
| Reuse prevention | last `10` passwords blocked |
| Temporary credentials | must be rotated on first use |
| Password handling in Admin Panel | forbidden |

## MFA Policy

| Role or surface | MFA policy |
|---|---|
| Standard end-user login | recommended, org policy driven |
| `SSO_AUDITOR` | required |
| `SSO_SESSION_ADMIN` | required |
| `SSO_SYSTEM_ADMIN` | required, stronger assurance expected |
| Break-glass admin | required, emergency-only process |

## MFA Preference Order

1. WebAuthn or passkey
2. TOTP authenticator app
3. Recovery code for emergency use only

Rejected as primary factors for admin access:

- SMS OTP
- email OTP

## Lockout Policy

| Control | Policy |
|---|---|
| Failed-attempt threshold | `5` attempts |
| Soft lock duration | `15 minutes` |
| Progressive delay | begins after `3` failed attempts |
| Per-IP throttling | required |
| Per-identifier throttling | required |
| Password spray detection | required |
| Admin account monitoring | elevated |

## Anti-Brute-Force Rules

- throttle by source IP
- throttle by normalized identifier
- detect repeated attempts against privileged identities
- emit security telemetry on:
  - lockout
  - repeated invalid credential events
  - repeated MFA failure
  - suspicious admin login attempts

## Anti-Enumeration Rules

Public-facing login UX must not reveal whether the failure was caused by:

- unknown account
- wrong password
- wrong MFA
- ambiguous alias

Public UI should remain generic even if internal machine-readable errors differ.

## Freshness Policy Alignment

| Action class | Freshness requirement |
|---|---|
| Admin dashboard entry | <= `15 minutes` |
| Destructive admin action | <= `5 minutes` |

## Audit Requirements

The following events must be recorded immutably:

- admin login success
- admin login failure
- lockout start
- lockout end or administrative release
- MFA challenge issued
- MFA challenge failed
- MFA satisfied
- `reauth_required`
- destructive action success
- destructive action deny

## Business Principle

The Admin Panel is not a password-management tool.
It is an operational control plane for sessions and SSO clients.
