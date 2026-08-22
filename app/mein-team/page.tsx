import type { Metadata } from "next";

import { ChatWorkspace } from "@/components/ChatWorkspace";

export const metadata: Metadata = {
  title: "Mein Team | XPORTAL",
  description:
    "Die Freelancer-Profile, die Sie sich aus Ihren Suchergebnissen gemerkt haben.",
  // The page only ever shows one account's own saved profiles.
  robots: {
    index: false,
    follow: false,
  },
};

export default function MyTeamPage() {
  return <ChatWorkspace view="team" />;
}
