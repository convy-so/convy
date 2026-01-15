import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreateSurveyOptionProps {
  title: string;
  description: string;
  icon: LucideIcon;
  features: string[];
  buttonText: string;
  buttonVariant?: "primary" | "secondary";
  gradient: string;
  iconColor: string;
  onClick: () => void;
  className?: string;
}

export function CreateSurveyOption({
  title,
  description,
  icon: Icon,
  features,
  buttonText,
  buttonVariant = "primary",
  gradient,
  iconColor,
  onClick,
  className,
}: CreateSurveyOptionProps) {
  return (
    <div 
      className={cn(
        "bg-white rounded-2xl border border-gray-200 p-8 hover:shadow-lg hover:border-gray-300 transition-all duration-300 cursor-pointer group",
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-4 mb-6">
        <div className={cn(
          "p-4 rounded-xl transition-all duration-300",
          gradient,
          "group-hover:scale-110"
        )}>
          <Icon className={cn("w-7 h-7", iconColor)} />
        </div>
        <h2 className="text-2xl font-bold text-[#080808] group-hover:text-[#292929] transition-colors">
          {title}
        </h2>
      </div>
      
      <p className="text-[#696969] mb-8 text-lg leading-relaxed">
        {description}
      </p>
      
      <div className="space-y-4 mb-8">
        {features.map((feature, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="w-2 h-2 bg-gradient-to-r from-green-400 to-green-600 rounded-full"></div>
            <span className="text-[#696969] font-medium">{feature}</span>
          </div>
        ))}
      </div>
      
      <button 
        className={cn(
          "w-full py-4 px-6 rounded-xl font-semibold text-lg transition-all duration-300 transform group-hover:scale-105",
          buttonVariant === "primary" 
            ? "bg-[#292929] text-white hover:bg-[#3a3a3a] shadow-lg hover:shadow-xl" 
            : "border-2 border-gray-200 text-[#292929] hover:bg-gray-50 hover:border-gray-300"
        )}
      >
        {buttonText}
      </button>
    </div>
  );
}