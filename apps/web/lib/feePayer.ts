import "server-only";

import {
  createKeyPairSignerFromBytes,
  getBase58Encoder,
  getBase64Encoder,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  partiallySignTransaction,
  type Base64EncodedWireTransaction,
  type KeyPairSigner,
} from "@solana/kit";
import { serverEnv } from "./env";

/**
 * Draw pays the network fee for every transaction, which is what lets a user
 * hold no SOL and never hear the word "gas".
 *
 * Ordering matters more than it looks. The fee payer is declared when the
 * transaction is built, before the user signs; adding it afterwards would
 * change the message and silently invalidate their signature. So the server
 * builds, the browser signs, and the server co-signs and submits — in that
 * order, always.
 */

let cached: KeyPairSigner | null = null;

export async function getFeePayer(): Promise<KeyPairSigner> {
  if (cached) return cached;

  const raw = serverEnv.feePayerSecretKey.trim();

  // Accept either the JSON array solana-keygen writes or a base58 string.
  const bytes = raw.startsWith("[")
    ? Uint8Array.from(JSON.parse(raw) as number[])
    : new Uint8Array(getBase58Encoder().encode(raw));

  if (bytes.length !== 64) {
    throw new Error(
      `FEE_PAYER_SECRET_KEY decoded to ${bytes.length} bytes; expected a 64 byte keypair`,
    );
  }

  cached = await createKeyPairSignerFromBytes(bytes);
  return cached;
}

/**
 * Add our signature to a transaction the user has already signed and hand back
 * the base64 wire transaction, ready to submit.
 *
 * `partiallySignTransaction` keeps signatures already present, so the user's
 * survives untouched.
 */
export async function coSignTransaction(
  userSignedBase64: string,
): Promise<Base64EncodedWireTransaction> {
  const feePayer = await getFeePayer();

  const wire = new Uint8Array(getBase64Encoder().encode(userSignedBase64));
  const transaction = getTransactionDecoder().decode(wire);

  const signed = await partiallySignTransaction(
    [feePayer.keyPair],
    transaction,
  );

  return getBase64EncodedWireTransaction(signed);
}
