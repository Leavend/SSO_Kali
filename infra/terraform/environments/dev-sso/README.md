# Dev SSO Terraform Control Plane

This environment is intentionally provider-neutral for the first DevOps
integration pass. It captures the runtime surface that must remain consistent
across GitHub Actions, Ansible, Docker Compose, monitoring, and future cloud
resources.

Use this layer as the safe starting point before adding real providers for DNS,
firewall, VPS, object storage, or managed monitoring.

## Local checks

```bash
terraform -chdir=infra/terraform/environments/dev-sso fmt -check
terraform -chdir=infra/terraform/environments/dev-sso init -backend=false
terraform -chdir=infra/terraform/environments/dev-sso validate
```

## Promotion principle

Any provider-backed resource added here must preserve:

- immutable deploy tags
- canary-first release path
- rollback-ready prior state
- smoke-test gate before promotion
- no direct mutation of production traffic without a reversible plan
