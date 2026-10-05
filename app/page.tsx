import { permanentRedirect } from "next/navigation";

/**
 * The root starts with product context. The working application remains one
 * deliberate click away; campaign visitors no longer arrive in a tool before
 * they can understand evidence, limits and price.
 *
 * Permanent (308): the domain's links and signals belong to the landing page
 * for „Freelancer finden“, not to a temporary stop on the way there.
 */
export default function RootPage() {
  permanentRedirect("/freelancer-finden");
}
