# Free Minutes Privacy Boundary

Last updated: 2026-05-23

Free Minutes is designed to keep editing and exports in the browser while using Cloudflare Workers AI for realtime speech-to-text. Users should understand the difference between realtime transcription traffic and local export data.

## Data Sent for Realtime STT

When listening is active, Free Minutes streams raw mixed-audio frames to its Cloudflare Worker. The Worker opens a Cloudflare Workers AI realtime speech-to-text connection with best-effort anonymous diarization enabled and returns transcript events to the browser.

## Data Not Saved by Export Features

The app does not save complete recordings, screenshots, transcript edits, Markdown notes, manifest data, or ZIP exports to a database. These files are generated in the browser and downloaded by the user.

## Browser-Local Meeting Notes

When Chrome Built-in AI is available, Free Minutes can generate meeting notes from the transcript in the browser with Gemini Nano. Users can edit the prompt. This notes feature does not send the transcript to the app's Cloudflare Worker.

Chrome may download or update its local built-in AI model the first time this feature is used. That model download is managed by Chrome; Free Minutes does not upload the transcript for notes generation.

## Browser APIs Used

- getUserMedia for microphone audio.
- getDisplayMedia for user-selected Tab, Window, or Screen sharing.
- Web Audio API for audio mixing and source volume analysis.
- MediaRecorder for WebM audio recording.
- Canvas for PNG screenshots from the shared video track.
- Chrome Built-in AI for optional browser-local meeting notes when available.
- JSZip for browser-local ZIP packaging.

## Consent and External Scripts

Google Consent Mode defaults analytics and ads storage to denied until the user chooses. The GitHub button loads GitHub Buttons for the visible repository button. The company homepage link only navigates when clicked.

## Important Capture Limits

Free Minutes cannot silently listen to arbitrary tabs, windows, or screens. The user must manually choose a sharing surface in Chrome's native picker. The app cannot read Chrome Live Caption text and cannot capture unshared content.
