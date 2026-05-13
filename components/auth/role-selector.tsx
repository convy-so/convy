"use client";

import { useState, useRef, useEffect } from "react";
import { GraduationCap, ChevronDown, Check, Presentation } from "lucide-react";
import { cn } from "@/lib/utils";

interface RoleSelectorProps {
  value: string;
  onChange: (value: "student" | "teacher") => void;
}

export function RoleSelector({ value, onChange }: RoleSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const options = [
    {
      id: "student",
      label: "Student",
      icon: GraduationCap,
    },
    {
      id: "teacher",
      label: "Teacher",
      icon: Presentation,
    },
  ] as const;

  const selectedOption = options.find((opt) => opt.id === value) || options[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-gray-300 transition-all focus:ring-2 focus:ring-[#292929] outline-none",
          isOpen && "ring-2 ring-[#292929] border-transparent"
        )}
      >
        <div className="flex items-center gap-3">
          <div className="text-[#696969]">
            <selectedOption.icon className="w-4 h-4" />
          </div>
          <span className="text-sm font-medium">{selectedOption.label}</span>
        </div>
        <ChevronDown className={cn(
          "h-3.5 w-3.5 text-slate-400 transition-transform duration-200",
          isOpen ? "rotate-180" : ""
        )} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-full z-50 bg-white border border-slate-100 rounded-xl overflow-hidden py-1 shadow-xl shadow-slate-200/40">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                onChange(option.id);
                setIsOpen(false);
              }}
              className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium transition-colors text-left hover:bg-slate-50"
            >
              <div className="flex items-center gap-3">
                <option.icon className={cn("w-4 h-4", value === option.id ? "text-slate-900" : "text-slate-400")} />
                <span className={value === option.id ? "text-slate-900" : "text-slate-600"}>{option.label}</span>
              </div>
              {value === option.id && <Check className="h-3.5 w-3.5 text-slate-900" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
