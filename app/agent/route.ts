import { NextResponse } from "next/server";
import { agentDestination } from "@/lib/recruiting/agent-redirect";
/** Legacy product entry. Forward campaign attribution and identifiers, never project text. */
export function GET(request: Request) { return NextResponse.redirect(new URL(agentDestination(new URL(request.url).searchParams), request.url), 308); }
