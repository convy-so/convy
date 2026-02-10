
import { createServer } from "http";
// import { WebSocketServer } from "ws";
import { parse } from "url";
// import { loadEnvConfig } from "@next/env";

const projectDir = process.cwd();
// loadEnvConfig(projectDir);

import { env } from "@/lib/env";
// Import all the heavy hitters from server.ts to trigger provided side-effects
// import { db } from "@/db";              
// import "@/lib/redis";
// import "@/lib/voice/deepgram-tts"; // Commented out to isolate STT first

import { DeepgramSTTService } from "@/lib/voice/deepgram-stt";

async function main() {
  console.log("Starting debug-server-env...");
  console.log("Imports loaded. Initializing Deepgram...");

  try {
    const service = new DeepgramSTTService();
    console.log("Service created.");

    const session = service.createStreamingSession({
        language: "en",
        sampleRate: 48000,
        enableInterimResults: true,
    });

    session.on("started", () => console.log("✅ Session started"));
    session.on("error", (err) => console.error("❌ Session error:", err));
    
    console.log("Starting session...");
    session.start();

    // Keep alive for a bit
    await new Promise(r => setTimeout(r, 5000));
    console.log("Done.");
    process.exit(0);
  } catch (err) {
    console.error("Main error:", err);
    process.exit(1);
  }
}

main();
