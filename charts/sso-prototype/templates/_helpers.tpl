{{- define "sso-prototype.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "sso-prototype.fullname" -}}
{{- printf "%s-%s" .Release.Name (include "sso-prototype.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
