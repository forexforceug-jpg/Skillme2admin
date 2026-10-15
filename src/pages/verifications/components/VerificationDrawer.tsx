import { useEffect, useState } from "react";
import { supabaseClient } from "../../../providers/supabase-client";
import { notifyUser } from "../../../lib/notify";
import { SendNotificationModal } from "../../../components/SendNotificationModal";

interface Verification {
  id: string;
  teacher_id: string;
  status: string;
  documents: Record<string, unknown> | null;
  notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  [key: string]: unknown;
}

interface Teacher {
  id: string;
  name: string;
  email: string;
  avatar_url: string;
  is_teacher: boolean;
  verification: string;
  likes_count: number;
  lessons_taught: number;
}

interface Reviewer {
  id: string;
  name: string;
  email: string;
}

interface Props {
  requestId: string;
  onClose: () => void;
  onUpdated?: () => void;
}

export function VerificationDrawer({ requestId, onClose, onUpdated }: Props) {
  const [request, setRequest] = useState<Verification | null>(null);
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [reviewer, setReviewer] = useState<Reviewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);

  async function load() {
    setLoading(true);
    const { data: v, error } = await supabaseClient
      .from("verification_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();
    if (error || !v) {
      setLoading(false);
      setToast("Failed to load request: " + (error?.message ?? "not found"));
      return;
    }
    setRequest(v as Verification);

    const tasks = [] as Promise<any>[];
    if (v.teacher_id) {
      tasks.push(
        supabaseClient.from("profiles")
          .select("id,name,email,avatar_url,is_teacher,verification,likes_count,lessons_taught")
          .eq("id", v.teacher_id)
          .maybeSingle()
          .then(res => { if (res.data) setTeacher(res.data as Teacher); })
      );
    }
    if (v.reviewed_by) {
      tasks.push(
        supabaseClient.from("profiles")
          .select("id,name,email")
          .eq("id", v.reviewed_by)
          .maybeSingle()
          .then(res => { if (res.data) setReviewer(res.data as Reviewer); })
      );
    }
    await Promise.all(tasks);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function approve() {
    if (!request || !teacher) return;
    const notes = prompt("Optional reviewer notes (visible to the teacher):", "");
    if (notes === null) return;
    if (!confirm(`Approve verification for ${teacher.name}?`)) return;

    setBusy(true);
    const now = new Date().toISOString();

    const { data: { user } } = await supabaseClient.auth.getUser();

    // 1. Update the request row
    const { error: reqErr } = await supabaseClient
      .from("verification_requests")
      .update({
        status: "approved",
        reviewed_at: now,
        reviewed_by: user?.id ?? null,
        notes: notes || null,
      })
      .eq("id", request.id);
    if (reqErr) { setBusy(false); return flash("Failed: " + reqErr.message); }

    // 2. Update the teacher's profile
    await supabaseClient.from("profiles")
      .update({ verification: "verified" })
      .eq("id", teacher.id);

    // 3. Notify the teacher
    await notifyUser({
      recipientId: teacher.id,
      type: "verification_approved",
      title: "Your Skillme2 verification was approved",
      body: `Congratulations — your verified teacher badge is now active.${notes ? `\n\nReviewer notes: ${notes}` : ""}`,
      sendEmail: true,
    });

    setBusy(false);
    flash("Verification approved.");
    load();
    onUpdated?.();
  }

  async function reject() {
    if (!request || !teacher) return;
    const reason = prompt("Reason for rejection (shown to the teacher):");
    if (!reason) return;
    if (!confirm(`Reject verification for ${teacher.name}?`)) return;

    setBusy(true);
    const now = new Date().toISOString();

    const { data: { user } } = await supabaseClient.auth.getUser();

    const { error: reqErr } = await supabaseClient
      .from("verification_requests")
      .update({
        status: "rejected",
        reviewed_at: now,
        reviewed_by: user?.id ?? null,
        notes: reason,
      })
      .eq("id", request.id);
    if (reqErr) { setBusy(false); return flash("Failed: " + reqErr.message); }

    await supabaseClient.from("profiles")
      .update({ verification: "unverified" })
      .eq("id", teacher.id);

    await notifyUser({
      recipientId: teacher.id,
      type: "verification_rejected",
      title: "Your Skillme2 verification was not approved",
      body: `We were unable to approve your verification request at this time.\n\nReason: ${reason}\n\nYou may re-submit with clearer documents.`,
      sendEmail: true,
    });

    setBusy(false);
    flash("Verification rejected.");
    load();
    onUpdated?.();
  }

  async function reopen() {
    if (!request) return;
    if (!confirm("Reopen this request for review? It will move back to pending.")) return;
    setBusy(true);
    const { error } = await supabaseClient
      .from("verification_requests")
      .update({ status: "pending", reviewed_at: null, reviewed_by: null })
      .eq("id", request.id);
    setBusy(false);
    if (error) return flash("Failed: " + error.message);
    flash("Request reopened.");
    load();
    onUpdated?.();
  }

  return (
    <>
      <div className="admin-drawer-backdrop" onClick={onClose} />
      <aside className="admin-drawer">
        <header className="admin-drawer__head">
          <div>
            <h2 className="admin-drawer__title">Verification request</h2>
            <p className="admin-drawer__sub">ID: {requestId.slice(0, 8)}…</p>
          </div>
          <button className="admin-drawer__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        {loading ? (
          <div className="admin-drawer__loading">Loading…</div>
        ) : !request ? (
          <div className="admin-drawer__loading">Request not found.</div>
        ) : (
          <div className="admin-drawer__body">
            {request.status === "approved" && (
              <div className="admin-drawer__banner" style={{ background: "rgba(20,184,122,0.1)", borderColor: "rgba(20,184,122,0.3)", color: "#14B87A" }}>
                Approved {request.reviewed_at ? `on ${new Date(request.reviewed_at).toLocaleString()}` : ""}.
              </div>
            )}
            {request.status === "rejected" && (
              <div className="admin-drawer__banner admin-drawer__banner--danger">
                Rejected {request.reviewed_at ? `on ${new Date(request.reviewed_at).toLocaleString()}` : ""}.
              </div>
            )}

            <section className="admin-drawer__section">
              <h3 className="admin-drawer__section-title">Request details</h3>
              <div className="admin-drawer__grid">
                <div><span className="admin-drawer__label">Status</span>
                  <span className={`badge badge--${request.status}`}>{request.status}</span>
                </div>
                <div><span className="admin-drawer__label">Submitted</span><span>{new Date(request.submitted_at).toLocaleString()}</span></div>
                {request.reviewed_at && (
                  <div><span className="admin-drawer__label">Reviewed</span><span>{new Date(request.reviewed_at).toLocaleString()}</span></div>
                )}
                {reviewer && (
                  <div><span className="admin-drawer__label">Reviewer</span><span>{reviewer.name}</span></div>
                )}
              </div>
              {request.notes && (
                <div style={{ marginTop: "0.85rem" }}>
                  <span className="admin-drawer__label">Reviewer notes</span>
                  <p className="admin-drawer__text" style={{ marginTop: 4 }}>{request.notes}</p>
                </div>
              )}
            </section>

            {teacher && (
              <section className="admin-drawer__section">
                <h3 className="admin-drawer__section-title">Teacher</h3>
                <div className="admin-drawer__teacher">
                  <img src={teacher.avatar_url || `https://i.pravatar.cc/80?u=${teacher.id}`} alt="" className="admin-drawer__avatar" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{teacher.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{teacher.email}</div>
                    <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span className={`badge badge--${teacher.is_teacher ? "completed" : "neutral"}`}>
                        {teacher.is_teacher ? "Teacher" : "Student"}
                      </span>
                      <span className={`badge badge--${teacher.verification}`}>{teacher.verification}</span>
                      <span className="badge badge--neutral">{teacher.likes_count ?? 0} likes</span>
                      <span className="badge badge--neutral">{teacher.lessons_taught ?? 0} taught</span>
                    </div>
                  </div>
                  <button className="btn btn--ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setMessageOpen(true)}>
                    Message
                  </button>
                </div>
              </section>
            )}

            {request.documents && (
              <section className="admin-drawer__section">
                <h3 className="admin-drawer__section-title">Submitted documents</h3>
                {typeof request.documents === "object" && Array.isArray((request.documents as any).urls) ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                    {((request.documents as any).urls as string[]).map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                         className="btn btn--ghost" style={{ justifyContent: "space-between" }}>
                        <span>Document {i + 1}</span>
                        <span>Open →</span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <pre className="admin-drawer__text" style={{ background: "var(--bg-elevated)", padding: "0.75rem", borderRadius: 6, fontSize: 12, overflow: "auto", maxHeight: 220 }}>
                    {JSON.stringify(request.documents, null, 2)}
                  </pre>
                )}
              </section>
            )}

            <section className="admin-drawer__section">
              <h3 className="admin-drawer__section-title">Actions</h3>
              <div className="admin-drawer__actions">
                {request.status === "pending" && (
                  <>
                    <button className="btn btn--gold" disabled={busy} onClick={approve}>
                      Approve verification
                    </button>
                    <button className="btn btn--ghost admin-bulk-bar__danger" disabled={busy} onClick={reject}>
                      Reject verification
                    </button>
                  </>
                )}
                {(request.status === "approved" || request.status === "rejected") && (
                  <button className="btn btn--ghost" disabled={busy} onClick={reopen}>
                    Reopen for review
                  </button>
                )}
              </div>
            </section>
          </div>
        )}

        {toast && <div className="admin-toast">{toast}</div>}
      </aside>

      {messageOpen && teacher && (
        <SendNotificationModal
          recipientIds={[teacher.id]}
          recipientLabel={teacher.name}
          onClose={() => setMessageOpen(false)}
          onSent={s => flash(`Sent. Inbox: ${s.inbox}, Email: ${s.email}`)}
        />
      )}
    </>
  );
}
