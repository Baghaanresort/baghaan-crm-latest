import 'server-only';

export async function sendEmail(
  to: string, subject: string, html: string,
): Promise<{ providerMessageId: string; provider: 'resend' }> {
  if (!to) throw new Error('Email: empty destination');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, html }),
  });
  const json = (await res.json()) as { id?: string; message?: string };
  if (!res.ok) throw new Error(`Resend ${res.status}: ${json.message ?? 'send failed'}`);
  return { providerMessageId: json.id ?? '', provider: 'resend' };
}
