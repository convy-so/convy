import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { LearningHub } from "@/components/learning/learning-hub";

export default function StudentDashboardPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
            </div>
        }>
            <LearningHub />
        </Suspense>
    );
}
