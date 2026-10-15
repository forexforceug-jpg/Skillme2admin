import { useEffect, useState } from "react";
import { supabaseClient } from "../../providers/supabase-client";

interface Stats {
  users: { total: number; teachers: number; newThisWeek: number; suspended: number };
  lessons: { published: number; draft: number; archived: number; newThisWeek: number };
  bookings: {
    pending: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    disputed: number;
    thisWeek: number;
  };
  escrow: { held: number; heldAmount: number; disputed: number; disputedAmount: number };
  payouts: { requested: number; requestedAmount: number; paid: number; paidAmount: number };
  verifications: { pending: number };
  revenue: { lifetime: number; last30: number; thisWeek: number };
}

interface RecentItem {
  kind: "user" | "lesson" | "booking" | "escrow" | "payout" | "verification";
  id: string;
  title: string;
  sub: string;
  at: string;
  meta?: string;
}

const EMPTY_STATS: Stats = {
  users: { total: 0, teachers: 0, newThisWeek: 0, suspended: 0 },
  lessons: { published: 0, draft: 0, archived: 0, newThisWeek: 0 },
  bookings: { pending: 0, confirmed: 0, completed: 0, cancelled: 0, disputed: 0, thisWeek: 0 },
  escrow: { held: 0, heldAmount: 0, disputed: 0, disputedAmount: 0 },
  payouts: { requested: 0, requestedAmount: 0, paid: 0, paidAmount: 0 },
  verifications: { pending: 0 },
  revenue: { lifetime: 0, last30: 0, thisWeek: 0 },
};

