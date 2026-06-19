import 'server-only';

export interface WhatsAppResult { providerMessageId: string; provider: string }

// Strip non-digits; ensure country code (default India 91 if a bare 10-digit number).
function normalize(num: string): string {
  const d = num.replace(/\D/g, '');
  if (d.length === 10) return `91${d}`;
  return d;
}

async function sendTwilio(to: string, template: string, params: string[], mediaUrl?: string): Promise<WhatsAppResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_WHATSAPP_FROM!; // 'whatsapp:+1...'
  const body = new URLSearchParams();
  body.set('From', from);
  body.set('To', `whatsapp:+${normalize(to)}`);
  // Content template (Twilio Content API): ContentSid + variables { "1": "...", ... }
  body.set('ContentSid', template);
  body.set('ContentVariables', JSON.stringify(Object.fromEntries(params.map((v, i) => [String(i + 1), v]))));
  if (mediaUrl) body.set('MediaUrl', mediaUrl);

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const json = (await res.json()) as { sid?: string; message?: string };
  if (!res.ok) throw new Error(`Twilio WhatsApp ${res.status}: ${json.message ?? 'send failed'}`);
  return { providerMessageId: json.sid ?? '', provider: 'twilio' };
}

async function sendGupshup(to: string, template: string, params: string[], mediaUrl?: string): Promise<WhatsAppResult> {
  const apiKey = process.env.GUPSHUP_API_KEY!;
  const source = process.env.GUPSHUP_SOURCE_NUMBER!;
  const appName = process.env.GUPSHUP_APP_NAME!;
  const body = new URLSearchParams();
  body.set('channel', 'whatsapp');
  body.set('source', source);
  body.set('destination', normalize(to));
  body.set('src.name', appName);
  body.set('template', JSON.stringify({ id: template, params }));
  if (mediaUrl) body.set('message', JSON.stringify({ type: 'document', url: mediaUrl }));

  const res = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', {
    method: 'POST',
    headers: { apikey: apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json()) as { messageId?: string; message?: string };
  if (!res.ok) throw new Error(`Gupshup WhatsApp ${res.status}: ${json.message ?? 'send failed'}`);
  return { providerMessageId: json.messageId ?? '', provider: 'gupshup' };
}

export async function sendWhatsAppTemplate(
  to: string, template: string, params: string[], mediaUrl?: string,
): Promise<WhatsAppResult> {
  const provider = process.env.WHATSAPP_PROVIDER ?? 'twilio';
  if (!to) throw new Error('WhatsApp: empty destination');
  if (provider === 'gupshup') return sendGupshup(to, template, params, mediaUrl);
  return sendTwilio(to, template, params, mediaUrl);
}
