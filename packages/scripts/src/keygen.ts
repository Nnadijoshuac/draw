import { generateKeyPairSync } from "node:crypto";
import { getBase58Decoder } from "@solana/kit";

/**
 * Generate the fee payer keypair.
 *
 * The fee payer sponsors every draw, which is what lets a user hold no SOL and
 * never encounter the word "gas". On a surfnet it is funded with a cheatcode,
 * so this key is disposable; on mainnet it would hold real SOL and belong in a
 * secrets manager rather than a dotfile.
 *
 *   pnpm keygen
 */

function main(): void {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  // Node hands back DER. Solana wants the raw 32-byte seed followed by the
  // 32-byte public key, so strip the ASN.1 headers: 16 bytes for a PKCS#8
  // ed25519 private key, 12 for an SPKI public key.
  const seed = privateKey.export({ format: "der", type: "pkcs8" }).subarray(16);
  const pub = publicKey.export({ format: "der", type: "spki" }).subarray(12);

  const secretKey = Buffer.concat([seed, pub]);
  const base58 = getBase58Decoder();

  const address = base58.decode(pub);

  console.log(`address           ${address}`);
  console.log(`FEE_PAYER_SECRET_KEY=${base58.decode(secretKey)}`);
  console.log(
    `\nPaste that line into .env.local. It never goes in the repo, and it must ` +
      `never become a NEXT_PUBLIC_ variable.`,
  );
}

main();
