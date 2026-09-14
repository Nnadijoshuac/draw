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
import { fetchAllAddressLookupTable } from "@solana-program/address-lookup-table";
import {
  DEFAULT_COMPUTE_UNIT_LIMIT,
  DEFAULT_COMPUTE_UNIT_PRICE,
  MAX_TRANSACTION_BYTES,
  TRANSACTION_SIZE_WARNING_BYTES,
} from "./constants.js";
import type { SolanaRpc } from "./connection.js";
import { buildDrawInstructions } from "./kamino.js";
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

  // The merchant may never have been paid in this stablecoin before. Creating
  // their token account is idempotent, so including it unconditionally costs
  // nothing when it already exists.
  push(
    await createAtaInstruction(rpc, {
      mint: debtMint,
      owner: merchant,
      payer: feePayer,
    }),
    "createMerchantTokenAccount",
  );

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

  lending.instructions.forEach((instruction, index) => {
    push(instruction, lending.labels[index] ?? `kamino[${index}]`);
  });

  // Forward the borrowed stablecoin to the merchant.
  const [source, destination, mintInfo] = await Promise.all([
    getAta(rpc, debtMint, user),
    getAta(rpc, debtMint, merchant),
    getMintInfo(rpc, debtMint),
  ]);

  push(
    getTransferCheckedInstruction(
      {
        source: source.address,
        mint: debtMint,
        destination: destination.address,
        authority: createNoopSigner(user),
        amount: borrowAmount,
        decimals: mintInfo.decimals,
      },
      { programAddress: source.tokenProgram },
    ),
    "payMerchant",
  );

  const lookupTables = await loadLookupTables(rpc, params.lookupTableAddresses);
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

  if (sizeBytes > MAX_TRANSACTION_BYTES) {
    throw new TransactionTooLargeError(sizeBytes, labels);
  }
  if (sizeBytes > TRANSACTION_SIZE_WARNING_BYTES) {
    console.warn(
      `[draw] transaction is ${sizeBytes}/${MAX_TRANSACTION_BYTES} bytes — close to the limit`,
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
