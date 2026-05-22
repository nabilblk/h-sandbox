---
name: exec-plan
description: "Create and manage execution plans as persistent repo artifacts. Use when: starting a multi-step feature, planning a refactor, tracking a complex bug fix, or any work spanning multiple files or sessions. Creates lightweight plans (under 2hrs, under 5 files) or full execution plans (with phases, decision logs, tech debt tracking) in docs/exec-plans/. Complements Claude Code /plan mode: use /plan to think, exec-plan to persist."
---

# Execution Plans

Plans are first-class artifacts. Use ephemeral `/plan` mode to think through an approach, then create an exec-plan to persist and track execution across sessions.

## Plan Lifecycle

```
Idea --> /plan (think) --> exec-plan (track) --> work --> complete --> archive
```

- `/plan` is ephemeral: it lives in the session and disappears when the session ends.
- exec-plan files live in the repo: they survive across sessions, show up in diffs, and serve as context for anyone picking up the work.

The two modes complement each other. Use `/plan` for rapid brainstorming and approach exploration. Use exec-plan when the work needs to be tracked, when it spans multiple sessions, or when decisions should be recorded for posterity.

---

## Step 1: Determine Scope

Before creating a plan file, determine whether the work calls for a lightweight plan or a full execution plan.

### Ask or Infer

If the user has described what they want to do, assess the scope from their description. If context is insufficient, ask:

- What is the goal of this work?
- Roughly how long do you expect it to take?
- How many files or components are involved?
- Is this a single concern or does it cut across multiple areas?

### Lightweight Plan Criteria

Choose a lightweight plan when ALL of the following are true:

- Estimated effort is under 2 hours
- Touches fewer than 5 files
- Addresses a single, well-defined concern
- No significant architectural decisions expected
- Single phase of work (no need to break into stages)

Examples: adding a utility function, fixing a bug, writing tests for a module, adding a configuration option, small refactors within one component.

### Full Execution Plan Criteria

Choose a full execution plan when ANY of the following are true:

- Estimated effort exceeds 2 hours or spans multiple days
- Involves multiple phases or stages of work
- Cuts across several components or subsystems
- Requires architectural or design decisions worth recording
- Multiple people may work on it or need context about it
- Work may be interrupted and resumed in a different session

Examples: migrating a subsystem, implementing a new feature with backend and frontend changes, large refactors, performance optimization campaigns, integrating a new service.

### When in Doubt

Start lightweight. A lightweight plan can always be upgraded to a full plan if scope grows. The reverse -- realizing a full plan was overkill -- wastes more time than upgrading.

---

## Step 2: Create the Plan File

### Directory Structure

All plans live under `docs/exec-plans/` in the repository root:

```
docs/
  exec-plans/
    active/          # Plans currently being worked on
    completed/       # Finished plans (archive)
```

If the `docs/exec-plans/` directory does not exist, create it along with the `active/` and `completed/` subdirectories.

### File Naming

- Use kebab-case: `add-rate-limiting.md`, `migrate-auth-to-sessions.md`
- Be descriptive but concise
- Do not include dates in the filename (the creation date is in the file metadata)

### Creating the File

Place the new plan in `docs/exec-plans/active/`.

