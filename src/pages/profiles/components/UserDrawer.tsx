import { useEffect, useState } from "react";
import { supabaseClient } from "../../../providers/supabase-client";
import { SendNotificationModal } from "../../../components/SendNotificationModal";

interface Profile {
  id: string;
  name: string;
  email: string;
  bio: string;
  avatar_url: string;
  timezone: string;
  language: string;
  is_teacher: boolean;
  verification: string;
  likes_count: number;
  lessons_taught: number;
  currency_preference: string;
  suspended_at?: string | null;
  suspension_reason?: string | null;
  created_at: string;
  [key: string]: unknown;
}

interface Props {
  userId: string;
  onClose: () => void;
  onUpdated?: () => void;
  canAssignRole?: boolean;
}

export function UserDrawer({ userId, onClose, onUpdated }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<Partial<Profile>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) {
      setLoading(false);
      setToast("Failed to load user: " + (error?.message ?? "not found"));
      return;
    }
    setProfile(data as Profile);
    setDraft(data as Profile);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function saveEdits() {
    if (!profile) return;
    setBusy(true);
    const { error } = await supabaseClient
      .from("profiles")
      .update({
        name: draft.name,
        email: draft.email,
        bio: draft.bio,
        timezone: draft.timezone,
        language: draft.language,
        is_teacher: draft.is_teacher,
        verification: draft.verification,
        currency_preference: draft.currency_preference,
        suspension_reason: draft.suspension_reason,
      })
      .eq("id", profile.id);
    setBusy(false);
    if (error) return flash("Save failed: " + error.message);
    flash("User updated.");
    setEditing(false);
    setProfile({ ...profile, ...draft } as Profile);
    onUpdated?.();
  }

  async function toggleSuspend() {
    if (!profile) return;
    const isSuspended = !!profile.suspended_at;
    if (!confirm(isSuspended ? "Reinstate this user?" : "Suspend this user?")) return;
    setBusy(true);
    const { error } = await supabaseClient
      .from("profiles")
      .update(
        isSuspended
          ? { suspended_at: null, suspension_reason: null }
          : { suspended_at: new Date().toISOString(), suspension_reason: "Suspended by admin" }
      )
      .eq("id", profile.id);
    setBusy(false);
    if (error) return flash("Failed: " + error.message);
    flash(isSuspended ? "User reinstated." : "User suspended.");
    load();
    onUpdated?.();
    if (!isSuspended) setMessageOpen(true);
  }

  function updateDraft<K extends keyof Profile>(key: K, value: Profile[K]) {
    setDraft(d => ({ ...d, [key]: value }));
  }

  return (
    <>
      <div className="admin-drawer-backdrop" onClick={onClose} />
      <aside className="admin-drawer">
        <header className="admin-drawer__head">
          <div>
            <h2 className="admin-drawer__title">{profile?.name ?? "User"}</h2>
            <p className="admin-drawer__sub">{profile?.email ?? userId.slice(0, 8)}</p>
          </div>
          <button className="admin-drawer__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        {loading ? (
          <div className="admin-drawer__loading">Loading…</div>
        ) : !profile ? (
          <div className="admin-drawer__loading">User not found.</div>
        ) : (
          <div className="admin-drawer__body">
            {profile.suspended_at && (
              <div className="admin-drawer__banner admin-drawer__banner--danger">
                This account is suspended.
                {profile.suspension_reason && <> Reason: {profile.suspension_reason}</>}
              </div>
            )}

            <section className="admin-drawer__section">
              <h3 className="admin-drawer__section-title">
                {editing ? "Edit Profile" : "Profile"}
              </h3>

              {editing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                  <label className="admin-field">
                    <span className="admin-field__label">Name</span>
                    <input className="admin-field__input" value={draft.name ?? ""} onChange={e => updateDraft("name", e.target.value)} />
                  </label>
                  <label className="admin-field">
                    <span className="admin-field__label">Email</span>
                    <input className="admin-field__input" value={draft.email ?? ""} onChange={e => updateDraft("email", e.target.value)} />
                  </label>
                  <label className="admin-field">
                    <span className="admin-field__label">Bio</span>
                    <textarea className="admin-field__input admin-field__textarea" rows={3} value={draft.bio ?? ""} onChange={e => updateDraft("bio", e.target.value)} />
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    <label className="admin-field">
                      <span className="admin-field__label">Timezone</span>
                      <input className="admin-field__input" value={draft.timezone ?? ""} onChange={e => updateDraft("timezone", e.target.value)} />
                    </label>
                    <label className="admin-field">
                      <span className="admin-field__label">Language</span>
                      <input className="admin-field__input" value={draft.language ?? ""} onChange={e => updateDraft("language", e.target.value)} />
                    </label>
                    <label className="admin-field">
                      <span className="admin-field__label">Verification</span>
                      <select className="admin-field__input" value={draft.verification ?? "unverified"} onChange={e => updateDraft("verification", e.target.value)}>
                        <option value="unverified">Unverified</option>
                        <option value="pending">Pending</option>
                        <option value="verified">Verified</option>
                      </select>
                    </label>
                    <label className="admin-field">
                      <span className="admin-field__label">Currency</span>
                      <select className="admin-field__input" value={draft.currency_preference ?? "USD"} onChange={e => updateDraft("currency_preference", e.target.value)}>
                        {["USD","UGX","KES","TZS","NGN","GHS","ZAR","EUR","GBP"].map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="admin-field admin-field--row">
                    <input
                      type="checkbox"
                      checked={!!draft.is_teacher}
                      onChange={e => updateDraft("is_teacher", e.target.checked)}
                      style={{ accentColor: "#C9A24A" }}
                    />
                    <span className="admin-field__label" style={{ margin: 0 }}>Teacher</span>
                  </label>
                  <label className="admin-field">
                    <span className="admin-field__label">Suspension reason (optional)</span>
                    <input
                      className="admin-field__input"
                      value={draft.suspension_reason ?? ""}
                      onChange={e => updateDraft("suspension_reason", e.target.value)}
                      placeholder="Only used when the user is suspended"
                    />
                  </label>
                </div>
              ) : (
                <div className="admin-drawer__grid">
                  <div><span className="admin-drawer__label">Type</span><span>{profile.is_teacher ? "Teacher" : "Student"}</span></div>
                  <div><span className="admin-drawer__label">Verification</span>
                    <span className={`badge badge--${profile.verification}`}>{profile.verification}</span>
                  </div>
                  <div><span className="admin-drawer__label">Timezone</span><span>{profile.timezone ?? "—"}</span></div>
                  <div><span className="admin-drawer__label">Language</span><span>{profile.language ?? "—"}</span></div>
                  <div><span className="admin-drawer__label">Currency</span><span>{profile.currency_preference ?? "USD"}</span></div>
                  <div><span className="admin-drawer__label">Likes</span><span>{profile.likes_count ?? 0}</span></div>
                  <div><span className="admin-drawer__label">Lessons taught</span><span>{profile.lessons_taught ?? 0}</span></div>
                  <div><span className="admin-drawer__label">Joined</span><span>{new Date(profile.created_at).toLocaleDateString()}</span></div>
                </div>
              )}
            </section>

            {!editing && profile.bio && (
              <section className="admin-drawer__section">
                <h3 className="admin-drawer__section-title">Bio</h3>
                <p className="admin-drawer__text">{profile.bio}</p>
              </section>
            )}

            <section className="admin-drawer__section">
              <h3 className="admin-drawer__section-title">Actions</h3>
              <div className="admin-drawer__actions">
                {!editing && (
                  <>
                    <button className="btn btn--gold" disabled={busy} onClick={() => setEditing(true)}>
                      Edit user data
                    </button>
                    <button className="btn btn--ghost" disabled={busy} onClick={() => setMessageOpen(true)}>
                      Message user
                    </button>
                    <button
                      className={`btn btn--ghost ${profile.suspended_at ? "" : "admin-bulk-bar__danger"}`}
                      disabled={busy}
                      onClick={toggleSuspend}
                    >
                      {profile.suspended_at ? "Reinstate account" : "Suspend account"}
                    </button>
                  </>
                )}
                {editing && (
                  <>
                    <button className="btn btn--gold" disabled={busy} onClick={saveEdits}>
                      {busy ? "Saving…" : "Save changes"}
                    </button>
                    <button
                      className="btn btn--ghost"
                      disabled={busy}
                      onClick={() => {
                        setDraft(profile);
                        setEditing(false);
                      }}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </section>
          </div>
        )}

        {toast && <div className="admin-toast">{toast}</div>}
      </aside>

      {messageOpen && profile && (
        <SendNotificationModal
          recipientIds={[profile.id]}
          recipientLabel={profile.name}
          onClose={() => setMessageOpen(false)}
          onSent={s => flash(`Sent. Inbox: ${s.inbox}, Email: ${s.email}`)}
        />
      )}
    </>
  );
}
