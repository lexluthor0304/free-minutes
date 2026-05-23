type Env = {
  AI: {
    run: (
      model: string,
      input: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => Promise<unknown>;
  };
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
};

const STT_MODEL = "@cf/openai/whisper-large-v3-turbo";
const REALTIME_STT_MODEL = "@cf/deepgram/nova-3";
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/transcribe") {
      return handleTranscribe(request, env);
    }
    if (url.pathname === "/api/realtime-transcribe") {
      return handleRealtimeTranscribe(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleTranscribe(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const audioBuffer = await request.arrayBuffer();
  if (!audioBuffer.byteLength) {
    return json({ error: "Missing audio body" }, 400);
  }
  if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
    return json({ error: "Audio chunk is too large" }, 413);
  }

  const url = new URL(request.url);
  const language = url.searchParams.get("language");
  const input: Record<string, unknown> = {
    // Workers AI Whisper large v3 turbo accepts Base64 audio through the AI binding.
    // The browser sends only the current live chunk; complete recordings and exports
    // stay in the browser.
    audio: arrayBufferToBase64(audioBuffer),
  };
  if (language) {
    input.language = language;
  }

  try {
    const raw = await env.AI.run(STT_MODEL, input);
    return json({
      text: extractText(raw),
      raw,
    });
  } catch (error) {
    return json({ error: describeError(error) }, 500);
  }
}

async function handleRealtimeTranscribe(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return json({ error: "Expected a WebSocket upgrade request" }, 426);
  }

  const url = new URL(request.url);
  const sampleRate = sanitizeSampleRate(url.searchParams.get("sampleRate"));
  const language = mapRealtimeLanguage(url.searchParams.get("language"));
  const input: Record<string, unknown> = {
    // Deepgram realtime STT accepts raw signed little-endian 16-bit PCM over the WebSocket.
    // The browser streams only live mixed-audio frames; exports remain browser-local.
    encoding: "linear16",
    sample_rate: String(sampleRate),
    interim_results: "true",
  };
  if (language) {
    input.language = language;
  }

  try {
    const response = await env.AI.run(REALTIME_STT_MODEL, input, { websocket: true });
    if (response instanceof Response) {
      return response;
    }
    return json({ error: "Realtime STT did not return a WebSocket response" }, 502);
  } catch (error) {
    return json({ error: describeError(error) }, 500);
  }
}

function extractText(raw: unknown): string {
  if (!raw || typeof raw !== "object") {
    return "";
  }
  const candidate = raw as { text?: unknown; transcription?: unknown };
  if (typeof candidate.text === "string") {
    return candidate.text;
  }
  if (typeof candidate.transcription === "string") {
    return candidate.transcription;
  }
  return "";
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function sanitizeSampleRate(value: string | null): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 8000 && parsed <= 96000) {
    return Math.round(parsed);
  }
  return 16000;
}

function mapRealtimeLanguage(value: string | null): string | null {
  if (value === "Japanese") {
    return "ja";
  }
  if (value === "English") {
    return "en";
  }
  if (value === "Auto") {
    return "multi";
  }
  return null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
