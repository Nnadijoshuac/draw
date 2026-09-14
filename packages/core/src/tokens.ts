import {
  createNoopSigner,
  fetchEncodedAccount,
  type Address,
  type Instruction,
} from "@solana/kit";
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  fetchMint,
  type Mint,
} from "@solana-program/token";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import type { TokenProgram } from "@draw/shared";
import type { SolanaRpc } from "./connection.js";

/**
 * xStocks are issued under Token-2022 while USDC uses the original token
 * program. The two are not interchangeable: deriving an associated token
 * address with the wrong program id produces a valid-looking address that
 * simply does not exist, and the resulting errors point nowhere near the
 * actual mistake.
 *
 * Nothing in this codebase should hardcode a token program. Resolve it from
 * the mint, every time, through here.
 */

const programCache = new Map<Address, Address>();
const mintCache = new Map<Address, Mint>();

export function isTokenProgram(programAddress: Address): boolean {
  return (
    programAddress === TOKEN_PROGRAM_ADDRESS ||
    programAddress === TOKEN_2022_PROGRAM_ADDRESS
  );
}

export function describeTokenProgram(programAddress: Address): TokenProgram {
  return programAddress === TOKEN_2022_PROGRAM_ADDRESS
    ? "spl-token-2022"
    : "spl-token";
}

/** Look up which token program owns a mint. Cached — mints do not migrate. */
export async function getTokenProgram(
  rpc: SolanaRpc,
  mint: Address,
): Promise<Address> {
  const cached = programCache.get(mint);
  if (cached) return cached;

  const account = await fetchEncodedAccount(rpc, mint);
  if (!account.exists) {
    throw new Error(`Mint account not found: ${mint}`);
  }
  if (!isTokenProgram(account.programAddress)) {
    throw new Error(
      `Account ${mint} is owned by ${account.programAddress}, which is not a token program`,
    );
  }

  programCache.set(mint, account.programAddress);
  return account.programAddress;
}

export async function getMintInfo(rpc: SolanaRpc, mint: Address): Promise<Mint> {
  const cached = mintCache.get(mint);
  if (cached) return cached;

  const account = await fetchMint(rpc, mint);
  mintCache.set(mint, account.data);
  return account.data;
}

export interface ResolvedAta {
  address: Address;
  tokenProgram: Address;
}

/**
 * Derive the associated token account for an owner, using whichever token
 * program actually owns the mint.
 */
export async function getAta(
  rpc: SolanaRpc,
  mint: Address,
  owner: Address,
): Promise<ResolvedAta> {
  const tokenProgram = await getTokenProgram(rpc, mint);
  const [address] = await findAssociatedTokenPda({ owner, tokenProgram, mint });
  return { address, tokenProgram };
}

/**
 * Build an idempotent create-ATA instruction.
 *
 * Idempotent rather than checked-then-created: it costs one fewer round trip
 * and removes the race where the account appears between the check and the
 * transaction landing. Safe to include unconditionally.
 */
export async function createAtaInstruction(
  rpc: SolanaRpc,
  params: { mint: Address; owner: Address; payer: Address },
): Promise<Instruction> {
  const { mint, owner, payer } = params;
  const { address, tokenProgram } = await getAta(rpc, mint, owner);

  // tokenProgram is an account this instruction passes through to, not the
  // program it runs on. Overriding programAddress here points the whole
  // instruction at the token program and it fails with InvalidArgument.
  //
  // The payer signs in the relay, not here, so a noop signer carries the
  // address through without needing key material.
  return getCreateAssociatedTokenIdempotentInstruction({
    payer: createNoopSigner(payer),
    ata: address,
    owner,
    mint,
    tokenProgram,
  });
}

/** Read a token balance in base units. Returns 0n when the account is absent. */
export async function getTokenBalance(
  rpc: SolanaRpc,
  mint: Address,
  owner: Address,
): Promise<bigint> {
  const { address } = await getAta(rpc, mint, owner);

  const account = await fetchEncodedAccount(rpc, address);
  if (!account.exists) return 0n;

  const balance = await rpc.getTokenAccountBalance(address).send();
  return BigInt(balance.value.amount);
}

/** Test seam — the caches are process-wide and would otherwise leak between runs. */
export function clearTokenCaches(): void {
  programCache.clear();
  mintCache.clear();
}
