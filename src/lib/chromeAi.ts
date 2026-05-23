import type { LanguageOption, TranscriptSegment } from "../types";
import { formatSegmentTime } from "./time";

export const DEFAULT_MEETING_NOTES_PROMPT = `# Command / 命令文
You are a professional meeting minutes writer.
あなたは議事録作成のプロフェッショナルです。

Your task is to create clear, structured, and effective meeting minutes for the KC and AS meeting based on the transcript provided in the input text.
以下の入力文は 君 と クライアント の会議文字起こしデータです。この内容に基づき、指定された制約条件に従って、明瞭で検索しやすい議事録を作成してください。

---

# Language Rule / 言語ルール

1. If the transcript is mainly Japanese, write the meeting minutes in Japanese.
   入力文が主に日本語の場合、議事録は日本語で作成してください。

2. If the transcript is mainly English, write the meeting minutes in English.
   入力文が主に英語の場合、議事録は英語で作成してください。

3. If the transcript contains both Japanese and English in meaningful amounts, create bilingual meeting minutes in Japanese and English.
   入力文に日本語と英語が一定量含まれる場合、日本語と英語の両方で議事録を作成してください。

4. Do not mechanically translate every sentence. Prioritize clarity, accuracy, and meeting-minutes usefulness.
   全文を機械的に逐語訳する必要はありません。明瞭性、正確性、議事録としての実用性を優先してください。

5. If bilingual output is needed, use Japanese first and English second under each major section.
   日英併記が必要な場合は、各主要セクションで日本語を先に、英語を後に記載してください。

---

# Assumptions / 前提条件

The input text is an AI-generated meeting transcript and may contain transcription errors, unclear expressions, incorrect speaker labels, filler words, and incomplete sentences.
入力文は AI による会議文字起こしデータであり、一部に書き起こしミス、不明瞭な表現、誤った話者ラベル、ケバ、文の欠落が含まれている可能性があります。

You must understand the context, correct obvious transcription mistakes where reasonable, remove filler words, and organize the content into professional meeting minutes.
文脈を理解し、合理的に修正可能な誤記は修正し、ケバ取りを行い、内容を専門的な議事録として整理してください。

---

# Constraints / 制約条件

1. Start with basic meeting information.
   最初に会議の基本情報を記載してください。

   Include the following items if available from the transcript:
   文字起こしデータから判断できる場合、以下を記載してください。

   - Meeting title / 会議名
   - Date and time / 日時
   - Location or meeting format / 場所または開催形式
   - Participants / 出席者
   - Organization or company names / 所属組織・会社名
   - Purpose of the meeting / 会議目的

   If any item is not available, write "Not specified" in English or "記載なし" in Japanese.
   情報が確認できない項目は、日本語では「記載なし」、英語では "Not specified" と記載してください。

2. Summarize key decisions at the beginning.
   会議での主要な「決定事項」を冒頭でまとめてください。

3. Then summarize action items.
   次に「アクションアイテム」をまとめてください。

   Each action item should include, where possible:
   各アクションアイテムには、可能な限り以下を含めてください。

   - Task / 対応内容
   - Owner / 担当者
   - Due date / 期限
   - Status or notes / 状況・補足

4. After that, organize the discussion by agenda topic.
   その後、各議題の見出しを設け、議題ごとに内容を整理してください。

5. Under each agenda topic, record who said what.
   各議題では、誰がどのような発言を行ったかが分かるように整理してください。

6. Use headings, bullet points, and structured formatting.
   見出し、箇条書き、構造化された形式を活用してください。

7. Write concisely and clearly.
   文書は簡潔かつ明瞭に記述してください。

8. Distinguish public information and confidential information where context suggests such distinction.
   公開可能な情報と非公開情報が文脈上区別できる場合は、適切に分けて扱ってください。

9. Define technical terms and abbreviations on first use.
   専門用語や略語を使用する場合は、初回の使用時に定義を明記してください。

10. Remove filler words, repetitions, false starts, and unnecessary conversational noise.
    ケバ、重複、言い直し、不要な会話表現を削除してください。

11. If a phrase is unclear but can be reasonably inferred from context, correct it.
    文脈から合理的に推測できる不明瞭な表現は修正してください。

12. If a phrase is unclear and cannot be reasonably inferred, either mark it as unclear or omit it if it does not affect the meeting minutes.
    文脈から合理的に推測できない箇所は、「不明」として記載するか、議事録上重要でなければ削除してください。

13. Do not invent facts.
    事実を捏造しないでください。

14. If a decision, action item, date, owner, or participant is uncertain, clearly mark it as uncertain.
    決定事項、アクションアイテム、日付、担当者、出席者などが不確実な場合は、その旨を明記してください。

---

# Output Format / 出力形式

Output the meeting minutes in plain text.
議事録はテキスト形式で出力してください。

Use the following structure.
以下の構成で作成してください。

---

## 1. Meeting Information / 会議基本情報

- Meeting title / 会議名:
- Date and time / 日時:
- Location or format / 場所・開催形式:
- Participants / 出席者:
- Related organizations / 関係組織:
- Purpose / 目的:

---

## 2. Key Decisions / 決定事項

- Decision 1:
- Decision 2:
- Decision 3:

If there are no clear decisions, write:
明確な決定事項がない場合は、以下のように記載してください。

Japanese:
- 明確な決定事項は確認できませんでした。

English:
- No clear decisions were confirmed.

---

## 3. Action Items / アクションアイテム

| No. | Task / 対応内容 | Owner / 担当者 | Due Date / 期限 | Notes / 補足 |
|---|---|---|---|---|
| 1 |  |  |  |  |

If there are no clear action items, write:
明確なアクションアイテムがない場合は、以下のように記載してください。

Japanese:
- 明確なアクションアイテムは確認できませんでした。

English:
- No clear action items were confirmed.

---

## 4. Discussion Summary by Agenda / 議題別議論内容

### Agenda 1 / 議題1: [Topic / 議題名]

- Speaker / 発言者:
  - Summary of statement / 発言要旨:
  - Details / 詳細:
  - Notes / 補足:

- Speaker / 発言者:
  - Summary of statement / 発言要旨:
  - Details / 詳細:
  - Notes / 補足:

### Agenda 2 / 議題2: [Topic / 議題名]

- Speaker / 発言者:
  - Summary of statement / 発言要旨:
  - Details / 詳細:
  - Notes / 補足:

---

## 5. Public and Confidential Information / 公開情報・非公開情報

### Public Information / 公開可能な情報

-

### Confidential or Sensitive Information / 非公開・取扱注意情報

-

If this distinction cannot be made from the transcript, write:
文字起こしデータから判断できない場合は、以下のように記載してください。

Japanese:
- 公開情報と非公開情報の明確な区別は、文字起こしデータからは判断できませんでした。

English:
- A clear distinction between public and confidential information could not be determined from the transcript.

---

## 6. Unclear or Uncertain Points / 不明点・確認事項

List points that require confirmation.
確認が必要な事項を記載してください。

-
-
-

---

## 7. Terms and Abbreviations / 用語・略語

If technical terms or abbreviations appear, define them here.
専門用語や略語が登場した場合は、ここで定義してください。

- Term / 用語:
  - Definition / 定義:

If none are found, write:
該当する用語がない場合は、以下のように記載してください。

Japanese:
- 特に定義が必要な専門用語・略語は確認できませんでした。

English:
- No technical terms or abbreviations requiring definition were identified.

---

# Input Text / 入力文

The transcript is provided after this prompt by the application.`;

