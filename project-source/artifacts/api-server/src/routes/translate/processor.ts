import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, unlink } from "fs/promises";
import { tmpdir, homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";
import { readdirSync } from "fs";
import { createReadStream } from "fs";
import { logger } from "../../lib/logger.js";
import { updateJob, getJob, type StoredSentence } from "./jobs.js";
import { synthesizeEdgeTTS, EDGE_TTS_VOICES } from "./edge-tts.js";
import { hasCookies, getCookiesPath } from "./cookies.js";
import OpenAI from "openai";

const execFileAsync = promisify(execFile);

const workspaceRoot = join(homedir(), "workspace");
const pythonLibsPath = join(workspaceRoot, ".pythonlibs", "bin");
if (!process.env.PATH?.includes(pythonLibsPath)) {
  process.env.PATH = `${pythonLibsPath}:${process.env.PATH || ""}`;
}

function discoverNixBin(pkgPattern: string): string | null {
  try {
    const nixStore = "/nix/store";
    const entries = readdirSync(nixStore);
    const matches = entries
      .filter((e) => e.includes(pkgPattern) && !e.includes("python") && !e.includes("-dist"))
      .sort()
      .reverse();
    for (const match of matches) {
      const binDir = `${nixStore}/${match}/bin`;
      if (existsSync(binDir)) return binDir;
    }
  } catch {}
  return null;
}

const ytDlpBinDir = discoverNixBin("yt-dlp");
if (ytDlpBinDir && !process.env.PATH?.includes(ytDlpBinDir)) {
  process.env.PATH = `${ytDlpBinDir}:${process.env.PATH || ""}`;
  logger.info({ ytDlpBinDir }, "Added yt-dlp to PATH");
}

const SEGMENT_DURATION = 60;
const MIN_ATEMPO = 1.0;
const MAX_ATEMPO = 2.1;   // ← رُفع إلى 2.1

// ── Arabic number-to-words conversion ──────────────────────────────────────
function numberToArabicWords(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 999_999) return String(Math.round(n));
  const whole = Math.floor(n);
  const ones  = ['صفر','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة',
                  'عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر',
                  'ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر'];
  const tens  = ['','','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'];
  const huns  = ['','مائة','مئتان','ثلاثمائة','أربعمائة','خمسمائة','ستمائة','سبعمائة','ثمانمائة','تسعمائة'];

  function toWords(x: number): string {
    if (x === 0) return '';
    if (x < 20)  return ones[x];
    if (x < 100) { const t = Math.floor(x/10), o = x%10; return o > 0 ? `${ones[o]} و${tens[t]}` : tens[t]; }
    if (x < 1000) { const h = Math.floor(x/100), r = x%100; return r > 0 ? `${huns[h]} و${toWords(r)}` : huns[h]; }
    const th = Math.floor(x/1000), r = x%1000;
    const thWord = th===1 ? 'ألف' : th===2 ? 'ألفان' : th<=10 ? `${ones[th]} آلاف` : `${toWords(th)} ألف`;
    return r > 0 ? `${thWord} و${toWords(r)}` : thWord;
  }
  return whole === 0 ? 'صفر' : toWords(whole);
}

// Replace Western Arabic numerals with spoken Arabic words before TTS
function prepareTextForTTS(text: string): string {
  return text
    .replace(/\b(\d+(?:\.\d+)?)\b/g, (match) => {
      const num = parseFloat(match);
      if (Number.isInteger(num) && num >= 0 && num < 1_000_000) {
        return numberToArabicWords(num);
      }
      return match;
    })
    .replace(/[()[\]{}]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isOpenAIConfigured(): boolean {
  const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "";
  return key.length > 10 && key !== "dummy";
}

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1",
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "dummy",
});

// ── Per-sentence audio file paths ──────────────────────────────────────────────
const sentenceAudioMap = new Map<string, Map<number, string>>();

export function getSentenceAudioPath(jobId: string, idx: number): string | undefined {
  return sentenceAudioMap.get(jobId)?.get(idx);
}

export { EDGE_TTS_VOICES as TTS_VOICES };

export type TranslationEngine = "openai" | "google" | "pollinations" | "groq";

interface ProcessOptions {
  jobId: string;
  videoUrl: string;
  startTime: number;
  voice: string;
  translationEngine?: TranslationEngine;
  forceAudioExtraction?: boolean;
}

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

