import { Link } from "@/i18n/routing";

interface AuthCardProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  showLogo?: boolean;
}

export function AuthCard({ children, title, subtitle, showLogo = true }: AuthCardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold text-[#080808] mb-2">
          {title}
        </h2>
        <p className="text-[#696969] text-sm">
          {subtitle}
        </p>
      </div>

      {children}
    </div>
  );
}