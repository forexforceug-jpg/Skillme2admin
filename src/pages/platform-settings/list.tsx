import { useEffect, useState } from "react";
import { supabaseClient } from "../../providers/supabase-client";
import { notifyUser } from "../../lib/notify";

interface Settings {
  id: string;
  platform_name: string;
  commission_rate: number;
  min_withdrawal: number;
  currency_display: string;
  support_email: string;
  support_phone: string;
  maintenance_mode: boolean;
  maintenance_message: string;
  signups_enabled: boolean;
  bookings_enabled: boolean;
  lessons_publishing_enabled: boolean;
  escrow_auto_release_hours: number;
  dispute_window_hours: number;
  email_notifications_enabled: boolean;
  auto_approve_verifications: boolean;
  featured_lesson_ids: string[];
  updated_at: string;
  [key: string]: unknown;
}

const DEFAULT_SETTINGS: Settings = {
  id: "",
  platform_name: "Skillme2",
  commission_rate: 0.20,
  min_withdrawal: 10,
  currency_display: "USD",
  support_email: "support@skillme2.com",
  support_phone: "",
  maintenance_mode: false,
  maintenance_message: "We're performing scheduled maintenance. We'll be back shortly.",
  signups_enabled: true,
  bookings_enabled: true,
  lessons_publishing_enabled: true,
  escrow_auto_release_hours: 24,
  dispute_window_hours: 48,
  email_notifications_enabled: true,
  auto_approve_verifications: false,
  featured_lesson_ids: [],
  updated_at: "",
};