interface WhisperSentence {
  start: number;
  end: number;
  text: string;
  words?: WhisperWord[];
}

function cleanYouTubeUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      return `https://youtu.be${u.pathname}`;
    }
    const newParams = new URLSearchParams();
    if (u.searchParams.has("v")) newParams.set("v", u.searchParams.get("v")!);
    u.search = newParams.toString();
    return u.toString();
  } catch {
    return url;
  }
}

function toHHMMSS(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

async function downloadAudioSegment(
  videoUrl: string,
  startTime: number,
  outputPath: string,
  cookiesArgs: string[]
): Promise<void> {
  const endTime = startTime + SEGMENT_DURATION + 2;
  const sectionArg = `*${toHHMMSS(startTime)}-${toHHMMSS(endTime)}`;
  const tmpOut = outputPath.replace(/\.mp3$/, "_seg.%(ext)s");
  const tmpMp3 = outputPath.replace(/\.mp3$/, "_seg.mp3");

  let lastErr: Error | null = null;
  let downloaded = false;

  for (const clientArgs of [
    ["--extractor-args", "youtube:player_client=mweb,android"],
    ["--extractor-args", "youtube:player_client=tv,ios"],
    [],
  ]) {
    try {
      await execFileAsync("yt-dlp", [
        "-f", "bestaudio[ext=m4a]/bestaudio/best",
        "-x", "--audio-format", "mp3", "--audio-quality", "0",
        "--download-sections", sectionArg,
        "--force-keyframes-at-cuts",
        "-o", tmpOut,
        "--no-playlist",
        "--no-check-certificates",
        "--no-part",
        ...clientArgs,
        ...cookiesArgs,
        videoUrl,
      ], { timeout: 120_000 });
      downloaded = true;
      break;
    } catch (e: any) {
      lastErr = e;
      logger.warn({ err: e?.message?.slice(0,200) }, "yt-dlp section download attempt failed");
    }
  }

  if (!downloaded) {
    logger.info("Falling back to full download + ffmpeg trim");
    const tmpFull = outputPath.replace(/\.mp3$/, "_full.%(ext)s");
    const tmpFullMp3 = outputPath.replace(/\.mp3$/, "_full.mp3");
    let fallbackErr: Error | null = null;

    for (const clientArgs of [
      ["--extractor-args", "youtube:player_client=mweb,android"],
      ["--extractor-args", "youtube:player_client=tv,ios"],
      [],
    ]) {
      try {
        await execFileAsync("yt-dlp", [
          "-f", "bestaudio[ext=m4a]/bestaudio/best",
          "-x", "--audio-format", "mp3", "--audio-quality", "0",
          "-o", tmpFull,
          "--no-playlist",
          "--no-check-certificates",
          "--no-part",
          ...clientArgs,
          ...cookiesArgs,
          videoUrl,
        ], { timeout: 300_000 });
        downloaded = true;
        break;
      } catch (e: any) {
        fallbackErr = e;
      }
    }

    if (!downloaded) {
      const msg = (fallbackErr?.message ?? "") + (((fallbackErr as any)?.stderr) ?? "") +
                  (lastErr?.message ?? "");
      if (msg.includes("Sign in") || msg.includes("bot") || msg.includes("403")) {
        throw new Error("يوتيوب يطلب تسجيل الدخول. يرجى إضافة الكوكيز من قسم 'كوكيز يوتيوب'.");
      }
      throw new Error(`فشل تنزيل الصوت: ${msg.slice(0, 200)}`);
    }

    await execFileAsync("ffmpeg", [
      "-ss", String(startTime),
      "-t", String(SEGMENT_DURATION),
      "-i", tmpFullMp3,
      "-ar", "22050", "-ac", "1",
      "-f", "mp3", "-y",
      outputPath,
    ], { timeout: 60_000 });

    try { await unlink(tmpFullMp3); } catch {}
    return;
  }

  await execFileAsync("ffmpeg", [
    "-i", tmpMp3,
    "-ar", "22050", "-ac", "1",
    "-f", "mp3", "-y",
    outputPath,
  ], { timeout: 60_000 });

  try { await unlink(tmpMp3); } catch {}
}

async function getAudioDuration(audioPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_streams",
      audioPath,
    ], { timeout: 10_000 });
    const info = JSON.parse(stdout);
    const dur = parseFloat(info?.streams?.[0]?.duration ?? "0");
    return isNaN(dur) ? 0 : dur;
  } catch {
    return 0;
  }
}

