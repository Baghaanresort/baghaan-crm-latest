# Baghaan CRM — Issues in the Booking Flow (for review & approval)

_Plain-English summary · 23 June 2026_

## How a booking works today

A guest enquiry comes in → we **hold** rooms for them tentatively → the guest pays an **advance deposit** → we **confirm** the booking → the guest **checks in**, stays, then **settles the bill and checks out**.

Below are 8 issues we found in this flow. Each one is rated **High / Medium / Low**. Nothing here needs new guest-facing features — these are corrections that make the flow safer and clearer.

---

## High priority (can lose money or rooms)

**1. A guest can pay and still lose their rooms.**
Every hold has an expiry time. Today, if a guest pays their advance but our team hasn't pressed "Book" before that time passes, the system **automatically cancels the hold** — even though the guest already paid. Their rooms are freed up and their payment is left stranded.
→ **Change:** never auto-cancel a hold once the guest has paid anything. Paid holds are protected.

**2. A booking can be confirmed without collecting the agreed advance.**
Right now, the moment *any* amount is recorded (even ₹1), the system treats the advance as "done" and lets us confirm the booking. The "Advance to be Paid" amount we set is ignored.
→ **Change:** "Book" only unlocks once the guest has paid at least the agreed advance. If they're short, it shows "short by ₹X" and stays locked.

---

## Medium priority (wrong amounts / wasted rooms / confusing)

**3. The advance request asks for the wrong amount.**
The "Send Advance Request" button always asks the guest for 50% of the total — even when we've set a different "Advance to be Paid".
→ **Change:** it asks for exactly the advance amount we set.

**4. Some holds never expire and keep rooms blocked forever.**
Holds created directly (not from an enquiry) don't expire on their own, so those rooms can stay falsely "unavailable" indefinitely.
→ **Change:** these holds also expire automatically — but, per issue 1, never if the guest has paid.

**5. A paid hold wrongly shows as "Confirmed".**
A hold where the guest paid a deposit currently appears as "Confirmed" in the bookings list, even though it isn't a real booking yet (we still need to press "Book"). Two screens end up disagreeing.
→ **Change:** it clearly reads "Advance Paid (hold)". "Confirmed" will only ever mean an actual booked stay.

**6. There are two ways to book an enquiry, and one skips the advance check.**
This makes the rules inconsistent — a booking could slip through without the advance being collected.
→ **Change:** one consistent path that always applies the advance rule.

---

## Low priority (wording & accuracy)

**7. Outdated wording.**
A few messages still say "verified payment", though we removed the verification step earlier.
→ **Change:** update the wording.

**8. Payment type is sometimes guessed wrong.**
The system auto-labels a payment as advance / balance / company-bill based on dates, and occasionally mislabels it, which can slightly skew the Accounts reports.
→ **Change:** keep the manual dropdown for staff, but make the automatic guess smarter.

---

## What we're asking to approve

Permission to fix all 8 — **highest priority on 1 & 2** (the ones that can lose a paying guest's rooms or let a booking through without the advance). No new features, no guest-facing disruption; existing data is unaffected.
