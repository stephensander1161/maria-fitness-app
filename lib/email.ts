import { audit } from "@/lib/audit";

/**
 * One way to send an email.
 *
 * Resend, over plain HTTP — no SDK for one POST. The key and the sender live
 * in the environment (`RESEND_API_KEY`, `EMAIL_FROM`); without a key nothing
 * is sent and the caller is told so, and outside production the message is
 * printed to the server log instead, which is how a reset link is read on a
 * laptop. Nothing about the message body is ever audited — a reset link is a
 * credential for an hour.
 */
export type Mail = { to: string; subject: string; text: string; html?: string };

export const emailConfigured = (): boolean => Boolean(process.env.RESEND_API_KEY);

const FROM = () => process.env.EMAIL_FROM || "Sore Winner <coach@sorewinner.app>";

export async function sendEmail(mail: Mail): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`\n── email (not sent: no RESEND_API_KEY) ──\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n──\n`);
    }
    return { sent: false, reason: "email is not configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM(), to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
    });
    if (!res.ok) {
      const why = `resend ${res.status}`;
      await audit("email.failed", { detail: { reason: why } });
      return { sent: false, reason: why };
    }
    return { sent: true };
  } catch (err) {
    const why = err instanceof Error ? err.message.slice(0, 120) : "network";
    await audit("email.failed", { detail: { reason: why } });
    return { sent: false, reason: why };
  }
}

/** A short, plain message with one link. The text is the message; the HTML only makes the link tappable. */
export function linkMail(to: string, subject: string, lines: string[], url: string, linkText: string): Mail {
  const text = `${lines.join("\n\n")}\n\n${url}\n\nIf you didn't ask for this, ignore it — nothing changes.`;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="font:15px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#222;max-width:36em">`
    + lines.map((l) => `<p>${esc(l)}</p>`).join("")
    + `<p><a href="${esc(url)}" style="display:inline-block;background:#ff6a45;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600">${esc(linkText)}</a></p>`
    + `<p style="color:#777;font-size:13px">Or paste this into your browser:<br>${esc(url)}</p>`
    + `<p style="color:#777;font-size:13px">If you didn't ask for this, ignore it — nothing changes.</p></div>`;
  return { to, subject, text, html };
}