const MAX_DIRECT_TRANSCRIPT_CHARS = 14_000;
const MAX_CHUNK_CHARS = 10_000;

type BuiltInAiAvailability = "available" | "downloadable" | "downloading" | "unavailable";

type BuiltInAiMonitor = {
  addEventListener: (
    type: "downloadprogress",
    listener: (event: { loaded: number; total?: number }) => void,
  ) => void;
};

type LanguageModelSession = {
  prompt: (input: string, options?: { signal?: AbortSignal }) => Promise<string>;
  destroy?: () => void;
};

type LanguageModelApi = {
  availability: (options?: unknown) => Promise<BuiltInAiAvailability>;
  create: (options?: { monitor?: (monitor: BuiltInAiMonitor) => void }) => Promise<LanguageModelSession>;
};

type SummarizerSession = {
  summarize: (input: string, options?: { signal?: AbortSignal }) => Promise<string>;
  destroy?: () => void;
};

type SummarizerApi = {
  availability: (options?: unknown) => Promise<BuiltInAiAvailability>;
  create: (options?: {
    format?: "markdown" | "plain-text";
    length?: "short" | "medium" | "long";
    sharedContext?: string;
    type?: "key-points" | "tldr" | "teaser" | "headline";
    monitor?: (monitor: BuiltInAiMonitor) => void;
  }) => Promise<SummarizerSession>;
};

