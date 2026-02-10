
import { createClient } from "@deepgram/sdk";
import { DeepgramSTTStreamingSession } from "./lib/voice/deepgram-stt";
import { env } from "./lib/env";
import * as dotenv from 'dotenv';
// Isolate WS import - this triggers the crash usually
import { WebSocketServer } from "ws";
// Attempt to use cross-fetch to bypass undici
// @ts-ignore
import fetch from "cross-fetch";

dotenv.config();

async function main() {
  console.log("Starting debug-fix...");
  
  if (!process.env.DEEPGRAM_API_KEY) {
    console.error("Error: DEEPGRAM_API_KEY is missing in env");
    return;
  }

  try {
    // FORCE global fetch patch
    // @ts-ignore
    global.fetch = fetch;
    // @ts-ignore
    global.Headers = fetch.Headers;
    // @ts-ignore
    global.Request = fetch.Request;
    // @ts-ignore
    global.Response = fetch.Response;

    console.log("Global fetch patched with cross-fetch");

    const client = createClient(process.env.DEEPGRAM_API_KEY);


    const session = new DeepgramSTTStreamingSession(client, {
      language: "en", 
      model: "flux-general-en",
      sampleRate: 48000,
      enableInterimResults: true,
      encoding: "linear16",
      channels: 1,
      vad_events: true,
      smart_format: true
    });

    session.on("started", () => {
      console.log("✅ Session started event received - FIX WORKED!");
    });

    session.on("error", (error) => {
      console.error("❌ Session error:", error);
    });

    console.log("Starting session...");
    session.start();

    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log("Ending session...");
    session.end();

  } catch (error) {
    console.error("Main error:", error);
  }
}

main();