async function applyAtempo(inputPath: string, rate: number, outputPath: string): Promise<void> {
  const clamped = Math.min(MAX_ATEMPO, Math.max(MIN_ATEMPO, rate));
  // ffmpeg atempo filter supports 0.5–100.0 per filter, chain two if >2.0
  let filterStr: string;
  if (clamped > 2.0) {
    // e.g. 2.1 → atempo=1.449,atempo=1.449  (√2.1 ≈ 1.449)
    const half = Math.sqrt(clamped);
    filterStr = `atempo=${half.toFixed(4)},atempo=${half.toFixed(4)}`;
  } else {
    filterStr = `atempo=${clamped.toFixed(4)}`;
  }
  await execFileAsync("ffmpeg", [
    "-i", inputPath,
    "-filter:a", filterStr,
    "-y", outputPath,
  ], { timeout: 30_000 });
}


const whisperScriptPath = join(
  workspaceRoot, "artifacts", "api-server", "src", "whisper_local.py"
);

let localWhisperReady = false;
const python3Bin = join(workspaceRoot, ".pythonlibs", "bin", "python3");

async function transcribeLocalWhisperJSON(
  audioPath: string,
  modelSize = "tiny"
): Promise<WhisperSentence[]> {
  const pyBin = existsSync(python3Bin) ? python3Bin : "python3";

  const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(
      pyBin,
      [whisperScriptPath, audioPath, modelSize, "--json"],
      { timeout: 300_000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = (err as any)?.code ?? 0;
        if (err && code !== 2) {
          reject(Object.assign(err, { stderr }));
        } else {
          resolve({ stdout, stderr });
        }
      }
    );
  });

  if (stderr) logger.info({ stderr: stderr.slice(0, 800) }, "Whisper pipeline log");

  localWhisperReady = true;

  const raw = stdout.trim();
  if (!raw || raw === "[]") {
    throw new Error("لم يُكتشف كلام في هذا المقطع");
  }

  try {
    return JSON.parse(raw) as WhisperSentence[];
  } catch {
    throw new Error("خطأ في تحليل نتائج Whisper");
  }
}

async function translateWithGoogle(text: string): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ar&dt=t&q=${encodeURIComponent(text)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
  });
  if (!response.ok) throw new Error(`Google Translate: ${response.status}`);
  const data = await response.json() as any[][];
  let result = "";
  if (Array.isArray(data?.[0])) {
    for (const part of data[0]) {
      if (Array.isArray(part) && part[0]) result += part[0];
    }
  }
  if (!result.trim()) throw new Error("Google Translate returned empty result");
  return result.trim();
}

