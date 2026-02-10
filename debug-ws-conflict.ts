
import { DeepgramSTTService } from "./lib/voice/deepgram-stt";
import { env } from "./lib/env";
import * as dotenv from 'dotenv';
// Isolate WS import
import { WebSocketServer } from "ws";

dotenv.config();

async function main() {
  console.log("Starting debug-ws-conflict...");
  
  if (!process.env.DEEPGRAM_API_KEY) {
    console.error("Error: DEEPGRAM_API_KEY is missing in env");
    return;
  }
  
  // CHECK FOR POLLUTION
  console.log("Global WebSocket defined?", !!global.WebSocket);
  if (global.WebSocket) {
      console.log("Global WebSocket detected! Deleting it to force Deepgram to use internal node-implementation...");
      // @ts-ignore
      delete global.WebSocket;
  }

  try {
    const service = new DeepgramSTTService();
    console.log("Service initialized");

    const session = service.createStreamingSession({
      language: "en", 
      sampleRate: 48000,
    });

    session.on("started", () => {
      console.log("✅ STATUS: SUCCESS - Connection Established!");
    });

    session.on("error", (error) => {
      console.error("❌ STATUS: FAILURE - Session error:", error);
    });

    console.log("Starting session with implicit model...");
    session.start();

    // specific delay to see if it crashes immediately without data
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log("Ending session...");
    session.end();

  } catch (error) {
    console.error("Main error:", error);
  }
}

main();
