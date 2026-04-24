variable "environment" {
  description = "Environment name represented by this control-plane catalog."
  type        = string
  default     = "dev"
}

variable "primary_domain" {
  description = "Primary SSO domain."
  type        = string
  default     = "dev-sso.timeh.my.id"
}

variable "zitadel_domain" {
  description = "Hosted-login / identity provider domain."
  type        = string
  default     = "id.dev-sso.timeh.my.id"
}

variable "app_domains" {
  description = "Application domains that consume the SSO broker."
  type        = set(string)
  default     = [
    "app-a.timeh.my.id",
    "app-b.timeh.my.id",
  ]
}

variable "vps_project_dir" {
  description = "Runtime project directory used by the deployment workflow."
  type        = string
  default     = "/opt/sso-prototype-dev"
}

variable "release_channels" {
  description = "Permitted release channels for deployment promotion."
  type        = set(string)
  default     = [
    "canary",
    "production",
    "rollback",
  ]
}

variable "required_runtime_services" {
  description = "Runtime services that must be present before full-stack rollout."
  type        = set(string)
  default     = [
    "proxy",
    "postgres",
    "redis",
    "zitadel-api",
    "zitadel-login",
    "sso-backend",
    "sso-backend-worker",
    "sso-frontend",
    "sso-admin-vue",
    "app-a-next",
    "app-b-laravel",
  ]
}
