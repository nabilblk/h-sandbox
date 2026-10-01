"""Public wire models. Additional fields are tolerated; unknown states stay unknown."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class Model(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="ignore",
        frozen=True,
        hide_input_in_errors=True,
    )


class RuntimeLimits(Model):
    file_artifact_max_bytes: int = Field(gt=0)
    command_timeout_ms: int = Field(gt=0)


class RuntimeMetadata(Model):
    workdir: str
    shell: str
    user: str
    limits: RuntimeLimits


class SandboxSummary(Model):
    id: str
    name: str
    template: str
    status: str
    runtime_metadata: RuntimeMetadata
    capacity_phase: str | None = None
    workspace_id: str | None = None
    ttl_seconds: int
    expires_at: datetime | None
    created_at: datetime


class Readiness(Model):
    status: str
    checked_at: datetime


class Operation(Model):
    id: str
    kind: str
    state: str
    sandbox_id: str | None = None
    attempts: int


class SandboxResponse(Model):
    sandbox: SandboxSummary
    readiness: Readiness | None = None
    operation: Operation | None = None
    status: str | None = None


class SandboxesResponse(Model):
    sandboxes: list[SandboxSummary]


class CommandReference(Model):
    sandbox_id: str
    command_id: str


class CommandSummary(Model):
    id: str
    sandbox_id: str
    status: str
    exit_code: int | None
    finish_reason: str | None
    stdout: str = Field(default="", repr=False)
    stderr: str = Field(default="", repr=False)
    cwd: str | None = None
    timeout_ms: int | None = None
    detached: bool = True

    @property
    def reference(self) -> CommandReference:
        return CommandReference(sandbox_id=self.sandbox_id, command_id=self.id)


class CommandResponse(Model):
    command: CommandSummary


class CommandsResponse(Model):
    commands: list[CommandSummary]


class CommandLogs(Model):
    command_id: str
    stdout: str = Field(repr=False)
    stderr: str = Field(repr=False)
    cursor: int | None = None
    stdout_truncated: bool = False
    stderr_truncated: bool = False


class RunResult(Model):
    sandbox_id: str
    command: str = Field(repr=False)
    stdout: str = Field(repr=False)
    stderr: str = Field(repr=False)
    exit_code: int | None
    duration_ms: float
    finish_reason: str | None = None
    stdout_truncated: bool = False
    stderr_truncated: bool = False


class RunResponse(Model):
    result: RunResult


class FileEntry(Model):
    path: str
    name: str
    type: str
    size: int = Field(ge=0)
    mode: str | None = None
    modified_at: datetime | None = None


class FileResponse(Model):
    file: FileEntry


class FileList(Model):
    cwd: str
    files: list[FileEntry]
    warnings: list[str] = Field(default_factory=list)


class FileText(Model):
    path: str
    encoding: Literal["utf8", "base64"]
    content: str = Field(repr=False)


class TransferMetadata(Model):
    mode: Literal["json-base64"]
    encoding: Literal["base64"]
    max_bytes: int = Field(gt=0)


class UploadResponse(Model):
    file: FileEntry
    size_bytes: int = Field(ge=0)
    sha256: str
    transfer: TransferMetadata


class DownloadResponse(Model):
    path: str
    content_base64: str = Field(repr=False)
    size_bytes: int = Field(ge=0)
    sha256: str
    transfer: TransferMetadata


class Workspace(Model):
    id: str
    name: str
    size_gib: int = Field(alias="sizeGiB", gt=0)
    mount_path: str
    status: str
    attached_sandbox_id: str | None
    storage_requested: bool
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


class WorkspacePolicy(Model):
    available: bool
    reason: str | None
    size_gib: int = Field(alias="sizeGiB")
    max_per_organization: int
    mount_path: str
    retention: str
    physical_deletion: bool


class WorkspaceResponse(Model):
    workspace: Workspace


class WorkspacesResponse(Model):
    workspaces: list[Workspace]
    policy: WorkspacePolicy


class Template(Model):
    id: str
    name: str
    description: str
    status: str
    workdir: str
    cpu_count: int
    memory_mb: int
    aliases: list[str]
    tags: list[str]
    runtime_family: str


class TemplatesResponse(Model):
    templates: list[Template]


class TemplateResponse(Model):
    template: Template


class CapacityBreakdown(Model):
    reserved: int
    active: int
    releasing: int
    uncertain: int


class Capacity(Model):
    state: str
    limit: int
    revision: int
    in_use: int | None
    available: int | None
    over_limit: int | None
    breakdown: CapacityBreakdown | None
    observed_at: datetime


class CapacityResponse(Model):
    capacity: Capacity


class Capability(Model):
    name: str
    state: str
    contract: str
    source: str
    required: bool
    reason: str | None = None


class RuntimeCapabilities(Model):
    provider: str
    capabilities: list[Capability]


class EgressPolicy(Model):
    mode: Literal["open", "restricted", "blocked", "custom"]
    presets: list[str] = Field(default_factory=list)
    allow: list[str] = Field(default_factory=list)
    deny: list[str] = Field(default_factory=list)
    default_action: Literal["allow", "deny"] | None = None


class LogEntry(Model):
    ts: datetime
    lvl: str
    msg: str = Field(repr=False)
    source: str | None = None


class LogsResponse(Model):
    logs: list[LogEntry]


class Ok(Model):
    ok: bool


class ObservedCommand(Model):
    command: CommandSummary
    logs: CommandLogs
