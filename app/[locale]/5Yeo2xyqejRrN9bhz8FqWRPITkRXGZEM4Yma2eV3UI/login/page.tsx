"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { InputField } from "@/components/auth/input-field";
import { SubmitButton } from "@/components/auth/submit-button";
import toast from "react-hot-toast";
import { requestAdminLogin } from "@/app/actions/admin-auth";

export default function AdminLoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await requestAdminLogin(formData.email, formData.password);
      // Always show success to prevent email enumeration
      setIsSuccess(true);
      toast.success("Verification link sent to your email");
    } catch (error) {
      console.error(error);
      toast.error("Failed to attempt login");
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] p-4">
        <AuthCard title="Check your email" subtitle="We sent a magic verification link to your inbox.">
          <div className="text-center mt-6">
            <p className="text-[#696969] text-sm">
              <Link href="/" className="text-[#292929] font-medium hover:text-[#292929]/80 transition-colors">
                Return home
              </Link>
            </p>
          </div>
        </AuthCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] p-4">
      <div className="w-full max-w-md">
        <AuthCard title="Admin Access" subtitle="Provide your administration credentials.">
          <form onSubmit={handleSubmit} className="space-y-4">
            <InputField
              id="email"
              type="email"
              label="Admin Email"
              icon={Mail}
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="admin@convy.ai"
              required
            />

            <InputField
              id="password"
              type={showPassword ? "text" : "password"}
              label="Admin Password"
              icon={Lock}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="••••••••"
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[#696969] hover:text-[#292929] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              }
              required
            />

            <SubmitButton isLoading={isLoading} loadingText="Verifying...">
              Send Login Link
            </SubmitButton>
          </form>

          <div className="text-center mt-6">
            <p className="text-[#696969] text-sm">
              <Link href="/" className="text-[#292929] font-medium hover:text-[#292929]/80 transition-colors">
                Return home
              </Link>
            </p>
          </div>
        </AuthCard>
      </div>
    </div>
  );
}
