# Free Minutes

Free Minutes is a Chrome desktop meeting capture app. It records microphone audio, shared Chrome Tab / Window / Screen audio, shared video screenshots, realtime Cloudflare speech-to-text, editable source-tagged transcript segments, TXT / Markdown export, and browser-local ZIP packaging.

The app is now a hybrid static frontend plus one Cloudflare Worker endpoint:

- The browser handles capture, audio mixing, recording, screenshots, transcript editing, file export, and ZIP generation.
- `/api/realtime-transcribe` runs in the Cloudflare Worker and opens a Workers AI realtime STT WebSocket.
- Live transcription streams raw mixed-audio PCM frames to Cloudflare Workers AI Deepgram Nova-3.
- Nova-3 realtime STT is requested with anonymous best-effort diarization, so transcript segments can include labels such as `Speaker 0` when the model returns speaker numbers.
- `/api/transcribe` remains as a fallback and sends short WAV chunks to Whisper large v3 turbo if the realtime WebSocket is unavailable.
- Meeting notes can be generated with Chrome Built-in AI / Gemini Nano when the user's Chrome and device support it. The prompt is editable, and the notes are generated in the browser.
- Screenshots, complete recordings, TXT, Markdown, manifest data, and ZIP files are not uploaded.
- GA4 is embedded with the official Google tag snippet and Google Consent Mode. Google AdSense is wired for production builds with the configured publisher ID.
- The header includes a GitHub button for the source repository and a company homepage link.
- AI search optimization assets are published at `/llms.txt`, `/product.md`, `/faq.md`, `/privacy.md`, `/pricing.md`, `/robots.txt`, and `/sitemap.xml`.
- The app does not include login, database, or remote storage.

## Local Start

```bash
npm install
npm run dev
```

Open the Vite URL in Chrome desktop. Local Vite preview can test capture and recording, but Cloudflare STT requires a deployed Worker with an `AI` binding unless you also run Wrangler locally with the binding configured.

## Build

```bash
npm run build
```

The build output is written to `dist/`.

Google configuration:

```bash
VITE_GA4_MEASUREMENT_ID=G-XXXXXXXXXX \
VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX \
VITE_ADSENSE_SLOT=1234567890 \
npm run build
```

GA4 uses the official Google tag snippet in `index.html`. Production builds default to the configured AdSense publisher. `VITE_ADSENSE_SLOT` is still optional; if it is empty, the page keeps a quiet sponsor slot reserved for a future ad unit.

## Cloudflare Worker Deployment

This repo uses Workers Static Assets plus an AI binding:

```toml
name = "free-minutes"
main = "src/worker.ts"
compatibility_date = "2026-05-23"

[assets]
directory = "./dist"
binding = "ASSETS"
not_found_handling = "single-page-application"

[ai]
binding = "AI"
```

Deploy with:

```bash
npm run build
npx wrangler deploy
```

## AI SEO / Answer Engine Optimization

The app includes normal human-readable structure plus machine-readable files for AI search engines and answer engines:

- `index.html` includes canonical URL, Open Graph metadata, Twitter summary metadata, WebApplication schema, Organization schema, and FAQPage schema.
- `/llms.txt` gives AI systems a concise product summary, privacy boundary, source labels, and key URLs.
- `/product.md`, `/faq.md`, `/privacy.md`, and `/pricing.md` provide extractable Markdown answer blocks.
- `/robots.txt` allows major search and AI assistant crawlers and points to `/sitemap.xml`.
- The visible page includes a below-the-fold product notes section with direct answer blocks and FAQ-style content.

## Usage

1. Open the deployed Worker URL in Chrome desktop.
2. Select language: Auto, Japanese, or English. Chinese is intentionally not supported in the realtime build.
3. Click `Start Listening`.
4. In Chrome's native sharing picker, choose a Chrome Tab for best results and enable `Share tab audio`.
5. Allow microphone permission.
6. While recording, the app streams mixed-audio PCM frames to `/api/realtime-transcribe` about every 250 ms and displays interim text as it arrives.
7. Click `Stop`.
8. Click `Notes` to generate browser-local meeting notes. Expand `Prompt` to use your own instruction.
9. Edit the transcript or notes if needed, then download TXT, Markdown, audio, or ZIP.

