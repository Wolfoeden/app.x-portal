import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "XPORTAL | The private gateway to a new digital ecosystem",
  description:
    "XPORTAL connects intelligence and specialized digital spaces through one conversational interface, beginning with Cardano DeFi.",
  openGraph: {
    title: "XPORTAL | One intelligent interface. A network behind it.",
    description:
      "Join the founding whitelist for the first Cardano DeFi gateway and the wider XPORTAL ecosystem.",
    type: "website",
  },
};

export default function HomeLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
