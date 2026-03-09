import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function GET() {
    try {
        throw new Error("Sentry Test API Error: This is a test error from an API route.");
    } catch (error) {
        Sentry.captureException(error);
        return NextResponse.json({ error: "Test error triggered" }, { status: 500 });
    }
}
