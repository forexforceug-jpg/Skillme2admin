import { useEffect, useState } from "react";
import { supabaseClient } from "../../../providers/supabase-client";
import { notifyUser } from "../../../lib/notify";
import { SendNotificationModal } from "../../../components/SendNotificationModal";

interface Payout {
  id: string;
  teacher_id: string;
  amount: number;
  method: string;
  status: string;
  reference: string | null;
  requested_at: string;
  processed_at: string | null;
  [key: string]: unknown;
}

interface Teacher {
  id: string;
  name: string;
  email: string;
  avatar_url: string;
  payout_method: Record<string, unknown> | null;
}

interface Wallet {
  profile_id: string;
  balance: number;
  currency: string;
}

interface Props {
  payoutId: string;
  onClose: () => void;
  onUpdated?: () => void;
}

export function PayoutDrawer({ payoutId, onClose, onUpdated }: Props) {
  const [payout, setPayout] = useState<Payout | null>(null);
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);

  async function load() {
    setLoading(true);
    const { data: p, error } = await supabaseClient
      .from("payouts")
      .select("*")
      .eq("id", payoutId)
      .maybeSingle();
    if (error || !p) {
      setLoading(false);
      setToast("Failed to load payout: " + (error?.message ?? "not found"));
      return;
    }
    setPayout(p as Payout);

    if (p.teacher_id) {
      const [tRes, wRes] = await Promise.all([
        supabaseClient.from("profiles").select("id,name,email,avatar_url,payout_method").eq("id", p.teacher_id).maybeSingle(),
        supabaseClient.from("wallets").select("*").eq("profile_id", p.teacher_id).maybeSingle(),
      ]);
      if (tRes.data) setTeacher(tRes.data as Teacher);
      if (wRes.data) setWallet(wRes.data as Wallet);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payoutId]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function approve() {
    if (!payout) return;
    if (!confirm(`Approve payout of $${Number(payout.amount).toFixed(2)}?`)) return;
    setBusy(true);
    const { error } = await supabaseClient
      .from("payouts")
      .update({ status: "approved" })
      .eq("id", payout.id);
    setBusy(false);
    if (error) return flash("Failed: " + error.message);

    await notifyUser({
      recipientId: payout.teacher_id,
      type: "payout_processed",
      title: "Your payout request has been approved",
      body: `Your request for $${Number(payout.amount).toFixed(2)} has been approved and will be processed shortly.`,
      sendEmail: true,
    });
    flash("Payout approved.");
    load();
    onUpdated?.();
  }

  async function markPaid() {
    if (!payout) return;
    const reference = prompt("Payment reference (e.g. bank transfer ID, mobile money code):");
    if (reference === null) return;
    if (!confirm(`Mark this payout as paid? $${Number(payout.amount).toFixed(2)} will be deducted from the teacher's wallet if it hasn't been already.`)) return;

    setBusy(true);
    const now = new Date().toISOString();

    // Deduct from wallet if not already deducted
    if (wallet) {
      const currentBalance = Number(wallet.balance);
      const newBalance = Math.max(0, currentBalance - Number(payout.amount));

      await supabaseClient.from("wallets")
        .update({ balance: newBalance, updated_at: now })
        .eq("profile_id", payout.teacher_id);

      await supabaseClient.from("wallet_transactions").insert({
        profile_id: payout.teacher_id,
        type: "withdrawal",
        amount: -Number(payout.amount),
        balance_after: newBalance,
        description: "Payout processed" + (reference ? ` (ref: ${reference})` : ""),
      });
    }

    const { error } = await supabaseClient
      .from("payouts")
      .update({ status: "paid", processed_at: now, reference: reference || null })
      .eq("id", payout.id);
    setBusy(false);
    if (error) return flash("Failed: " + error.message);

    await notifyUser({
      recipientId: payout.teacher_id,
      type: "payout_processed",
      title: "Your payout has been sent",
      body: `$${Number(payout.amount).toFixed(2)} has been sent to your ${payout.method || "payout method"}.${reference ? `\n\nReference: ${reference}` : ""}`,
      sendEmail: true,
    });
    flash("Payout marked as paid.");
    load();
    onUpdated?.();
  }

  async function reject() {
    if (!payout) return;
    const reason = prompt("Reason for rejection? (shown to the teacher)");
    if (!reason) return;
    if (!confirm("Reject this payout? The amount stays in the teacher's wallet.")) return;

    setBusy(true);
    const now = new Date().toISOString();

    const { error } = await supabaseClient
      .from("payouts")
      .update({ status: "rejected", processed_at: now })
      .eq("id", payout.id);
    setBusy(false);
    if (error) return flash("Failed: " + error.message);

    await notifyUser({
      recipientId: payout.teacher_id,
      type: "warning",
      title: "Your payout request was not approved",
      body: `Your withdrawal request for $${Number(payout.amount).toFixed(2)} was not approved.\n\nReason: ${reason}\n\nYour balance is unchanged.`,
      sendEmail: true,
    });
    flash("Payout rejected.");
    load();
    onUpdated?.();
  }

  return (
    <>
      <div className="admin-drawer-backdrop" onClick={onClose} />
      <aside className="admin-drawer">
        <header className="admin-drawer__head">
          <div>
            <h2 className="admin-drawer__title">Payout request</h2>
            <p className="admin-drawer__sub">ID: {payoutId.slice(0, 8)}…</p>
          </div>
          <button className="admin-drawer__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        {loading ? (
          <div className="admin-drawer__loading">Loading…</div>
        ) : !payout ? (
          <div className="admin-drawer__loading">Payout not found.</div>
        ) : (
          <div className="admin-drawer__body">
            {payout.status === "rejected" && (
              <div className="admin-drawer__banner admin-drawer__banner--danger">
                This payout was rejected.
              </div>
            )}
            {payout.status === "paid" && (
              <div className="admin-drawer__banner" style={{ background: "rgba(20,184,122,0.1)", borderColor: "rgba(20,184,122,0.3)", color: "#14B87A" }}>
                This payout has been paid.
              </div>
            )}

            <section className="admin-drawer__section">
              <h3 className="admin-drawer__section-title">Payout details</h3>
              <div className="admin-drawer__grid">
                <div><span className="admin-drawer__label">Amount</span><span style={{ fontWeight: 700, color: "#C9A24A", fontSize: 18 }}>${Number(payout.amount).toFixed(2)}</span></div>
                <div><span className="admin-drawer__label">Status</span>
                  <span className={`badge badge--${payout.status}`}>{payout.status}</span>
                </div>
                <div><span className="admin-drawer__label">Method</span><span>{payout.method ?? "—"}</span></div>
                <div><span className="admin-drawer__label">Requested</span><span>{new Date(payout.requested_at).toLocaleString()}</span></div>
                {payout.processed_at && <div><span className="admin-drawer__label">Processed</span><span>{new Date(payout.processed_at).toLocaleString()}</span></div>}
                {payout.reference && <div><span className="admin-drawer__label">Reference</span><span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }}>{payout.reference}</span></div>}
              </div>
            </section>

            {teacher && (
              <section className="admin-drawer__section">
                <h3 className="admin-drawer__section-title">Teacher</h3>
                <div className="admin-drawer__teacher">
                  <img src={teacher.avatar_url || `https://i.pravatar.cc/80?u=${teacher.id}`} alt="" className="admin-drawer__avatar" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{teacher.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{teacher.email}</div>
                    {wallet && (
                      <div style={{ marginTop: 6 }}>
                        <span className="badge badge--neutral">
                          Wallet: ${Number(wallet.balance).toFixed(2)} {wallet.currency}
                        </span>
                      </div>
                    )}
                  </div>
                  <button className="btn btn--ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setMessageOpen(true)}>
                    Message
                  </button>
                </div>
              </section>
            )}

            {teacher?.payout_method && (
              <section className="admin-drawer__section">
                <h3 className="admin-drawer__section-title">Stored payout method</h3>
                <pre className="admin-drawer__text" style={{ background: "var(--bg-elevated)", padding: "0.75rem", borderRadius: 6, fontSize: 12, overflow: "auto" }}>
                  {JSON.stringify(teacher.payout_method, null, 2)}
                </pre>
              </section>
            )}

            <section className="admin-drawer__section">
              <h3 className="admin-drawer__section-title">Actions</h3>
              <div className="admin-drawer__actions">
                {payout.status === "requested" && (
                  <>
                    <button className="btn btn--gold" disabled={busy} onClick={approve}>
                      Approve payout
                    </button>
                    <button className="btn btn--ghost admin-bulk-bar__danger" disabled={busy} onClick={reject}>
                      Reject payout
                    </button>
                  </>
                )}
                {payout.status === "approved" && (
                  <>
                    <button className="btn btn--gold" disabled={busy} onClick={markPaid}>
                      Mark as paid
                    </button>
                    <button className="btn btn--ghost admin-bulk-bar__danger" disabled={busy} onClick={reject}>
                      Reject payout
                    </button>
                  </>
                )}
                {(payout.status === "paid" || payout.status === "rejected") && (
                  <p className="admin-drawer__text">
                    This payout is closed. No further action is possible.
                  </p>
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
