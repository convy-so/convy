import { Check } from "lucide-react";

interface PasswordStrengthProps {
  password: string;
  requirements: {
    length: boolean;
    uppercase: boolean;
    number: boolean;
    special: boolean;
  };
  compact?: boolean;
}

export function PasswordStrength({ password, requirements, compact = false }: PasswordStrengthProps) {
  if (!password) return null;

  const checks = [
    { key: 'length', label: '8+ characters', met: requirements.length },
    { key: 'uppercase', label: 'Uppercase', met: requirements.uppercase },
    { key: 'number', label: 'Number', met: requirements.number },
    { key: 'special', label: 'Special char', met: requirements.special },
  ];

  if (compact) {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs">
        {checks.map((check) => (
          <div key={check.key} className="flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${check.met ? 'bg-green-500' : 'bg-gray-300'}`} />
            <span className={check.met ? 'text-green-600' : 'text-[#696969]'}>
              {check.label}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {checks.map((check) => (
        <div key={check.key} className="flex items-center gap-2 text-xs">
          <div className={`w-2 h-2 rounded-full ${check.met ? 'bg-green-500' : 'bg-gray-300'}`} />
          <span className={check.met ? 'text-green-600' : 'text-[#696969]'}>
            {check.label}
          </span>
          {check.met && <Check className="w-3 h-3 text-green-500" />}
        </div>
      ))}
    </div>
  );
}