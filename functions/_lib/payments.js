/* Payments: one row in `payments` per attempt, tied to the order part it pays.

   UPI (now): the customer pays in their own UPI app (button, QR code or the UPI ID typed by hand), then types
   the 12-digit UPI reference (UTR) from their receipt. The payment waits as 'submitted' until the owner finds the
   money in the bank and presses "Mark paid" (or "Reject"). Nothing here can see the bank: the owner's check is the proof.

   A gateway such as Razorpay fits later without changing any table: it would create its own payment row
   (provider 'razorpay', provider_order_id from Razorpay), and its signed webhook would call settleStatements()
   below, exactly as the owner's "Mark paid" does today.

   The UPI details come from Cloudflare settings, never from this repo:
     UPI_ID          the main UPI ID (used by the pay button and the QR code)
     UPI_ID_BACKUP   other UPI IDs for the same account, comma-separated, shown "if the payment fails"
     UPI_PAYEE_NAME  the name the UPI app shows */
import { now } from "./auth.js";

export const UTR = /^\d{12}$/;                 // a UPI reference (UTR) is 12 digits
export const MAX_SUBMITS_PER_DAY = 5;          // UPI references one order can receive in 24 hours

export const cleanVpa = (v) => {
  const s = typeof v === "string" ? v.trim() : "";
  return /^[A-Za-z0-9.\-_]{2,128}@[A-Za-z][A-Za-z0-9]{1,63}$/.test(s) ? s : null;
};

export function cleanUtr(v) {
  const s = typeof v === "string" ? v.replace(/[\s-]/g, "") : "";
  return UTR.test(s) ? s : null;
}

/* The UPI settings, or null while they are missing (the pay box then says payment is not switched on yet). */
export function upiConfig(env) {
  const id = cleanVpa(env.UPI_ID);
  const payee = typeof env.UPI_PAYEE_NAME === "string" ? env.UPI_PAYEE_NAME.trim().slice(0, 60) : "";
  if (!id || !payee) return null;
  const backups = String(env.UPI_ID_BACKUP || "").split(",").map(cleanVpa).filter((x) => x && x !== id).slice(0, 4);
  return { id, backups, payee };
}

/* The note on the payment: the order number, plus the part for split prices ("TAS-7K2Q9M 2/3"). */
export const payNote = (ref, seq, count) => (count > 1 ? `${ref} ${seq}/${count}` : ref);

/* The standard UPI payment address (NPCI "upi://pay" format). The UPI ID stays readable: some apps fail on %40. */
export function upiQuery({ id, payee, amountMinor, note }) {
  return `pa=${id}&pn=${encodeURIComponent(payee)}&am=${(amountMinor / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
}

/* Statements that settle one part with a confirmed payment, and move the order on:
   all parts paid → 'paid' (unless work already started or finished); an advance paid → 'in_progress'. */
export function settleStatements(env, { order, parts, part, paymentId, actorId, t = now() }) {
  const stillOpen = parts.filter((p) => p.id !== part.id && p.status !== "paid").length;
  const next = stillOpen === 0 ? (order.status === "pending" ? "paid" : order.status) : order.status === "pending" ? "in_progress" : order.status;
  return {
    allPaid: stillOpen === 0,
    statements: [
      env.DB.prepare("UPDATE payments SET status = 'confirmed', confirmed_by = ?, confirmed_at = ?, updated_at = ? WHERE id = ? AND status IN ('submitted', 'created')").bind(actorId, t, t, paymentId),
      env.DB.prepare("UPDATE order_parts SET status = 'paid', paid_at = ?, payment_id = ?, updated_at = ? WHERE id = ? AND status = 'due'").bind(t, paymentId, t, part.id),
      env.DB.prepare("UPDATE orders SET status = ?, paid_at = CASE WHEN ? THEN ? ELSE paid_at END, updated_at = ? WHERE id = ?").bind(next, stillOpen === 0 ? 1 : 0, t, t, order.id),
    ],
  };
}
