"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Mail, Lock, Loader2, ShieldCheck, ArrowRight } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import toast from "react-hot-toast";
import { Link, useRouter } from "@/i18n/routing";
import { prepareAuthIntent } from "@/lib/auth/intent-client";

export default function ExpertLoginPage() {
  const params = useParams<{ locale?: string | string[] }>();
  const locale = Array.isArray(params.locale)
    ? (params.locale[0] ?? "en")
    : (params.locale ?? "en");
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const callbackURL = await prepareAuthIntent({
        kind: "plain-signin",
        locale,
        returnTo: `/${locale}/expert`,
      });

      await authClient.signIn.email({
        email: formData.email,
        password: formData.password,
        callbackURL,
        fetchOptions: {
          onSuccess: () => {
            toast.success("Welcome back to the Expert Portal");
            router.push("/auth/continue");
          },
          onError: (ctx) => {
            toast.error(ctx.error.message || "Invalid credentials or unauthorized.");
          }
        }
      });
    } catch (error) {
      console.error("[Expert SignIn] Failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col justify-center py-12 sm:px-6 lg:px-8 selection:bg-slate-200">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="h-12 w-12 bg-slate-950 rounded-2xl flex items-center justify-center shadow-sm">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-2xl font-bold tracking-tight text-slate-950">
          Expert Operations Portal
        </h2>
        <p className="mt-2 text-center text-sm text-slate-500">
          Sign in to manage pedagogical frameworks and AI guidance.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-[440px]">
        <div className="bg-white py-8 px-4 shadow-sm border border-slate-100 sm:rounded-[24px] sm:px-10">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label 
                htmlFor="email" 
                className="block text-sm font-medium leading-6 text-slate-900"
              >
                Work Email
              </label>
              <div className="relative mt-2 rounded-xl shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Mail className="h-5 w-5 text-slate-400" aria-hidden="true" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="block w-full rounded-xl border-0 py-2.5 pl-10 text-slate-900 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-slate-950 sm:text-sm sm:leading-6 transition-all"
                  placeholder="expert@convy.com"
                />
              </div>
            </div>

            <div>
              <label 
                htmlFor="password" 
                className="block text-sm font-medium leading-6 text-slate-900"
              >
                Password
              </label>
              <div className="relative mt-2 rounded-xl shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-5 w-5 text-slate-400" aria-hidden="true" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="block w-full rounded-xl border-0 py-2.5 pl-10 text-slate-900 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-slate-950 sm:text-sm sm:leading-6 transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-slate-950"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-700">
                  Remember me
                </label>
              </div>

              <div className="text-sm leading-6">
                <Link
                  href={{
                    pathname: "/forgot-password",
                    query: {
                      returnTo: `/${locale}/expert-login`,
                    },
                  }}
                  className="font-medium text-slate-900 hover:text-slate-700 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group flex w-full justify-center items-center gap-2 rounded-xl bg-slate-950 px-3 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    Sign in to Portal
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
