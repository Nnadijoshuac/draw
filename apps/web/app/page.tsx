import { redirect } from "next/navigation";

// The app is the root for now. The marketing page takes this route back once
// it exists, and the portfolio moves under /portfolio properly.
export default function HomePage() {
  redirect("/portfolio");
}