export function PlatformOperationsPage() {
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // --- Users
    const [{ count: userCount }, { count: teacherCount }, { count: newUsers }, { count: suspendedUsers }] =
      await Promise.all([
        supabaseClient.from("profiles").select("id", { count: "exact", head: true }),
        supabaseClient.from("profiles").select("id", { count: "exact", head: true }).eq("is_teacher", true),
        supabaseClient.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
        supabaseClient.from("profiles").select("id", { count: "exact", head: true }).not("suspended_at", "is", null),
      ]);

    // --- Lessons
    const [{ count: publishedLessons }, { count: draftLessons }, { count: archivedLessons }, { count: newLessons }] =
      await Promise.all([
        supabaseClient.from("lessons").select("id", { count: "exact", head: true }).eq("status", "published"),
        supabaseClient.from("lessons").select("id", { count: "exact", head: true }).eq("status", "draft"),
        supabaseClient.from("lessons").select("id", { count: "exact", head: true }).eq("status", "archived"),
        supabaseClient.from("lessons").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
      ]);

    // --- Bookings
    const [
      { count: pendingBookings },
      { count: confirmedBookings },
      { count: completedBookings },
      { count: cancelledBookings },
      { count: disputedBookings },
      { count: newBookings },
    ] = await Promise.all([
      supabaseClient.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseClient.from("bookings").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
      supabaseClient.from("bookings").select("id", { count: "exact", head: true }).eq("status", "completed"),
      supabaseClient.from("bookings").select("id", { count: "exact", head: true }).eq("status", "cancelled"),
      supabaseClient.from("bookings").select("id", { count: "exact", head: true }).eq("status", "disputed"),
      supabaseClient.from("bookings").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
    ]);

    // --- Escrow
    const { data: heldEscrow } = await supabaseClient
      .from("escrow").select("amount").eq("status", "held");
    const { data: disputedEscrow } = await supabaseClient
      .from("escrow").select("amount").eq("status", "disputed");

    const heldAmount = (heldEscrow || []).reduce((s, r) => s + Number(r.amount || 0), 0);
    const disputedAmount = (disputedEscrow || []).reduce((s, r) => s + Number(r.amount || 0), 0);

    // --- Payouts
    const { data: requestedPayouts } = await supabaseClient
      .from("payouts").select("amount").eq("status", "requested");
    const { data: paidPayouts } = await supabaseClient
      .from("payouts").select("amount,processed_at").eq("status", "paid");

    const requestedPayoutsAmount = (requestedPayouts || []).reduce((s, r) => s + Number(r.amount || 0), 0);
    const paidPayoutsAmount = (paidPayouts || []).reduce((s, r) => s + Number(r.amount || 0), 0);

    // --- Verifications
    const { count: pendingVerifications } = await supabaseClient
      .from("verification_requests").select("id", { count: "exact", head: true }).eq("status", "pending");

    // --- Revenue (from escrow releases; platform keeps 20%)
    // Approximate: completed bookings * 20% of price_paid
    const { data: completedBookingRows } = await supabaseClient
      .from("bookings")
      .select("price_paid,created_at,scheduled_at")
      .eq("status", "completed");

    const lifetimeGross = (completedBookingRows || []).reduce((s, r) => s + Number(r.price_paid || 0), 0);
    const lifetimeRevenue = lifetimeGross * 0.20;

    const last30Gross = (completedBookingRows || [])
      .filter(r => r.scheduled_at && new Date(r.scheduled_at) >= new Date(monthAgo))
      .reduce((s, r) => s + Number(r.price_paid || 0), 0);
    const last30Revenue = last30Gross * 0.20;

    const thisWeekGross = (completedBookingRows || [])
      .filter(r => r.scheduled_at && new Date(r.scheduled_at) >= new Date(weekAgo))
      .reduce((s, r) => s + Number(r.price_paid || 0), 0);
    const thisWeekRevenue = thisWeekGross * 0.20;

    setStats({
      users: {
        total: userCount ?? 0,
        teachers: teacherCount ?? 0,
        newThisWeek: newUsers ?? 0,
        suspended: suspendedUsers ?? 0,
      },
      lessons: {
        published: publishedLessons ?? 0,
        draft: draftLessons ?? 0,
        archived: archivedLessons ?? 0,
        newThisWeek: newLessons ?? 0,
      },
      bookings: {
        pending: pendingBookings ?? 0,
        confirmed: confirmedBookings ?? 0,
        completed: completedBookings ?? 0,
        cancelled: cancelledBookings ?? 0,
        disputed: disputedBookings ?? 0,
        thisWeek: newBookings ?? 0,
      },
      escrow: {
        held: heldEscrow?.length ?? 0,
        heldAmount,
        disputed: disputedEscrow?.length ?? 0,
        disputedAmount,
      },
      payouts: {
        requested: requestedPayouts?.length ?? 0,
        requestedAmount: requestedPayoutsAmount,
        paid: paidPayouts?.length ?? 0,
        paidAmount: paidPayoutsAmount,
      },
      verifications: { pending: pendingVerifications ?? 0 },
      revenue: {
        lifetime: lifetimeRevenue,
        last30: last30Revenue,
        thisWeek: thisWeekRevenue,
      },
    });

    // --- Recent activity feed
    const feed: RecentItem[] = [];

    const { data: recentUsers } = await supabaseClient
      .from("profiles").select("id,name,email,created_at,is_teacher")
      .order("created_at", { ascending: false }).limit(8);
    (recentUsers || []).forEach(u => feed.push({
      kind: "user",
      id: u.id,
      title: u.name || u.email,
      sub: u.is_teacher ? "New teacher" : "New student",
      at: u.created_at,
    }));

    const { data: recentLessons } = await supabaseClient
      .from("lessons").select("id,title,price,status,created_at,author_id")
      .order("created_at", { ascending: false }).limit(8);
    (recentLessons || []).forEach(l => feed.push({
      kind: "lesson",
      id: l.id,
      title: l.title || "Untitled lesson",
      sub: `${l.status} · $${Number(l.price || 0).toFixed(2)}`,
      at: l.created_at,
    }));

    const { data: recentBookings } = await supabaseClient
      .from("bookings")
      .select("id,lesson_title_snapshot,price_paid,status,created_at")
      .order("created_at", { ascending: false }).limit(8);
    (recentBookings || []).forEach(b => feed.push({
      kind: "booking",
      id: b.id,
      title: b.lesson_title_snapshot || "Booking",
      sub: `${b.status} · $${Number(b.price_paid || 0).toFixed(2)}`,
      at: b.created_at,
    }));

    const { data: recentPayouts } = await supabaseClient
      .from("payouts").select("id,amount,status,requested_at,teacher_id")
      .order("requested_at", { ascending: false }).limit(6);
    (recentPayouts || []).forEach(p => feed.push({
      kind: "payout",
      id: p.id,
      title: `Payout $${Number(p.amount || 0).toFixed(2)}`,
      sub: p.status,
      at: p.requested_at,
    }));

    feed.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    setRecent(feed.slice(0, 15));

    setLastUpdated(new Date().toLocaleTimeString());
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000); // refresh every minute
    return () => clearInterval(t);
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function copyStats() {
    const summary = [
      `Skillme2 Platform Operations — ${new Date().toLocaleString()}`,
      ``,
      `Users: ${stats.users.total} total (${stats.users.teachers} teachers, ${stats.users.suspended} suspended)`,
      `Lessons: ${stats.lessons.published} published, ${stats.lessons.draft} draft, ${stats.lessons.archived} archived`,
      `Bookings: ${stats.bookings.pending} pending, ${stats.bookings.confirmed} confirmed, ${stats.bookings.completed} completed, ${stats.bookings.cancelled} cancelled, ${stats.bookings.disputed} disputed`,
      `Escrow: $${stats.escrow.heldAmount.toFixed(2)} held (${stats.escrow.held} records), $${stats.escrow.disputedAmount.toFixed(2)} disputed`,
      `Payouts: $${stats.payouts.requestedAmount.toFixed(2)} requested (${stats.payouts.requested}), $${stats.payouts.paidAmount.toFixed(2)} paid`,
      `Pending verifications: ${stats.verifications.pending}`,
      `Revenue: $${stats.revenue.lifetime.toFixed(2)} lifetime, $${stats.revenue.last30.toFixed(2)} last 30d, $${stats.revenue.thisWeek.toFixed(2)} this week`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(summary);
      showToast("Operations summary copied to clipboard.");
    } catch {
      showToast("Copy failed — select and copy manually.");
    }
  }

  function StatCard({
    label,
    value,
    sub,
    tone = "default",
    onClick,
  }: {
    label: string;
    value: string | number;
    sub?: string;
    tone?: "default" | "gold" | "green" | "red" | "dim";
    onClick?: () => void;
  }) {
    const colors = {
      default: { value: "#ffffff", border: "var(--border-soft)" },
      gold: { value: "#C9A24A", border: "rgba(201,162,74,0.35)" },
      green: { value: "#14B87A", border: "rgba(20,184,122,0.35)" },
      red: { value: "#FCA5A5", border: "rgba(239,68,68,0.35)" },
      dim: { value: "rgba(255,255,255,0.7)", border: "var(--border-soft)" },
    }[tone];

    return (
      <div
        className="ops-stat"
        style={{ borderColor: colors.border, cursor: onClick ? "pointer" : "default" }}
        onClick={onClick}
      >
        <div className="ops-stat__label">{label}</div>
        <div className="ops-stat__value" style={{ color: colors.value }}>{value}</div>
        {sub && <div className="ops-stat__sub">{sub}</div>}
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-head__title">Platform Operations</h1>
          <p className="page-head__sub">
            Live overview of Skillme2 — users, lessons, bookings, escrow, payouts, and revenue.
            {lastUpdated && <> · updated {lastUpdated}</>}
          </p>
        </div>
        <div className="page-head__actions">
          <button className="btn btn--ghost" onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh now"}
          </button>
          <button className="btn btn--gold" onClick={copyStats}>
            Copy summary
          </button>
        </div>
      </div>

      {/* Revenue + headline numbers */}
      <div className="ops-section">
        <h2 className="ops-section__title">Revenue & headline numbers</h2>
        <div className="ops-grid ops-grid--4">
          <StatCard label="Lifetime revenue" value={`$${stats.revenue.lifetime.toFixed(2)}`} sub="20% platform commission" tone="gold" />
          <StatCard label="Last 30 days" value={`$${stats.revenue.last30.toFixed(2)}`} sub="rolling revenue" tone="green" />
          <StatCard label="This week" value={`$${stats.revenue.thisWeek.toFixed(2)}`} sub="last 7 days" tone="green" />
          <StatCard label="In escrow (held)" value={`$${stats.escrow.heldAmount.toFixed(2)}`} sub={`${stats.escrow.held} active records`} tone="default" />
        </div>
      </div>

      {/* Users */}
      <div className="ops-section">
        <h2 className="ops-section__title">Users</h2>
        <div className="ops-grid ops-grid--4">
          <StatCard label="Total users" value={stats.users.total.toLocaleString()} sub={`+${stats.users.newThisWeek} this week`} />
          <StatCard label="Teachers" value={stats.users.teachers.toLocaleString()} sub={`${stats.users.total ? ((stats.users.teachers / stats.users.total) * 100).toFixed(0) : 0}% of users`} tone="gold" />
          <StatCard label="Suspended" value={stats.users.suspended.toLocaleString()} sub="account suspended" tone={stats.users.suspended > 0 ? "red" : "dim"} />
          <StatCard label="New this week" value={stats.users.newThisWeek.toLocaleString()} sub="signups in last 7 days" />
        </div>
      </div>

      {/* Lessons */}
      <div className="ops-section">
        <h2 className="ops-section__title">Lessons</h2>
        <div className="ops-grid ops-grid--4">
          <StatCard label="Published" value={stats.lessons.published.toLocaleString()} sub="live on the marketplace" tone="green" />
          <StatCard label="Draft" value={stats.lessons.draft.toLocaleString()} sub="not yet visible" />
          <StatCard label="Archived" value={stats.lessons.archived.toLocaleString()} sub="hidden by admin or teacher" />
          <StatCard label="New this week" value={stats.lessons.newThisWeek.toLocaleString()} sub="created in last 7 days" />
        </div>
      </div>

      {/* Bookings */}
      <div className="ops-section">
        <h2 className="ops-section__title">Bookings</h2>
        <div className="ops-grid ops-grid--6">
          <StatCard label="Pending" value={stats.bookings.pending.toLocaleString()} sub="awaiting teacher" tone={stats.bookings.pending > 0 ? "gold" : "dim"} />
          <StatCard label="Confirmed" value={stats.bookings.confirmed.toLocaleString()} sub="upcoming lessons" />
          <StatCard label="Completed" value={stats.bookings.completed.toLocaleString()} sub="escrow released" tone="green" />
          <StatCard label="Cancelled" value={stats.bookings.cancelled.toLocaleString()} sub="refunded" tone="dim" />
          <StatCard label="Disputed" value={stats.bookings.disputed.toLocaleString()} sub="needs review" tone={stats.bookings.disputed > 0 ? "red" : "dim"} />
          <StatCard label="This week" value={stats.bookings.thisWeek.toLocaleString()} sub="new bookings" />
        </div>
      </div>

      {/* Escrow + payouts */}
      <div className="ops-grid ops-grid--2" style={{ marginTop: "2rem" }}>
        <div className="ops-panel">
          <h2 className="ops-section__title">Escrow</h2>
          <div className="ops-panel__list">
            <div className="ops-row">
              <span className="ops-row__label">Held</span>
              <span className="ops-row__value" style={{ color: "#C9A24A" }}>${stats.escrow.heldAmount.toFixed(2)}</span>
            </div>
            <div className="ops-row">
              <span className="ops-row__label">Records held</span>
              <span className="ops-row__value">{stats.escrow.held}</span>
            </div>
            <div className="ops-row">
              <span className="ops-row__label">Disputed amount</span>
              <span className="ops-row__value" style={{ color: stats.escrow.disputedAmount > 0 ? "#FCA5A5" : undefined }}>
                ${stats.escrow.disputedAmount.toFixed(2)}
              </span>
            </div>
            <div className="ops-row">
              <span className="ops-row__label">Disputed records</span>
              <span className="ops-row__value">{stats.escrow.disputed}</span>
            </div>
          </div>
        </div>

        <div className="ops-panel">
          <h2 className="ops-section__title">Payouts</h2>
          <div className="ops-panel__list">
            <div className="ops-row">
              <span className="ops-row__label">Awaiting action</span>
              <span className="ops-row__value" style={{ color: stats.payouts.requestedAmount > 0 ? "#C9A24A" : undefined }}>
                ${stats.payouts.requestedAmount.toFixed(2)}
              </span>
            </div>
            <div className="ops-row">
              <span className="ops-row__label">Requests pending</span>
              <span className="ops-row__value">{stats.payouts.requested}</span>
            </div>
            <div className="ops-row">
              <span className="ops-row__label">Paid lifetime</span>
              <span className="ops-row__value" style={{ color: "#14B87A" }}>${stats.payouts.paidAmount.toFixed(2)}</span>
            </div>
            <div className="ops-row">
              <span className="ops-row__label">Paid records</span>
              <span className="ops-row__value">{stats.payouts.paid}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Verification queue */}
      <div className="ops-section" style={{ marginTop: "2rem" }}>
        <h2 className="ops-section__title">Verification queue</h2>
        <div className="ops-grid ops-grid--1">
          <StatCard
            label="Pending verifications"
            value={stats.verifications.pending.toLocaleString()}
            sub={stats.verifications.pending > 0 ? "awaiting your review" : "all caught up"}
            tone={stats.verifications.pending > 0 ? "gold" : "green"}
          />
        </div>
      </div>

      {/* Recent activity */}
      <div className="ops-section" style={{ marginTop: "2rem" }}>
        <h2 className="ops-section__title">Recent activity</h2>
        <div className="ops-feed">
          {recent.length === 0 ? (
            <div className="ops-feed__empty">No activity yet.</div>
          ) : (
            recent.map((item, i) => (
              <div key={`${item.kind}-${item.id}-${i}`} className="ops-feed__item">
                <span className={`ops-feed__badge ops-feed__badge--${item.kind}`}>{item.kind}</span>
                <div className="ops-feed__body">
                  <div className="ops-feed__title">{item.title}</div>
                  <div className="ops-feed__sub">{item.sub}</div>
                </div>
                <div className="ops-feed__time">{new Date(item.at).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {toast && <div className="admin-toast">{toast}</div>}
    </div>
  );
}
