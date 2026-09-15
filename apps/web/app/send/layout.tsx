import { Providers } from "@/app/providers";

// Same reasoning as the other app routes: Privy is scoped here rather than at
// the root, so the landing page never waits on a wallet SDK it does not use.
export default function SendLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