export function PlatformSettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastSending, setBroadcastSending] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabaseClient
      .from("platform_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (error) {
      setLoading(false);
      setToast("Failed to load settings: " + error.message);
      return;
    }

    if (data) {
      setSettings(data as Settings);
      setDraft(data as Settings);
    } else {
      // No row yet — insert defaults
      const { data: created, error: insertErr } = await supabaseClient
        .from("platform_settings")
        .insert({ ...DEFAULT_SETTINGS, id: undefined })
        .select()
        .maybeSingle();
      if (insertErr) {
        setLoading(false);
        setToast("Failed to seed settings: " + insertErr.message);
        return;
      }
      if (created) {
        setSettings(created as Settings);
        setDraft(created as Settings);
      }
    }
    setDirty(false);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setDraft(d => ({ ...d, [key]: value }));
    setDirty(true);
  }

  async function save() {
    setBusy(true);
    const { error } = await supabaseClient
      .from("platform_settings")
      .update({
        platform_name: draft.platform_name,
        commission_rate: draft.commission_rate,
        min_withdrawal: draft.min_withdrawal,
        currency_display: draft.currency_display,
        support_email: draft.support_email,
        support_phone: draft.support_phone,
        maintenance_mode: draft.maintenance_mode,
        maintenance_message: draft.maintenance_message,
        signups_enabled: draft.signups_enabled,
        bookings_enabled: draft.bookings_enabled,
        lessons_publishing_enabled: draft.lessons_publishing_enabled,
        escrow_auto_release_hours: draft.escrow_auto_release_hours,
        dispute_window_hours: draft.dispute_window_hours,
        email_notifications_enabled: draft.email_notifications_enabled,
        auto_approve_verifications: draft.auto_approve_verifications,
        featured_lesson_ids: draft.featured_lesson_ids,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draft.id);

    setBusy(false);
    if (error) return flash("Save failed: " + error.message);
    setSettings(draft);
    setDirty(false);
    flash("Settings saved.");
  }

  function reset() {
    if (!confirm("Discard unsaved changes?")) return;
    setDraft(settings);
    setDirty(false);
  }

  async function sendBroadcast() {
    if (!broadcastTitle.trim() || !broadcastBody.trim()) {
      flash("Title and body are required.");
      return;
    }
    if (!confirm(`Send this message to every user on the platform? This cannot be undone.`)) return;
    setBroadcastSending(true);

    const { data: profiles, error } = await supabaseClient
      .from("profiles")
      .select("id");

    if (error) { setBroadcastSending(false); return flash("Failed: " + error.message); }

    let sent = 0;
    for (const p of profiles || []) {
      const res = await notifyUser({
        recipientId: p.id,
        type: "admin_message",
        title: broadcastTitle.trim(),
        body: broadcastBody.trim(),
        sendEmail: true,
      });
      if (res.inboxOk) sent++;
    }

    setBroadcastSending(false);
    setBroadcastOpen(false);
    setBroadcastTitle("");
    setBroadcastBody("");
    flash(`Broadcast sent to ${sent} user(s).`);
  }

  function Field({
    label, sub, children,
  }: { label: string; sub?: string; children: React.ReactNode }) {
    return (
      <label className="settings-field">
        <span className="settings-field__label">{label}</span>
        {sub && <span className="settings-field__sub">{sub}</span>}
        {children}
      </label>
    );
  }

  function Toggle({
    label, sub, value, onChange, tone = "default",
  }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; tone?: "default" | "danger" | "success" }) {
    return (
      <div className={`settings-toggle settings-toggle--${tone}`}>
        <div className="settings-toggle__body">
          <div className="settings-toggle__label">{label}</div>
          {sub && <div className="settings-toggle__sub">{sub}</div>}
        </div>
        <button
          type="button"
          className={`settings-switch ${value ? "is-on" : ""}`}
          onClick={() => onChange(!value)}
          aria-pressed={value}
        >
          <span className="settings-switch__thumb" />
        </button>
      </div>
    );
  }

  if (loading) {
    return <div className="admin-table__loading">Loading settings…</div>;
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-head__title">Platform Settings</h1>
          <p className="page-head__sub">
            Global configuration for Skillme2 — changes take effect immediately.
            {settings.updated_at && <> · last saved {new Date(settings.updated_at).toLocaleString()}</>}
          </p>
        </div>
        <div className="page-head__actions">
          {dirty && <button className="btn btn--ghost" onClick={reset} disabled={busy}>Discard</button>}
          <button className="btn btn--gold" onClick={save} disabled={busy || !dirty}>
            {busy ? "Saving…" : dirty ? "Save changes" : "No changes"}
          </button>
        </div>
      </div>

      {draft.maintenance_mode && (
        <div className="admin-drawer__banner admin-drawer__banner--danger" style={{ marginBottom: "1.5rem" }}>
          <strong>Maintenance mode is ON.</strong> Users will see: "{draft.maintenance_message}"
        </div>
      )}

      {/* General */}
      <section className="settings-section">
        <h2 className="settings-section__title">General</h2>
        <div className="settings-grid settings-grid--2">
          <Field label="Platform name">
            <input className="admin-field__input" value={draft.platform_name} onChange={e => update("platform_name", e.target.value)} />
          </Field>
          <Field label="Display currency" sub="underlying wallet balances stay in USD">
            <select className="admin-field__input" value={draft.currency_display} onChange={e => update("currency_display", e.target.value)}>
              {["USD","UGX","KES","TZS","NGN","GHS","ZAR","EUR","GBP"].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Support email">
            <input className="admin-field__input" value={draft.support_email} onChange={e => update("support_email", e.target.value)} />
          </Field>
          <Field label="Support phone" sub="optional, shown on help pages">
            <input className="admin-field__input" value={draft.support_phone} onChange={e => update("support_phone", e.target.value)} />
          </Field>
        </div>
      </section>

      {/* Money */}
      <section className="settings-section">
        <h2 className="settings-section__title">Money</h2>
        <div className="settings-grid settings-grid--3">
          <Field label="Commission rate" sub="e.g. 0.20 for 20%">
            <input
              type="number" step="0.01" min="0" max="1"
              className="admin-field__input"
              value={draft.commission_rate}
              onChange={e => update("commission_rate", Number(e.target.value))}
            />
            <span className="settings-hint">Currently: {(draft.commission_rate * 100).toFixed(1)}%</span>
          </Field>
          <Field label="Minimum withdrawal (USD)">
            <input
              type="number" step="0.5" min="0"
              className="admin-field__input"
              value={draft.min_withdrawal}
              onChange={e => update("min_withdrawal", Number(e.target.value))}
            />
          </Field>
          <Field label="Escrow auto-release (hours)" sub="after both confirm completion">
            <input
              type="number" min="1"
              className="admin-field__input"
              value={draft.escrow_auto_release_hours}
              onChange={e => update("escrow_auto_release_hours", Number(e.target.value))}
            />
          </Field>
          <Field label="Dispute window (hours)" sub="before admin review kicks in">
            <input
              type="number" min="1"
              className="admin-field__input"
              value={draft.dispute_window_hours}
              onChange={e => update("dispute_window_hours", Number(e.target.value))}
            />
          </Field>
        </div>
      </section>

      {/* Availability */}
      <section className="settings-section">
        <h2 className="settings-section__title">Availability</h2>
        <div className="settings-grid">
          <Toggle
            label="Signups enabled"
            sub="turn off to pause new account creation"
            value={draft.signups_enabled}
            onChange={v => update("signups_enabled", v)}
          />
          <Toggle
            label="Bookings enabled"
            sub="turn off to prevent new lesson bookings"
            value={draft.bookings_enabled}
            onChange={v => update("bookings_enabled", v)}
          />
          <Toggle
            label="Lesson publishing enabled"
            sub="turn off to freeze the marketplace while you clean it up"
            value={draft.lessons_publishing_enabled}
            onChange={v => update("lessons_publishing_enabled", v)}
          />
          <Toggle
            label="Email notifications enabled"
            sub="master switch for transactional emails"
            value={draft.email_notifications_enabled}
            onChange={v => update("email_notifications_enabled", v)}
            tone="success"
          />
          <Toggle
            label="Auto-approve verifications"
            sub="skip manual review — usually off"
            value={draft.auto_approve_verifications}
            onChange={v => update("auto_approve_verifications", v)}
          />
        </div>
      </section>

      {/* Maintenance */}
      <section className="settings-section">
        <h2 className="settings-section__title">Maintenance</h2>
        <Toggle
          label="Maintenance mode"
          sub="show a maintenance notice to all users and pause the marketplace"
          value={draft.maintenance_mode}
          onChange={v => update("maintenance_mode", v)}
          tone="danger"
        />
        <Field label="Maintenance message" sub="shown to users while maintenance mode is on">
          <textarea
            className="admin-field__input admin-field__textarea"
            rows={3}
            value={draft.maintenance_message}
            onChange={e => update("maintenance_message", e.target.value)}
          />
        </Field>
      </section>

      {/* Broadcast */}
      <section className="settings-section">
        <h2 className="settings-section__title">Broadcast</h2>
        <p className="settings-hint" style={{ marginBottom: "0.85rem" }}>
          Send a message to every user's inbox and email at once. Use sparingly.
        </p>
        <button className="btn btn--gold" onClick={() => setBroadcastOpen(true)}>
          Compose broadcast
        </button>
      </section>

      {/* Featured lessons */}
      <section className="settings-section">
        <h2 className="settings-section__title">Featured lessons</h2>
        <Field label="Lesson IDs" sub="comma-separated UUIDs shown at the top of the feed">
          <textarea
            className="admin-field__input admin-field__textarea"
            rows={3}
            value={(draft.featured_lesson_ids || []).join(", ")}
            onChange={e => update("featured_lesson_ids", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx, yyyyyyyy-…"
          />
        </Field>
      </section>

      {broadcastOpen && (
        <>
          <div className="admin-modal-backdrop" onClick={() => setBroadcastOpen(false)} />
          <div className="admin-modal">
            <header className="admin-modal__head">
              <div>
                <h2 className="admin-modal__title">Broadcast to all users</h2>
                <p className="admin-modal__sub">This sends an inbox notification and an email to every registered profile.</p>
              </div>
              <button className="admin-drawer__close" onClick={() => setBroadcastOpen(false)}>×</button>
            </header>
            <div className="admin-modal__body">
              <label className="admin-field">
                <span className="admin-field__label">Subject</span>
                <input className="admin-field__input" value={broadcastTitle} onChange={e => setBroadcastTitle(e.target.value)} placeholder="e.g. New features on Skillme2" />
              </label>
              <label className="admin-field">
                <span className="admin-field__label">Message</span>
                <textarea className="admin-field__input admin-field__textarea" rows={6} value={broadcastBody} onChange={e => setBroadcastBody(e.target.value)} placeholder="Write your announcement…" />
              </label>
            </div>
            <footer className="admin-modal__foot">
              <button className="btn btn--ghost" onClick={() => setBroadcastOpen(false)} disabled={broadcastSending}>Cancel</button>
              <button className="btn btn--gold" onClick={sendBroadcast} disabled={broadcastSending}>
                {broadcastSending ? "Sending…" : "Send to everyone"}
              </button>
            </footer>
          </div>
        </>
      )}

      {toast && <div className="admin-toast">{toast}</div>}
    </div>
  );
}
