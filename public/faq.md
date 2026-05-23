# Free Minutes FAQ

Last updated: 2026-05-23

## What is Free Minutes?

Free Minutes is a Chrome desktop web app for realtime meeting transcription. It captures microphone audio and user-shared Chrome Tab, Window, or Screen audio, streams mixed audio to Cloudflare Workers AI for speech-to-text, and lets users edit and export meeting transcripts.

## Can Free Minutes transcribe Chrome Tab audio?

Yes. Free Minutes uses Chrome's standard sharing picker through getDisplayMedia. For best results, users should select Chrome Tab and enable "Share tab audio." Window and Screen audio availability depends on Chrome, the operating system, and the selected sharing surface.

## Does Free Minutes upload complete recordings or transcript exports?

No. Complete recordings, screenshots, transcript edits, Markdown notes, manifest data, and ZIP exports are generated in the browser and downloaded locally. Realtime transcription does stream raw mixed-audio frames to this Cloudflare Worker for Cloudflare Workers AI speech-to-text.

## Can Free Minutes save Chrome Live Caption text?

No. Chrome Live Caption is a browser accessibility feature, not a standard Web API. A normal web page cannot read, subscribe to, or save Chrome Live Caption text programmatically.

## Does Free Minutes identify who is speaking?

Free Minutes does not identify individual remote speakers by name. It does not perform real speaker diarization or voiceprint recognition. It infers source labels from audio volume: User for microphone audio, Screen for shared audio, Mixed for both, and Unknown when unclear.

## What export formats does Free Minutes support?

Free Minutes exports transcript.txt, meeting-notes.md, mixed-audio.webm, PNG screenshots, manifest.json, and ZIP packages. Markdown export includes transcript timestamps, speaker/source labels, screenshot paths, summary placeholders, and action item placeholders.

## Does Free Minutes require a login?

No. Free Minutes does not include user accounts, login, a database, or remote save functionality.
