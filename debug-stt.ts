
import { GoogleSTTService } from "./lib/voice/google-stt";
import { env } from "./lib/env";
import * as dotenv from 'dotenv';

// Load env
dotenv.config();

async function main() {
  console.log("Starting debug-stt...");
  try {
    const service = new GoogleSTTService();
    console.log("Service initialized");

    const session = service.createStreamingSession({
      language: "en-US",
      enableInterimResults: true,
      enableAutoPunctuation: true,
       // match the config from survey-creation-voice.ts
      speechEndTimeout: 1.5,
      singleUtterance: false,
    });

    session.on("started", () => {
      console.log("Session started event received");
    });

    session.on("error", (error) => {
      console.error("Session error:", error);
    });

    session.on("end", () => {
      console.log("Session ended");
    });

    console.log("Starting session...");
    session.start();

    // specific delay to see if it crashes immediately without data
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log("Sending dummy audio...");
    // 1 second of silence (16kHz, mono, 16-bit = 32000 bytes)
    const silence = Buffer.alloc(32000);
    session.write(silence);

    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log("Ending session...");
    session.end();

  } catch (error) {
    console.error("Main error:", error);
  }
}

main();
