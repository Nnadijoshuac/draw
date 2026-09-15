import { fetchEncodedAccount, address, type Address } from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import type { SolanaRpc } from "./connection";
import { isTokenProgram } from "./tokens";

/**
 * Check an address before we let money go to it.
 *
 * A Solana address is 32 bytes of base58 and nothing more. Any string of the
 * right shape decodes cleanly, so "is this valid" tells us almost nothing —
 * a typo that happens to land on a real address looks exactly like the address
 * the user meant. And the transfer is final.
 *
 * So we ask the chain what the account actually is. The expensive mistake is
 * pasting a token account instead of a wallet, which is easy to do because both
 * are 44 characters of base58 and wallets display theirs next to their balance.
 */

export type RecipientProblem =
  | "malformed"
  /** A token account, not a wallet. Sending here would strand the funds. */
  | "token-account"
  /** A program or PDA. Nothing here can move the tokens again. */
  | "not-a-wallet";

export type RecipientCheck =
  | {
      ok: true;
      address: Address;
      /**
       * False when the address has no account yet. Legitimate for a wallet that
       * has never been funded, and identical to a typo, so the user decides.
       */
      funded: boolean;
      /** True when this is the sender's own address. */
      self: boolean;
    }
  | { ok: false; problem: RecipientProblem };

/** Decode without throwing. Used by the UI while someone is still typing. */
export function parseAddress(value: string): Address | null {
  try {
    return address(value.trim());
  } catch {
    return null;
  }
}

export async function checkRecipient(
  rpc: SolanaRpc,
  value: string,
  owner?: Address,
): Promise<RecipientCheck> {
  const parsed = parseAddress(value);
  if (!parsed) return { ok: false, problem: "malformed" };

  const self = owner !== undefined && parsed === owner;
  const account = await fetchEncodedAccount(rpc, parsed);

  // No account at all. A fresh wallet is the common case and it is fine to send
  // to — the transfer creates its token account. We flag it rather than block
  // it, because from here a new wallet and a typo are indistinguishable.
  if (!account.exists) {
    return { ok: true, address: parsed, funded: false, self };
  }

  if (isTokenProgram(account.programAddress)) {
    return { ok: false, problem: "token-account" };
  }

  // System-owned means a plain wallet. Anything else is a program or a PDA,
  // and tokens sent to one are generally unrecoverable.
  if (account.programAddress !== SYSTEM_PROGRAM_ADDRESS) {
    return { ok: false, problem: "not-a-wallet" };
  }

  return { ok: true, address: parsed, funded: true, self };
}

/** What to tell the user. Kept here so both surfaces say the same thing. */
export function describeProblem(problem: RecipientProblem): string {
  switch (problem) {
    case "malformed":
      return "That doesn't look like a Solana address.";
    case "token-account":
      return "That's a token account, not a wallet. Use the wallet address it belongs to.";
    case "not-a-wallet":
      return "That address belongs to a program, not a wallet. Money sent there can't be recovered.";
  }
}