## Privacy Boundary

- Audio mixing is performed in the browser with Web Audio API.
- Audio recording is performed in the browser with MediaRecorder.
- Screenshots are generated in the browser with HTMLVideoElement and Canvas.
- ZIP files are generated in the browser with JSZip.
- Live STT uploads raw mixed-audio PCM frames to this Cloudflare Worker, which calls Cloudflare Workers AI.
- Meeting-note generation uses Chrome Built-in AI / Gemini Nano when available. The transcript is processed by the browser-local model and is not sent to this app's Worker for notes generation.
- Exported audio files, screenshots, transcript text, meeting notes, manifest data, and ZIP files are not uploaded by the export features.
- GA4 loads through the official Google tag snippet with Consent Mode defaulting analytics and ads storage to denied until the user chooses.
- The GitHub button loads the GitHub Buttons script for the visible repository button. The company homepage link only navigates when clicked.
- The app uses `localStorage` only to remember the Google consent choice. Session data is kept in memory and is cleared by refresh or `Clear Session`.

## Cloudflare Realtime STT

The primary Worker endpoint is `GET /api/realtime-transcribe` with a WebSocket upgrade. The browser streams raw signed little-endian 16-bit PCM frames. The Worker calls:

```ts
env.AI.run("@cf/deepgram/nova-3", {
  encoding: "linear16",
  sample_rate: "16000",
  interim_results: "true",
  diarize: true,
  language: "ja"
}, {
  websocket: true
})
```

`Auto` maps to `multi`, `Japanese` maps to `ja`, and `English` maps to `en`. Chinese is dropped because Nova-3 realtime STT on Workers AI does not list Chinese in its supported realtime languages.

The fallback endpoint is `POST /api/transcribe`. The browser sends a short `audio/wav` chunk. The Worker converts the bytes to Base64 and calls:

```ts
env.AI.run("@cf/openai/whisper-large-v3-turbo", {
  audio: base64,
  language: "en"
})
```

Realtime STT can show interim text before final segments. Latency depends on WebSocket connection quality, audio quality, Workers AI availability, and model processing time.

## Chrome Built-in AI Meeting Notes

The `Notes` button attempts to use Chrome Built-in AI in the browser:

- It first tries the Prompt API through `LanguageModel`, which supports the user's custom prompt.
- If the Prompt API is unavailable but the Summarizer API is available, it falls back to a browser-generated summary and warns that the custom prompt was not used.
- Long transcripts are summarized in chunks and then combined.
- Generated notes are editable and are written into `meeting-notes.md` and ZIP export.

Chrome Built-in AI is device- and version-dependent. It may require model download, enough local disk space, supported hardware, and Chrome flags or origin-trial availability depending on the user's Chrome version. It does not replace speech-to-text; it only summarizes transcript text that already exists.

## Chrome Browser Limits

This app targets Chrome desktop. Other browsers may not support the same media capture, display audio, MediaRecorder, or AudioWorklet behavior.

Important limits:

- A normal web page cannot use `chrome.tabCapture`.
- A normal web page cannot use `chrome.tabs.captureVisibleTab`.
- A normal web page cannot directly choose, monitor, or screenshot a tab silently.
- A normal web page must use `navigator.mediaDevices.getDisplayMedia()`.
- The user must manually select a Tab / Window / Screen in Chrome's native picker.
- The app can only capture and screenshot the shared stream selected by the user.
- The app cannot capture unshared pages, windows, or browser tabs.
- Screen / Window audio capture is not guaranteed in every environment.
- Chrome Tab audio capture is usually most stable, but the user must enable `Share tab audio`.

## getDisplayMedia Limits

`getDisplayMedia({ video: true, audio: true })` opens Chrome's native chooser. The app cannot bypass the chooser, preselect a specific tab, or listen silently. Shared audio may be missing when the user selects Window / Screen, when the OS/browser does not expose audio, or when `Share tab audio` is not enabled.

## Why Web Speech API Is Not Used

Earlier prototypes attempted to use Web Speech API for live text, but it is not reliable here:

