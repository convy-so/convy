import { apiUnhandledError } from "@/lib/api/error-contract";

export async function GET() {
    try {
        throw new Error("Sentry Test API Error: This is a test error from an API route.");
    } catch (error) {
        return apiUnhandledError(error, "Test error triggered", "/api/sentry-test");
    }
}