**For a lightweight plan**, use the template at `assets/lightweight-plan.md.template`:
- Fill in the title, date (today's date), scope, and time estimate
- Write a clear 1-2 sentence goal
- Break the work into concrete, checkable steps
- Leave Notes empty and Outcome as the placeholder

**For a full execution plan**, use the template at `assets/full-plan.md.template`:
- Fill in all header metadata (title, date, author, status as "Not Started" or "In Progress", priority, effort estimate)
- Write the Context section explaining why this work is needed
- Define measurable success criteria as checkboxes
- Break the work into phases, each with its own status and task list
- Initialize the decision log table (leave empty or add any decisions already made)
- Leave Tech Debt and Completion Notes sections as placeholders

### Filling In What You Know

Fill in all information that is available. For anything unknown, leave the `{placeholder}` markers from the template. Do not invent information. If the user has not specified a priority, leave it as `{P0-P3}` rather than guessing.

### Reference Material

See `references/plan-formats.md` for complete annotated examples of both plan types, plus detailed guidance on the decision log format.

---

## Step 3: Work the Plan

As work progresses, keep the plan file updated. The plan is a living document, not a write-once artifact.

### Checking Off Tasks

Mark completed tasks by changing `- [ ]` to `- [x]`:

```markdown
- [x] Set up Redis-backed session store
- [x] Implement session middleware with configurable TTL
- [ ] Add feature flag to control rollout percentage    <-- next up
```

### Updating Phase Status

For full plans, update the status line of each phase as work moves through it:

```markdown
### Phase 1: Session Infrastructure
**Status**: Complete

### Phase 2: Dual-Auth Migration Layer
**Status**: In Progress
```

Also update the top-level plan status field when transitioning between phases.

### Logging Decisions

For full plans, add entries to the decision log table whenever a meaningful decision is made during execution. See `references/plan-formats.md` for guidance on which decisions to log. The key categories are:

- Architecture choices
- Library or tool selections
- Scope changes (features added or cut)
- Approach pivots (changing implementation strategy)
- Trade-offs accepted (knowingly taking on debt or accepting limitations)

Add new rows to the bottom of the table:

```markdown
| 2026-02-12 | Chose Redis over DynamoDB for sessions | Sub-ms latency needed on auth path; already operating Redis | DynamoDB (new dependency), PostgreSQL (too slow) |
```

### Recording Tech Debt

When shortcuts are taken or suboptimal approaches are chosen for pragmatic reasons, note them in the Tech Debt Incurred section. Be specific about what the debt is and what the ideal fix would be:

```markdown
## Tech Debt Incurred
- Dual-auth middleware adds branching complexity; must remove in Phase 3
- Session keys use flat namespace; should add tenant prefix before multi-tenancy work
```

### Update Frequency

Update the plan file after each significant milestone, not after every small change. Good moments to update:

- After completing a task or group of related tasks
- After making a decision worth logging
- At the end of a work session (checkpoint)
- When scope changes

---

## Step 4: Complete the Plan

When all work is done (or the plan is being abandoned), follow these steps to close it out.

### Update Final Status

Set the top-level status to "Completed" or "Abandoned":

```markdown
**Status**: Completed
```

### Fill In Completion Notes

Write a brief summary in the Completion Notes section:

```markdown
## Completion Notes
Migrated all 14 API endpoints from JWT to session-based auth. Session store handles
~2000 concurrent sessions with p99 under 3ms. Deferred tenant-namespacing of session
keys to the multi-tenancy project (PROJ-501). Lesson learned: the dual-auth migration
layer was worth the complexity -- allowed us to catch two edge cases in staging that
would have caused production issues with a big-bang cutover.
```

For abandoned plans, explain why the work was stopped and whether it should be revisited.

### Move to Completed

Move the plan file from `active/` to `completed/`:

```
docs/exec-plans/active/migrate-auth.md --> docs/exec-plans/completed/migrate-auth.md
```

Use `git mv` if the repo is under version control to preserve history.

### Tech Debt Follow-Up

If the plan's Tech Debt Incurred section has entries, check whether a file named `docs/exec-plans/tech-debt-tracker.md` exists. If it does, append the new debt items to it with a reference to the originating plan. If it does not exist, mention the tech debt items to the user and suggest creating the tracker if they want centralized tracking.

### Update PLANS.md

If a file named `docs/PLANS.md` exists in the repo, update it: move the plan entry from the "Active" section to the "Recently Completed" section. If no such file exists, skip this step.

---

## Integration with Claude Code /plan

The `/plan` command and exec-plan serve different purposes and work best together.

### When to Use /plan Alone

- Quick exploration of an approach before deciding whether to proceed
- Thinking through a problem that may not result in any code changes
- Sketching out options for a decision that has not been made yet
- Small, single-session work that does not need persistence

### When to Use exec-plan

- Work that spans multiple sessions and needs persistent state
- Tasks where decisions should be recorded for future reference
- Collaborative work where others need to understand progress and rationale
- Any effort where you want to track what was done, when, and why

### Recommended Workflow

1. **Think**: Use `/plan` to brainstorm and explore the approach. This is fast and disposable.
2. **Commit**: Once the approach is clear, invoke exec-plan to create a persistent plan file.
3. **Execute**: Work through the plan, updating it as you go.
4. **Resume**: In a new session, read the exec-plan file to pick up where you left off.
5. **Complete**: Close out the plan and archive it.

The exec-plan file becomes a session handoff artifact. When starting a new session on in-progress work, reading the active plan file immediately provides context: what has been done, what is remaining, and what decisions have been made.

---

## Upgrading a Lightweight Plan to Full

If a lightweight plan grows beyond its original scope, convert it to a full execution plan rather than stretching the lightweight format.

### How to Upgrade

1. Read the existing lightweight plan file
2. Create a new file using the full plan template at `assets/full-plan.md.template`
3. Carry over all existing content:
   - Title and creation date stay the same (do not reset the creation date)
   - Goal becomes the Context section (expand as needed)
   - Existing steps become Phase 1 tasks; mark completed ones with `[x]`
   - Move Notes content into the decision log if applicable
4. Add the new sections: additional phases, decision log table, tech debt section
5. Replace the old file with the new one (same path in `active/`)

### Signals That a Lightweight Plan Needs Upgrading

- The step count exceeds 8-10 items
- You realize the work has natural phases
- An architectural decision needs to be recorded
- The estimated time has grown past the 2-hour mark
- A second person needs to understand the plan

---

## Resources

### references/
- `plan-formats.md` -- Complete annotated examples of both plan types, decision log format guidance, and tips for writing effective decision entries.

### assets/
- `lightweight-plan.md.template` -- Template file for lightweight plans. Copy this to create a new lightweight plan.
- `full-plan.md.template` -- Template file for full execution plans. Copy this to create a new full plan.
