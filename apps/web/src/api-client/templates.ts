import type {
  CreateTemplateBody,
  CreateTemplateBuildBody,
  PromoteTemplateBody,
  TemplateBuildContextResponse,
  TemplateBuildLogsResponse,
  TemplateBuildResponse,
  TemplateBuildsResponse,
  TemplateResponse,
  TemplatesResponse,
  TemplateVersionsResponse,
  UploadTemplateBuildContextBody
} from "@harakiri/shared";
import { request } from "./request";

export const templatesApi = {
  templates: (params = "") => request<TemplatesResponse>(`/v1/templates${params}`),
  template: (id: string) => request<TemplateResponse>(`/v1/templates/${encodeURIComponent(id)}`),
  templateVersions: (id: string) => request<TemplateVersionsResponse>(`/v1/templates/${encodeURIComponent(id)}/versions`),
  createTemplate: (body: CreateTemplateBody) =>
    request<TemplateResponse>("/v1/templates", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  createTemplateBuild: (id: string, body: CreateTemplateBuildBody = {}) =>
    request<TemplateBuildResponse>(`/v1/templates/${encodeURIComponent(id)}/builds`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  templateBuilds: (params = "") => request<TemplateBuildsResponse>(`/v1/template-builds${params}`),
  templateBuild: (id: string) => request<TemplateBuildResponse>(`/v1/template-builds/${encodeURIComponent(id)}`),
  templateBuildLogs: (id: string) => request<TemplateBuildLogsResponse>(`/v1/template-builds/${encodeURIComponent(id)}/logs`),
  uploadTemplateBuildContext: (id: string, body: UploadTemplateBuildContextBody) =>
    request<TemplateBuildContextResponse>(`/v1/template-builds/${encodeURIComponent(id)}/context`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  cancelTemplateBuild: (id: string) => request<TemplateBuildResponse>(`/v1/template-builds/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
  retryTemplateBuild: (id: string) => request<TemplateBuildResponse>(`/v1/template-builds/${encodeURIComponent(id)}/retry`, { method: "POST" }),
  promoteTemplateVersion: (id: string, body: PromoteTemplateBody) =>
    request<TemplateResponse>(`/v1/templates/${encodeURIComponent(id)}/promote`, {
      method: "POST",
      body: JSON.stringify({ alias: "stable", ...body })
    }),
  archiveTemplate: (id: string) => request<TemplateResponse>(`/v1/templates/${encodeURIComponent(id)}/archive`, { method: "POST" })
};
