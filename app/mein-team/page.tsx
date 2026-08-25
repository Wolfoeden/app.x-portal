import type { Metadata } from "next";

import { ChatWorkspace } from "@/components/ChatWorkspace";

export const metadata: Metadata = {
  title: "Merkliste | XPORTAL",
  description:
    "Ihre gespeicherten Freelancer-Profile für die spätere Auswahl.",
  // The page only ever shows one account's own saved profiles.
  robots: {
    index: false,
    follow: false,
  },
};

export default function MyTeamPage() {
  return <ChatWorkspace view="team" />;
}
