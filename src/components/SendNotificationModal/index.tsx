import { useState } from "react";
import { notifyUser, NotificationType } from "../../lib/notify";

export interface NotificationPreset {
  label: string;
  type: NotificationType;
  title: string;
  body: string;
  sendEmail: boolean;
}

export const NOTIFICATION_PRESETS: NotificationPreset[] = [
  {
    label: "Custom message",
    type: "admin_message",
    title: "",
    body: "",
    sendEmail: true,
  },
  {
    label: "Account suspended",
    type: "account_suspended",
    title: "Your Skillme2 account has been suspended",
    body:
      "Your account has been suspended following a review by our team. " +
      "You will not be able to book or teach lessons while suspended. " +
      "If you believe this is a mistake, reply to this email and we will review your case.",
    sendEmail: true,
  },
  {
    label: "Account reinstated",
    type: "account_reinstated",
    title: "Your Skillme2 account has been reinstated",
    body:
      "Good news — your account has been reinstated. You can now book and teach lessons again. " +
      "Thank you for your patience.",
    sendEmail: true,
  },
  {
    label: "Lesson archived",
    type: "lesson_archived",
    title: "One of your lessons has been archived",
    body:
      "One of your lessons was archived by our team because it did not meet our community guidelines. " +
      "You can review our terms for more details, or reply to this message if you would like to appeal.",
    sendEmail: true,
  },
  {
    label: "Verification approved",
    type: "verification_approved",
    title: "Your Skillme2 verification was approved",
    body:
      "Congratulations — your verified teacher badge is now active. " +
      "Your profile will show the badge on all lessons you publish.",
    sendEmail: true,
  },
  {
    label: "Verification rejected",
    type: "verification_rejected",
    title: "Your Skillme2 verification was not approved",
    body:
      "We were unable to approve your verification request at this time. " +
      "You may re-submit with clearer documents. Reply to this message if you need help.",
    sendEmail: true,
  },
  {
    label: "Payout processed",
    type: "payout_processed",
    title: "Your payout has been processed",
    body:
      "Your withdrawal request has been processed and the funds are on their way. " +
      "You will see the reference number in your Wallet transactions.",
    sendEmail: true,
  },
  {
    label: "Warning",
    type: "warning",
    title: "Important notice about your Skillme2 account",
    body:
      "We are writing to let you know about an issue on your account. " +
      "Please review our community guidelines and reply if you have any questions.",
    sendEmail: true,
  },
];

interface Props {
  recipientIds: string[];
  recipientLabel?: string; // e.g. "Aijukabyoona Junior" or "3 users"
  onClose: () => void;
  onSent?: (summary: { inbox: number; email: number; failed: number }) => void;
}

export function SendNotificationModal({
  recipientIds,
  recipientLabel,
  onClose,
  onSent,
}: Props) {
  const [presetIndex, setPresetIndex] = useState(0);
  const [title, setTitle] = useState(NOTIFICATION_PRESETS[0].title);
  const [body, setBody] = useState(NOTIFICATION_PRESETS[0].body);
  const [sendEmail, setSendEmail] = useState(true);
  const [emailSubject, setEmailSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyPreset(i: number) {
    setPresetIndex(i);
    setTitle(NOTIFICATION_PRESETS[i].title);
    setBody(NOTIFICATION_PRESETS[i].body);
    setSendEmail(NOTIFICATION_PRESETS[i].sendEmail);
    setEmailSubject("");
  }

  async function send() {
    if (!title.trim() || !body.trim()) {
      setError("Title and message body are required.");
      return;
    }
    setBusy(true);
    setError(null);

    const summary = { inbox: 0, email: 0, failed: 0 };
    const preset = NOTIFICATION_PRESETS[presetIndex];

    for (const id of recipientIds) {
      const res = await notifyUser({
        recipientId: id,
        type: preset.type,
        title: title.trim(),
        body: body.trim(),
        sendEmail,
        emailSubject: emailSubject.trim() || title.trim(),
        emailBody: body.trim(),
      });
      if (res.inboxOk) summary.inbox += 1;
      if (res.emailOk) summary.email += 1;
      if (!res.inboxOk) summary.failed += 1;
    }

    setBusy(false);
    onSent?.(summary);
    onClose();
  }

  return (
    <>
      <div className="admin-modal-backdrop" onClick={onClose} />
      <div className="admin-modal">
        <header className="admin-modal__head">
          <div>
            <h2 className="admin-modal__title">Send message</h2>
            <p className="admin-modal__sub">
              To: {recipientLabel ?? `${recipientIds.length} user(s)`}
            </p>
          </div>
          <button className="admin-drawer__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="admin-modal__body">
          <label className="admin-field">
            <span className="admin-field__label">Preset</span>
            <select
              className="admin-field__input"
              value={presetIndex}
              onChange={e => applyPreset(Number(e.target.value))}
            >
              {NOTIFICATION_PRESETS.map((p, i) => (
                <option key={p.label} value={i}>{p.label}</option>
              ))}
            </select>
          </label>

          <label className="admin-field">
            <span className="admin-field__label">Title (shown in inbox)</span>
            <input
              className="admin-field__input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Your Skillme2 account has been suspended"
            />
          </label>

          <label className="admin-field">
            <span className="admin-field__label">Message</span>
            <textarea
              className="admin-field__input admin-field__textarea"
              rows={8}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Explain what happened and what the user should do next."
            />
          </label>

          <div className="admin-field admin-field--row">
            <input
              id="send-email-toggle"
              type="checkbox"
              checked={sendEmail}
              onChange={e => setSendEmail(e.target.checked)}
              style={{ accentColor: "#C9A24A" }}
            />
            <label htmlFor="send-email-toggle" className="admin-field__label" style={{ margin: 0 }}>
              Also send as email
            </label>
          </div>

          {sendEmail && (
            <label className="admin-field">
              <span className="admin-field__label">Email subject (optional)</span>
              <input
                className="admin-field__input"
                value={emailSubject}
                onChange={e => setEmailSubject(e.target.value)}
                placeholder="Defaults to the title above"
              />
            </label>
          )}

          {error && <div className="admin-modal__error">{error}</div>}
        </div>

        <footer className="admin-modal__foot">
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn--gold" onClick={send} disabled={busy}>
            {busy ? "Sending…" : `Send to ${recipientIds.length}`}
          </button>
        </footer>
      </div>
    </>
  );
}
