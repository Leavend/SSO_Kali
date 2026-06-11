## Summary

- [ ] Backend, portal BFF, and admin BFF changes ship in this PR as one atomic unit.
- [ ] `SSO_PORTAL_CLIENT_SECRET` and `ADMIN_PANEL_CLIENT_SECRET` are each 64 random characters.
- [ ] GitHub Actions secrets `SSO_PORTAL_CLIENT_SECRET` and `ADMIN_PANEL_CLIENT_SECRET` are set before deploy.

## Verification

- [ ] Backend OIDC/OAuth tests and static analysis pass.
- [ ] Portal BFF tests, typecheck, build, and browser-bundle secret scan pass.
- [ ] Admin BFF tests, typecheck, build, and browser-bundle secret scan pass.
- [ ] Portal login succeeds end-to-end after deploy.
- [ ] Admin login succeeds end-to-end after deploy.
- [ ] Refresh succeeds after token expiry or forced refresh.
- [ ] Logout revokes the refresh token and clears the BFF session.
- [ ] `/clients` reports portal and admin as Confidential.

## Rollback

- [ ] Revert this PR and run migration rollback so both BFF registrations return to `public` with `secret_hash=null`.
