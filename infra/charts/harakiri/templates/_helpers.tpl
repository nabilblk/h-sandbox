{{/*
Expand the name of the chart.
*/}}
{{- define "harakiri.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Fully qualified app name.
*/}}
{{- define "harakiri.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "harakiri.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels.
*/}}
{{- define "harakiri.labels" -}}
helm.sh/chart: {{ include "harakiri.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: harakiri
{{ include "harakiri.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
{{- end -}}

{{/*
Selector labels shared by the release. Per-component selectors add
app.kubernetes.io/component on top of these.
*/}}
{{- define "harakiri.selectorLabels" -}}
app.kubernetes.io/name: {{ include "harakiri.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
ServiceAccount name.
*/}}
{{- define "harakiri.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "harakiri.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/*
ConfigMap name.
*/}}
{{- define "harakiri.configMapName" -}}
{{- printf "%s-config" (include "harakiri.fullname" .) -}}
{{- end -}}

{{- define "harakiri.observabilityName" -}}
{{- printf "%s-observe" (include "harakiri.fullname" . | trunc 40 | trimSuffix "-") -}}
{{- end -}}

{{/*
Secret name: use an existing Secret when provided, otherwise the rendered one.
*/}}
{{- define "harakiri.secretName" -}}
{{- if .Values.secret.existingSecret -}}
{{- .Values.secret.existingSecret -}}
{{- else -}}
{{- printf "%s-api" (include "harakiri.fullname" .) -}}
{{- end -}}
{{- end -}}

{{/*
Fully-qualified image references. Tag falls back to the chart appVersion so a
`helm install` without overrides pulls the image built for this chart version.
*/}}
{{- define "harakiri.image.api" -}}
{{- if .Values.image.api.digest -}}
{{- if not (regexMatch "^sha256:[a-f0-9]{64}$" .Values.image.api.digest) }}{{ fail "image.api.digest must be a sha256 digest" }}{{ end -}}
{{- printf "%s/%s/%s@%s" .Values.image.registry .Values.image.repository .Values.image.api.name .Values.image.api.digest -}}
{{- else -}}
{{- $tag := .Values.image.api.tag | default .Chart.AppVersion -}}
{{- printf "%s/%s/%s:%s" .Values.image.registry .Values.image.repository .Values.image.api.name $tag -}}
{{- end -}}
{{- end -}}

{{- define "harakiri.image.web" -}}
{{- if .Values.image.web.digest -}}
{{- if not (regexMatch "^sha256:[a-f0-9]{64}$" .Values.image.web.digest) }}{{ fail "image.web.digest must be a sha256 digest" }}{{ end -}}
{{- printf "%s/%s/%s@%s" .Values.image.registry .Values.image.repository .Values.image.web.name .Values.image.web.digest -}}
{{- else -}}
{{- $tag := .Values.image.web.tag | default .Chart.AppVersion -}}
{{- printf "%s/%s/%s:%s" .Values.image.registry .Values.image.repository .Values.image.web.name $tag -}}
{{- end -}}
{{- end -}}

{{- define "harakiri.operatorMounts" -}}
{{- if .Values.temporaryStorage.enabled }}
- name: temporary
  mountPath: /tmp
{{- end }}
{{- if .Values.trustBundle.configMapName }}
- name: trust-bundle
  mountPath: /var/run/harakiri-trust
  readOnly: true
{{- end }}
{{- end -}}

{{- define "harakiri.operatorVolumes" -}}
{{- if .Values.temporaryStorage.enabled }}
- name: temporary
  emptyDir:
    sizeLimit: {{ .Values.temporaryStorage.sizeLimit | quote }}
{{- end }}
{{- if .Values.trustBundle.configMapName }}
- name: trust-bundle
  configMap:
    name: {{ .Values.trustBundle.configMapName | quote }}
    items:
      - key: {{ required "trustBundle.key is required" .Values.trustBundle.key | quote }}
        path: ca-bundle.crt
{{- end }}
{{- end -}}

{{/*
imagePullSecrets list, merging an optionally-created Harbor pull secret with any
explicitly supplied secrets.
*/}}
{{- define "harakiri.imagePullSecrets" -}}
{{- $secrets := .Values.imagePullSecrets | default (list) -}}
{{- if .Values.harborPullSecret.create -}}
{{- $secrets = append $secrets (dict "name" .Values.harborPullSecret.name) -}}
{{- end -}}
{{- if $secrets -}}
imagePullSecrets:
{{- range $secrets }}
  - name: {{ .name }}
{{- end }}
{{- end -}}
{{- end -}}
