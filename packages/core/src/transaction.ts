import {
  appendTransactionMessageInstructions,
  compileTransaction,
  compressTransactionMessageUsingAddressLookupTables,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Instruction,
} from "@solana/kit";
import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from "@solana-program/compute-budget";
import { getTransferCheckedInstruction } from "@solana-program/token";
import { getTransferSolInstruction } from "@solana-program/system";
import { fetchEncodedAccount } from "@solana/kit";
import { fetchAllAddressLookupTable } from "@solana-program/address-lookup-table";
import {
  DEFAULT_COMPUTE_UNIT_LIMIT,
  DEFAULT_COMPUTE_UNIT_PRICE,
  MAX_TRANSACTION_BYTES,
  TRANSACTION_SIZE_WARNING_BYTES,
  SETUP_RENT_LAMPORTS,
} from "./constants.js";
import type { SolanaRpc } from "./connection.js";
import { buildDrawInstructions, getUserLookupTable, needsAccountSetup } from "./kamino.js";
import { createAtaInstruction, getAta, getMintInfo } from "./tokens.js";

/**
 * Assembles the whole draw into a single transaction: take the collateral,
 * borrow against it, and pay the merchant.
 *
 * Doing all three in one transaction is the product, not an optimisation. It
 * is what lets the user see a payment instead of a loan application followed
 * by a transfer, and it means there is no state where the borrow succeeded but
 * the payment did not.
 */

export interface BuildDrawTransactionParams {
  rpc: SolanaRpc;
  /** Wallet spending. Signs in the browser; never signs here. */
  user: Address;
  /** Who gets paid. */
  merchant: Address;
  collateralMint: Address;
  /** Collateral to lock, in base units. */
  collateralAmount: bigint;
  debtMint: Address;
  /** Stablecoin to borrow and forward, in base units. */
  borrowAmount: bigint;
  /** Pays network fees so the user never needs SOL. */
  feePayer: Address;
  /** Kamino lookup tables, which the bundle almost certainly needs to fit. */
  lookupTableAddresses?: Address[];
  computeUnitLimit?: number;
  computeUnitPrice?: number;
  /** Return an oversized transaction instead of throwing. Diagnostics only. */
  allowOversize?: boolean;
  /** Skip the "has this user been set up" guard. Diagnostics only. */
  skipSetupCheck?: boolean;
}

/**
 * The user has no Kamino position yet.
 *
 * First-time accounts — user metadata, the obligation, its farm state and the
 * user's lookup table — are five extra instructions, which is enough to push
 * the draw past the transaction size limit on its own. So they go in their own
 * transaction first. Every draw after that is a single atomic one, using the
 * lookup table the setup created.
 */
export class UserSetupRequiredError extends Error {
  constructor(public readonly labels: string[]) {
    super("User needs a one-time Kamino setup transaction before drawing");
    this.name = "UserSetupRequiredError";
  }
}

export interface BuiltTransaction {
  /** Base64 wire transaction, ready for the browser to sign. */
  wireTransaction: string;
  /** Serialized size, so an oversized bundle is caught at build time. */
  sizeBytes: number;
  blockhash: string;
  lastValidBlockHeight: bigint;
  /** Instruction labels in order, which make a failed simulation readable. */
  labels: string[];
}

export class TransactionTooLargeError extends Error {
  constructor(
    public readonly sizeBytes: number,
    public readonly labels: string[],
  ) {
    super(
      `Draw transaction is ${sizeBytes} bytes, over the ${MAX_TRANSACTION_BYTES} byte limit. ` +
        `Supply more lookup tables, pre-create the merchant token account, or split the draw into two transactions.`,
    );
    this.name = "TransactionTooLargeError";
  }
}

