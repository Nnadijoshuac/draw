import {
  createKeyPairSignerFromBytes,
  getBase58Encoder,
  getBase64Encoder,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  partiallySignTransaction,
} from "@solana/kit";

/**
 * The merchant loop, end to end, with no browser in it.
 *
 * Drives the real HTTP routes: build the transaction, sign it the way the
 * wallet would, submit it, and then ask the *shop's own server* whether it
 * believes the order is paid.
 *
 * That last step is the point. The browser claiming a payment proves nothing;
 * this asserts the shop learned about it from a signed server-to-server event.
 *
 *   pnpm --filter @draw/scripts exec tsx src/e2e-webhook.ts <user-secret-key>
 */

const APP = process.env.DRAW_APP_URL ?? "http://localhost:3000";
const SHOP = process.env.DRAW_SHOP_URL ?? "http://localhost:3001";
const AMOUNT_MINOR = 4000;
const REFERENCE = "order_1042";

async function main(): Promise<void> {
  const [userSecret] = process.argv.slice(2);
  if (!userSecret) {
    console.error("Usage: e2e-webhook <user-secret-key>");
    process.exit(1);
  }

  const user = await createKeyPairSignerFromBytes(
    new Uint8Array(getBase58Encoder().encode(userSecret)),
  );
  console.log(`user ${user.address}`);

  // The shop must not already believe this order is paid, or the assertion at
  // the end proves nothing.
  const before = await fetch(
    `${SHOP}/api/draw/status?reference=${REFERENCE}`,
  ).then((r) => r.json());
  console.log(`shop believes paid, before: ${before.paid}`);

  // 1. Build. Same route the checkout popup calls.
  const built = await fetch(`${APP}/api/tx/build`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: REFERENCE,
      owner: user.address,
      amountMinor: AMOUNT_MINOR,
      origin: SHOP,
    }),
  }).then((r) => r.json());

  if (built.error) {
    console.error(`build failed: ${built.code} — ${built.error}`);
    process.exit(1);
  }
  console.log(
    `built  ${built.labels.length} ixs, ${built.sizeBytes}/1232 bytes → ${built.destinationName}`,
  );

  // 2. Sign. The wallet does this in the browser; here we do it directly.
  const decoded = getTransactionDecoder().decode(
    new Uint8Array(getBase64Encoder().encode(built.transaction)),
  );
  const signed = await partiallySignTransaction([user.keyPair], decoded);
  const wire = getBase64EncodedWireTransaction(signed);

  // 3. Submit. The fee payer co-signs, it simulates, it sends, and then it
  //    notifies the merchant.
  const submitted = await fetch(`${APP}/api/tx/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: REFERENCE,
      transaction: wire,
      origin: SHOP,
      amountMinor: AMOUNT_MINOR,
      currency: "USD",
      reference: REFERENCE,
    }),
  }).then((r) => r.json());

  if (submitted.error) {
    console.error(`submit failed: ${submitted.code} — ${submitted.error}`);
    process.exit(1);
  }

  console.log(`landed ${submitted.signature}`);
  console.log(`notified merchant: ${submitted.notified}`);

  // 4. Ask the shop. Not the browser — the shop.
  const after = await fetch(
    `${SHOP}/api/draw/status?reference=${REFERENCE}`,
  ).then((r) => r.json());

  if (!after.paid) {
    console.error("\nthe shop never heard about it");
    process.exit(1);
  }

  console.log(`\nshop confirms order ${after.order.reference}`);
  console.log(`  $${(after.order.amountMinor / 100).toFixed(2)} ${after.order.currency}`);
  console.log(`  ${after.order.signature}`);

  if (after.order.signature !== submitted.signature) {
    console.error("\nthe shop recorded a different signature");
    process.exit(1);
  }
  console.log("\nsignature matches what actually landed");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
