import { useEffect, useState } from "react";
import { supabaseClient } from "../../../providers/supabase-client";
import { notifyUser } from "../../../lib/notify";
import { SendNotificationModal } from "../../../components/SendNotificationModal";

interface Booking {
  id: string;
  lesson_id: string;
  student_id: string;
  teacher_id: string;
  group_session_id: string | null;
  is_group: boolean;
  scheduled_at: string;
  duration_minutes: number;
  focus: string | null;
  price_paid: number;
  status: string;
  lesson_number_for_pair: number | null;
  lesson_title_snapshot: string;
  lesson_cover_snapshot: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  jitsi_room_url: string | null;
  created_at: string;
  [key: string]: unknown;
}

interface Person {
  id: string;
  name: string;
  email: string;
  avatar_url: string;
}

interface Props {
  bookingId: string;
  onClose: () => void;
  onUpdated?: () => void;
}

export function BookingDrawer({ bookingId, onClose, onUpdated }: Props) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [student, setStudent] = useState<Person | null>(null);
  const [teacher, setTeacher] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [messageOpen, setMessageOpen] = useState<"student" | "teacher" | null>(null);

  async function load() {
    setLoading(true);
    const { data: b, error } = await supabaseClient
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle();
    if (error || !b) {
      setLoading(false);
      setToast("Failed to load booking: " + (error?.message ?? "not found"));
      return;
    }
    setBooking(b as Booking);

    const [s, t] = await Promise.all([
      b.student_id
        ? supabaseClient.from("profiles").select("id,name,email,avatar_url").eq("id", b.student_id).maybeSingle()
        : Promise.resolve({ data: null }),
      b.teacher_id
        ? supabaseClient.from("profiles").select("id,name,email,avatar_url").eq("id", b.teacher_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (s.data) setStudent(s.data as Person);
    if (t.data) setTeacher(t.data as Person);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function cancelBooking() {
    if (!booking) return;
    const reason = prompt("Reason for cancellation? (shown to both parties)");
    if (!reason) return;
    if (!confirm("Cancel this booking? The student will be refunded from escrow.")) return;
    setBusy(true);
    const now = new Date().toISOString();

    const { error: bErr } = await supabaseClient
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: now,
        cancellation_reason: reason,
      })
      .eq("id", booking.id);
    if (bErr) { setBusy(false); return flash("Failed: " + bErr.message); }

    // Refund escrow if held
    const { data: esc } = await supabaseClient
      .from("escrow")
      .select("id,status,amount")
      .eq("booking_id", booking.id)
      .maybeSingle();

    if (esc && esc.status === "held") {
      await supabaseClient.from("escrow")
        .update({ status: "refunded", refunded_at: now })
        .eq("id", esc.id);

      const { data: wallet } = await supabaseClient
        .from("wallets")
        .select("profile_id,balance")
        .eq("profile_id", booking.student_id)
        .maybeSingle();

      const newBalance = Number(wallet?.balance ?? 0) + Number(esc.amount);
      if (wallet) {
        await supabaseClient.from("wallets")
          .update({ balance: newBalance, updated_at: now })
          .eq("profile_id", booking.student_id);
      } else {
        await supabaseClient.from("wallets")
          .insert({ profile_id: booking.student_id, balance: newBalance, currency: "USD", updated_at: now });
      }

      await supabaseClient.from("wallet_transactions").insert({
        profile_id: booking.student_id,
        type: "refund",
        amount: esc.amount,
        balance_after: newBalance,
        booking_id: booking.id,
        description: "Booking cancelled by admin: " + reason,
      });
    }

    // Notify both parties
    await notifyUser({
      recipientId: booking.student_id,
      type: "admin_message",
      title: "Your booking was cancelled by Skillme2",
      body: `Your lesson "${booking.lesson_title_snapshot}" has been cancelled. Reason: ${reason}\n\nAny payment held in escrow has been refunded to your Skillme2 wallet.`,
      sendEmail: true,
    });
    await notifyUser({
      recipientId: booking.teacher_id,
      type: "admin_message",
      title: "A booking was cancelled by Skillme2",
      body: `The lesson "${booking.lesson_title_snapshot}" scheduled for ${new Date(booking.scheduled_at).toLocaleString()} has been cancelled. Reason: ${reason}`,
      sendEmail: true,
    });

    setBusy(false);
    flash("Booking cancelled and refunded.");
    load();
    onUpdated?.();
  }

  async function forceComplete() {
    if (!booking) return;
    if (!confirm("Mark this booking as complete and release escrow to the teacher?")) return;
    setBusy(true);
    const now = new Date().toISOString();

    const { error: bErr } = await supabaseClient
      .from("bookings")
      .update({ status: "completed" })
      .eq("id", booking.id);
    if (bErr) { setBusy(false); return flash("Failed: " + bErr.message); }

    // Release escrow
    const { data: esc } = await supabaseClient
      .from("escrow")
      .select("id,status,amount")
      .eq("booking_id", booking.id)
      .maybeSingle();

    if (esc && esc.status === "held") {
      await supabaseClient.from("escrow")
        .update({ status: "released", released_at: now })
        .eq("id", esc.id);

      // 20% platform commission
      const gross = Number(esc.amount);
      const payout = Number((gross * 0.8).toFixed(2));

      const { data: wallet } = await supabaseClient
        .from("wallets")
        .select("profile_id,balance")
        .eq("profile_id", booking.teacher_id)
        .maybeSingle();

      const newBalance = Number(wallet?.balance ?? 0) + payout;
      if (wallet) {
        await supabaseClient.from("wallets")
          .update({ balance: newBalance, updated_at: now })
          .eq("profile_id", booking.teacher_id);
      } else {
        await supabaseClient.from("wallets")
          .insert({ profile_id: booking.teacher_id, balance: newBalance, currency: "USD", updated_at: now });
      }

      await supabaseClient.from("wallet_transactions").insert({
        profile_id: booking.teacher_id,
        type: "earning",
        amount: payout,
        balance_after: newBalance,
        booking_id: booking.id,
        description: "Lesson completed (admin forced): $" + gross.toFixed(2) + " gross, 20% commission",
      });

      await notifyUser({
        recipientId: booking.teacher_id,
        type: "payout_processed",
        title: "Your lesson earnings have been released",
        body: `$${payout.toFixed(2)} (after 20% platform commission) has been added to your Skillme2 wallet for the lesson "${booking.lesson_title_snapshot}".`,
        sendEmail: true,
      });
    }

    setBusy(false);
    flash("Booking marked complete, escrow released.");
    load();
    onUpdated?.();
  }

  async function markDisputed() {
    if (!booking) return;
    const reason = prompt("Why is this booking being disputed?");
    if (!reason) return;
    setBusy(true);
    const now = new Date().toISOString();

    await supabaseClient.from("bookings")
      .update({ status: "disputed" })
      .eq("id", booking.id);

    await supabaseClient.from("escrow")
      .update({ status: "disputed", dispute_reason: reason })
      .eq("booking_id", booking.id);

    await notifyUser({
      recipientId: booking.student_id,
      type: "warning",
      title: "A dispute has been opened on your booking",
      body: `Skillme2 has opened a dispute on the lesson "${booking.lesson_title_snapshot}". Reason: ${reason}\n\nWe will contact you if we need more information.`,
      sendEmail: true,
    });
    await notifyUser({
      recipientId: booking.teacher_id,
      type: "warning",
      title: "A dispute has been opened on your booking",
      body: `Skillme2 has opened a dispute on the lesson "${booking.lesson_title_snapshot}". Reason: ${reason}\n\nWe will contact you if we need more information.`,
      sendEmail: true,
    });

    setBusy(false);
    flash("Booking marked as disputed.");
    load();
    onUpdated?.();
  }

  return (
    <>
      <div className="admin-drawer-backdrop" onClick={onClose} />
      <aside className="admin-drawer">
        <header className="admin-drawer__head">
          <div>
            <h2 className="admin-drawer__title">{booking?.lesson_title_snapshot ?? "Booking"}</h2>
            <p className="admin-drawer__sub">Booking ID: {bookingId.slice(0, 8)}…</p>
          </div>
          <button className="admin-drawer__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        {loading ? (
          <div className="admin-drawer__loading">Loading…</div>
        ) : !booking ? (
          <div className="admin-drawer__loading">Booking not found.</div>
        ) : (
          <div className="admin-drawer__body">
            {booking.status === "disputed" && (
              <div className="admin-drawer__banner admin-drawer__banner--danger">
                This booking is under dispute.
              </div>
            )}

            {booking.lesson_cover_snapshot && (
              <img src={booking.lesson_cover_snapshot} alt="" className="admin-drawer__cover" />
            )}

            <section className="admin-drawer__section">
              <h3 className="admin-drawer__section-title">Overview</h3>
              <div className="admin-drawer__grid">
                <div><span className="admin-drawer__label">Status</span>
                  <span className={`badge badge--${booking.status}`}>{booking.status}</span>
                </div>
                <div><span className="admin-drawer__label">Paid</span><span style={{ fontWeight: 700, color: "#C9A24A" }}>${Number(booking.price_paid).toFixed(2)}</span></div>
                <div><span className="admin-drawer__label">Scheduled</span><span>{new Date(booking.scheduled_at).toLocaleString()}</span></div>
                <div><span className="admin-drawer__label">Duration</span><span>{booking.duration_minutes} min</span></div>
                <div><span className="admin-drawer__label">Lesson #</span><span>{booking.lesson_number_for_pair ?? "—"}</span></div>
                <div><span className="admin-drawer__label">Group</span><span>{booking.is_group ? "Yes" : "No"}</span></div>
                <div><span className="admin-drawer__label">Created</span><span>{new Date(booking.created_at).toLocaleString()}</span></div>
                {booking.jitsi_room_url && (
                  <div><span className="admin-drawer__label">Room URL</span>
                    <a href={booking.jitsi_room_url} target="_blank" rel="noopener" style={{ color: "#53bdeb", fontSize: 12 }}>
                      Open Jitsi →
                    </a>
                  </div>
                )}
              </div>
            </section>

            {booking.focus && (
              <section className="admin-drawer__section">
                <h3 className="admin-drawer__section-title">Focus notes</h3>
                <p className="admin-drawer__text">{booking.focus}</p>
              </section>
            )}

            {booking.cancelled_at && (
              <section className="admin-drawer__section">
                <h3 className="admin-drawer__section-title">Cancellation</h3>
                <p className="admin-drawer__text">
                  Cancelled {new Date(booking.cancelled_at).toLocaleString()}
                  {booking.cancellation_reason && <><br />Reason: {booking.cancellation_reason}</>}
                </p>
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
                  <button className="btn btn--ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setMessageOpen("student")}>
                    Message
                  </button>
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
                  <button className="btn btn--ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setMessageOpen("teacher")}>
                    Message
                  </button>
                </div>
              </section>
            )}

            <section className="admin-drawer__section">
              <h3 className="admin-drawer__section-title">Actions</h3>
              <div className="admin-drawer__actions">
                {booking.status !== "cancelled" && booking.status !== "completed" && (
                  <>
                    <button className="btn btn--gold" disabled={busy} onClick={forceComplete}>
                      Force complete & release escrow
                    </button>
                    <button className="btn btn--ghost" disabled={busy} onClick={cancelBooking}>
                      Cancel booking & refund
                    </button>
                    <button className="btn btn--ghost admin-bulk-bar__danger" disabled={busy} onClick={markDisputed}>
                      Mark as disputed
                    </button>
                  </>
                )}
                {(booking.status === "cancelled" || booking.status === "completed") && (
                  <p className="admin-drawer__text">
                    This booking is closed. No further action is possible.
                  </p>
                )}
              </div>
            </section>
          </div>
        )}

        {toast && <div className="admin-toast">{toast}</div>}
      </aside>

      {messageOpen && booking && (
        <SendNotificationModal
          recipientIds={[messageOpen === "student" ? booking.student_id : booking.teacher_id]}
          recipientLabel={messageOpen === "student" ? student?.name : teacher?.name}
          onClose={() => setMessageOpen(null)}
          onSent={s => flash(`Sent. Inbox: ${s.inbox}, Email: ${s.email}`)}
        />
      )}
    </>
  );
}