type ChromeAiGlobal = typeof globalThis & {
  LanguageModel?: LanguageModelApi;
  Summarizer?: SummarizerApi;
};

export type MeetingNotesResult = {
  text: string;
  engine: "prompt-api" | "summarizer-api";
  customPromptUsed: boolean;
};

export async function generateMeetingNotesWithChromeAi(options: {
  language: LanguageOption;
  prompt: string;
  segments: TranscriptSegment[];
  signal?: AbortSignal;
  onStatus?: (message: string) => void;
}): Promise<MeetingNotesResult> {
  const transcript = formatTranscriptForNotes(options.segments);
  if (!transcript.trim()) {
    throw new Error("Transcript is empty.");
  }

  const customPrompt = options.prompt.trim() || DEFAULT_MEETING_NOTES_PROMPT;
  const languageModel = (globalThis as ChromeAiGlobal).LanguageModel;
  if (languageModel) {
    return {
      text: await generateWithPromptApi({
        language: options.language,
        prompt: customPrompt,
        transcript,
        signal: options.signal,
        onStatus: options.onStatus,
      }),
      engine: "prompt-api",
      customPromptUsed: true,
    };
  }

  const summarizer = (globalThis as ChromeAiGlobal).Summarizer;
  if (summarizer) {
    options.onStatus?.("Prompt API is unavailable. Using Chrome Summarizer instead.");
    return {
      text: await generateWithSummarizerApi({
        transcript,
        signal: options.signal,
        onStatus: options.onStatus,
      }),
      engine: "summarizer-api",
      customPromptUsed: false,
    };
  }

  throw new Error("Chrome built-in AI is not available in this browser.");
}

function formatTranscriptForNotes(segments: TranscriptSegment[]): string {
  return segments
    .filter((segment) => segment.text.trim())
    .map((segment) => {
      const speakerParts = [segment.speaker, segment.source, segment.diarizedSpeaker].filter(Boolean);
      return `[${formatSegmentTime(segment.startTime)} - ${formatSegmentTime(segment.endTime)}] ${speakerParts.join(" / ")}
${segment.text.trim()}`;
    })
    .join("\n\n");
}

async function generateWithPromptApi(options: {
  language: LanguageOption;
  prompt: string;
  transcript: string;
  signal?: AbortSignal;
  onStatus?: (message: string) => void;
}): Promise<string> {
  const languageModel = (globalThis as ChromeAiGlobal).LanguageModel;
  if (!languageModel) {
    throw new Error("Chrome Prompt API is unavailable.");
  }

  const availabilityOptions = buildLanguageModelOptions(options.language);
  options.onStatus?.("Checking Chrome built-in AI.");
  const availability = await getLanguageModelAvailability(languageModel, availabilityOptions);
  if (availability === "unavailable") {
    throw new Error("Chrome built-in AI is unavailable on this device.");
  }

  const session = await languageModel.create({
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => {
        const percent = Math.round(event.loaded * 100);
        options.onStatus?.(`Downloading Chrome AI model ${percent}%.`);
      });
    },
  });

  try {
    if (options.transcript.length <= MAX_DIRECT_TRANSCRIPT_CHARS) {
      options.onStatus?.("Generating notes locally in Chrome.");
      return cleanNotesOutput(
        await session.prompt(buildFinalPrompt(options.prompt, options.transcript), {
          signal: options.signal,
        }),
      );
    }

    const chunks = splitByParagraph(options.transcript, MAX_CHUNK_CHARS);
    const chunkNotes: string[] = [];
    for (const [index, chunk] of chunks.entries()) {
      options.onStatus?.(`Summarizing transcript part ${index + 1}/${chunks.length}.`);
      chunkNotes.push(
        cleanNotesOutput(
          await session.prompt(buildChunkPrompt(chunk), {
            signal: options.signal,
          }),
        ),
      );
    }

    options.onStatus?.("Combining local notes.");
    return cleanNotesOutput(
      await session.prompt(buildFinalPrompt(options.prompt, chunkNotes.join("\n\n")), {
        signal: options.signal,
      }),
    );
  } finally {
    session.destroy?.();
  }
}

