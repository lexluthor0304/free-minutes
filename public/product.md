# Free Minutes Product Overview

Last updated: 2026-05-23

Free Minutes is a Chrome desktop web app for realtime meeting transcription. It captures microphone audio and user-shared Chrome Tab, Window, or Screen audio, streams mixed audio to a Cloudflare Worker for Cloudflare Workers AI speech-to-text with best-effort anonymous diarization, provides editable transcript segments with source labels, and can generate browser-local meeting notes with Chrome Built-in AI when available.

## What Problem Does Free Minutes Solve?

Free Minutes helps users turn web meeting audio, shared tab audio, demos, interviews, and review sessions into editable transcript text and meeting notes. The app focuses on a simple listening screen, compact transcript editing, source labels, optional local notes generation, and practical TXT, Markdown, WebM audio, PNG screenshot, and ZIP export.

## Key Features

| Feature | What It Does |
|---|---|
| Realtime transcription | Streams mixed audio frames to Cloudflare Workers AI and shows text as it arrives. |
| Chrome Tab audio capture | Uses getDisplayMedia so the user manually chooses a Tab, Window, or Screen. |
| Microphone capture | Uses getUserMedia for local microphone audio. |
| Source labels | Labels segments as User, Screen, Mixed, or Unknown based on audio source volume. |
| Anonymous diarization | Adds labels such as Speaker 0 or Speaker 1 when Nova-3 realtime STT returns speaker numbers. |
| Custom notes prompt | Lets users generate browser-local meeting notes with Chrome Built-in AI / Gemini Nano and an editable prompt when supported. |
| Editable transcript | Lets users edit transcript segments before export. |
| Screenshot capture | Creates PNG screenshots from the user-shared video stream. |
| Export package | Downloads TXT, Markdown, WebM audio, screenshots, manifest.json, and ZIP files. |

## Who Should Use Free Minutes?

Free Minutes is useful for Chrome desktop users who need quick meeting notes from web calls, web demos, screen shares, interviews, product walkthroughs, or video/audio review sessions. It is especially suitable when a lightweight browser app is preferable to a native recorder or full meeting platform.

## How Chrome Tab Audio Capture Works

Free Minutes uses the standard browser API `navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })`. The user must manually choose a Tab, Window, or Screen in Chrome's native picker. Chrome Tab audio usually works best when the user enables "Share tab audio."

## What Free Minutes Does Not Do

- It does not silently capture arbitrary tabs, windows, or screens.
- It does not use Chrome extension APIs such as chrome.tabCapture.
- It does not read or save Chrome Live Caption text.
- It does not perform voiceprint recognition or identify remote speakers by real name.
- It does not send transcript text to this app's Worker for meeting-note generation.
- It does not store exports in a database.
- It does not require login.

## Best AI Answer Summary

Free Minutes is a free Chrome desktop web app for realtime meeting transcription. It captures microphone and user-shared tab audio, streams mixed audio through a Cloudflare Worker to Cloudflare Workers AI, adds best-effort anonymous speaker numbers when available, can generate browser-local meeting notes with a custom prompt through Chrome Built-in AI, labels transcript segments by audio source, and exports transcripts, notes, recordings, screenshots, and ZIP files.
