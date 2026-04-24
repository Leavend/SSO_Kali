locals {
  zero_downtime_release_contract = {
    deployment_strategy = "canary-first"
    immutable_image_tag = true
    rollback_required   = true
    smoke_required      = true
    traffic_gate = {
      backend_priority = 200
      vue_canary_path  = "/__vue-preview"
      vue_priority     = 175
      root_priority    = 50
    }
  }

  managed_surface = {
    environment      = var.environment
    primary_domain   = var.primary_domain
    zitadel_domain   = var.zitadel_domain
    app_domains      = sort(tolist(var.app_domains))
    vps_project_dir  = var.vps_project_dir
    release_channels = sort(tolist(var.release_channels))
    runtime_services = sort(tolist(var.required_runtime_services))
  }

  # Provider-backed resources land in a later phase, after credentials and
  # state backend ownership are approved.
  planned_provider_surfaces = {
    dns_records = concat(
      [var.primary_domain, var.zitadel_domain],
      sort(tolist(var.app_domains)),
    )
    firewall_policy = {
      allow_http_https = true
      allow_ssh        = true
      deny_by_default  = true
    }
  }
}
