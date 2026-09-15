import { Providers } from "@/app/providers";

// Auth is scoped to the app, not the site. See app/portfolio/layout.tsx.
export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Providers>{children}</Providers>;
}
