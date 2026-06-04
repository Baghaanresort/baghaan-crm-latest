'use server';

import { createHmac } from 'crypto';
import { headers } from 'next/headers';

function makeToken(bookingId: string): string {
  const secret = process.env.VOUCHER_SECRET ?? 'baghaan-orchard-voucher-2024';
  return createHmac('sha256', secret).update(bookingId).digest('hex').slice(0, 20);
}

export async function getVoucherShareUrl(bookingId: string): Promise<string> {
  const hdrs = await headers();
  const host = hdrs.get('host') ?? 'localhost:3000';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  const token = makeToken(bookingId);
  return `${proto}://${host}/api/voucher/view?bookingId=${bookingId}&token=${token}`;
}
