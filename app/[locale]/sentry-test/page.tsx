"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function SentryTestPage() {
  const triggerClientError = () => {
    toast.error("Triggering client error...");
    throw new Error("Sentry Test Client Error: This is a test error from the browser.");
  };

  const triggerApiError = async () => {
    toast.info("Triggering API error...");
    try {
      const response = await fetch("/api/sentry-test");
      if (!response.ok) {
        toast.error("API error returned 500 (Check Sentry)");
      }
    } catch (error) {
      toast.error("Fetch failed");
    }
  };

  const triggerServerError = async () => {
    // We'll use a dynamic import or a non-existent function to trigger a server-side error
    // in a way that Sentry captures it during the request.
    window.location.href = "/sentry-test?error=true";
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sentry Test Dashboard</CardTitle>
          <CardDescription>
            Use these buttons to trigger sample errors across different parts of the application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            variant="destructive" 
            className="w-full" 
            onClick={triggerClientError}
          >
            Trigger Client-Side Error
          </Button>
          
          <Button 
            variant="outline" 
            className="w-full" 
            onClick={triggerApiError}
          >
            Trigger API Route Error
          </Button>

          <Button 
            variant="secondary" 
            className="w-full" 
            onClick={triggerServerError}
          >
            Trigger Server-Side Error
          </Button>
        </CardContent>
      </Card>
      
      <p className="text-sm text-neutral-500">
        Check your <a href="https://sentry.io" target="_blank" className="text-primary hover:underline">Sentry Dashboard</a> after clicking these buttons.
      </p>
    </div>
  );
}
