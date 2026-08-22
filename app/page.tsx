import { redirect } from "next/navigation";

/**
 * The root is the freelancer search. The Cardano page it used to serve lives
 * at /cardano: a recruiter arriving from a campaign must not land on a crypto
 * pre-launch page, which was the single biggest trust problem with the old
 * routing.
 */
export default function RootPage() {
  redirect("/chat");
}
