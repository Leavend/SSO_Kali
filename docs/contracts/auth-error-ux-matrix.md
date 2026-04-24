# Auth Error UX Matrix

## Status

- Status: Active working contract
- Date: 2026-04-09
- Surfaces:
  - `dev-sso.timeh.my.id`
  - `id.dev-sso.timeh.my.id`

## Purpose

This matrix aligns:

- machine-readable auth errors
- `dev-sso` recovery pages
- hosted-login message keys in `id.dev-sso`
- user-facing posture

The goal is to keep all auth failures:

- professional
- concise
- non-leaky
- operationally recoverable

## Admin Surface Matrix

| Scenario | Taxonomy | `dev-sso` Route | User Posture | Primary Recovery |
|---|---|---|---|---|
| Admin account is authenticated but not allowed | `forbidden` | `/access-denied` | explain access restriction without server detail | go back to secure sign-in |
| Admin session is valid but not fresh enough | `reauth_required` | `/reauth-required` | request step-up verification | re-verify identity |
| Credentials or sign-in attempt could not be verified | `invalid_credentials` | `/invalid-credentials` | generic auth failure | restart secure sign-in |
| Sign-in requires an additional factor | `mfa_required` | `/mfa-required` | request additional verification without internal detail | continue secure sign-in |
| OIDC or broker handshake could not be completed | `handshake_failed` | `/handshake-failed` | explain secure handshake failure without internals | retry secure sign-in |
| Secure sign-in is temporarily throttled | `too_many_attempts` | `/too-many-attempts` | explain temporary protection without lockout internals | wait, then retry secure sign-in |

## Hosted Login Key Coverage

### `forbidden`

- `linkingNotAllowed`
- `localAuthenticationNotAllowed`
- `passkeysNotAllowed`
- `userInitialStateNotSupported`
- `userNotActive`

### `reauth_required`

- `codeOrVerificationRequired`
- `passwordVerificationMissing`
- `passwordVerificationTooOld`
- `verificationRequired`

### `invalid_credentials`

- `couldNotSearchUsers`
- `couldNotVerifyPassword`
- `failedToAuthenticate`
- `failedToAuthenticateNoLimit`

### `mfa_required`

- `codeOrVerificationRequired`
- `passwordVerificationMissing`
- `passwordVerificationTooOld`
- `verificationRequired`

### `handshake_failed`

- `contextMissing`
- `couldNotFindSession`
- `couldNotGetLoginSettings`
- `couldNotUpdateSession`
- `missingParameters`
- `sessionExpired`
- `sessionNotValid`
- `unknownContext`

### `too_many_attempts`

- `failedToAuthenticateNoLimit`
- `lockoutMessage`

### Hosted Login Lifecycle States

These remain hosted-login-first states and do not currently map to dedicated `dev-sso` pages:

#### Account state

- `userNotActive`

#### Password reset / set-password

- `couldNotChangePassword`
- `couldNotResetPassword`
- `couldNotSendResetLink`
- `couldNotSetPassword`

#### Email verification

- `couldNotResendEmail`
- `couldNotVerifyEmail`
- `emailSendFailed`
- `userAlreadyVerified`

#### Invitation / invite verification

- `couldNotResendInvite`
- `couldNotVerifyInvite`
- `inviteSendFailed`

### Sign-up / Verification Adjacent

These are also hosted-login-first states and do not currently map to dedicated `dev-sso` pages:

- `couldNotRegisterUser`
- `multipleUsersFound`
- `couldNotVerify`
- `couldNotVerifyEmail`
- `couldNotVerifyInvite`
- `couldNotVerifyUser`
- `userAlreadyVerified`
- `couldNotResendEmail`
- `couldNotResendInvite`

## Copy Rules

- Never expose stack traces, exception classes, digest ids, or server diagnostics.
- Prefer next-step guidance over raw technical cause.
- Keep public credential failures generic.
- Use admin-contact wording only when the failure is truly policy-driven.

## Validation

Run:

```bash
node /Users/leavend/Desktop/Project_SSO/tools/qa/validate-auth-error-ux-matrix.mjs
```

This validates:

- `dev-sso` route-to-taxonomy mapping
- hosted-login key coverage
- curated locale packs
- non-leaky copy posture
