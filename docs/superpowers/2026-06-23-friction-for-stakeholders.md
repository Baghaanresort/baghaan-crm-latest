# Baghaan CRM — Issues in the Booking Flow (for review & decision)

_Plain-English summary · 23 June 2026 · please tick one option under each issue_

**How a booking works today:** an enquiry comes in → we **hold** rooms tentatively → the guest pays an **advance deposit** → we **confirm** the booking → the guest **checks in**, stays, then **settles the bill and checks out.**

Below are 8 issues we found in this flow. For each, we've written what happens today and a few ways we could fix it — please pick the option you prefer.

---

## High priority (can lose money or rooms)

### 1. A guest can pay and still lose their rooms
**What happens now:** every hold has an expiry time. If a guest pays their advance but our team hasn't pressed "Book" before that time passes, the system **auto-cancels the hold** — even though they already paid. Their rooms are freed and their payment is left stranded.
**How we could fix it:**
- ☐ **A —** Once a guest pays anything, the hold is protected and never auto-cancels (stays until staff act). *(our recommendation)*
- ☐ **B —** When an advance is paid, automatically extend the hold (e.g., +7 days) so it doesn't quietly lapse.
- ☐ **C —** Keep auto-cancelling, but warn staff before a paid hold is about to expire so they can act.

### 2. A booking can be confirmed without collecting the agreed advance
**What happens now:** the moment *any* amount is recorded (even ₹1), the system treats the advance as "done" and lets us confirm. The "Advance to be Paid" we set is ignored.
**How we could fix it:**
- ☐ **A —** "Book" only unlocks once the guest has paid at least the agreed advance; until then it shows "short by ₹X" and stays locked. *(our recommendation)*
- ☐ **B —** Allow booking at any time, but show a clear "advance short by ₹X" warning and let staff decide.
- ☐ **C —** Show "part-paid" and "advance fully paid" as two separate stages; only allow "Book" at fully-paid.

---

## Medium priority (wrong amounts / wasted rooms / confusing)

### 3. The advance request asks the guest for the wrong amount
**What happens now:** the "Send Advance Request" link always asks for 50% of the total — even when we've set a different "Advance to be Paid".
**How we could fix it:**
- ☐ **A —** Ask for exactly the "Advance to be Paid" we set (and fall back to 50% only if we didn't set one). *(our recommendation)*
- ☐ **B —** Always use a single fixed percentage we configure (e.g., 50%), and drop the per-hold amount.
- ☐ **C —** Let staff type the amount each time they send the request.

### 4. Some holds never expire and keep rooms blocked forever
**What happens now:** holds created directly (not from an enquiry) don't expire on their own, so those rooms can stay falsely "unavailable" indefinitely.
**How we could fix it:**
- ☐ **A —** These holds expire automatically like the others — but never if the guest has paid (see issue 1). *(our recommendation)*
- ☐ **B —** Don't auto-expire them, but show staff a "holds past expiry" list to release manually.
- ☐ **C —** Leave as is.

### 5. A paid hold wrongly shows as "Confirmed"
**What happens now:** a hold where the guest paid a deposit appears as "Confirmed" in the bookings list, even though it isn't a real booking yet (we still need to press "Book"). Two screens end up disagreeing.
**How we could fix it:**
- ☐ **A —** Show it as "Advance Paid (hold)"; the word "Confirmed" only ever means a truly booked stay. *(our recommendation)*
- ☐ **B —** Keep the word "Confirmed" but add a small "not yet booked" marker next to it.
- ☐ **C —** Leave as is.

### 6. There are two ways to book an enquiry, and one skips the advance check
**What happens now:** two different routes turn an enquiry into a booking, and one of them doesn't apply the advance rule — so a booking could slip through without the deposit.
**How we could fix it:**
- ☐ **A —** Use one consistent route that always applies the advance rule (remove the shortcut). *(our recommendation)*
- ☐ **B —** Keep both routes, but make both apply the advance rule.
- ☐ **C —** Leave as is.

---

## Low priority (wording & accuracy)

### 7. Outdated wording
**What happens now:** a few on-screen messages still say "verified payment", though we removed the verification step earlier.
**How we could fix it:**
- ☐ **A —** Update the wording so it's current. *(our recommendation)*
- ☐ **B —** Leave as is.

### 8. Payment type is sometimes labelled wrong
**What happens now:** the system auto-labels each payment as *advance / balance / company-bill* based on dates, and occasionally gets it wrong, which can slightly skew the Accounts reports.
**How we could fix it:**
- ☐ **A —** Keep the manual dropdown for staff, but make the automatic guess smarter. *(our recommendation)*
- ☐ **B —** Make staff choose the type every time (no automatic guess).
- ☐ **C —** Leave as is.

---

_These are corrections, not new features — no guest-facing disruption, and existing bookings/data are unaffected. Please tick one option per issue and return._
