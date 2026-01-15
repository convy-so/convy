import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface PageHeaderProps {
  title: string;
  subtitle: string;
  backHref?: string;
}

export function PageHeader({ title, subtitle, backHref }: PageHeaderProps) {
  return (
    <div className="flex items-center gap-6">
      {backHref && (
        <Link
          href={backHref}
          className="p-3 hover:bg-gray-100 rounded-xl transition-colors group"
        >
          <ArrowLeft className="w-6 h-6 text-[#696969] group-hover:text-[#292929] group-hover:-translate-x-1 transition-all" />
        </Link>
      )}
      <div>
        <h1 className="text-3xl font-bold text-[#080808] mb-2">{title}</h1>
        <p className="text-[#696969] text-lg">{subtitle}</p>
      </div>
    </div>
  );
}