import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface TextareaFieldProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  helperText?: string;
}

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  ({ label, error, helperText, className = "", ...props }, ref) => {
    const supportingText = error ?? helperText;

    return (
      <div>
        <label
          htmlFor={props.id}
          className="mb-2 block text-sm font-medium text-[#292929]"
        >
          {label}
        </label>
        <textarea
          ref={ref}
          className={cn(
            "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-[#080808] outline-none transition-all placeholder:text-[#696969] focus:border-transparent focus:ring-2 focus:ring-[#292929]",
            error && "border-red-300 focus:ring-red-500",
            className
          )}
          {...props}
        />
        {supportingText ? (
          <p
            className={cn(
              "mt-2 text-xs text-[#696969]",
              error && "text-sm text-red-600"
            )}
          >
            {supportingText}
          </p>
        ) : null}
      </div>
    );
  }
);

TextareaField.displayName = "TextareaField";
