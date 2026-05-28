"use client";

import { useState, useRef } from "react";
import { FaRobot, FaBolt, FaSync, FaComments, FaPlay, FaPause } from "react-icons/fa";

const whyCards = [
  {
    icon: FaRobot,
    iconBg: "bg-[#0BA5EC]",
    title: "Adapts to each learner",
    description:
      "Every learning conversation shifts based on the student's response, pace, and level of understanding.",
  },
  {
    icon: FaBolt,
    iconBg: "bg-[#F04438]",
    title: "Built for teachers and tutors",
    description:
      "Create topic-based learning experiences, student check-ins, and guided support without stitching together separate systems.",
  },
  {
    icon: FaSync,
    iconBg: "bg-[#F79009]",
    title: "Voice and text ready",
    description:
      "Support students through typed or spoken interaction across desktop and mobile with the same clean experience.",
  },
  {
    icon: FaComments,
    iconBg: "bg-[#FFFFFF]",
    iconColor: "text-[#080808]",
    title: "Actionable learning insight",
    description:
      "Turn tutoring sessions into summaries, readiness signals, and teacher-friendly reports instead of raw transcripts.",
  },
];

export default function WhyConvyySection() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  return (
    <section className="p-[12px]">
      <div className="mx-auto max-w-[1920px] rounded-[32px] bg-[#292929] px-4 py-12 text-white sm:px-6 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-6xl">

          {/* Header */}
          <div className="mb-12 text-center md:mb-16">
            <p
              className="mb-4 text-[20px] font-normal italic leading-[33px] tracking-[-0.24px] text-[#8D8D8D] md:text-[32px] md:leading-[44px] md:tracking-[-0.32px]"
              style={{ fontFamily: "var(--font-fasthand)" }}
            >
              Why Convyy wins
            </p>
            <h2 className="mb-4 text-[28px] font-[500] leading-[36px] tracking-[-0.48px] text-[#FFFFFF] md:text-[40px] md:leading-[50px] md:tracking-[-0.64px]">
              AI learning support built for real classrooms.
            </h2>
            <p className="mx-auto max-w-3xl text-[16px] font-[500] leading-[22px] tracking-normal text-[#E5E5E5] sm:font-[600] md:text-[20px] md:leading-[28px]">
              Convyy helps teachers, tutors, and school teams guide students
              with conversations that adapt, stay contextual, and surface
              meaningful progress signals.
            </p>
          </div>

          {/* Video intro */}
          <div
            className="relative mb-14 overflow-hidden rounded-[28px] cursor-pointer select-none group"
            style={{ minHeight: "340px" }}
            onClick={handlePlayPause}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            {/* Background image shown when video is not playing or as poster */}
            <div
              className="absolute inset-0 z-0"
              style={{
                backgroundImage: "url('/vid-bg.png')",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
            {/* Dark overlay */}
            <div
              className="absolute inset-0 z-10 transition-opacity duration-300"
              style={{
                background:
                  "linear-gradient(135deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.30) 100%)",
                opacity: isPlaying && !isHovering ? 0.2 : 1,
              }}
            />

            {/* Video element (no src since this is a demo — swap in real src when available) */}
            <video
              ref={videoRef}
              className="absolute inset-0 z-0 h-full w-full object-cover opacity-0"
              loop
              playsInline
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />

            {/* Play/Pause button */}
            <div className="relative z-20 flex h-full min-h-[340px] flex-col items-center justify-center gap-6 px-6 py-12 text-center">
              <div
                className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white/90 shadow-[0_8px_32px_rgba(0,0,0,0.28)] transition-all duration-200 group-hover:scale-110 group-hover:bg-white"
                style={{ backdropFilter: "blur(8px)" }}
              >
                {isPlaying ? (
                  <FaPause className="h-7 w-7 text-[#292929]" />
                ) : (
                  <FaPlay className="ml-1 h-7 w-7 text-[#292929]" />
                )}
              </div>

              <div>
                <p
                  className="mb-2 text-[14px] font-normal italic leading-[22px] text-white/70"
                  style={{ fontFamily: "var(--font-fasthand)" }}
                >
                  Watch the intro
                </p>
                <h3 className="text-[22px] font-[500] leading-[30px] tracking-[-0.3px] text-white md:text-[28px] md:leading-[36px]">
                  See how Convyy transforms classroom learning
                </h3>
                <p className="mx-auto mt-2 max-w-lg text-[15px] leading-[23px] text-white/70 md:text-[16px]">
                  A 2-minute walkthrough of how teachers set up AI tutoring,
                  track student progress, and act on real-time insights.
                </p>
              </div>
            </div>

            {/* Duration badge */}
            <div className="absolute bottom-4 right-4 z-20 rounded-full bg-black/50 px-3 py-1 text-[13px] font-[500] text-white backdrop-blur-sm">
              2:07
            </div>
          </div>

          {/* Why cards grid */}
          <div
            className="grid grid-cols-1 justify-center gap-x-4 gap-y-4 px-4 md:grid-cols-2 md:px-0"
            style={{ maxWidth: "920px", margin: "0 auto" }}
          >
            {whyCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.title}
                  className="w-full rounded-[32px] bg-[#3D3D3D] p-6 md:w-[456px] md:p-[34px] transition-colors duration-200 hover:bg-[#484848]"
                >
                  <div className="flex flex-col gap-[32px]">
                    <div className="flex-shrink-0">
                      <div
                        className={`flex h-[60px] w-[60px] items-center justify-center rounded-full ${card.iconBg}`}
                      >
                        <Icon
                          className={`h-8 w-8 ${card.iconColor ?? "text-white"}`}
                        />
                      </div>
                    </div>
                    <div>
                      <h3 className="mb-[12px] text-[24px] font-medium leading-[32px] tracking-[-0.24px] text-white">
                        {card.title}
                      </h3>
                      <p className="text-[18px] font-normal leading-[27px] text-[#B2B2B2]">
                        {card.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </section>
  );
}
