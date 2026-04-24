output "managed_surface" {
  description = "IaC catalog of the Dev SSO runtime surface."
  value       = local.managed_surface
}

output "zero_downtime_release_contract" {
  description = "Release contract that CI/CD, Ansible, and runtime smoke tests must preserve."
  value       = local.zero_downtime_release_contract
}

output "planned_provider_surfaces" {
  description = "DNS and firewall surfaces that should become provider-backed after approval."
  value       = local.planned_provider_surfaces
}
