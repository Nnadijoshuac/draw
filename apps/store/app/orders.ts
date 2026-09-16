import "server-only";

/**
 * What the shop believes about its own orders.
 *
 * In-memory on purpose. A real shop writes this to its database inside the
 * same transaction that reserves stock; the point of the demo is only to show
 * that the shop's belief comes from a signed server-to-server call and not
 * from a browser saying so.
 *
 * Module scope survives between requests in `next dev`, which is all this
 * needs to hold for a demo.
 */

export interface PaidOrder {
  reference: string;
  amountMinor: number;
  currency: string;
  signature: string;
  paidAt: string;
}

const paid = new Map<string, PaidOrder>();

export function recordPaid(order: PaidOrder): void {
  paid.set(order.reference, order);
}

export function getPaid(reference: string): PaidOrder | null {
  return paid.get(reference) ?? null;
}
