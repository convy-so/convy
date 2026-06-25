"use client";

import { useState, useRef } from "react";
import { FaPlay, FaPause } from "react-icons/fa";

export default function VideoSection() {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      void videoRef.current.play();
      setIsPlaying(true);
    }
  };

  return (
    <section className="bg-white px-4 py-20 sm:px-6 lg:px-12">
      <div className="mx-auto max-w-[1200px]">
        <div
          className="group relative w-full cursor-pointer overflow-hidden rounded-[20px] bg-[#F7F7F7] shadow-lg"
          style={{ aspectRatio: "16/9" }}
          onClick={handlePlayPause}
        >
          {/* Background image */}
          <div
            className="absolute inset-0 z-0 transition-opacity duration-500"
            style={{
              backgroundImage: "url('/vid-bg.png')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              opacity: isPlaying ? 0 : 1,
            }}
          />

          <video
            ref={videoRef}
            className="absolute inset-0 z-0 h-full w-full object-cover"
            loop
            playsInline
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          >
            <source src="/convy.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>

          {/* Play/Pause Button */}
          <div
            className={`absolute inset-0 z-10 flex items-center justify-center transition-all duration-300 ${
              isPlaying ? "opacity-0 group-hover:opacity-100" : "opacity-100"
            }`}
            style={{
              background: isPlaying ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.1)",
            }}
          >
            <div className="flex h-[64px] w-[64px] items-center justify-center rounded-full bg-black text-white shadow-xl transition-transform duration-300 group-hover:scale-110">
              {isPlaying ? (
                <FaPause className="h-6 w-6" />
              ) : (
                <FaPlay className="ml-1 h-6 w-6" />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
