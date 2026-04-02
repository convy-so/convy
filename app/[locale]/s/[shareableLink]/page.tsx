"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/routing";
import { Loader2 } from "lucide-react";

export default function ShareableSurveyPage() {
  const params = useParams<{ shareableLink: string }>();
  const router = useRouter();
  const shareableLink = params.shareableLink;
  
  useEffect(() => {
    if (shareableLink) {
      router.replace(`/s/${shareableLink}/respond`);
    }
  }, [shareableLink, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
       <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
    </div>
  );
}
