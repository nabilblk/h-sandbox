import { useEffect, useMemo, useState } from "react";
import type { OrganizationMemberSummary } from "@harakiri/shared";
import { api } from "../api";
import { Icon } from "../components/icon";
import { Field } from "../components/ui";
import { formatDateTime } from "../format";

const statusLabel: Record<string, string> = {
  active: "active",
  sent: "pending",
  pending: "pending",
  send_failed: "email failed",
  expired: "expired",
  accepted: "accepted",
  canceled: "canceled"
};

const statusClass = (status: string) => status === "active" || status === "accepted" ? "live" : status === "send_failed" || status === "expired" ? "warn" : "muted";

export const MembersRoute = () => {
  const [members, setMembers] = useState<OrganizationMemberSummary[]>([]);
  const [email, setEmail] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = () => api.members().then((response) => setMembers(response.members));
  useEffect(() => { void load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load members.")); }, []);

  const counts = useMemo(() => ({
    active: members.filter((member) => member.kind === "member").length,
    pending: members.filter((member) => member.kind === "invitation" && ["pending", "sent"].includes(member.status)).length,
    failed: members.filter((member) => ["send_failed", "expired"].includes(member.status)).length
  }), [members]);

  const invite = async () => {
    const nextEmail = email.trim();
    if (!nextEmail) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const result = await api.inviteMember(nextEmail);
      setEmail("");
      setInviteOpen(false);
      setNotice(result.member.kind === "member"
        ? `${result.member.email} already has access to this workspace.`
        : result.member.status === "send_failed"
          ? `Invitation saved, but the email could not be sent. Use Retry after checking email delivery.`
          : `Invitation sent to ${result.member.email}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite member.");
    } finally {
      setLoading(false);
    }
  };

  const rowAction = async (member: OrganizationMemberSummary, action: "resend" | "cancel" | "remove") => {
    if (action === "cancel" && !confirm(`Cancel invitation for ${member.email}?`)) return;
    if (action === "remove" && !confirm(`Remove ${member.email} from this workspace?`)) return;
    const id = action === "remove" ? member.membershipId : member.invitationId;
    if (!id) return;
    setBusyId(`${action}:${id}`);
    setError("");
    setNotice("");
    try {
      const result =
        action === "resend" ? await api.resendInvitation(id)
          : action === "cancel" ? await api.cancelInvitation(id)
            : await api.removeMember(id);
      setNotice(action === "resend" && result.member.status === "send_failed"
        ? `Retry saved, but the email still could not be sent.`
        : action === "resend" ? `Invitation resent to ${member.email}.`
          : action === "cancel" ? `Invitation canceled for ${member.email}.`
            : `${member.email} was removed.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Member action failed.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="dash-page members-workspace">
      <div className="page-head members-page-head">
        <div>
          <h1 className="page-h">Members</h1>
          <div className="page-sub"><span style={{ color: "var(--muted)" }}>Invite teammates and manage workspace access.</span></div>
        </div>
        <button className="btn btn-primary" onClick={() => setInviteOpen(true)}><Icon name="plus" size={12} /> Invite member</button>
      </div>

      <div className="member-stats">
        <span className="stat"><b>{counts.active}</b> <span>active</span></span>
        <span className="stat"><b>{counts.pending}</b> <span>pending</span></span>
        <span className="stat"><b>{counts.failed}</b> <span>needs attention</span></span>
      </div>

      {notice ? <div className="member-notice">{notice}</div> : null}
      {error ? <div className="member-error">{error}</div> : null}

      <div className="members-table card">
        <div className="member-row member-head"><span>Member</span><span>Role</span><span>Status</span><span>Updated</span><span /></div>
        {members.map((member) => (
          <div className="member-row" key={`${member.kind}:${member.id}`}>
            <span className="member-identity">
              <span className="member-avatar">{member.email.slice(0, 1).toUpperCase()}</span>
              <span>
                <b>{member.fullName ?? member.email}</b>
                <small>{member.email}</small>
                {member.lastError ? <small className="member-row-error">{member.lastError}</small> : null}
              </span>
            </span>
            <span><span className="tag">{member.role}</span></span>
            <span><span className={`pill ${statusClass(member.status)}`}><span className="dot" /> {statusLabel[member.status] ?? member.status}</span></span>
            <span className="num muted">{formatDateTime(member.joinedAt ?? member.invitedAt ?? member.expiresAt ?? "")}</span>
            <span className="member-actions">
              {member.actions.canResend ? <button className="btn btn-sm" disabled={busyId === `resend:${member.invitationId}`} onClick={() => void rowAction(member, "resend")}>Retry</button> : null}
              {member.actions.canCancel ? <button className="btn btn-sm" disabled={busyId === `cancel:${member.invitationId}`} onClick={() => void rowAction(member, "cancel")}>Cancel</button> : null}
              {member.actions.canRemove ? <button className="btn btn-sm danger" disabled={busyId === `remove:${member.membershipId}`} onClick={() => void rowAction(member, "remove")}>Remove</button> : null}
            </span>
          </div>
        ))}
        {members.length ? null : <div className="sbx-empty"><div className="sbx-empty-title">No members yet.</div><div className="sbx-empty-sub">Invite the first teammate by email.</div></div>}
      </div>

      {inviteOpen ? (
        <div className="modal-backdrop" onClick={() => !loading && setInviteOpen(false)}>
          <div className="modal invite-modal card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div className="modal-title">Invite member</div>
                <div className="members-help">They will receive an email to set up their account and join this workspace.</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setInviteOpen(false)}><Icon name="x" size={13} /></button>
            </div>
            <form
              className="members-form"
              onSubmit={(event) => {
                event.preventDefault();
                void invite();
              }}
            >
              <Field label="Email address">
                <input autoFocus className="input" type="email" placeholder="teammate@company.com" value={email} onChange={(event) => setEmail(event.target.value)} />
              </Field>
              <div className="modal-actions">
                <button type="button" className="btn" disabled={loading} onClick={() => setInviteOpen(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={loading || !email.trim()}>{loading ? <><span className="spinner" /> Sending...</> : <><Icon name="plus" size={12} /> Send invite</>}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};
