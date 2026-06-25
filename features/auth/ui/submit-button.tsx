interface SubmitButtonProps {
  children: React.ReactNode;
  isLoading?: boolean;
  disabled?: boolean;
  loadingText?: string;
  type?: "button" | "submit";
  onClick?: () => void;
}

export function SubmitButton({ 
  children, 
  isLoading = false, 
  disabled = false, 
  loadingText = "Loading...",
  type = "submit",
  onClick
}: SubmitButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isLoading || disabled}
      className="w-full bg-[#292929] text-white py-3 px-4 rounded-xl font-medium hover:bg-[#3a3a3a] transition-colors focus:ring-2 focus:ring-[#292929] focus:ring-offset-2 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoading ? (
        <div className="flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          {loadingText}
        </div>
      ) : (
        children
      )}
    </button>
  );
}