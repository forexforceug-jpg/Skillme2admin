import { supabaseClient } from "../providers/supabase-client";

export type NotificationType =
  | "booking_request"
  | "booking_accepted"
  | "booking_declined"
  | "lesson_reminder"
  | "lesson_starting"
  | "lesson_complete"
  | "payment_received"
  | "payout_sent"
  | "review_received"
  | "message"
  | "admin_message"
  | "account_suspended"
  | "account_reinstated"
  | "lesson_archived"
  | "lesson_removed"
  | "verification_approved"
  | "verification_rejected"
  | "payout_processed"
  | "payout_rejected"
  | "warning"
  | "custom";

export interface NotifyInput {
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  sendEmail?: boolean;
  emailSubject?: string;
  emailBody?: string;
}

export interface NotifyResult {
  ok: boolean;
  inboxOk: boolean;
  emailOk: boolean;
  error?: string;
}

/**
 * Sends an in-app notification (writes to `notifications`) and optionally
 * triggers a transactional email via the `send-admin-email` Edge Function.
 *
 * The Edge Function is expected to accept POST { to, subject, body }
 * and use Resend under the hood. If it doesn't exist yet, emailOk will
 * be false and the inbox write will still succeed.
 */
export async function notifyUser(input: NotifyInput): Promise<NotifyResult> {
  const result: NotifyResult = { ok: false, inboxOk: false, emailOk: false };

  // 1. In-app inbox row
  const { error: inboxErr } = await supabaseClient
    .from("notifications")
    .insert({
      profile_id: input.recipientId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
    });

  if (inboxErr) {
    result.error = "Inbox write failed: " + inboxErr.message;
    return result;
  }
  result.inboxOk = true;

  // 2. Optional email via Edge Function
  if (input.sendEmail) {
    try {
      const { data: profile } = await supabaseClient
        .from("profiles")
        .select("email,name")
        .eq("id", input.recipientId)
        .maybeSingle();

      if (profile?.email) {
        const { error: emailErr } = await supabaseClient.functions.invoke(
          "send-admin-email",
          {
            body: {
              to: profile.email,
              toName: profile.name,
              subject: input.emailSubject ?? input.title,
              body: input.emailBody ?? input.body,
            },
          }
        );
        result.emailOk = !emailErr;
        if (emailErr) result.error = "Email failed: " + emailErr.message;
      } else {
        result.error = "No email on profile.";
      }
    } catch (e) {
      result.error = "Email invoke threw: " + (e as Error).message;
    }
  }

  result.ok = result.inboxOk;
  return result;
}
