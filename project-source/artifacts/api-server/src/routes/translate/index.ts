import { Router, type IRouter } from "express";
import { createReadStream, existsSync } from "fs";
import { ProcessVideoBody, GetJobStatusParams } from "@workspace/api-zod";
import { createJob, getJob } from "./jobs.js";
import { processVideoSegment, getSentenceAudioPath, TTS_VOICES, getVideoInfo } from "./processor.js";
import { saveCookies, deleteCookies, hasCookies } from "./cookies.js";

const router: IRouter = Router();

router.get("/translate/models", (_req, res) => {
  res.json({ voices: TTS_VOICES });
});

router.get("/translate/info", async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "url required" });
    return;
  }
  const info = await getVideoInfo(url);
  res.json(info);
});

router.get("/translate/cookies/status", async (_req, res) => {
  const has = await hasCookies();
  res.json({ hasCookies: has });
});

router.post("/translate/cookies", async (req, res) => {
  const { cookies } = req.body as { cookies?: string };
  if (!cookies || typeof cookies !== "string" || cookies.trim().length < 10) {
    res.status(400).json({ error: "يرجى تقديم محتوى الكوكيز" });
    return;
  }
  try {
    await saveCookies(cookies.trim());
    res.json({ success: true, message: "تم حفظ الكوكيز بنجاح ✅" });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "فشل حفظ الكوكيز" });
  }
});

router.delete("/translate/cookies", async (_req, res) => {
  await deleteCookies();
  res.json({ success: true, message: "تم حذف الكوكيز" });
});

router.post("/translate/process", async (req, res) => {
  const parsed = ProcessVideoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.message });
    return;
  }

  const { videoUrl, startTime, voice, translationEngine } = parsed.data;
  const job = createJob(startTime);

  // Uses parallel per-sentence processing — each sentence gets its own audio file
  processVideoSegment({
    jobId: job.jobId,
    videoUrl,
    startTime,
    voice,
    translationEngine: translationEngine as any,
    forceAudioExtraction: true,
  }).catch(() => {});

  res.json({ jobId: job.jobId, status: job.status, message: "بدأت المعالجة" });
});

router.get("/translate/status/:jobId", (req, res) => {
  const parsed = GetJobStatusParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.message });
    return;
  }

  const job = getJob(parsed.data.jobId);
  if (!job) {
    res.status(404).json({ error: "not_found", message: "المهمة غير موجودة" });
    return;
  }

  res.json({
    jobId:            job.jobId,
    status:           job.status,
    progress:         job.progress,
    audioUrl:         null, // per-sentence mode — no single concatenated file
    transcript:       job.transcript,
    translation:      job.translation,
    error:            job.error,
    startTime:        job.startTime,
    suggestedRate:    job.suggestedRate ?? null,
    audioDurationSec: job.audioDurationSec ?? null,
    sentences:        job.sentences ?? null,
  });
});

// ── Serve individual sentence audio file ──────────────────────────────────────
router.get("/translate/sentence-audio/:jobId/:idx", (req, res) => {
  const { jobId, idx } = req.params;
  const sentenceIdx = parseInt(idx, 10);
  if (!jobId || isNaN(sentenceIdx) || sentenceIdx < 0) {
    res.status(400).json({ error: "invalid_params" });
    return;
  }

  const audioPath = getSentenceAudioPath(jobId, sentenceIdx);
  if (!audioPath || !existsSync(audioPath)) {
    res.status(404).json({ error: "not_found", message: "الصوت غير متوفر بعد" });
    return;
  }

  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "public, max-age=3600");
  createReadStream(audioPath).pipe(res);
});


export default router;
