import { useEffect, useState } from "react";
import { supabaseClient } from "../../../providers/supabase-client";
import { SendNotificationModal } from "../../../components/SendNotificationModal";

interface Lesson {
  id: string;
  title: string;
  description: string;
  body: string;
  category_id: string;
  level: string;
  price: number;
  duration_minutes: number;
  status: string;
  group_mode: string;
  cover_url: string;
  author_id: string;
  created_at: string;
  what_youll_learn: string[];
  preparation_notes: string;
  tags: string[];
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

interface Props {
  lessonId: string;
  onClose: () => void;
  onUpdated?: () => void;
}

export function LessonDrawer({ lessonId, onClose, onUpdated }: Props) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [bookingCount, setBookingCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // edit mode
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Lesson>>({});

  // message modal
  const [messageOpen, setMessageOpen] = useState(false);

  async function load() {
    setLoading(true);
    const { data: lessonData, error: lessonErr } = await supabaseClient
      .from("lessons")
      .select("*")
      .eq("id", lessonId)
      .maybeSingle();

    if (lessonErr || !lessonData) {
      setLoading(false);
      setToast("Failed to load lesson: " + (lessonErr?.message ?? "not found"));
      return;
    }
    setLesson(lessonData as Lesson);
    setDraft(lessonData as Lesson);

    if (lessonData.author_id) {
      const { data: teacherData } = await supabaseClient
        .from("profiles")
        .select("id,name,email,avatar_url,is_teacher,verification,likes_count,lessons_taught")
        .eq("id", lessonData.author_id)
        .maybeSingle();
      if (teacherData) setTeacher(teacherData as Teacher);
    }

    const { count } = await supabaseClient
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("lesson_id", lessonId);
    setBookingCount(count ?? 0);

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function saveEdits() {
    if (!lesson) return;
    setBusy(true);
    const { error } = await supabaseClient
      .from("lessons")
      .update({
        title: draft.title,
        description: draft.description,
        body: draft.body,
        level: draft.level,
        price: draft.price,
        duration_minutes: draft.duration_minutes,
        group_mode: draft.group_mode,
        status: draft.status,
        what_youll_learn: draft.what_youll_learn,
        preparation_notes: draft.preparation_notes,
        tags: draft.tags,
      })
      .eq("id", lesson.id);
    setBusy(false);
    if (error) return flash("Save failed: " + error.message);
    flash("Lesson updated.");
    setEditing(false);
    setLesson({ ...lesson, ...draft } as Lesson);
    onUpdated?.();
  }

  async function updateLesson(patch: Partial<Lesson>) {
    if (!lesson) return;
    setBusy(true);
    const { error } = await supabaseClient
      .from("lessons")
      .update(patch)
      .eq("id", lesson.id);
    setBusy(false);
    if (error) return flash("Failed: " + error.message);
    flash("Lesson updated.");
    setLesson({ ...lesson, ...patch });
    setDraft({ ...draft, ...patch });
    onUpdated?.();
  }

  async function archiveLesson() {
    if (!lesson) return;
    if (!confirm("Archive this lesson? It will be hidden from the marketplace.")) return;
    await updateLesson({ status: "archived" });
    setMessageOpen(true);
  }

  async function publishLesson() {
    if (!lesson) return;
    await updateLesson({ status: "published" });
  }

  async function unpublishLesson() {
    if (!lesson) return;
    await updateLesson({ status: "draft" });
  }

  async function deleteLesson() {
    if (!lesson) return;
    if (!confirm("Permanently delete this lesson? This cannot be undone.")) return;
    setBusy(true);
    const { error } = await supabaseClient.from("lessons").delete().eq("id", lesson.id);
    setBusy(false);
    if (error) return flash("Failed: " + error.message);
    onUpdated?.();
    onClose();
  }

  function updateDraft<K extends keyof Lesson>(key: K, value: Lesson[K]) {
    setDraft(d => ({ ...d, [key]: value }));
  }

  return (
    <>
      <div className="admin-drawer-backdrop" onClick={onClose} />
      <aside className="admin-drawer">
        <header className="admin-drawer__head">
          <div>
            <h2 className="admin-drawer__title">{lesson?.title ?? "Lesson"}</h2>
            <p className="admin-drawer__sub">Lesson ID: {lessonId.slice(0, 8)}…</p>
          </div>
          <button className="admin-drawer__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        {loading ? (
          <div className="admin-drawer__loading">Loading…</div>
        ) : !lesson ? (
          <div className="admin-drawer__loading">Lesson not found.</div>
        ) : (
          <div className="admin-drawer__body">
            {lesson.cover_url && !editing && (
              <img src={lesson.cover_url} alt="" className="admin-drawer__cover" />
            )}

            <section className="admin-drawer__section">
              <h3 className="admin-drawer__section-title">
                {editing ? "Edit Lesson" : "Overview"}
              </h3>

              {editing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                  <label className="admin-field">
                    <span className="admin-field__label">Title</span>
                    <input
                      className="admin-field__input"
                      value={draft.title ?? ""}
                      onChange={e => updateDraft("title", e.target.value)}
                    />
                  </label>
                  <label className="admin-field">
                    <span className="admin-field__label">Description</span>
                    <textarea
                      className="admin-field__input admin-field__textarea"
                      rows={4}
                      value={draft.description ?? ""}
                      onChange={e => updateDraft("description", e.target.value)}
                    />
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    <label className="admin-field">
                      <span className="admin-field__label">Price (USD)</span>
                      <input
                        type="number"
                        step="0.01"
                        className="admin-field__input"
                        value={draft.price ?? 0}
                        onChange={e => updateDraft("price", Number(e.target.value))}
                      />
                    </label>
                    <label className="admin-field">
                      <span className="admin-field__label">Duration (min)</span>
                      <input
                        type="number"
                        className="admin-field__input"
                        value={draft.duration_minutes ?? 60}
                        onChange={e => updateDraft("duration_minutes", Number(e.target.value))}
                      />
                    </label>
                    <label className="admin-field">
                      <span className="admin-field__label">Level</span>
                      <select
                        className="admin-field__input"
                        value={draft.level ?? "all"}
                        onChange={e => updateDraft("level", e.target.value)}
                      >
                        <option value="all">All levels</option>
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                      </select>
                    </label>
                    <label className="admin-field">
                      <span className="admin-field__label">Group mode</span>
                      <select
                        className="admin-field__input"
                        value={draft.group_mode ?? "solo_only"}
                        onChange={e => updateDraft("group_mode", e.target.value)}
                      >
                        <option value="solo_only">1:1 only</option>
                        <option value="allow_groups">Allow groups</option>
                        <option value="group_required">Group required</option>
                      </select>
                    </label>
                    <label className="admin-field">
                      <span className="admin-field__label">Status</span>
                      <select
                        className="admin-field__input"
                        value={draft.status ?? "draft"}
                        onChange={e => updateDraft("status", e.target.value)}
                      >
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>
                  </div>
                  <label className="admin-field">
                    <span className="admin-field__label">Preparation notes</span>
                    <textarea
                      className="admin-field__input admin-field__textarea"
                      rows={3}
                      value={draft.preparation_notes ?? ""}
                      onChange={e => updateDraft("preparation_notes", e.target.value)}
                    />
                  </label>
                </div>
              ) : (
                <div className="admin-drawer__grid">
                  <div><span className="admin-drawer__label">Category</span><span>{String(lesson.category_id ?? "—").slice(0, 8)}</span></div>
                  <div><span className="admin-drawer__label">Level</span><span>{lesson.level ?? "—"}</span></div>
                  <div><span className="admin-drawer__label">Price</span><span>${Number(lesson.price ?? 0).toFixed(2)}</span></div>
                  <div><span className="admin-drawer__label">Duration</span><span>{lesson.duration_minutes ?? 0} min</span></div>
                  <div><span className="admin-drawer__label">Mode</span><span>{lesson.group_mode ?? "solo_only"}</span></div>
                  <div><span className="admin-drawer__label">Status</span>
                    <span className={`badge badge--${lesson.status}`}>{lesson.status}</span>
                  </div>
                  <div><span className="admin-drawer__label">Bookings</span><span>{bookingCount}</span></div>
                  <div><span className="admin-drawer__label">Created</span><span>{new Date(lesson.created_at).toLocaleDateString()}</span></div>
                </div>
              )}
            </section>

            {!editing && lesson.description && (
              <section className="admin-drawer__section">
                <h3 className="admin-drawer__section-title">Description</h3>
                <p className="admin-drawer__text">{lesson.description}</p>
              </section>
            )}

            {!editing && teacher && (
              <section className="admin-drawer__section">
                <h3 className="admin-drawer__section-title">Teacher</h3>
                <div className="admin-drawer__teacher">
                  <img
                    src={teacher.avatar_url || `https://i.pravatar.cc/80?u=${teacher.id}`}
                    alt=""
                    className="admin-drawer__avatar"
                  />
                  <div style={{ flex: 1 }}>
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
                </div>
              </section>
            )}

            <section className="admin-drawer__section">
              <h3 className="admin-drawer__section-title">Actions</h3>
              <div className="admin-drawer__actions">
                {!editing && (
                  <>
                    <button className="btn btn--gold" disabled={busy} onClick={() => setEditing(true)}>
                      Edit lesson data
                    </button>
                    <button className="btn btn--ghost" disabled={busy} onClick={() => setMessageOpen(true)}>
                      Message teacher
                    </button>
                    {lesson.status !== "published" && (
                      <button className="btn btn--ghost" disabled={busy} onClick={publishLesson}>Publish</button>
                    )}
                    {lesson.status === "published" && (
                      <button className="btn btn--ghost" disabled={busy} onClick={unpublishLesson}>Unpublish (to draft)</button>
                    )}
                    {lesson.status !== "archived" && (
                      <button className="btn btn--ghost" disabled={busy} onClick={archiveLesson}>
                        Archive + notify teacher
                      </button>
                    )}
                    <button className="btn btn--ghost admin-bulk-bar__danger" disabled={busy} onClick={deleteLesson}>
                      Delete
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
                        setDraft(lesson);
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
