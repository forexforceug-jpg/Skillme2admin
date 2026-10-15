import { useEffect, useState } from "react";
import { supabaseClient } from "../../../providers/supabase-client";
import { notifyUser } from "../../../lib/notify";

interface Escrow {
  id: string;
  booking_id: string;
  student_id: string;
  teacher_id: string;
  amount: number;
  status: string;
  held_at: string;
  released_at: string | null;
  refunded_at: string | null;
  dispute_reason: string | null;
  [key: string]: unknown;
}

interface Person {
  id: string;
  name: string;
  email: string;
  avatar_url: string;
}

interface Booking {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  price_paid: number;
  status: string;
  lesson_title_snapshot: string;
  lesson_cover_snapshot: string;
}

interface Props {
  escrowId: string;
  onClose: () => void;
  onUpdated?: () => void;
}

export function EscrowDrawer({ escrowId, onClose, onUpdated }: Props) {
  const [escrow, setEscrow] = useState<Escrow | null>(null);
  const [student, setStudent] = useState<Person | null>(null);
  const [teacher, setTeacher] = useState<Person | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data: esc, error } = await supabaseClient
      .from("escrow")
      .select("*")
      .eq("id", escrowId)
      .maybeSingle();
    if (error || !esc) {
      setLoading(false);
      setToast("Failed to load escrow: " + (error?.message ?? "not found"));
      return;
    }
    setEscrow(esc as Escrow);

    // Load booking, student, teacher in parallel
    const [b, s, t] = await Promise.all([
      esc.booking_id
        ? supabaseClient.from("bookings").select("*").eq("id", esc.booking_id).maybeSingle()
        : Promise.resolve({ data: null }),
      esc.student_id
        ? supabaseClient.from("profiles").select("id,name,email,avatar_url").eq("id", esc.student_id).maybeSingle()
        : Promise.resolve({ data: null }),
      esc.teacher_id
        ? supabaseClient.from("profiles").select("id,name,email,avatar_url").eq("id", esc.teacher_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (b.data) setBooking(b.data as Booking);
    if (s.data) setStudent(s.data as Person);
    if (t.data) setTeacher(t.data as Person);

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escrowId]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function releaseToTeacher() {
    if (!escrow) return;
    if (!confirm(`Release $${Number(escrow.amount).toFixed(2)} to the teacher? This cannot be undone.`)) return;
    setBusy(true);
    const now = new Date().toISOString();

    const { error: escErr } = await supabaseClient
      .from("escrow")
      .update({ status: "released", released_at: now })
      .eq("id", escrow.id);
    if (escErr) { setBusy(false); return flash("Release failed: " + escErr.message); }

    // Credit teacher wallet
    const { data: wallet } = await supabaseClient
      .from("wallets")
      .select("profile_id,balance")
      .eq("profile_id", escrow.teacher_id)
      .maybeSingle();

    const newBalance = Number(wallet?.balance ?? 0) + Number(escrow.amount);
    if (wallet) {
      await supabaseClient.from("wallets")
        .update({ balance: newBalance, updated_at: now })
        .eq("profile_id", escrow.teacher_id);
    } else {
      await supabaseClient.from("wallets")
        .insert({ profile_id: escrow.teacher_id, balance: newBalance, currency: "USD", updated_at: now });
    }

    await supabaseClient.from("wallet_transactions").insert({
      profile_id: escrow.teacher_id,
      type: "earning",
      amount: escrow.amount,
      balance_after: newBalance,
      booking_id: escrow.booking_id,
      description: "Escrow released by admin",
    });

    // Notify teacher
    await notifyUser({
      recipientId: escrow.teacher_id,
      type: "payout_processed",
      title: "Your earnings have been released",
      body: `$${Number(escrow.amount).toFixed(2)} has been added to your Skillme2 wallet from a completed lesson.`,
      sendEmail: true,
    });

    setBusy(false);
    flash("Escrow released to teacher.");
    load();
    onUpdated?.();
  }

  async function refundToStudent() {
    if (!escrow) return;
    if (!confirm(`Refund $${Number(escrow.amount).toFixed(2)} to the student? This cannot be undone.`)) return;
    setBusy(true);
    const now = new Date().toISOString();

    const { error: escErr } = await supabaseClient
      .from("escrow")
      .update({ status: "refunded", refunded_at: now })
      .eq("id", escrow.id);
    if (escErr) { setBusy(false); return flash("Refund failed: " + escErr.message); }

    // Credit student wallet
    const { data: wallet } = await supabaseClient
      .from("wallets")
      .select("profile_id,balance")
      .eq("profile_id", escrow.student_id)
      .maybeSingle();

    const newBalance = Number(wallet?.balance ?? 0) + Number(escrow.amount);
    if (wallet) {
      await supabaseClient.from("wallets")
        .update({ balance: newBalance, updated_at: now })
        .eq("profile_id", escrow.student_id);
    } else {
      await supabaseClient.from("wallets")
        .insert({ profile_id: escrow.student_id, balance: newBalance, currency: "USD", updated_at: now });
    }

    await supabaseClient.from("wallet_transactions").insert({
      profile_id: escrow.student_id,
      type: "refund",
      amount: escrow.amount,
      balance_after: newBalance,
      booking_id: escrow.booking_id,
      description: "Escrow refunded by admin",
    });

    // Cancel the booking if it wasn't already
    if (booking && booking.status !== "cancelled") {
      await supabaseClient.from("bookings")
        .update({
          status: "cancelled",
          cancelled_at: now,
          cancellation_reason: "Refunded by admin",
        })
        .eq("id", booking.id);
    }

    // Notify student
    await notifyUser({
      recipientId: escrow.student_id,
      type: "admin_message",
      title: "Your payment has been refunded",
      body: `$${Number(escrow.amount).toFixed(2)} has been returned to your Skillme2 wallet.`,
      sendEmail: true,
    });

    setBusy(false);
    flash("Escrow refunded to student.");
    load();
    onUpdated?.();
  }

  async function markAsDisputed() {
    if (!escrow) return;
    const reason = prompt("Why is this escrow being marked as disputed?");
    if (!reason) return;
    setBusy(true);
    const { error } = await supabaseClient
      .from("escrow")
      .update({ status: "disputed", dispute_reason: reason })
      .eq("id", escrow.id);
    setBusy(false);
    if (error) return flash("Failed: " + error.message);
    flash("Marked as disputed.");
    load();
    onUpdated?.();
  }

  return (
    <>
      <div className="admin-drawer-backdrop" onClick={onClose} />
      <aside className="admin-drawer">
        <header className="admin-drawer__head">
          <div>
            <h2 className="admin-drawer__title">Escrow</h2>
            <p className="admin-drawer__sub">ID: {escrowId.slice(0, 8)}…</p>
          </div>
          <button className="admin-drawer__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        {loading ? (
          <div className="admin-drawer__loading">Loading…</div>
        ) : !escrow ? (
          <div className="admin-drawer__loading">Escrow not found.</div>
        ) : (
          <div className="admin-drawer__body">
            {escrow.status === "disputed" && (
              <div className="admin-drawer__banner admin-drawer__banner--danger">
                <strong>Disputed:</strong> {escrow.dispute_reason || "No reason provided"}
              </div>
            )}

            <section className="admin-drawer__section">
              <h3 className="admin-drawer__section-title">Escrow details</h3>
              <div className="admin-drawer__grid">
                <div><span className="admin-drawer__label">Amount</span><span style={{ fontWeight: 700, color: "#C9A24A" }}>${Number(escrow.amount).toFixed(2)}</span></div>
                <div><span className="admin-drawer__label">Status</span>
                  <span className={`badge badge--${escrow.status}`}>{escrow.status}</span>
                </div>
                <div><span className="admin-drawer__label">Held since</span><span>{new Date(escrow.held_at).toLocaleString()}</span></div>
                {escrow.released_at && <div><span className="admin-drawer__label">Released at</span><span>{new Date(escrow.released_at).toLocaleString()}</span></div>}
                {escrow.refunded_at && <div><span className="admin-drawer__label">Refunded at</span><span>{new Date(escrow.refunded_at).toLocaleString()}</span></div>}
              </div>
            </section>

            {booking && (
              <section className="admin-drawer__section">
                <h3 className="admin-drawer__section-title">Booking</h3>
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                  {booking.lesson_cover_snapshot && (
                    <img
                      src={booking.lesson_cover_snapshot}
                      alt=""
                      style={{ width: 64, height: 64, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{booking.lesson_title_snapshot || "Lesson"}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {new Date(booking.scheduled_at).toLocaleString()} · {booking.duration_minutes} min
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <span className={`badge badge--${booking.status}`}>{booking.status}</span>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {student && (
              <section className="admin-drawer__section">
                <h3 className="admin-drawer__section-title">Student</h3>
                <div className="admin-drawer__teacher">
                  <img src={student.avatar_url || `https://i.pravatar.cc/80?u=${student.id}`} alt="" className="admin-drawer__avatar" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{student.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{student.email}</div>
                  </div>
                </div>
              </section>
            )}

            {teacher && (
              <section className="admin-drawer__section">
                <h3 className="admin-drawer__section-title">Teacher</h3>
                <div className="admin-drawer__teacher">
                  <img src={teacher.avatar_url || `https://i.pravatar.cc/80?u=${teacher.id}`} alt="" className="admin-drawer__avatar" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{teacher.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{teacher.email}</div>
                  </div>
                </div>
              </section>
            )}

            <section className="admin-drawer__section">
              <h3 className="admin-drawer__section-title">Actions</h3>
              <div className="admin-drawer__actions">
                {escrow.status === "held" && (
                  <>
                    <button className="btn btn--gold" disabled={busy} onClick={releaseToTeacher}>
                      Release to teacher
                    </button>
                    <button className="btn btn--ghost" disabled={busy} onClick={refundToStudent}>
                      Refund to student
                    </button>
                    <button className="btn btn--ghost admin-bulk-bar__danger" disabled={busy} onClick={markAsDisputed}>
                      Mark as disputed
                    </button>
                  </>
                )}
                {escrow.status === "disputed" && (
                  <>
                    <button className="btn btn--gold" disabled={busy} onClick={releaseToTeacher}>
                      Release to teacher
                    </button>
                    <button className="btn btn--ghost" disabled={busy} onClick={refundToStudent}>
                      Refund to student
                    </button>
                  </>
                )}
                {(escrow.status === "released" || escrow.status === "refunded") && (
                  <p className="admin-drawer__text">
                    This escrow is closed. No further action is possible.
                  </p>
                )}
              </div>
            </section>
          </div>
        )}

        {toast && <div className="admin-toast">{toast}</div>}
      </aside>
    </>
  );
}
