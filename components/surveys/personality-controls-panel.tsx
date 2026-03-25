"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type PersonalityPreset = {
  id: string;
  label: string;
  description: string;
};

type PersonalityAssignment = {
  presetId: string;
  overlay: {
    summary?: string;
    toneDirectives?: string[];
    openingDirectives?: string[];
    questionDirectives?: string[];
    probeDirectives?: string[];
    closingDirectives?: string[];
  };
};

export function PersonalityControlsPanel({ surveyId }: { surveyId: string }) {
  const [presets, setPresets] = useState<PersonalityPreset[]>([]);
  const [assignment, setAssignment] = useState<PersonalityAssignment | null>(null);
  const [toneOverlay, setToneOverlay] = useState("");
  const [probeOverlay, setProbeOverlay] = useState("");
  const [openingOverlay, setOpeningOverlay] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("balanced_researcher");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function load() {
    setIsLoading(true);
    const response = await fetch(`/api/surveys/${surveyId}/personalities`);
    const data = await response.json();
    setPresets(data.presets || []);
    const nextAssignment = data.active?.sample ?? null;
    setAssignment(nextAssignment);
    setSelectedPresetId(nextAssignment?.presetId || "balanced_researcher");
    setToneOverlay((nextAssignment?.overlay?.toneDirectives || []).join("\n"));
    setProbeOverlay((nextAssignment?.overlay?.probeDirectives || []).join("\n"));
    setOpeningOverlay((nextAssignment?.overlay?.openingDirectives || []).join("\n"));
    setIsLoading(false);
  }

  useEffect(() => {
    load().catch(() => setIsLoading(false));
  }, [surveyId]);

  async function handleSave(applyToLive = false) {
    setIsSaving(true);
    try {
      await fetch(`/api/surveys/${surveyId}/personalities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "sample",
          presetId: selectedPresetId,
          applyToLive,
          overlay: {
            summary: "Creator adjustments",
            toneDirectives: toneOverlay.split("\n").map((item) => item.trim()).filter(Boolean),
            probeDirectives: probeOverlay.split("\n").map((item) => item.trim()).filter(Boolean),
            openingDirectives: openingOverlay.split("\n").map((item) => item.trim()).filter(Boolean),
          },
        }),
      });
      await load();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Interviewer Personality</h3>
        <p className="mt-1 text-xs text-gray-500">
          Pick a preset and apply light overlays for tone, opening, or probing.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading personalities...
        </div>
      ) : (
        <>
          <div className="grid gap-2">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setSelectedPresetId(preset.id)}
                className={cn(
                  "rounded-xl border px-3 py-3 text-left transition-colors",
                  selectedPresetId === preset.id
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
                )}
              >
                <div className="text-sm font-medium">{preset.label}</div>
                <div className={cn("mt-1 text-xs", selectedPresetId === preset.id ? "text-gray-200" : "text-gray-500")}>
                  {preset.description}
                </div>
              </button>
            ))}
          </div>

          <textarea
            value={toneOverlay}
            onChange={(event) => setToneOverlay(event.target.value)}
            placeholder="Tone overlay. Example: Acknowledge effort briefly before hard reflection questions."
            className="h-20 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gray-300"
          />
          <textarea
            value={openingOverlay}
            onChange={(event) => setOpeningOverlay(event.target.value)}
            placeholder="Opening overlay. Example: Open with a short reassurance before the first question."
            className="h-20 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gray-300"
          />
          <textarea
            value={probeOverlay}
            onChange={(event) => setProbeOverlay(event.target.value)}
            placeholder="Probe overlay. Example: Ask for one concrete example before moving on."
            className="h-20 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gray-300"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={isSaving}
              className="flex-1 rounded-xl bg-gray-900 px-3 py-2 text-sm font-medium text-white"
            >
              {isSaving ? "Saving..." : "Save for sample"}
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={isSaving}
              className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
            >
              Save + promote live
            </button>
          </div>

          {assignment && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-900">
              Active sample preset: <span className="font-semibold">{assignment.presetId}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
