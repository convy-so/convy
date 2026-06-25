"use client";

import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  Loader2,
  Search,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/shared/ui/tailwind-class-utils";
import { RawResponseCard } from "./raw-response-card";

type ResponseRecord = {
  id: string;
  status: "completed" | "abandoned";
  duration: string;
  keyInsights: string[];
  messageCount: number;
  summary?: string;
  createdAt: string | null;
};

type Translate = ReturnType<typeof useTranslations>;

export function SurveyResponsesTab({
  surveyId,
  responses,
  currentPage,
  totalPages,
  statusFilter,
  isFilterOpen,
  isLoadingResponses,
  searchPlaceholder,
  setIsFilterOpen,
  setStatusFilter,
  setCurrentPage,
  t,
}: {
  surveyId: string;
  responses: ResponseRecord[];
  currentPage: number;
  totalPages: number;
  statusFilter: string;
  isFilterOpen: boolean;
  isLoadingResponses: boolean;
  searchPlaceholder: string;
  setIsFilterOpen: (open: boolean) => void;
  setStatusFilter: (status: string) => void;
  setCurrentPage: (value: number | ((current: number) => number)) => void;
  t: Translate;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-900/10"
          />
        </div>

        <div className="relative">
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="flex min-w-[160px] items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 outline-none transition-all hover:bg-gray-50 focus:border-gray-300 focus:ring-2 focus:ring-gray-900/10"
          >
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <span>
                {statusFilter === "all" && t("Responses.Filter.All")}
                {statusFilter === "completed" && t("Responses.Filter.Completed")}
                {statusFilter === "in_progress" &&
                  t("Responses.Filter.InProgress")}
              </span>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-gray-400 transition-transform",
                isFilterOpen && "rotate-180",
              )}
            />
          </button>

          {isFilterOpen ? (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsFilterOpen(false)}
              />
              <div className="absolute right-0 top-full z-20 mt-2 w-48 animate-in zoom-in-95 rounded-xl border border-gray-100 bg-white py-1 shadow-lg duration-200">
                {[
                  { value: "all", label: t("Responses.Filters.All") },
                  { value: "completed", label: t("Responses.Filters.Completed") },
                  {
                    value: "in_progress",
                    label: t("Responses.Filters.InProgress"),
                  },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setStatusFilter(option.value);
                      setCurrentPage(1);
                      setIsFilterOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-gray-50",
                      statusFilter === option.value
                        ? "bg-gray-50/50 font-medium text-gray-900"
                        : "text-gray-600",
                    )}
                  >
                    {option.label}
                    {statusFilter === option.value ? (
                      <Check className="h-4 w-4 text-gray-900" />
                    ) : null}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
        {isLoadingResponses ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : responses.length === 0 ? (
          <div className="py-12 text-center">
            <Users className="mx-auto mb-3 h-12 w-12 text-gray-300" />
            <p className="text-gray-500">{t("Responses.Table.Empty")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 lg:grid-cols-3">
            {responses.map((response) => {
              let durationMinutes = 0;
              if (response.duration) {
                const match = response.duration.match(/(\d+)m/);
                const durationText = match?.[1];
                if (durationText) durationMinutes = parseInt(durationText, 10);
              }

              return (
                <RawResponseCard
                  key={response.id}
                  id={response.id}
                  surveyId={surveyId}
                  summary={
                    response.summary ||
                    response.keyInsights?.[0] ||
                    t("Responses.Card.NoSummary")
                  }
                  durationMinutes={durationMinutes}
                  messageCount={response.messageCount || 0}
                  isCompleted={response.status === "completed"}
                  createdAt={response.createdAt || new Date().toISOString()}
                />
              );
            })}
          </div>
        )}
      </div>

      {responses.length > 0 ? (
        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
          <div className="text-sm text-gray-500">
            {t("Responses.Pagination.Page", {
              current: currentPage,
              total: totalPages,
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1 || isLoadingResponses}
              className="rounded-lg border border-gray-200 p-2 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              title={t("Responses.Pagination.FirstPage")}
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1 || isLoadingResponses}
              className="rounded-lg border border-gray-200 p-2 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              title={t("Responses.Pagination.PreviousPage")}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              disabled={currentPage === totalPages || isLoadingResponses}
              className="rounded-lg border border-gray-200 p-2 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              title={t("Responses.Pagination.NextPage")}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages || isLoadingResponses}
              className="rounded-lg border border-gray-200 p-2 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              title={t("Responses.Pagination.LastPage")}
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
