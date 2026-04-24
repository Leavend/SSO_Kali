# Dev Admin Password Rotation

Use this runbook to rotate the ZITADEL bootstrap admin password for `dev@timeh.my.id`
without storing plaintext credentials in the repo.

## Principles

- Do not hard-code passwords in scripts, docs, or `.env` files.
- Prefer interactive password entry or a root-owned password file outside the repo.
- In automation or CI, avoid prompt-driven TTY input. Use `NEW_PASSWORD_FILE`, or let
  the script generate a password file with `0600` permissions.
- Treat previously documented bootstrap passwords as compromised.

## Interactive Rotation

Run from the repo root:

```bash
bash /Users/leavend/Desktop/Project_SSO/infra/zitadel/reset-dev-admin-password.sh
```

The script prompts twice and never echoes the password.

## Non-Interactive Rotation

Use a secure file outside the repo:

```bash
printf '%s' 'YourNewStrongPassword!123' >/root/dev-admin-password.txt
chmod 600 /root/dev-admin-password.txt
NEW_PASSWORD_FILE=/root/dev-admin-password.txt \
bash /Users/leavend/Desktop/Project_SSO/infra/zitadel/reset-dev-admin-password.sh
rm -f /root/dev-admin-password.txt
```

## Automation-Safe Rotation

If stdin is not interactive and no password value is supplied, the script now
generates a strong password automatically, writes it to a file with `0600`
permissions, and prints only the file path.

Use an explicit output path:

```bash
GENERATED_PASSWORD_OUTPUT_FILE=/root/dev-admin-password.txt \
bash /Users/leavend/Desktop/Project_SSO/infra/zitadel/reset-dev-admin-password.sh
```

or let the script create a temporary file under `${TMPDIR:-/tmp}`:

```bash
bash /Users/leavend/Desktop/Project_SSO/infra/zitadel/reset-dev-admin-password.sh </dev/null
```

After login verification, delete the generated file:

```bash
rm -f /root/dev-admin-password.txt
```

## Bootstrap First-User Creation

If the bootstrap script must create `dev@timeh.my.id` for the first time, provide a
password explicitly:

```bash
TEST_USER_PASSWORD='YourNewStrongPassword!123' \
bash /Users/leavend/Desktop/Project_SSO/infra/zitadel/bootstrap-dev-resources.sh
```

or:

```bash
TEST_USER_PASSWORD_FILE=/root/dev-admin-password.txt \
bash /Users/leavend/Desktop/Project_SSO/infra/zitadel/bootstrap-dev-resources.sh
```

## Post-Rotation Checks

Verify the login flow from a fresh browser session:

1. Open [https://dev-sso.timeh.my.id](https://dev-sso.timeh.my.id)
2. Click `Continue to Secure Sign-In`
3. Authenticate with `dev@timeh.my.id`
4. Confirm redirect reaches `/dashboard`
