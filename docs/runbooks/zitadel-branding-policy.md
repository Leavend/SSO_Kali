# ZITADEL Branding Policy

## Palette

- Light primary: `#1D4ED8`
- Light background: `#F4F7FB`
- Light font: `#0F172A`
- Light warn: `#DC2626`
- Dark primary: `#2563EB`
- Dark background: `#0F172A`
- Dark font: `#E2E8F0`
- Dark warn: `#F87171`

## Assets

- Light logo: `infra/zitadel-login/assets/dev-sso-wordmark-light.svg`
- Dark logo: `infra/zitadel-login/assets/dev-sso-wordmark-dark.svg`
- Light icon: `infra/zitadel-login/assets/dev-sso-mark.svg`
- Dark icon: `infra/zitadel-login/assets/dev-sso-mark.svg`

## Apply

Run:

```bash
bash infra/zitadel/apply-dev-sso-branding.sh
bash infra/zitadel/apply-dev-sso-language-policy.sh
```

The script:

1. Reads the ZITADEL admin PAT from the bootstrap Docker volume.
2. Creates or updates the custom organization label policy preview.
3. Uploads the Dev-SSO logo and icon assets.
4. Activates the label policy.
5. Prints the active branding summary.

The language policy script:

1. Restricts the instance login languages to `id` and `en`.
2. Sets the default language to `id`.
3. Prints the verified language policy summary.
