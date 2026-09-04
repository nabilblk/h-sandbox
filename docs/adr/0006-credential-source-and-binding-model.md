# ADR 0006: Credential Source And Binding Model

- Status: Accepted
- Date: 2026-09-03

## Context

Harakiri needs one public model for one-time values, encrypted workspace
custody, external references, and dynamically issued credentials. Templates
must describe requirements without owning values, while runtime providers must
remain replaceable.

## Decision

Use four stable concepts:

- a discriminated `SecretSource` selects custody;
- a `CredentialProviderPreset` or custom profile defines safe injection policy;
- a `TemplateCredentialSlot` stores a value-free requirement; and
- a `SandboxCredentialAttachment` records desired and observed runtime state.

Template launch maps a slot to a source through `credentialMappings`. The slot
owns binding, fake env, and egress policy. Direct attachments remain available
for workflows without a template slot.

## Consequences

Adding a source adapter does not replace sandbox or template APIs. Templates
remain portable and immutable versions snapshot only requirements. The model
has more explicit IDs and states than a simple env map, but avoids leaking
custody into runtime metadata.
