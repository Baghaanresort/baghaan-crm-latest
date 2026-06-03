export const WA_TEMPLATES = {
  enquiryFollowup: (name: string) =>
    `Hi ${name || 'there'}, following up on your enquiry for Baghaan Orchard Retreat. Would you like to proceed with the booking? 🌿`,
  bookingConfirmation: (name: string, conf: string, arrival: string) =>
    `Dear ${name}, your booking at Baghaan Orchard Retreat is confirmed!\n\nConfirmation: ${conf}\nArrival: ${arrival}\n\nLooking forward to hosting you! 🌿`,
  paymentReminder: (name: string, amount: string) =>
    `Hi ${name}, a gentle reminder that ₹${amount} is pending for your upcoming stay at Baghaan. Please share the transaction reference once done. Thank you! 🙏`,
  enquiryGreeting: (name: string) =>
    `Hi ${name || 'there'}, thank you for your interest in Baghaan Orchard Retreat! 🌿`,
} as const;

export function buildWaLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.startsWith('91') ? digits : `91${digits}`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
