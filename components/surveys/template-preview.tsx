import { LucideIcon } from "lucide-react";

interface TemplatePreviewProps {
  icon: LucideIcon;
  title: string;
  description: string;
  iconColor: string;
  onClick: () => void;
}

export function TemplatePreview({ 
  icon: Icon, 
  title, 
  description, 
  iconColor,
  onClick 
}: TemplatePreviewProps) {
  return (
    <div 
      className="p-6 border border-gray-100 rounded-xl hover:bg-gray-50 hover:border-gray-200 transition-all duration-200 cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex items-center gap-4 mb-3">
        <Icon className={`w-6 h-6 ${iconColor} group-hover:scale-110 transition-transform`} />
        <h4 className="font-semibold text-[#080808] group-hover:text-[#292929] transition-colors">
          {title}
        </h4>
      </div>
      <p className="text-sm text-[#696969] leading-relaxed">{description}</p>
    </div>
  );
}