export async function buildDrawTransaction(
  params: BuildDrawTransactionParams,
): Promise<BuiltTransaction> {
  const {
    rpc,
    user,
    merchant,
    collateralMint,
    collateralAmount,
    debtMint,
    borrowAmount,
    feePayer,
  } = params;

  const instructions: Instruction[] = [];
  const labels: string[] = [];

  const push = (instruction: Instruction, label: string) => {
    instructions.push(instruction);
    labels.push(label);
  };

  // Budget first. These are tuned from simulation output rather than guessed;
  // too low fails the transaction outright, too high wastes priority fees.
  push(
    getSetComputeUnitLimitInstruction({
      units: params.computeUnitLimit ?? DEFAULT_COMPUTE_UNIT_LIMIT,
    }),
    "computeUnitLimit",
  );
  push(
    getSetComputeUnitPriceInstruction({
      microLamports: params.computeUnitPrice ?? DEFAULT_COMPUTE_UNIT_PRICE,
    }),
    "computeUnitPrice",
  );

  // Only create the merchant's token account when it is actually missing.
  // Including it unconditionally is simpler but costs accounts we cannot
  // spare â€” the bundle is already close to the size limit.
  const merchantAta = await getAta(rpc, debtMint, merchant);
  const merchantAtaExists = await fetchEncodedAccount(rpc, merchantAta.address);

  if (!merchantAtaExists.exists) {
    push(
      await createAtaInstruction(rpc, {
        mint: debtMint,
        owner: merchant,
        payer: feePayer,
      }),
      "createMerchantTokenAccount",
    );
  }

  // Deposit the collateral and borrow against it. Kamino exposes this as one
  // action, so both legs land on the same obligation by construction.
  const lending = await buildDrawInstructions({
    rpc,
    owner: user,
    collateralMint,
    depositAmount: collateralAmount.toString(),
    debtMint,
    borrowAmount: borrowAmount.toString(),
  });

  if (needsAccountSetup(lending.setup.labels) && !params.skipSetupCheck) {
    throw new UserSetupRequiredError(lending.setup.labels);
  }

  // Whatever is left is idempotent account creation, cheap enough to ride along.
  lending.setup.instructions.forEach((instruction, index) => {
    push(instruction, lending.setup.labels[index] ?? `setup[${index}]`);
  });

  lending.draw.instructions.forEach((instruction, index) => {
    push(instruction, lending.draw.labels[index] ?? `kamino[${index}]`);
  });

  // Forward the borrowed stablecoin to the merchant.
  const [source, mintInfo] = await Promise.all([
    getAta(rpc, debtMint, user),
    getMintInfo(rpc, debtMint),
  ]);

  push(
    getTransferCheckedInstruction(
      {
        source: source.address,
        mint: debtMint,
        destination: merchantAta.address,
        authority: createNoopSigner(user),
        amount: borrowAmount,
        decimals: mintInfo.decimals,
      },
      { programAddress: source.tokenProgram },
    ),
    "payMerchant",
  );

  // Fall back to the user's own Kamino lookup table. The draw does not fit
  // without one, and callers should not have to know that.
  const lutAddresses =
    params.lookupTableAddresses ??
    (await getUserLookupTable(rpc, user).then((lut) => (lut ? [lut] : [])));

  const lookupTables = await loadLookupTables(rpc, lutAddresses);
  const { value: latestBlockhash } = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    // The fee payer must be set before the user signs. Changing it afterwards
    // silently invalidates their signature.
    (m) => setTransactionMessageFeePayer(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
    (m) =>
      lookupTables.size > 0
        ? compressTransactionMessageUsingAddressLookupTables(m,
            Object.fromEntries(lookupTables))
        : m,
  );

  const transaction = compileTransaction(message);
  const wireTransaction = getBase64EncodedWireTransaction(transaction);
  const sizeBytes = Buffer.from(wireTransaction, "base64").length;

  if (sizeBytes > MAX_TRANSACTION_BYTES && !params.allowOversize) {
    throw new TransactionTooLargeError(sizeBytes, labels);
  }
  if (sizeBytes > TRANSACTION_SIZE_WARNING_BYTES) {
    console.warn(
      `[draw] transaction is ${sizeBytes}/${MAX_TRANSACTION_BYTES} bytes â€” close to the limit`,
    );
  }

  return {
    wireTransaction,
    sizeBytes,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    labels,
  };
}

/**
 * One-time account setup for a user who has never drawn.
 *
 * Returns null when they are already set up, so callers can just try it.
 */
export async function buildUserSetupTransaction(params: {
  rpc: SolanaRpc;
  user: Address;
  collateralMint: Address;
  collateralAmount: bigint;
  debtMint: Address;
  borrowAmount: bigint;
  feePayer: Address;
}): Promise<BuiltTransaction | null> {
  const { rpc, user, collateralMint, collateralAmount, debtMint, borrowAmount, feePayer } =
    params;

  const lending = await buildDrawInstructions({
    rpc,
    owner: user,
    collateralMint,
    depositAmount: collateralAmount.toString(),
    debtMint,
    borrowAmount: borrowAmount.toString(),
  });

  if (!needsAccountSetup(lending.setup.labels)) return null;

  // Kamino makes the user the rent payer for their own lookup table,
  // obligation and metadata accounts, and our fee payer only covers
  // transaction fees. So top them up first, or setup fails with "insufficient
  // lamports" on a wallet we promised would never need SOL.
  const instructions: Instruction[] = [
    getSetComputeUnitLimitInstruction({ units: DEFAULT_COMPUTE_UNIT_LIMIT }),
    getSetComputeUnitPriceInstruction({ microLamports: DEFAULT_COMPUTE_UNIT_PRICE }),
    getTransferSolInstruction({
      source: createNoopSigner(feePayer),
      destination: user,
      amount: SETUP_RENT_LAMPORTS,
    }),
    ...lending.setup.instructions,
  ];

  const { value: latestBlockhash } = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );

  const transaction = compileTransaction(message);
  const wireTransaction = getBase64EncodedWireTransaction(transaction);

  return {
    wireTransaction,
    sizeBytes: Buffer.from(wireTransaction, "base64").length,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    labels: ["computeUnitLimit", "computeUnitPrice", ...lending.setup.labels],
  };
}

/**
 * Fetch the address lookup tables the bundle needs.
 *
 * Without these the draw will not fit: Kamino's deposit and borrow reference a
 * long list of reserve, oracle and farm accounts, and a legacy message runs out
 * of room well before the payment instruction is reached.
 */
async function loadLookupTables(
  rpc: SolanaRpc,
  addresses: Address[] | undefined,
): Promise<Map<Address, Address[]>> {
  const tables = new Map<Address, Address[]>();
  if (!addresses || addresses.length === 0) return tables;

  const accounts = await fetchAllAddressLookupTable(rpc, addresses);

  for (const account of accounts) {
    tables.set(account.address, account.data.addresses);
  }

  return tables;
}






