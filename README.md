# Draw

**Spend against what you own.**

Pay for things with your tokenized stock as collateral — without selling it. One tap, one transaction, and you keep every share.

Built for the [Stocklana hackathon](https://hackathons.solana.com/hackathons/stocklana).

---

## The problem

You own $200 of Nvidia. You need $40 today.

Your options are to sell — settlement delay, taxable event, and you permanently give up the upside on something you believed in — or to not buy the thing.

The instrument that solves this already exists. It is called securities-backed lending, and it is how wealthy people fund their lives without liquidating assets. It requires a private bank, a six-figure minimum, days of paperwork, and market hours.

## What Draw does

A merchant site has a **Pay with Draw** button. The user clicks it, sees *"borrowing $40 against your NVDAx — you keep all 1.42 shares"*, and confirms.

Behind that single confirmation, **one Solana transaction** deposits the collateral, borrows the stablecoin, and pays the merchant.

No credit check. No bureau. No loan application. Works on a Sunday. Works in any country.

### The idea underneath

> **The collateral is the underwriting.**

Most of the world has no credit bureau, so it has no consumer credit. The bottleneck was never interest rates — it was the absence of underwriting data. A liquid, on-chain, 24/7-liquidatable asset replaces the bureau entirely.

## Why this needs Solana

**Atomic composition.** Deposit, borrow and pay settle together or not at all. There is no window where a user has taken on debt but the merchant has not been paid.

**24/7.** Tokenized equities trade when the stock market is closed. A payment on Saturday night is not a special case.

**Permissionless collateral.** xStocks are Token-2022 with no freeze authority and no whitelist, so anyone can post them as collateral without asking anyone.

**Open composability.** Draw is not a lending protocol. It sits on Kamino, which already does that well, and turns a borrow into a payment — something only possible because the pieces are open.

## How it works

```
merchant site
  → Draw.checkout({ amount })           three lines of JavaScript
    → POST /api/sessions                 create the payment session
    → popup /checkout
      → POST /api/quote                  LTV, health factor, liquidation price
      → POST /api/tx/build               server builds, fee payer declared
      → wallet signs in the browser      Privy embedded wallet, no seed phrase
      → POST /api/tx/submit              fee payer co-signs, simulate, send
    → postMessage → merchant page updates
  → signed webhook → merchant server     the source of truth
```

## Integration

Three lines on the merchant's page:

```html
<script src="https://js.draw.fi/v1"></script>
<button onclick="Draw.checkout({ amount: 4000 })">Pay with Draw</button>
```

And on their server:

```ts
import { verifyWebhook } from "@draw/sdk";

const event = await verifyWebhook({ secret, signature, body });
if (event.type === "payment.paid") await fulfil(event.data.reference);
```

That is the whole integration. Nothing in it mentions wallets, collateral, or liquidation.

## Repository

```
apps/
  web/          Next.js 16 — app, checkout, API routes, Convex functions
  store/        demo merchant, separate origin on purpose
packages/
  core/         chain layer: tokens, pricing, Kamino, policy, transactions
  sdk/          merchant SDK — sessions, quotes, webhook verification
  embed/        the 1.3kb script that opens checkout
  shared/       domain types and money handling
  scripts/      surfnet funding and Kamino reserve discovery
```

### Design notes

**On-chain is value and ownership; off-chain is coordination.** Balances, debt, collateral and the payment itself live on Solana. Convex holds merchants and checkout sessions — the things a public ledger is the wrong place for. There is no payments table: the transaction signature is the receipt.

**Prices come from Kamino's own reserve oracles**, not a separate feed. Pricing collateral from one source while the protocol liquidates against another would tell users they were safe right up until they weren't.

**Draw lends well below what the protocol allows.** Kamino may permit 65% LTV; Draw exposes 35%. Tokenized stocks trade 24/7 but the underlying market does not, so a position opened on Saturday can gap at Monday's open with no chance to react. The gap between the two numbers is the user's margin.

**No leverage loops.** Borrowed funds cannot be redeposited. This is a spending product, not a leverage product.

## Running it locally

You need [Surfpool](https://github.com/solana-foundation/surfpool) and a free [Helius](https://helius.dev) key. No real money is required at any point.

```bash
pnpm install
cp .env.example .env.local          # fill in HELIUS_API_KEY

# 1. fork mainnet locally
surfpool start --url https://mainnet.helius-rpc.com/?api-key=$HELIUS_API_KEY

# 2. see which reserves Kamino will actually lend against,
#    then set NEXT_PUBLIC_XSTOCK_MINT from the output
pnpm probe

# 3. mint yourself collateral and a stablecoin balance
pnpm fund <your-wallet> <fee-payer-wallet>

# 4. run it
pnpm dev                            # app       localhost:3000
pnpm --filter @draw/store dev       # merchant  localhost:3001
```

### About the fork

Draw runs against a **forked Solana mainnet** via Surfpool: real Kamino lending reserves, real xStocks mints, real Jupiter routing — cloned mainnet state, not mocks.

That is a deliberate choice, not a limitation we are hiding. It let us test liquidation edges and multi-thousand-dollar positions without capital, which is not something you can responsibly do with real money on a four-day clock. Pointing at live mainnet is a change of `NEXT_PUBLIC_RPC_URL`, not a change of code.

## What is real, and what is next

**Real:** the chain layer, the risk engine (unit tested), the atomic transaction, the payment API, the embed, the merchant SDK with signed webhooks.

**Next:** a Draw program that CPIs into Kamino, which would give guaranteed atomicity regardless of transaction size, protocol-level fee capture, and a position abstraction other builders can compose with. Everything the current version does in several instructions, one program would do in one.

## Licence

MIT.
