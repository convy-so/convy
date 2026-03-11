import { Link } from "@/i18n/routing";
import { LucideIcon } from "lucide-react";

interface StatusCardProps {
  icon?: LucideIcon;
  iconColor?: "green" | "red" | "blue";
  imageSrc?: string;
  title: string;
  description: string | React.ReactNode;
  actionButton?: {
    text: string;
    href?: string;
    onClick?: () => void;
    disabled?: boolean;
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
  iconColor = "blue", 
  imageSrc,
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
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md w-full mx-auto">
      <div className="text-center">
        {showLogo && (
          <Link href="/" className="inline-block mb-6">
            <h1 className="text-2xl font-bold text-[#080808]">Convyy</h1>
          </Link>
        )}
        
        {imageSrc ? (
          <div className="flex justify-center mb-6">
            <img src={imageSrc} alt={title} className="w-32 h-32 object-contain" />
          </div>
        ) : Icon && (
          <div className={`w-16 h-16 ${iconColorClasses[iconColor]} rounded-full flex items-center justify-center mx-auto mb-6`}>
            <Icon className="w-8 h-8" />
          </div>
        )}
        
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
                  disabled={actionButton.disabled}
                  className="w-full bg-[#292929] text-white py-3 px-4 rounded-xl font-medium hover:bg-[#3a3a3a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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