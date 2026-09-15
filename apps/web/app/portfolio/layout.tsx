import { Providers } from "@/app/providers";

// Auth is scoped to the app, not the site. Wrapping the whole tree in Privy
// meant the landing page waited on a wallet SDK it never uses, and hung
// entirely when that SDK could not reach its iframe.
export default function PortfolioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Providers>{children}</Providers>;
}
