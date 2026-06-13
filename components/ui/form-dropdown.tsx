"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type FormDropdownOption<T extends string = string> = {
  label: string;
  value: T;
};

type FormDropdownProps<T extends string = string> = {
  id?: string;
  label?: string;
  value: T;
  options: FormDropdownOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  icon?: LucideIcon;
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
  /** Raise above modals (default overlay z-[100]). */
  menuZIndex?: number;
};

export function FormDropdown<T extends string = string>({
  id,
  label,
  value,
  options,
  onChange,
  placeholder = "Select...",
  icon: Icon,
  disabled = false,
  className,
  menuClassName,
  menuZIndex = 120,
}: FormDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((option) => option.value === value);
  const backdropZIndex = menuZIndex - 10;

  return (
    <div className={cn("relative space-y-2", className)} ref={dropdownRef}>
      {label ? (
        <label htmlFor={id} className="block text-sm font-medium text-[#292929]">
          {label}
        </label>
      ) : null}

      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white py-3 pr-4 text-sm text-[#292929] outline-none transition-all",
          "hover:border-gray-300 focus:border-transparent focus:ring-2 focus:ring-[#292929]",
          Icon ? "pl-10" : "pl-4",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        {Icon ? (
          <Icon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#696969]" />
        ) : null}
        <span className="truncate text-left">{selectedOption?.label ?? placeholder}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[#696969] transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen ? (
        <>
          <div
            className="fixed inset-0"
            style={{ zIndex: backdropZIndex }}
            aria-hidden="true"
            onClick={() => setIsOpen(false)}
          />
          <ul
            role="listbox"
            aria-labelledby={id}
            className={cn(
              "absolute top-full left-0 right-0 mt-2 max-h-60 overflow-auto rounded-xl border border-gray-100 bg-white py-1 shadow-xl animate-in fade-in zoom-in-95",
              menuClassName,
            )}
            style={{ zIndex: menuZIndex }}
          >
            {options.map((option) => {
              const isSelected = option.value === value;

              return (
                <li key={option.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-50"
                  >
                    <span className={cn("truncate", isSelected ? "font-medium text-[#292929]" : "text-[#696969]")}>
                      {option.label}
                    </span>
                    {isSelected ? <Check className="h-4 w-4 shrink-0 text-[#292929]" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
