"use client";

import { useState } from "react";
import Image from "next/image";
import { FaRobot, FaBolt, FaSync, FaComments } from "react-icons/fa";

const accordionItems = [
  {
    id: "adapts",
    icon: FaRobot,
    iconColor: "text-[#0BA5EC]", // Blue
    title: "Adapts to each learner",
    description: "Every learning conversation shifts based on the student's response, pace, and level of understanding.",
  },
  {
    id: "built-for",
    icon: FaBolt,
    iconColor: "text-[#F04438]", // Red
    title: "Built for teachers and tutors",
    description: "Create topic-based learning experiences, student check-ins, and guided support without stitching together separate systems.",
  },
  {
    id: "voice-text",
    icon: FaSync,
    iconColor: "text-[#F79009]", // Orange
    title: "Voice and text ready",
    description: "Support students through typed or spoken interaction across desktop and mobile with the same clean experience.",
  },
  {
    id: "insights",
    icon: FaComments,
    iconColor: "text-[#6366F1]", // Indigo
    title: "Actionable learning insight",
    description: "Turn tutoring sessions into summaries, readiness signals, and teacher-friendly reports instead of raw transcripts.",
  },
];

export default function WhyWeWinSection() {
  const [activeId, setActiveId] = useState<string | null>(
    accordionItems[0]?.id ?? null,
  );

  return (
    <section className="bg-white px-4 py-12 sm:px-6 lg:px-12">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-10 max-w-4xl">
          <h2 className="text-[24px] font-[500] leading-[34px] tracking-[-0.01em]  text-[#080808] md:text-[28px] md:leading-[38px]">
            Learning at full intelligence Stop guessing, start guiding with convvy.
          </h2>
        </div>

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
          {/* Left side: Static Image */}
          <div className="w-full rounded-[16px] bg-[#F7F7F7] p-2 lg:w-[60%] border border-gray-100 shadow-sm">
             <Image
                src="/vid-bg.png"
                alt="Convyy dashboard insights"
                width={1200}
                height={800}
                className="h-auto w-full rounded-[12px] object-cover shadow-sm"
              />
          </div>

          {/* Right side: Accordion */}
          <div className="flex w-full flex-col gap-4 lg:w-[40%] mt-2">
            {accordionItems.map((item) => {
              const isActive = activeId === item.id;
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  className={`cursor-pointer border-b border-gray-100 pb-4 transition-all last:border-0 ${isActive ? "opacity-100" : "opacity-60 hover:opacity-80"}`}
                  onClick={() => setActiveId(item.id)}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`h-[16px] w-[16px] ${item.iconColor}`} />
                    <h3 className="text-[16px] font-medium text-[#080808]">
                      {item.title}
                    </h3>
                  </div>
                  {isActive && (
                    <p className="mt-2 text-[14px] leading-[22px] text-[#696969] pl-7">
                      {item.description}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
