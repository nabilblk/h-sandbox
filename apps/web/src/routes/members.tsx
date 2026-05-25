import { useEffect, useState } from "react";
import type { OrganizationMemberSummary } from "@harakiri/shared";
import { api } from "../api";
import { Icon } from "../components/icon";
import { Field } from "../components/ui";
import { formatDateTime } from "../format";

export const MembersRoute = () => {
  const [members, setMembers] = useState<OrganizationMemberSummary[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = () => api.members().then((response) => setMembers(response.members));
  useEffect(() => { void load(); }, []);

  const add = async () => {
    const nextEmail = email.trim();
    if (!nextEmail) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const result = await api.addMember(nextEmail);
      setEmail("");
      setNotice(result.created ? `${result.member.email} can join this workspace after Keycloak login.` : `${result.member.email} is already a member.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dash-page members-workspace">
      <div className="page-head">
        <div>
          <h1 className="page-h">Members</h1>
          <div className="page-sub"><span style={{ color: "var(--muted)" }}>Add teammates by email. Keycloak still owns sign-in.</span></div>
        </div>
      </div>

      <div className="members-layout">
        <div className="members-card card">
          <div className="members-card-head">
            <div>
              <div className="card-h">Add member</div>
              <div className="members-help">The user is attached to this organization immediately and becomes active after their first Keycloak login.</div>
            </div>
          </div>
          <form
            className="members-form"
            onSubmit={(event) => {
              event.preventDefault();
              void add();
            }}
          >
            <Field label="Email address">
              <input className="input" type="email" placeholder="teammate@company.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
            <button className="btn btn-primary" disabled={loading || !email.trim()}>{loading ? <><span className="spinner" /> Adding...</> : <><Icon name="plus" size={12} /> Add member</>}</button>
          </form>
          {notice ? <div className="member-notice">{notice}</div> : null}
          {error ? <div className="member-error">{error}</div> : null}
        </div>

        <div className="members-table card">
          <div className="member-row member-head"><span>Member</span><span>Role</span><span>Status</span><span>Joined</span></div>
          {members.map((member) => (
            <div className="member-row" key={member.id}>
              <span className="member-identity">
                <span className="member-avatar">{member.email.slice(0, 1).toUpperCase()}</span>
                <span><b>{member.fullName ?? member.email}</b><small>{member.email}</small></span>
              </span>
              <span><span className="tag">{member.role}</span></span>
              <span><span className={`pill ${member.status === "active" ? "live" : "muted"}`}><span className="dot" /> {member.status}</span></span>
              <span className="num muted">{formatDateTime(member.joinedAt)}</span>
            </div>
          ))}
          {members.length ? null : <div className="sbx-empty"><div className="sbx-empty-title">No members yet.</div><div className="sbx-empty-sub">Add the first teammate by email.</div></div>}
        </div>
      </div>
    </div>
  );
};