async function generateWithSummarizerApi(options: {
  transcript: string;
  signal?: AbortSignal;
  onStatus?: (message: string) => void;
}): Promise<string> {
  const summarizerApi = (globalThis as ChromeAiGlobal).Summarizer;
  if (!summarizerApi) {
    throw new Error("Chrome Summarizer API is unavailable.");
  }

  options.onStatus?.("Checking Chrome Summarizer.");
  const availabilityOptions = {
    type: "key-points",
    format: "markdown",
    length: "medium",
  };
  const availability = await getSummarizerAvailability(summarizerApi, availabilityOptions);
  if (availability === "unavailable") {
    throw new Error("Chrome Summarizer is unavailable on this device.");
  }

  const summarizer = await summarizerApi.create({
    type: "key-points",
    format: "markdown",
    length: "medium",
    sharedContext: "Meeting transcript summary. Do not invent facts.",
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => {
        const percent = Math.round(event.loaded * 100);
        options.onStatus?.(`Downloading Chrome AI model ${percent}%.`);
      });
    },
  });

  try {
    if (options.transcript.length <= MAX_DIRECT_TRANSCRIPT_CHARS) {
      options.onStatus?.("Generating notes locally in Chrome.");
      return cleanNotesOutput(await summarizer.summarize(options.transcript, { signal: options.signal }));
    }

    const chunks = splitByParagraph(options.transcript, MAX_CHUNK_CHARS);
    const summaries: string[] = [];
    for (const [index, chunk] of chunks.entries()) {
      options.onStatus?.(`Summarizing transcript part ${index + 1}/${chunks.length}.`);
      summaries.push(cleanNotesOutput(await summarizer.summarize(chunk, { signal: options.signal })));
    }
    options.onStatus?.("Combining local notes.");
    return cleanNotesOutput(await summarizer.summarize(summaries.join("\n\n"), { signal: options.signal }));
  } finally {
    summarizer.destroy?.();
  }
}

function buildLanguageModelOptions(language: LanguageOption): unknown {
  const languages = language === "Auto" ? ["en", "ja"] : [language === "Japanese" ? "ja" : "en"];
  return {
    expectedInputs: [{ type: "text", languages }],
    expectedOutputs: [{ type: "text", languages }],
  };
}

async function getLanguageModelAvailability(
  languageModel: LanguageModelApi,
  options: unknown,
): Promise<BuiltInAiAvailability> {
  try {
    return await languageModel.availability(options);
  } catch {
    return languageModel.availability();
  }
}

async function getSummarizerAvailability(
  summarizerApi: SummarizerApi,
  options: unknown,
): Promise<BuiltInAiAvailability> {
  try {
    return await summarizerApi.availability(options);
  } catch {
    return summarizerApi.availability();
  }
}

function buildChunkPrompt(transcriptChunk: string): string {
  return `Summarize this part of a meeting transcript for later meeting notes.

Keep names and speaker labels only if they are present in the transcript. Do not invent facts.

Transcript part:
${transcriptChunk}`;
}

function buildFinalPrompt(userPrompt: string, transcriptOrChunkNotes: string): string {
  return `${userPrompt}

Transcript or intermediate notes:
${transcriptOrChunkNotes}`;
}

function splitByParagraph(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of text.split(/\n{2,}/)) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) {
      chunks.push(current);
    }
    if (paragraph.length > maxChars) {
      chunks.push(...splitLongText(paragraph, maxChars));
      current = "";
    } else {
      current = paragraph;
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function splitLongText(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += maxChars) {
    chunks.push(text.slice(index, index + maxChars));
  }
  return chunks;
}

function cleanNotesOutput(text: string): string {
  return text.trim() || "_No notes generated._";
}
