"use client";

import { ArrowRight, BookOpen, GraduationCap } from "lucide-react";

import { Link } from "@/i18n/routing";

const destinations = [
  {
    href: "/expert/frameworks/studio",
    title: "Framework studio",
    description:
      "Choose a course and edit its pedagogical framework, capabilities, and teaching examples.",
    icon: BookOpen,
  },
  {
    href: "/expert/frameworks/courses",
    title: "Courses",
    description:
      "Add courses to the catalog and see which ones already have a framework attached.",
    icon: GraduationCap,
  },
] as const;

export function ExpertFrameworksHub() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
          Pedagogical frameworks
        </h1>
        <p className="mt-1 max-w-xl text-sm text-slate-500">
          Manage the course catalog and author the tutoring framework each course uses when live.
        </p>
      </div>

      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        {destinations.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 transition-colors hover:border-slate-400"
            >
              <div>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
                  <Icon className="h-5 w-5" />
                </span>
                <h2 className="mt-4 text-base font-semibold text-slate-950">{item.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{item.description}</p>
              </div>
              <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-950">
                Open
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
