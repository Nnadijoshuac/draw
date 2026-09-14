import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  getMint,
  type Mint,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  type TransactionInstruction,
} from "@solana/web3.js";
import type { TokenProgram } from "@draw/shared";

/**
 * xStocks are issued under Token-2022 while USDC uses the original token
 * program. The two are not interchangeable: deriving an associated token
 * address with the wrong program id produces a valid-looking address that
 * simply does not exist, and the resulting errors point nowhere near the
 * actual mistake.
 *
 * Nothing in this codebase should hardcode a token program id. Resolve it from
 * the mint, every time, through here.
 */

const programCache = new Map<string, PublicKey>();
const mintCache = new Map<string, Mint>();

export function isTokenProgram(programId: PublicKey): boolean {
  return (
    programId.equals(TOKEN_PROGRAM_ID) || programId.equals(TOKEN_2022_PROGRAM_ID)
  );
}

export function describeTokenProgram(programId: PublicKey): TokenProgram {
  return programId.equals(TOKEN_2022_PROGRAM_ID) ? "spl-token-2022" : "spl-token";
}

/** Look up which token program owns a mint. Cached — mints do not migrate. */
export async function getTokenProgramId(
  connection: Connection,
  mint: PublicKey,
): Promise<PublicKey> {
  const key = mint.toBase58();

  const cached = programCache.get(key);
  if (cached) return cached;

  const account = await connection.getAccountInfo(mint);
  if (!account) {
    throw new Error(`Mint account not found: ${key}`);
  }
  if (!isTokenProgram(account.owner)) {
    throw new Error(
      `Account ${key} is owned by ${account.owner.toBase58()}, which is not a token program`,
    );
  }

  programCache.set(key, account.owner);
  return account.owner;
}

export async function getMintInfo(
  connection: Connection,
  mint: PublicKey,
): Promise<Mint> {
  const key = mint.toBase58();

  const cached = mintCache.get(key);
  if (cached) return cached;

  const programId = await getTokenProgramId(connection, mint);
  const info = await getMint(connection, mint, undefined, programId);

  mintCache.set(key, info);
  return info;
}

export interface ResolvedAta {
  address: PublicKey;
  programId: PublicKey;
}

/**
 * Derive the associated token account for an owner, using whichever token
 * program actually owns the mint.
 *
 * `allowOwnerOffCurve` is enabled because some owners are program-derived
 * addresses rather than wallets.
 */
export async function getAta(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
): Promise<ResolvedAta> {
  const programId = await getTokenProgramId(connection, mint);
  const address = getAssociatedTokenAddressSync(mint, owner, true, programId);
  return { address, programId };
}

/**
 * Build an idempotent create-ATA instruction.
 *
 * Idempotent rather than checked-then-created: it costs one fewer round trip
 * and removes the race where the account appears between the check and the
 * transaction landing. Safe to include unconditionally.
 */
export async function createAtaInstruction(
  connection: Connection,
  params: { mint: PublicKey; owner: PublicKey; payer: PublicKey },
): Promise<TransactionInstruction> {
  const { mint, owner, payer } = params;
  const { address, programId } = await getAta(connection, mint, owner);

  return createAssociatedTokenAccountIdempotentInstruction(
    payer,
    address,
    owner,
    mint,
    programId,
  );
}

/** Read a token balance in base units. Returns 0n when the account is absent. */
export async function getTokenBalance(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
): Promise<bigint> {
  const { address } = await getAta(connection, mint, owner);

  const account = await connection.getAccountInfo(address);
  if (!account) return 0n;

  const balance = await connection.getTokenAccountBalance(address);
  return BigInt(balance.value.amount);
}

/** Test seam — the caches are process-wide and would otherwise leak between runs. */
export function clearTokenCaches(): void {
  programCache.clear();
  mintCache.clear();
}
