import { address } from "@solana/kit";
import { createChainClient, describeTokenProgram, getAta, getTokenProgram } from "@draw/core";
import { env } from "./env";

/**
 * Where are the tokens, actually?
 *
 * When a balance reads zero the question is always one of two things: the
 * account is empty, or we are looking at the wrong address. This prints both
 * the address we derive and every token account the wallet really owns, under
 * both token programs, so the two can be compared directly.
 *
 *   pnpm inspect <wallet>
 */

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

async function main(): Promise<void> {
  const owner = address(process.argv[2] ?? "");
  const { rpc } = createChainClient({ rpcUrl: env.rpcUrl });

  for (const mint of [env.collateralMint, env.debtMint]) {
    const program = await getTokenProgram(rpc, mint);
    const ata = await getAta(rpc, mint, owner);

    console.log(`\nmint      ${mint}`);
    console.log(`program   ${program} (${describeTokenProgram(program)})`);
    console.log(`we expect ${ata.address}`);

    const account = await rpc.getAccountInfo(ata.address, { encoding: "base64" }).send();
    console.log(`exists    ${account.value !== null}`);
  }

  console.log(`\nToken accounts actually owned by ${owner}:`);

  for (const programId of [TOKEN_PROGRAM, TOKEN_2022_PROGRAM]) {
    const accounts = await rpc
      .getTokenAccountsByOwner(
        owner,
        { programId: address(programId) },
        { encoding: "jsonParsed" },
      )
      .send();

    console.log(`\n  under ${programId}:`);
    if (accounts.value.length === 0) {
      console.log("    (none)");
      continue;
    }

    for (const entry of accounts.value) {
      const parsed = entry.account.data as unknown as {
        parsed: { info: { mint: string; tokenAmount: { uiAmountString: string } } };
      };
      console.log(
        `    ${entry.pubkey}  mint=${parsed.parsed.info.mint}  amount=${parsed.parsed.info.tokenAmount.uiAmountString}`,
      );
    }
  }
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
