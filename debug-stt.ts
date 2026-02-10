
import { DeepgramSTTService } from "./lib/voice/deepgram-stt";
import { env } from "./lib/env";
import * as dotenv from 'dotenv';

// Load env
dotenv.config();

async function main() {
  console.log("Starting debug-stt...");
  
  if (!process.env.DEEPGRAM_API_KEY) {
    console.error("Error: DEEPGRAM_API_KEY is missing in env");
    return;
  }
  console.log(`API Key present: ${process.env.DEEPGRAM_API_KEY.substring(0, 5)}...`);

  try {
    const service = new DeepgramSTTService();
    console.log("Service initialized");

    const session = service.createStreamingSession({
      language: "en", // Match app config
      // model is implicit -> should default to flux-general-en
      enableInterimResults: true,
      enableAutoPunctuation: true,
      speechEndTimeout: 1.0, 
      sampleRate: 48000,
    });

    session.on("started", () => {
      console.log("✅ Session started event received - Connection Established!");
    });

    session.on("error", (error) => {
      console.error("❌ Session error:", error);
    });

    session.on("end", () => {
      console.log("Session ended");
    });
    
    session.on("transcription", (data) => {
        console.log("Transcription:", data.text, data.isFinal ? "(Final)" : "(Interim)");
    });

    console.log("Starting session with flux-general-en...");
    session.start();

    // specific delay to see if it crashes immediately without data
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log("Sending dummy audio (16kHz linear16 silence)...");
    // 1 second of silence (16kHz, mono, 16-bit = 32000 bytes)
    const silence = Buffer.alloc(32000);
    const sent = await session.write(silence);
    console.log("Audio sent:", sent);

    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log("Ending session...");
    session.end();

  } catch (error) {
    console.error("Main error:", error);
  }
}

main();
