import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "No session token" }, { status: 401 });
  }

  // session.session.token is the actual token string stored in the DB
  return NextResponse.json({ token: session.session.token });
}

