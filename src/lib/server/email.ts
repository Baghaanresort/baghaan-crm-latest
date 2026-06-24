import 'server-only';

// A file to attach to the email. `content` is the file bytes, base64-encoded
// (Resend's REST API expects base64 strings, not raw buffers).
export interface EmailAttachment {
  filename: string;
  content: string;
  contentType?: string;
}

export async function sendEmail(
  to: string, subject: string, html: string, attachments?: EmailAttachment[],
): Promise<{ providerMessageId: string; provider: 'resend' }> {
  if (!to) throw new Error('Email: empty destination');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM, to, subject, html,
      ...(attachments && attachments.length ? { attachments } : {}),
    }),
  });
  const json = (await res.json()) as { id?: string; message?: string };
  if (!res.ok) throw new Error(`Resend ${res.status}: ${json.message ?? 'send failed'}`);
  return { providerMessageId: json.id ?? '', provider: 'resend' };
}
