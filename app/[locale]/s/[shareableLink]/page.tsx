"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function ShareableSurveyPage() {
  const params = useParams();
  const router = useRouter();
  const shareableLink = params.shareableLink as string;
  
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
