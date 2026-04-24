# Dev SSO Ansible Control Plane

This directory provides the first safe Ansible layer for the VPS-based SSO
platform. It is intentionally preflight-first: it validates the host, Docker
Compose control plane, and public SSO endpoints before the project uses Ansible
for mutating bootstrap or configuration management tasks.

## Syntax check

```bash
cd infra/ansible
ansible-playbook --syntax-check playbooks/devops-preflight.yml
```

## Read-only live preflight

```bash
cd infra/ansible
ansible-playbook playbooks/devops-preflight.yml
```

The live preflight expects the Compose control plane on the VPS to include
`sso-admin-vue`. If it fails there, the VPS is not yet aligned with the current
workspace release bundle.

## Expansion path

Add mutating roles only after this preflight is green:

- docker host bootstrap
- nginx site installation
- deploy directory ownership
- backup timer installation
- Prometheus/Grafana agent configuration
- firewall baseline
