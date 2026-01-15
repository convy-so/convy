import Link from "next/link";
import { LucideIcon } from "lucide-react";

interface StatusCardProps {
  icon: LucideIcon;
  iconColor: "green" | "red" | "blue";
  title: string;
  description: string;
  actionButton?: {
    text: string;
    href?: string;
    onClick?: () => void;
  };
  secondaryAction?: {
    text: string;
    href?: string;
    onClick?: () => void;
  };
  showLogo?: boolean;
}

export function StatusCard({ 
  icon: Icon, 
  iconColor, 
  title, 
  description, 
  actionButton,
  secondaryAction,
  showLogo = true 
}: StatusCardProps) {
  const iconColorClasses = {
    green: "bg-green-100 text-green-600",
    red: "bg-red-100 text-red-600",
    blue: "bg-blue-100 text-blue-600",
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <div className="text-center">
        {showLogo && (
          <Link href="/" className="inline-block mb-6">
            <h1 className="text-2xl font-bold text-[#080808]">Convy</h1>
          </Link>
        )}
        
        <div className={`w-16 h-16 ${iconColorClasses[iconColor]} rounded-full flex items-center justify-center mx-auto mb-6`}>
          <Icon className="w-8 h-8" />
        </div>
        
        <h2 className="text-2xl font-semibold text-[#080808] mb-2">
          {title}
        </h2>
        
        <p className="text-[#696969] text-sm mb-6">
          {description}
        </p>
        
        <div className="space-y-3">
          {actionButton && (
            <>
              {actionButton.href ? (
                <Link
                  href={actionButton.href}
                  className="inline-block bg-[#292929] text-white py-3 px-6 rounded-xl font-medium hover:bg-[#3a3a3a] transition-colors"
                >
                  {actionButton.text}
                </Link>
              ) : (
                <button
                  onClick={actionButton.onClick}
                  className="w-full bg-[#292929] text-white py-3 px-4 rounded-xl font-medium hover:bg-[#3a3a3a] transition-colors"
                >
                  {actionButton.text}
                </button>
              )}
            </>
          )}
          
          {secondaryAction && (
            <>
              {secondaryAction.href ? (
                <Link
                  href={secondaryAction.href}
                  className="block text-[#696969] text-sm hover:text-[#292929] transition-colors"
                >
                  {secondaryAction.text}
                </Link>
              ) : (
                <button
                  onClick={secondaryAction.onClick}
                  className="text-[#696969] text-sm hover:text-[#292929] transition-colors"
                >
                  {secondaryAction.text}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}