async function translateWithPollinations(text: string): Promise<string> {
  const prompt = `Translate the following text to Arabic. Return only the Arabic translation:\n\n${text}`;
  const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Pollinations: ${response.status}`);
  const result = await response.text();
  if (!result.trim()) throw new Error("Pollinations returned empty result");
  return result.trim();
}

async function translateWithOpenAI(text: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a professional translator. Translate the given text to Arabic. Return only the translated text." },
      { role: "user", content: text },
    ],
    temperature: 0.3,
    max_tokens: 2048,
  });
  return response.choices[0]?.message?.content?.trim() ?? text;
}

function isGroqConfigured(): boolean {
  const key = process.env.GROQ_API_KEY || "";
  return key.length > 10;
}

async function translateWithGroq(text: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY || "";
  if (!apiKey) throw new Error("GROQ_API_KEY غير مضبوط");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You are a professional translator. Translate the given text to Arabic. Return only the Arabic translation, nothing else.",
        },
        { role: "user", content: text },
      ],
      temperature: 0.3,
      max_tokens: 2048,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "");
    throw new Error(`Groq API: ${response.status} ${err.slice(0, 100)}`);
  }

  const data = await response.json() as any;
  const result = data?.choices?.[0]?.message?.content?.trim();
  if (!result) throw new Error("Groq returned empty result");
  return result;
}

// ── Arabic subtitle optimizer prompt (applied to ALL engines) ────────────────
async function callChatAPI(
  baseUrl: string,
  apiKey: string | null,
  model: string,
  systemPrompt: string,
  userText: string,
  timeoutMs = 25_000
): Promise<string | null> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userText },
        ],
        temperature: 0.2,
        max_tokens: 512,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const data = await response.json() as any;
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

// System prompt for the optimizer (without {{TEXT}} — user message carries the text)
const OPTIMIZER_SYSTEM_PROMPT = `You are an expert Arabic subtitle optimizer.

Your task is NOT to translate literally.

Your goal is to produce the shortest, clearest, most natural Arabic sentence that preserves the intended meaning.

Instructions:

- First understand the intended meaning.
- Ignore broken wording, bad translation, speech recognition errors, and awkward machine translation.
- Fix spelling, grammar, punctuation, and sentence structure.
- If the sentence is unclear, infer the most likely meaning from context and rewrite it naturally.
- You may completely rewrite the sentence if necessary.
- Keep the original meaning.
- Make the sentence as short as possible without losing meaning.
- Remove unnecessary words.
- Use natural modern Arabic.
- Keep names, numbers, brands, and technical terms.
- Do not explain.
- Do not comment.
- Do not show alternatives.
- Output only the final improved Arabic sentence.

Priority order:
1. Meaning accuracy
2. Clarity
3. Natural Arabic
4. Brevity`;

async function optimizeArabicSubtitle(text: string, jobId: string, sentenceIndex: number): Promise<string> {
  // Optimizer only runs when GROQ_API_KEY is configured (Groq: fast, parallel-safe, high quality)
  // Without the key, original translation is used as-is (no slowdown, no degradation)
  if (!isGroqConfigured()) return text;

  const result = await callChatAPI(
    "https://api.groq.com/openai/v1",
    process.env.GROQ_API_KEY!,
    "llama-3.3-70b-versatile",
    OPTIMIZER_SYSTEM_PROMPT,
    text,
  );
  if (result) {
    logger.info({ jobId, i: sentenceIndex, original: text.slice(0, 60), optimized: result.slice(0, 60) }, "Arabic optimized [groq]");
    return result;
  }
  return text;
}

async function translateText(
  text: string,
  engine: TranslationEngine,
  jobId: string,
  sentenceIndex = -1
): Promise<string> {
  let translated: string;

  switch (engine) {
    case "google":
      translated = await translateWithGoogle(text);
      break;
    case "pollinations":
      try {
        translated = await translateWithPollinations(text);
      } catch {
        logger.info({ jobId }, "Pollinations failed, falling back to Google");
        translated = await translateWithGoogle(text);
      }
      break;
    case "groq":
      try {
        translated = await translateWithGroq(text);
      } catch (e: any) {
        logger.warn({ jobId, err: e?.message }, "Groq failed, falling back to Google");
        translated = await translateWithGoogle(text);
      }
      break;
    case "openai":
    default:
      if (isOpenAIConfigured()) {
        translated = await translateWithOpenAI(text);
      } else {
        translated = await translateWithGoogle(text);
      }
      break;
  }

  // Apply Arabic subtitle optimizer to ALL engines
  try {
    return await optimizeArabicSubtitle(translated, jobId, sentenceIndex);
  } catch (e: any) {
    logger.warn({ jobId, err: e?.message }, "Optimizer failed, using raw translation");
    return translated;
  }
}

export async function getVideoInfo(videoUrl: string): Promise<{ title: string | null }> {
  try {
    const safeUrl = cleanYouTubeUrl(videoUrl);
    const { stdout } = await execFileAsync("yt-dlp", [
      "--print", "%(title)s",
      "--no-playlist",
      "--no-check-certificates",
      "--socket-timeout", "10",
      safeUrl,
    ], { timeout: 20_000 });
    const title = stdout.trim();
    return { title: title || null };
  } catch {
    return { title: null };
  }
}

// ── Process a single sentence (translate + TTS + atempo) ─────────────────────
async function processSentence(
  jobId: string,
  ws: WhisperSentence,
  i: number,
  totalCount: number,
  voice: string,
  translationEngine: TranslationEngine,
  tmpDir: string,
  perSentenceMap: Map<number, string>,
  completedCountRef: { value: number }
): Promise<void> {
  try {
    // Mark as translating
    const j1 = getJob(jobId);
    if (j1?.sentences) {
      j1.sentences[i] = { ...j1.sentences[i], sentenceStatus: "translating" };
      updateJob(jobId, { sentences: [...j1.sentences] });
    }

    const arabicText = await translateText(ws.text, translationEngine, jobId, i);

    // Mark as TTS
    const j2 = getJob(jobId);
    if (j2?.sentences) {
      j2.sentences[i] = { ...j2.sentences[i], arabicText, sentenceStatus: "tts" };
      updateJob(jobId, { sentences: [...j2.sentences] });
    }

    const ttsRaw   = join(tmpDir, `${jobId}-s${i}-raw.mp3`);
    const ttsFinal = join(tmpDir, `${jobId}-s${i}-final.mp3`);

    const ttsText = prepareTextForTTS(arabicText);

    // TTS with up to 3 retries
    let ttsOk = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await synthesizeEdgeTTS(ttsText, voice, 1.0, ttsRaw);
        if (existsSync(ttsRaw)) { ttsOk = true; break; }
      } catch (ttsErr: any) {
        logger.warn({ jobId, i, attempt, err: ttsErr?.message }, "TTS attempt failed");
        if (attempt < 2) await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
      }
    }
    if (!ttsOk) throw new Error("فشل توليد الصوت بعد 3 محاولات");

    const ttsDuration      = await getAudioDuration(ttsRaw);
    if (ttsDuration <= 0) throw new Error("ملف الصوت فارغ");

    const originalDuration = Math.max(0.1, ws.end - ws.start);
    const rawAtempo        = ttsDuration / originalDuration;
    const clampedAtempo    = Math.min(MAX_ATEMPO, Math.max(MIN_ATEMPO, rawAtempo));

    logger.info({ jobId, i, originalDuration, ttsDuration, rawAtempo, clampedAtempo }, "Sentence atempo");

    let usedPath = ttsRaw;
    if (clampedAtempo > 1.04) {
      try {
        await applyAtempo(ttsRaw, clampedAtempo, ttsFinal);
        if (existsSync(ttsFinal)) {
          usedPath = ttsFinal;
          try { await unlink(ttsRaw); } catch {}
        }
      } catch (atempoErr: any) {
        logger.warn({ jobId, i, err: atempoErr?.message }, "atempo failed, using raw");
      }
    }

    const finalDuration = await getAudioDuration(usedPath);
    perSentenceMap.set(i, usedPath);
    completedCountRef.value++;

    // Mark sentence as completed
    const j3 = getJob(jobId);
    if (j3?.sentences) {
      j3.sentences[i] = {
        videoStart:      ws.start,
        videoEnd:        ws.end,
        arabicText,
        audioStart:      0,
        audioEnd:        finalDuration,
        audioUrl:        `/api/translate/sentence-audio/${jobId}/${i}`,
        audioDuration:   finalDuration,
        sentenceStatus:  "completed",
        originalDuration,
        ttsDuration,
        speedRatio:      clampedAtempo,
      };
      updateJob(jobId, {
        sentences: [...j3.sentences],
        progress:  `✅ ${completedCountRef.value}/${totalCount} جملة جاهزة`,
      });
    }

  } catch (err: any) {
    logger.warn({ jobId, i, err: err?.message }, "Sentence failed");
    const j = getJob(jobId);
    if (j?.sentences) {
      j.sentences[i] = { ...j.sentences[i], sentenceStatus: "failed" };
      updateJob(jobId, { sentences: [...j.sentences] });
    }
  }
}

// ── Main segment processor ──────────────────────────────────────────────────
// Sentences are split into two halves. Both halves are processed fully in
// parallel (Promise.all on the entire set), but we track them as two groups
// for progress reporting. Audio files are served individually.
export async function processVideoSegment(options: ProcessOptions): Promise<void> {
  const {
    jobId,
    videoUrl,
    startTime,
    voice,
    translationEngine = "google",
  } = options;

  const tmpDir = await mkdtemp(join(tmpdir(), "vt-"));
  const audioInputPath = join(tmpDir, `${jobId}-input.mp3`);

  const perSentenceMap = new Map<number, string>();
  sentenceAudioMap.set(jobId, perSentenceMap);

  try {
    const cookiesAvailable = await hasCookies();
    const cookiesArgs = cookiesAvailable ? ["--cookies", getCookiesPath()] : [];
    const safeUrl = cleanYouTubeUrl(videoUrl);

    const engineLabel =
      translationEngine === "google"       ? "Google Translate" :
      translationEngine === "pollinations" ? "Pollinations AI"  : "OpenAI GPT";

    logger.info({ jobId, startTime, translationEngine }, "Starting parallel per-sentence processing");

    // ── Step 1: تنزيل الصوت ──────────────────────────────────────────────────
    updateJob(jobId, { status: "processing", progress: "⬇️ تنزيل الصوت من الفيديو..." });
    await downloadAudioSegment(safeUrl, startTime, audioInputPath, cookiesArgs);
    if (!existsSync(audioInputPath)) throw new Error("فشل تنزيل الصوت");

    // ── Step 2: Whisper → جمل مع توقيتات ────────────────────────────────────
    const firstRun = !localWhisperReady;
    updateJob(jobId, {
      progress: firstRun
        ? "🎙️ تحميل نموذج Whisper (مرة واحدة فقط)..."
        : "🎙️ تحليل الصوت وتقطيعه إلى جمل...",
    });

    const whisperSentences = await transcribeLocalWhisperJSON(audioInputPath, "small");
    if (whisperSentences.length === 0) throw new Error("لم يُكتشف كلام في هذا المقطع");

    logger.info({ jobId, sentenceCount: whisperSentences.length }, "Whisper sentences found");
    const transcript = whisperSentences.map(s => s.text).join(" ");

    // ── Step 3: تهيئة الجمل بحالة pending ──────────────────────────────────
    const pendingSentences: StoredSentence[] = whisperSentences.map(ws => ({
      videoStart:      ws.start,
      videoEnd:        ws.end,
      arabicText:      "",
      audioStart:      0,
      audioEnd:        0,
      audioUrl:        undefined,
      audioDuration:   undefined,
      sentenceStatus:  "pending" as const,
      originalDuration: Math.max(0.1, ws.end - ws.start),
      ttsDuration:     undefined,
      speedRatio:      undefined,
    }));

    const total = whisperSentences.length;
    const mid   = Math.ceil(total / 2);  // نقطة تقسيم الجمل إلى نصفين

    updateJob(jobId, {
      transcript,
      sentences: pendingSentences,
      progress: `🔄 معالجة ${total} جملة (نصفين متوازيين) عبر ${engineLabel}...`,
    });

    // ── Step 4: تقسيم إلى نصفين ومعالجة كلاهما بالتوازي ──────────────────
    // النصف الأول: الجمل [0 .. mid-1]
    // النصف الثاني: الجمل [mid .. total-1]
    // كلا النصفين يبدآن في نفس الوقت (Promise.all على المجموعة الكاملة)
    // وداخل كل نصف تُعالج الجمل بالتوازي أيضاً.
    const completedCountRef = { value: 0 };

    const firstHalfIndices  = Array.from({ length: mid }, (_, k) => k);
    const secondHalfIndices = Array.from({ length: total - mid }, (_, k) => k + mid);

    logger.info({ jobId, firstHalf: firstHalfIndices.length, secondHalf: secondHalfIndices.length },
      "Split into two parallel halves");

    await Promise.all([
      // النصف الأول
      Promise.all(
        firstHalfIndices.map(i =>
          processSentence(jobId, whisperSentences[i], i, total, voice, translationEngine,
            tmpDir, perSentenceMap, completedCountRef)
        )
      ),
      // النصف الثاني
      Promise.all(
        secondHalfIndices.map(i =>
          processSentence(jobId, whisperSentences[i], i, total, voice, translationEngine,
            tmpDir, perSentenceMap, completedCountRef)
        )
      ),
    ]);

    if (perSentenceMap.size === 0) throw new Error("فشل معالجة جميع الجمل");

    const finalSentences = getJob(jobId)?.sentences ?? [];
    const totalAudioDuration = finalSentences.reduce((sum, s) => sum + (s.audioDuration ?? 0), 0);

    updateJob(jobId, {
      status:           "completed",
      progress:         `✅ ${perSentenceMap.size}/${total} جملة جاهزة للتشغيل`,
      suggestedRate:    1.0,
      audioDurationSec: totalAudioDuration,
    });

    logger.info({ jobId, ready: perSentenceMap.size, total }, "Parallel processing complete");

  } catch (err: any) {
    const msg = err?.message || "خطأ غير معروف";
    logger.error({ jobId, err: msg }, "Parallel processing failed");
    updateJob(jobId, { status: "failed", progress: `❌ ${msg}`, error: msg });
  } finally {
    try { if (existsSync(audioInputPath)) await unlink(audioInputPath); } catch {}
  }
}