- Web Speech API cannot be assumed to accept an arbitrary captured `MediaStream`.
- Chrome may mainly use the microphone/default input.
- Captured Tab / Screen audio, such as YouTube or meeting audio, may not be transcribed.
- Local Web Speech behavior is browser-dependent.

## Why Not Chrome Live Caption

Chrome Live Caption is a browser accessibility feature, not a standard Web API. A normal webpage cannot read Live Caption text, save it, or subscribe to it programmatically. Using it for transcript export would require unsupported browser internals or extension-level capabilities.

## Screenshot Limits

Screenshots are only created from the video track returned by `getDisplayMedia()`. The user must actively share a Tab / Window / Screen. The app cannot silently screenshot arbitrary pages or unshared tabs.

Screenshot flow:

- A temporary `HTMLVideoElement` receives the shared display stream.
- Canvas `drawImage(video, 0, 0, width, height)` copies the current frame.
- `canvas.toBlob("image/png")` creates a local PNG Blob.
- The screenshot remains in browser memory with a Blob object URL.
- Screenshot Blob URLs are revoked when screenshots are deleted or the page unloads.
- Markdown references screenshots with `screenshots/<filename>.png`; it does not embed images.

## ZIP Export

JSZip is used only for browser-local ZIP packaging. It does not upload data or call any remote service.

The ZIP contains:

```text
meeting-notes.md
transcript.txt
manifest.json
mixed-audio.webm
screenshots/
```

`mixed-audio.webm` is included only when an audio recording exists. The `screenshots/` folder is included only when screenshots exist. The Markdown screenshot paths match the ZIP folder layout.

## Speaker / Source Marking

The app does not perform voiceprint recognition, true-name identification, or remote participant identity recognition. It requests best-effort anonymous diarization from Nova-3 realtime STT; when available, transcript segments may include labels such as `Speaker 0` or `Speaker 1`.

Primary source labels are still inferred from browser-local Web Audio API RMS volume checks:

- `User` = microphone input is active.
- `Screen` = shared tab/window/screen audio is active.
- `Mixed` = both microphone and shared audio are active.
- `Unknown` = neither source is clearly active or the result is unclear.

Each segment stores `speaker`, `source`, and optionally `diarizedSpeaker`. Users can manually override the broad speaker/source label for every segment.

## Automatic Segmentation

The first segmentation method is time-based. Available intervals:

- 30 seconds
- 1 minute
- 3 minutes
- 5 minutes

Optional silence segmentation is best-effort. It samples the mixed audio volume with Web Audio API and creates a new segment when the mixed RMS volume stays below the configured silence threshold for the configured duration. Device, browser, meeting software, and ambient noise can affect accuracy.

The app does not call any external LLM for semantic segmentation.

## Export Formats

TXT export includes created timestamp, language, screenshot timestamps and relative paths, transcript segment timestamps, and speaker/source labels.

Markdown export includes title, language, created timestamp, Summary placeholder, Action Items placeholder, Screenshots table, Transcript section, segment timestamps, and speaker/source labels.
If browser-local meeting notes have been generated, Markdown export uses those notes in the Summary section.

`manifest.json` includes app name, export timestamp, language, filenames, screenshot metadata, and segment metadata.

## Known Limitations

- Chrome desktop is the intended browser.
- Shared audio availability depends on the selected sharing surface and Chrome/OS behavior.
- Live STT uploads raw audio frames to Cloudflare, so it is not local-only transcription.
- Chinese realtime STT is intentionally not included in this build.
- STT latency and accuracy depend on Workers AI behavior and source audio quality.
- Chrome Built-in AI meeting notes depend on the user's Chrome version, local model availability, and device capability.
- Screenshots require an active shared video track.
- Segment speaker inference is volume-based and approximate.
- Long recordings and many screenshots consume browser memory until refresh or manual clearing.

## Future Options

- Add a user-selectable local Whisper/WebGPU path if browser-local ASR becomes stable enough.
- Improve local meeting-note generation as Chrome Built-in AI APIs stabilize.
- Add a local NLP model or local LLM for semantic segmentation.
- Add an explicit mode switch between local-only capture/export and cloud STT transcription.
