import React, { useState, useRef, useEffect, useCallback } from 'react';
import YouTube from 'react-youtube';
import {
  Play, Square, Youtube, Volume2, Loader2, CheckCircle2,
  Cookie, ChevronDown, ChevronUp, Trash2, Globe, BookOpen,
  SkipBack, SkipForward, Clock, Mic, Maximize2, Video,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { useToast } from '@/hooks/use-toast';
import { useGetTtsModels } from '@workspace/api-client-react';
import { useYoutubeUrl } from '@/hooks/use-youtube-url';
import { PipelineBar } from '@/components/pipeline-bar';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// ─── Constants ────────────────────────────────────────────────────────────────
const SEGMENT_STEP  = 59;   // seconds per segment (fixed — no more ABC system)
const POLL_MS       = 600;
const MAX_RETRIES   = 2;
const NAV_GRACE_MS  = 1500; // after sentence nav, block auto-switching for this long

type TranslationEngine = 'openai' | 'google' | 'pollinations' | 'groq';
type SentenceStatus    = 'pending' | 'translating' | 'tts' | 'completed' | 'failed';

interface StoredSentence {
  videoStart:       number;
  videoEnd:         number;
  arabicText:       string;
  audioStart:       number;
  audioEnd:         number;
  audioUrl?:        string;
  audioDuration?:   number;
  sentenceStatus?:  SentenceStatus;
  originalDuration?: number;
  ttsDuration?:     number;
  speedRatio?:      number;
}

interface SegJob {
  jobId:            string;
  status:           'processing' | 'completed' | 'failed';
  progress:         string;
  suggestedRate:    number | null;
  audioDurationSec: number | null;
  sentences:        StoredSentence[] | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function segLabel(start: number) {
  return `${fmt(start)} – ${fmt(start + SEGMENT_STEP)}`;
}

function getSegStart(videoTime: number, step: number): number {
  return Math.floor(videoTime / step) * step;
}

// Sentence status → short label
function statusLabel(st?: SentenceStatus): string {
  if (st === 'translating') return '🌍';
  if (st === 'tts')         return '🔊';
  if (st === 'completed')   return '✅';
  if (st === 'failed')      return '❌';
  return '⏳';
}

// ─── API calls ────────────────────────────────────────────────────────────────
async function postProcess(
  videoUrl: string, startTime: number, voice: string,
  translationEngine: TranslationEngine
): Promise<string> {
  const r = await fetch('/api/translate/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl, startTime, voice, translationEngine, forceAudioExtraction: true }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'فشل الطلب');
  return d.jobId as string;
}

async function fetchStatus(jobId: string) {
  const r = await fetch(`/api/translate/status/${jobId}`);
  return r.json();
}

async function fetchCookiesStatus(): Promise<boolean> {
  try {
    const r = await fetch('/api/translate/cookies/status');
    return (await r.json()).hasCookies === true;
  } catch { return false; }
}

async function fetchVideoInfo(videoUrl: string): Promise<string | null> {
  try {
    const r = await fetch(`/api/translate/info?url=${encodeURIComponent(videoUrl)}`);
    const d = await r.json();
    return d.title ?? null;
  } catch { return null; }
}

async function postCookies(content: string): Promise<{ success: boolean; message: string }> {
  const r = await fetch('/api/translate/cookies', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookies: content }),
  });
  const d = await r.json();
  if (!r.ok) return { success: false, message: d.error || 'فشل الحفظ' };
  return { success: true, message: d.message };
}

async function deleteCookiesReq() {
  await fetch('/api/translate/cookies', { method: 'DELETE' });
}

// ─── Static data ──────────────────────────────────────────────────────────────
const TRANSLATION_ENGINES: { value: TranslationEngine; label: string; description: string; free: boolean }[] = [
  { value: 'google',       label: 'Google Translate', description: 'مجاني • سريع',                    free: true  },
  { value: 'pollinations', label: 'Pollinations AI',  description: 'مجاني • ذكاء اصطناعي',            free: true  },
  { value: 'groq',         label: 'Groq Llama 3.3',  description: 'مجاني • جودة عالية • يحتاج مفتاح', free: true  },
  { value: 'openai',       label: 'OpenAI GPT',       description: 'دقيق • يحتاج مفتاح',              free: false },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function Home() {
  const { toast } = useToast();
  const { url, setUrl, videoId, directVideoUrl, isValid } = useYoutubeUrl();

  // ── refs ──────────────────────────────────────────────────────────────────
  const ytRef               = useRef<any>(null);
  const videoRef            = useRef<HTMLVideoElement>(null);
  const audioRef            = useRef<HTMLAudioElement>(null);
  const preloadRef          = useRef<HTMLAudioElement>(null); // preloads next sentence
  const jobsRef             = useRef<Map<number, SegJob>>(new Map());
  const activeSegRef        = useRef<number>(-1);
  const stopRequestedRef    = useRef(false);
  const waitingRef          = useRef(false);
  const kickCountRef        = useRef<Map<number, number>>(new Map());
  const lastRetryRef        = useRef<Map<number, number>>(new Map());
  const stepRef             = useRef<number>(SEGMENT_STEP);
  const lastVideoTimeRef    = useRef<number>(-1);
  const lastSeekCheckRef    = useRef<number>(-1);
  const playingSegRef       = useRef<number>(-1);
  const currentSentIdxRef    = useRef<number>(-1);
  const audioLoadedForSent   = useRef<number>(-1);
  const videoSentIdxRef      = useRef<number>(-1);
  const pendingNextSentRef   = useRef<number>(-1);
  const currentSentTextRef   = useRef<string | null>(null);
  const navGraceRef          = useRef<number>(0);
  const pendingCanplayRef   = useRef<(() => void) | null>(null);
  const preloadTriggeredRef = useRef<string>(''); // tracks last preloaded URL
  const syncLoopRef         = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── state ─────────────────────────────────────────────────────────────────
  const [jobs,                setJobs]               = useState<Map<number, SegJob>>(new Map());
  const [activeSeg,           setActiveSeg]          = useState<number>(-1);
  const [processingProgress,  setProcessingProgress] = useState('');
  const [isRunning,           setIsRunning]          = useState(false);
  const [ytReady,             setYtReady]            = useState(false);
  const [duration,            setDuration]           = useState(0);
  const [selectedVoice,       setSelectedVoice]      = useState('');
  const [selectedEngine,      setSelectedEngine]     = useState<TranslationEngine>('google');
  const [hasStarted,          setHasStarted]         = useState(false);
  const [isWaitingForProcess, setIsWaitingForProcess]= useState(false);
  const [currentSentence,     setCurrentSentence]    = useState<string | null>(null);
  const [currentSentenceIdx,  setCurrentSentenceIdx] = useState<number>(-1);
  const [currentSpeedInfo,    setCurrentSpeedInfo]   = useState<{ orig: number; tts: number; ratio: number } | null>(null);
  const [videoTitle,          setVideoTitle]         = useState<string | null>(null);
  const [showCookies,         setShowCookies]        = useState(false);
  const [cookieText,          setCookieText]         = useState('');
  const [hasCookies,          setHasCookies]         = useState(false);
  const [cookiesSaving,       setCookiesSaving]      = useState(false);

  const { data: modelsData } = useGetTtsModels();

  useEffect(() => { fetchCookiesStatus().then(setHasCookies); }, []);

  useEffect(() => {
    if (modelsData?.voices?.length && !selectedVoice)
      setSelectedVoice(modelsData.voices[0].id);
  }, [modelsData, selectedVoice]);

  // ── Fetch video title when URL changes ────────────────────────────────────
  useEffect(() => {
    if (!isValid || !videoId) { setVideoTitle(null); return; }
    let cancelled = false;
    fetchVideoInfo(url).then(title => {
      if (!cancelled) setVideoTitle(title);
    });
    return () => { cancelled = true; };
  }, [url, isValid, videoId]);

  const activeJob = activeSeg >= 0 ? jobs.get(activeSeg) : undefined;

  const syncJobs = useCallback(() => setJobs(new Map(jobsRef.current)), []);

  // ── Cancel any pending canplay listener ──────────────────────────────────
  const cancelPendingLoad = useCallback(() => {
    const audio = audioRef.current;
    if (audio && pendingCanplayRef.current) {
      audio.removeEventListener('canplay', pendingCanplayRef.current);
      pendingCanplayRef.current = null;
    }
  }, []);

  // ── Preload next sentence into hidden preload element ─────────────────────
  // Called while current sentence is still playing so the audio file is
  // already buffered/cached when we actually need to play it → zero gap.
  const preloadSentenceAudio = useCallback((seg: number, sentIdx: number) => {
    const job  = jobsRef.current.get(seg);
    const sent = job?.sentences?.[sentIdx];
    if (!sent?.audioUrl || sent.sentenceStatus !== 'completed') return;
    const el = preloadRef.current;
    if (!el) return;
    const target = new URL(sent.audioUrl, window.location.href).href;
    if (preloadTriggeredRef.current === target) return; // already preloading
    preloadTriggeredRef.current = target;
    el.src = sent.audioUrl;
    el.preload = 'auto';
    el.load();
  }, []);

  // ── Load a sentence and play — checks preload cache for instant start ──────
  const loadSentenceAudio = useCallback((
    seg: number,
    sentIdx: number,
    audioUrl: string,
    startTime = 0,
  ) => {
    const audio = audioRef.current;
    if (!audio) return;

    cancelPendingLoad();
    playingSegRef.current      = seg;
    currentSentIdxRef.current  = sentIdx;
    audioLoadedForSent.current = sentIdx;
    setCurrentSentenceIdx(sentIdx);

    const job  = jobsRef.current.get(seg);
    const sent = job?.sentences?.[sentIdx];
    const txt  = sent?.arabicText ?? null;
    currentSentTextRef.current = txt;
    setCurrentSentence(txt);
    if (sent?.originalDuration && sent?.ttsDuration && sent?.speedRatio) {
      setCurrentSpeedInfo({ orig: sent.originalDuration, tts: sent.ttsDuration, ratio: sent.speedRatio });
    } else {
      setCurrentSpeedInfo(null);
    }

    const targetHref = new URL(audioUrl, window.location.href).href;

    // ── Case 1: same URL already in main player → seek & play instantly
    if (audio.src === targetHref && !audio.ended) {
      audio.currentTime = startTime;
      if (audio.paused) audio.play().catch(() => {});
      // Preload the sentence after this one
      preloadSentenceAudio(seg, sentIdx + 1);
      return;
    }

    // ── Case 2: this URL was preloaded → audio is already in HTTP cache,
    //    canplay fires almost immediately (browser reads from cache)
    const preloadEl = preloadRef.current;
    const preloadHref = preloadEl?.src ? new URL(preloadEl.src, window.location.href).href : '';
    const isPreloaded = preloadHref === targetHref && !!preloadEl &&
                        preloadEl.readyState >= 2; // HAVE_CURRENT_DATA or better

    if (isPreloaded) {
      // Copy preload element's buffered data by reassigning src — browser cache
      // means this is instant (readyState ≥ 2 already)
      audio.src = audioUrl;
      audio.currentTime = startTime;
      audio.play().catch(() => {});
      // Clear preload tracking so next sentence can be queued
      preloadTriggeredRef.current = '';
      preloadSentenceAudio(seg, sentIdx + 1);
      return;
    }

    // ── Case 3: not preloaded → load normally with canplay listener
    const onReady = () => {
      pendingCanplayRef.current = null;
      audio.currentTime = startTime;
      audio.play().catch(() => {});
    };
    pendingCanplayRef.current = onReady;
    audio.addEventListener('canplay', onReady, { once: true });
    audio.src = audioUrl;
    audio.load();

    // Still preload the one after
    preloadSentenceAudio(seg, sentIdx + 1);
  }, [cancelPendingLoad, preloadSentenceAudio]);

  // ── Jump to next / previous sentence ─────────────────────────────────────
  // Much simpler than before: just swap audio file + seek video + nav grace.
  // No correctDrift, no jumpGrace complex phases, no targetSentenceVideoTimeRef.
  const jumpToSentence = useCallback((delta: 1 | -1) => {
    const seg = playingSegRef.current;
    if (seg < 0) return;
    if (!ytRef.current && !videoRef.current) return;

    const job = jobsRef.current.get(seg);
    if (!job?.sentences || job.sentences.length === 0) return;

    const curIdx    = currentSentIdxRef.current;
    const targetIdx = curIdx + delta;
    if (targetIdx < 0 || targetIdx >= job.sentences.length) return;

    const target = job.sentences[targetIdx];
    if (!target?.audioUrl || target.sentenceStatus !== 'completed') return;

    loadSentenceAudio(seg, targetIdx, target.audioUrl, 0);
    navGraceRef.current = Date.now() + NAV_GRACE_MS;

    const seekTime = seg + target.videoStart;
    if (videoRef.current) videoRef.current.currentTime = seekTime;
    else ytRef.current?.seekTo(seekTime, true);

    // Reset seek detector so the jump doesn't trigger seek-reset logic
    lastSeekCheckRef.current = seekTime;
  }, [loadSentenceAudio]);

  // ── YouTube event handlers ─────────────────────────────────────────────────
  const handleYtReady = (e: any) => {
    ytRef.current = e.target;
    setYtReady(true);
    const dur = e.target.getDuration();
    if (dur > 0) setDuration(dur);
  };

  const handleYtStateChange = useCallback((e: any) => {
    const YT = (window as any).YT;
    if (!YT) return;
    if (e.data === YT.PlayerState.ENDED) {
      if (audioRef.current) audioRef.current.pause();
    } else if (e.data === YT.PlayerState.PAUSED) {
      if (audioRef.current && !audioRef.current.paused) audioRef.current.pause();
    } else if (e.data === YT.PlayerState.PLAYING) {
      const a = audioRef.current;
      if (a?.src && a.paused && !a.ended) a.play().catch(() => {});
    }
  }, []);

  // ── Audio-led sync (100ms loop + audio.ended handler) ─────────────────────
  //
  // DESIGN:
  //   • audio.ended is PRIMARY driver: each sentence plays fully, then loads next.
  //   • sync loop handles: initial trigger, display text, and "catch-up" when
  //     video jumps 2+ sentences ahead of audio cursor.
  //   • Per-sentence atempo is calculated in processor.ts — no global speed.
  //
  // This guarantees every sentence is read in full before advancing.
  const startSyncLoop = useCallback(() => {
    if (syncLoopRef.current) clearInterval(syncLoopRef.current);
    syncLoopRef.current = setInterval(() => {
      // Support both YouTube player and HTML5 video element
      const videoTime = videoRef.current
        ? videoRef.current.currentTime
        : (ytRef.current?.getCurrentTime?.() ?? 0);

      if (!ytRef.current && !videoRef.current) return;

      // ── Seek detection: reset audio when user jumps >3s ───────────────────
      const lastSC = lastSeekCheckRef.current;
      if (lastSC >= 0 && Math.abs(videoTime - lastSC) > 3.0) {
        const aud = audioRef.current;
        if (aud) { aud.pause(); aud.playbackRate = 1.0; }
        audioLoadedForSent.current  = -1;
        pendingNextSentRef.current  = -1;
        currentSentIdxRef.current   = -1;
        currentSentTextRef.current  = null;
        setCurrentSentenceIdx(-1);
        setCurrentSentence(null);
        setCurrentSpeedInfo(null);
        lastSeekCheckRef.current    = videoTime;
        lastVideoTimeRef.current    = videoTime;
        return;
      }
      lastSeekCheckRef.current = videoTime;

      const step      = stepRef.current;
      const seg       = getSegStart(videoTime, step);

      activeSegRef.current = seg;
      setActiveSeg(seg);

      const job = jobsRef.current.get(seg);
      if (!job?.sentences) { lastVideoTimeRef.current = videoTime; return; }

      const relTime     = Math.max(0, videoTime - seg);
      const sentenceIdx = job.sentences.findIndex(
        s => relTime >= s.videoStart && relTime < s.videoEnd
      );

      // Track video position for audio catch-up
      videoSentIdxRef.current = sentenceIdx;

      if (Date.now() < navGraceRef.current) {
        lastVideoTimeRef.current = videoTime;
        return;
      }

      const audio       = audioRef.current;
      const audioActive = !!(audio && !audio.paused && !audio.ended && audio.src);

      if (sentenceIdx >= 0) {
        const s       = job.sentences[sentenceIdx];
        const newText = s.arabicText || null;

        // ── Always keep display text current ──────────────────────────────
        const displayIdx = Math.max(sentenceIdx, audioLoadedForSent.current);
        if (displayIdx !== currentSentIdxRef.current) {
          currentSentIdxRef.current = displayIdx;
          setCurrentSentenceIdx(displayIdx);
        }
        if (newText && newText !== currentSentTextRef.current) {
          currentSentTextRef.current = newText;
          setCurrentSentence(newText);
        }

        const audioCursor = audioLoadedForSent.current;

        // ── Load pending sentence once it becomes ready ────────────────────
        // audio.ended set pendingNextSentRef when next sentence wasn't ready yet.
        const pending = pendingNextSentRef.current;
        if (pending >= 0 && !audioActive) {
          const pendingS = job.sentences[pending];
          if (pendingS?.audioUrl && pendingS.sentenceStatus === 'completed') {
            pendingNextSentRef.current = -1;
            loadSentenceAudio(seg, pending, pendingS.audioUrl, 0);
            lastVideoTimeRef.current = videoTime;
            return;
          }
          // Still not ready — but if video is 2+ ahead, give up and catch up
          if (sentenceIdx > pending + 1) {
            pendingNextSentRef.current = -1;
            // fall through to catch-up below
          } else {
            lastVideoTimeRef.current = videoTime;
            return; // keep waiting
          }
        }

        // ── Catch-up: video jumped 2+ sentences ahead of audio ────────────
        if (sentenceIdx > audioCursor + 1 && !audioActive) {
          if (s.audioUrl && s.sentenceStatus === 'completed') {
            loadSentenceAudio(seg, sentenceIdx, s.audioUrl, 0);
          }
          lastVideoTimeRef.current = videoTime;
          return;
        }

        // ── Initial start: nothing playing yet ────────────────────────────
        if (!audioActive && audioCursor < 0 && pending < 0) {
          if (s.audioUrl && s.sentenceStatus === 'completed') {
            loadSentenceAudio(seg, sentenceIdx, s.audioUrl, 0);
          }
        }

        // ── Resume if paused on same sentence (e.g., after buffering) ──────
        if (!audioActive && audioCursor === sentenceIdx) {
          const a = audioRef.current;
          if (a && a.src && !a.ended && a.paused) a.play().catch(() => {});
        }

        // ── Real-time playbackRate: keep audio in sync with video ──────────
        if (audioActive && audio) {
          const sentInfo = job.sentences[audioLoadedForSent.current];
          if (sentInfo) {
            const videoProgress = Math.max(0, (videoTime - seg) - sentInfo.videoStart);
            const audioProgress = audio.currentTime;
            const error = videoProgress - audioProgress;
            if (Math.abs(error) > 0.08) {
              const newRate = Math.max(0.65, Math.min(2.1, 1.0 + 0.5 * error));
              if (Math.abs((audio.playbackRate || 1.0) - newRate) > 0.04) {
                audio.playbackRate = newRate;
              }
            } else if (Math.abs((audio.playbackRate || 1.0) - 1.0) > 0.04) {
              audio.playbackRate = 1.0;
            }

            // ── Proactive preload: when < 0.8s left, fetch next sentence ──
            const timeLeft = (audio.duration || 0) - audio.currentTime;
            if (timeLeft > 0 && timeLeft < 0.8) {
              const nextIdx = audioLoadedForSent.current + 1;
              if (nextIdx < job.sentences.length) {
                preloadSentenceAudio(seg, nextIdx);
              } else {
                // Last sentence of this segment — preload first of next segment
                const nextSeg = seg + stepRef.current;
                const nextJob = jobsRef.current.get(nextSeg);
                if (nextJob?.sentences?.[0]?.sentenceStatus === 'completed') {
                  preloadSentenceAudio(nextSeg, 0);
                }
              }
            }
          }
        }

      } else {
        // Between sentences — pause audio and clear display
        if (currentSentIdxRef.current >= 0) {
          if (audio && !audio.paused) audio.pause();
          currentSentIdxRef.current  = -1;
          audioLoadedForSent.current = -1;
          pendingNextSentRef.current = -1;
          currentSentTextRef.current = null;
          setCurrentSentenceIdx(-1);
          setCurrentSentence(null);
          setCurrentSpeedInfo(null);
        }
      }

      lastVideoTimeRef.current = videoTime;
    }, 100);
  }, [loadSentenceAudio, preloadSentenceAudio]);

  const stopSyncLoop = useCallback(() => {
    if (syncLoopRef.current) { clearInterval(syncLoopRef.current); syncLoopRef.current = null; }
  }, []);

  // ── Poll a single job ─────────────────────────────────────────────────────
  const pollJob = useCallback(async (seg: number, jobId: string) => {
    while (true) {
      await new Promise(r => setTimeout(r, POLL_MS));
      try {
        const s = await fetchStatus(jobId);
        jobsRef.current.set(seg, {
          jobId,
          status:           s.status,
          progress:         s.progress,
          suggestedRate:    s.suggestedRate ?? null,
          audioDurationSec: s.audioDurationSec ?? null,
          sentences:        s.sentences ?? null,
        });
        syncJobs();
        if (seg === activeSegRef.current) setProcessingProgress(s.progress || '');
        if (s.status === 'completed' || s.status === 'failed') break;
      } catch { break; }
    }
  }, [syncJobs]);

  // ── Kick off a segment job ────────────────────────────────────────────────
  const startSegJob = useCallback(async (seg: number, force = false) => {
    const count = kickCountRef.current.get(seg) ?? 0;
    if (!force && count > 0) return;
    if (count >= MAX_RETRIES + 1) return;
    kickCountRef.current.set(seg, count + 1);
    lastRetryRef.current.set(seg, Date.now());
    jobsRef.current.set(seg, {
      jobId: '', status: 'processing',
      progress: '⏳ جاري التحضير...', suggestedRate: null, audioDurationSec: null, sentences: null,
    });
    syncJobs();
    try {
      const jobId = await postProcess(url, seg, selectedVoice, selectedEngine);
      const entry = jobsRef.current.get(seg);
      if (entry) { entry.jobId = jobId; jobsRef.current.set(seg, entry); }
      pollJob(seg, jobId);
    } catch {
      jobsRef.current.set(seg, {
        jobId: '', status: 'failed',
        progress: '❌ فشل الاتصال بالخادم', suggestedRate: null, audioDurationSec: null, sentences: null,
      });
      syncJobs();
    }
  }, [url, selectedVoice, selectedEngine, pollJob, syncJobs]);

  // ── Main translation loop ──────────────────────────────────────────────────
  const startTranslation = useCallback(async () => {
    if (!isValid || !selectedVoice) return;
    if (!ytRef.current && !videoRef.current) return;

    stopRequestedRef.current    = false;
    waitingRef.current          = false;
    lastVideoTimeRef.current    = -1;
    lastSeekCheckRef.current    = -1;
    playingSegRef.current       = -1;
    currentSentIdxRef.current   = -1;
    audioLoadedForSent.current  = -1;
    currentSentTextRef.current  = null;
    videoSentIdxRef.current     = -1;
    pendingNextSentRef.current  = -1;
    navGraceRef.current         = 0;
    jobsRef.current.clear();
    kickCountRef.current.clear();
    lastRetryRef.current.clear();
    syncJobs();

    setIsRunning(true);
    setHasStarted(true);
    setIsWaitingForProcess(false);
    setCurrentSentence(null);
    setCurrentSentenceIdx(-1);

    const getVT   = () => videoRef.current ? videoRef.current.currentTime : (ytRef.current?.getCurrentTime() ?? 0);
    const getDur  = () => videoRef.current ? (videoRef.current.duration || 0) : (ytRef.current?.getDuration() || 0);
    const pauseV  = () => { if (videoRef.current) videoRef.current.pause(); else ytRef.current?.pauseVideo(); };
    const playV   = () => { if (videoRef.current) videoRef.current.play().catch(() => {}); else ytRef.current?.playVideo(); };

    const dur  = getDur() || duration;
    const step = stepRef.current;

    startSyncLoop();

    const runLoop = async () => {
      while (!stopRequestedRef.current) {
        const videoTime = getVT();
        const seg       = getSegStart(videoTime, step);

        if (seg !== activeSegRef.current) {
          activeSegRef.current = seg;
          setActiveSeg(seg);
          setProcessingProgress('');
        }

        const currentJob = jobsRef.current.get(seg);
        if (!currentJob) {
          startSegJob(seg);
        } else if (currentJob.status === 'failed') {
          const count     = kickCountRef.current.get(seg) ?? 0;
          const lastRetry = lastRetryRef.current.get(seg) ?? 0;
          if (count <= MAX_RETRIES && Date.now() - lastRetry > 5000) startSegJob(seg, true);
        }

        // Pre-fetch next segment once current completes
        if (currentJob?.status === 'completed') {
          const nextSeg = seg + step;
          if (nextSeg < dur && !kickCountRef.current.has(nextSeg)) startSegJob(nextSeg);
          const nextNextSeg = seg + step * 2;
          if (nextNextSeg < dur && !kickCountRef.current.has(nextNextSeg)) startSegJob(nextNextSeg);
        }

        const freshJob = jobsRef.current.get(seg);

        if (!freshJob || freshJob.status === 'processing') {
          if (!waitingRef.current) {
            waitingRef.current = true;
            setIsWaitingForProcess(true);
            pauseV();
            if (audioRef.current) audioRef.current.pause();
          }
          if (freshJob?.progress) setProcessingProgress(freshJob.progress);

        } else if (freshJob.status === 'completed') {
          if (waitingRef.current) {
            waitingRef.current = false;
            setIsWaitingForProcess(false);
            playV();
          }
          // Sync loop handles audio switching — no need to load audio here
        } else if (freshJob.status === 'failed') {
          if (waitingRef.current && (kickCountRef.current.get(seg) ?? 0) > MAX_RETRIES) {
            waitingRef.current = false;
            setIsWaitingForProcess(false);
            playV();
          }
        }

        await new Promise(r => setTimeout(r, 250));
      }

      stopSyncLoop();
      setIsRunning(false);
      setIsWaitingForProcess(false);
      waitingRef.current = false;
      setCurrentSentence(null);
      setCurrentSentenceIdx(-1);
    };

    runLoop();
  }, [isValid, selectedVoice, selectedEngine, url, duration, syncJobs, startSegJob, startSyncLoop, stopSyncLoop]);

  const stopTranslation = useCallback(() => {
    stopRequestedRef.current   = true;
    waitingRef.current         = false;
    stopSyncLoop();
    setIsRunning(false);
    setIsWaitingForProcess(false);
    setCurrentSentence(null);
    setCurrentSentenceIdx(-1);
    if (videoRef.current) videoRef.current.pause();
    else if (ytRef.current) ytRef.current.pauseVideo();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.playbackRate = 1.0; audioRef.current.src = ''; }
    if (preloadRef.current) { preloadRef.current.src = ''; }
    preloadTriggeredRef.current = '';
    activeSegRef.current        = -1;
    playingSegRef.current       = -1;
    currentSentIdxRef.current   = -1;
    audioLoadedForSent.current  = -1;
    currentSentTextRef.current  = null;
    videoSentIdxRef.current     = -1;
    pendingNextSentRef.current  = -1;
    lastSeekCheckRef.current    = -1;
    setActiveSeg(-1);
    setCurrentSpeedInfo(null);
  }, [stopSyncLoop]);

  useEffect(() => () => stopSyncLoop(), [stopSyncLoop]);

  // ── HTML5 video event handlers ─────────────────────────────────────────────
  // Reset seek detector when the user seeks in the HTML5 player
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    const onSeeked = () => {
      // Let the sync loop handle the rest; just reset the seek check baseline
      lastSeekCheckRef.current = vid.currentTime;
    };

    vid.addEventListener('seeked', onSeeked);
    return () => vid.removeEventListener('seeked', onSeeked);
  }, [directVideoUrl]); // re-attach when URL changes

  // ── audio.ended — PRIMARY sentence advancement driver ─────────────────────
  // When a sentence's audio finishes, immediately load the next one.
  // If video has jumped 2+ sentences ahead, snap to video position instead.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onEnded = () => {
      const seg     = playingSegRef.current;
      const curIdx  = audioLoadedForSent.current;
      if (seg < 0 || curIdx < 0) return;

      const job = jobsRef.current.get(seg);
      if (!job?.sentences) return;

      // Determine next sentence index
      // If video is significantly ahead, snap to it; otherwise advance by 1
      const videoIdx = videoSentIdxRef.current;
      const nextIdx  = videoIdx > curIdx + 1 ? videoIdx : curIdx + 1;

      if (nextIdx < job.sentences.length) {
        const next = job.sentences[nextIdx];
        if (next?.audioUrl && next.sentenceStatus === 'completed') {
          loadSentenceAudio(seg, nextIdx, next.audioUrl, 0);
          // Eagerly preload the sentence after next (N+2)
          preloadSentenceAudio(seg, nextIdx + 1);
        } else {
          pendingNextSentRef.current = nextIdx;
          if (next?.arabicText && next.arabicText !== currentSentTextRef.current) {
            currentSentTextRef.current = next.arabicText;
            setCurrentSentence(next.arabicText);
          }
        }
        return;
      }

      // Last sentence of segment — try first sentence of next segment
      const step    = stepRef.current;
      const nextSeg = seg + step;
      const nextJob = jobsRef.current.get(nextSeg);
      if (nextJob?.sentences?.length) {
        const first = nextJob.sentences[0];
        if (first?.audioUrl && first.sentenceStatus === 'completed') {
          loadSentenceAudio(nextSeg, 0, first.audioUrl, 0);
          preloadSentenceAudio(nextSeg, 1); // preload 2nd sentence of next segment
        } else {
          pendingNextSentRef.current = 0;
        }
      }
    };

    audio.addEventListener('ended', onEnded);
    return () => audio.removeEventListener('ended', onEnded);
  }, [loadSentenceAudio, preloadSentenceAudio]);

  const handleSaveCookies = async () => {
    if (!cookieText.trim()) return;
    setCookiesSaving(true);
    const result = await postCookies(cookieText.trim());
    setCookiesSaving(false);
    if (result.success) {
      toast({ title: result.message });
      setHasCookies(true); setCookieText('');
    } else {
      toast({ title: 'خطأ', description: result.message, variant: 'destructive' });
    }
  };

  const handleDeleteCookies = async () => {
    await deleteCookiesReq();
    setHasCookies(false);
    toast({ title: 'تم حذف الكوكيز' });
  };

  // ── Segment sentence summary (for status display) ──────────────────────────
  const getSentenceSummary = (job: SegJob) => {
    if (!job.sentences) return null;
    const total     = job.sentences.length;
    const completed = job.sentences.filter(s => s.sentenceStatus === 'completed').length;
    return { total, completed };
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 flex flex-col items-center" dir="rtl">
      <div className="w-full max-w-2xl space-y-4">

        {/* Header */}
        <div className="text-center pt-4 pb-2">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Youtube className="w-6 h-6 text-red-500" />
            <h1 className="text-2xl font-bold text-white">مترجم الفيديو</h1>
          </div>
          <p className="text-slate-400 text-sm">ترجمة فورية لمقاطع يوتيوب إلى العربية</p>
        </div>

        {/* Settings Card */}
        <Card className="bg-slate-900/50 border-slate-800/60 p-4 space-y-4">

          {/* URL */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              {videoId ? <Youtube className="w-3.5 h-3.5 text-red-400" /> : <Video className="w-3.5 h-3.5 text-blue-400" />}
              رابط الفيديو
            </label>
            <Input
              placeholder="https://youtube.com/watch?v=... أو رابط مباشر (mp4، pixeldrain...)"
              value={url}
              onChange={e => setUrl(e.target.value)}
              className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500 text-left"
              dir="ltr"
            />
            <AnimatePresence>
              {videoTitle && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-start gap-2 bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-700/40"
                >
                  <Youtube className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                  <span className="text-xs text-slate-300 leading-relaxed line-clamp-2">{videoTitle}</span>
                </motion.div>
              )}
              {directVideoUrl && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-start gap-2 bg-blue-900/20 rounded-lg px-3 py-2 border border-blue-700/40"
                >
                  <Video className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                  <span className="text-xs text-blue-300 leading-relaxed break-all">{directVideoUrl}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Pipeline info */}
          <div className="flex items-center gap-2 bg-slate-800/40 rounded-lg px-3 py-2 border border-slate-700/30">
            <Mic className="w-4 h-4 text-violet-400 shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-medium text-slate-300">معالجة متوازية جملة بجملة</p>
              <p className="text-[11px] text-slate-500">Whisper → كل جملة تُعالج باستقلالية وتوازي → ملف صوتي خاص لكل جملة</p>
            </div>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full shrink-0">مجاني</span>
          </div>

          {/* Translation Engine */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              محرك الترجمة
            </label>
            <div className="grid grid-cols-3 gap-2">
              {TRANSLATION_ENGINES.map(engine => (
                <button
                  key={engine.value}
                  onClick={() => setSelectedEngine(engine.value)}
                  className={`relative p-2.5 rounded-lg border text-right transition-all ${
                    selectedEngine === engine.value
                      ? 'border-violet-500 bg-violet-500/10 text-violet-200'
                      : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {engine.free && (
                    <span className="absolute top-1.5 left-1.5 text-[9px] bg-emerald-500/20 text-emerald-400 px-1 py-0.5 rounded-full">مجاني</span>
                  )}
                  <div className="font-semibold text-xs mb-0.5">{engine.label}</div>
                  <div className="text-[10px] opacity-60">{engine.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Voice */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-medium">الصوت العربي</label>
            <Select value={selectedVoice} onValueChange={setSelectedVoice}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100">
                <SelectValue placeholder="اختر الصوت..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {modelsData?.voices?.map(v => (
                  <SelectItem key={v.id} value={v.id} className="text-slate-100 focus:bg-slate-700">
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

        </Card>

        {/* Video Player (YouTube or HTML5) */}
        {isValid && (
          <Card className="bg-slate-900/50 border-slate-800/60 overflow-hidden">
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              <div className="absolute inset-0">
                {videoId ? (
                  /* ── YouTube player ── */
                  <YouTube
                    videoId={videoId}
                    onReady={handleYtReady}
                    onStateChange={handleYtStateChange}
                    opts={{
                      width: '100%',
                      height: '100%',
                      playerVars: { autoplay: 0, controls: 1, rel: 0, playsinline: 1, fs: 1 },
                    }}
                    className="w-full h-full"
                  />
                ) : directVideoUrl ? (
                  /* ── HTML5 direct video player ── */
                  <video
                    ref={videoRef}
                    src={directVideoUrl}
                    controls
                    controlsList="nodownload"
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-contain bg-black"
                    style={{ outline: 'none' }}
                  />
                ) : null}
              </div>

              {/* Fullscreen button */}
              {directVideoUrl && (
                <button
                  onClick={() => videoRef.current?.requestFullscreen?.()}
                  className="absolute bottom-2 left-2 z-20 p-1.5 rounded-md bg-black/60 hover:bg-black/80 text-white transition-colors"
                  title="ملء الشاشة"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              )}

              {/* Waiting overlay */}
              <AnimatePresence>
                {isWaitingForProcess && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-10"
                  >
                    <div className="flex flex-col items-center gap-3 text-center px-6">
                      <div className="relative">
                        <div className="w-14 h-14 rounded-full border-4 border-violet-500/30 border-t-violet-500 animate-spin" />
                        <Volume2 className="w-5 h-5 text-violet-400 absolute inset-0 m-auto" />
                      </div>
                      <div>
                        <p className="text-white font-semibold text-base">جاري معالجة الجمل</p>
                        <p className="text-slate-300 text-sm mt-1">{processingProgress || 'يتم تحضير الترجمة العربية...'}</p>
                        <p className="text-slate-500 text-xs mt-1">سيبدأ الفيديو تلقائياً بعد الانتهاء</p>
                      </div>
                      <div className="flex gap-1.5">
                        {[0, 1, 2].map(i => (
                          <motion.div key={i} className="w-2 h-2 rounded-full bg-violet-500"
                            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Card>
        )}

        <audio ref={audioRef} className="hidden" />
        <audio ref={preloadRef} className="hidden" preload="auto" />

        {/* Current Sentence Display — instant transitions, no animation flash */}
        {isRunning && (
          <Card className="bg-slate-900/60 border-slate-700/60 p-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 mt-0.5">
                <div className="w-7 h-7 rounded-full bg-violet-500/20 border border-violet-500/40 flex items-center justify-center">
                  <BookOpen className="w-3.5 h-3.5 text-violet-400" />
                </div>
              </div>
              <div className="flex-1 min-h-[2.5rem] flex items-center">
                {currentSentence ? (
                  <p className="text-white text-base leading-relaxed font-medium text-right w-full">
                    {currentSentence}
                  </p>
                ) : (
                  <p className="text-slate-500 text-sm text-right w-full">
                    {isWaitingForProcess ? processingProgress || 'جاري التحضير...' : 'في انتظار بدء الكلام...'}
                  </p>
                )}
              </div>
            </div>

            {/* Speed comparison bar */}
            {currentSpeedInfo && (
              <div className="mt-3 pt-3 border-t border-slate-700/40">
                <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-1.5">
                  <Clock className="w-3 h-3 text-violet-400 shrink-0" />
                  <span>مقارنة السرعة</span>
                  <span className={`mr-auto font-mono px-1.5 py-0.5 rounded text-[10px] ${
                    currentSpeedInfo.ratio >= 1.8 ? 'bg-red-500/20 text-red-300' :
                    currentSpeedInfo.ratio >= 1.4 ? 'bg-amber-500/20 text-amber-300' :
                    'bg-emerald-500/20 text-emerald-300'
                  }`}>
                    ×{currentSpeedInfo.ratio.toFixed(2)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="bg-slate-800/60 rounded px-2 py-1.5 flex justify-between">
                    <span className="text-slate-500">🎤 أصلي</span>
                    <span className="text-slate-300 font-mono">{currentSpeedInfo.orig.toFixed(2)}ث</span>
                  </div>
                  <div className="bg-slate-800/60 rounded px-2 py-1.5 flex justify-between">
                    <span className="text-slate-500">🔊 TTS</span>
                    <span className="text-slate-300 font-mono">{currentSpeedInfo.tts.toFixed(2)}ث</span>
                  </div>
                </div>
                {/* Visual speed bar */}
                <div className="mt-1.5 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      currentSpeedInfo.ratio >= 1.8 ? 'bg-red-500' :
                      currentSpeedInfo.ratio >= 1.4 ? 'bg-amber-500' :
                      'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, ((currentSpeedInfo.ratio - 1.0) / 1.1) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-slate-600 mt-0.5 font-mono">
                  <span>1.0×</span>
                  <span>1.5×</span>
                  <span>2.1×</span>
                </div>
              </div>
            )}

            {/* Sentence navigation */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/50">
              <button
                onClick={() => jumpToSentence(-1)}
                disabled={currentSentenceIdx <= 0}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-violet-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1 rounded-md hover:bg-slate-800/60"
              >
                <SkipBack className="w-3.5 h-3.5" />
                السابقة
              </button>
              <span className="text-xs text-slate-600 font-mono">
                {currentSentenceIdx >= 0
                  ? `${currentSentenceIdx + 1} / ${jobs.get(playingSegRef.current)?.sentences?.length ?? '?'}`
                  : '—'}
              </span>
              <button
                onClick={() => jumpToSentence(1)}
                disabled={(() => {
                  const job = jobs.get(playingSegRef.current);
                  return !job?.sentences || currentSentenceIdx >= job.sentences.length - 1;
                })()}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-violet-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1 rounded-md hover:bg-slate-800/60"
              >
                التالية
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            </div>
          </Card>
        )}

        {/* Control Button */}
        {isValid && (ytReady || !!directVideoUrl) && (
          <div className="flex gap-3">
            {!isRunning ? (
              <Button
                onClick={startTranslation}
                disabled={!selectedVoice}
                className="flex-1 bg-violet-600 hover:bg-violet-500 text-white gap-2 h-11"
              >
                <Play className="w-4 h-4" />
                شغّل مع الترجمة العربية
                <span className="text-xs opacity-60">
                  ({TRANSLATION_ENGINES.find(e => e.value === selectedEngine)?.label})
                </span>
              </Button>
            ) : (
              <Button onClick={stopTranslation} variant="destructive" className="flex-1 gap-2 h-11">
                <Square className="w-4 h-4" />
                إيقاف الترجمة
              </Button>
            )}
          </div>
        )}

        {/* Pipeline Bar */}
        {hasStarted && activeSeg >= 0 && (
          <PipelineBar
            isVisible={isRunning}
            progressText={processingProgress}
            segmentLabel={activeJob ? segLabel(activeSeg) : ''}
            done={activeJob?.status === 'completed'}
          />
        )}

        {/* Segments status — shows per-sentence progress */}
        {hasStarted && jobs.size > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              حالة المقاطع
            </p>
            <div className="space-y-2">
              {[...jobs.entries()].sort((a, b) => a[0] - b[0]).map(([seg, job]) => {
                const summary = getSentenceSummary(job);
                const isActive = activeSeg === seg;
                return (
                  <div
                    key={seg}
                    className={`rounded-lg border p-2.5 transition-all ${
                      isActive
                        ? 'bg-violet-500/10 border-violet-500/30'
                        : job.status === 'completed'
                        ? 'bg-emerald-500/5 border-emerald-500/15'
                        : job.status === 'failed'
                        ? 'bg-red-500/5 border-red-500/15'
                        : 'bg-slate-800/50 border-slate-700/50'
                    }`}
                  >
                    {/* Segment header */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        {job.status === 'completed'
                          ? <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          : job.status === 'processing'
                          ? <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
                          : <span className="w-3 h-3 text-red-400 text-xs">✕</span>}
                        <span className={`text-xs font-medium ${isActive ? 'text-violet-300' : 'text-slate-400'}`}>
                          {segLabel(seg)}
                        </span>
                      </div>
                      {summary && (
                        <span className="text-[10px] text-slate-500 font-mono">
                          {summary.completed}/{summary.total} جملة
                        </span>
                      )}
                    </div>

                    {/* Per-sentence status dots */}
                    {job.sentences && job.sentences.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {job.sentences.map((s, i) => (
                          <div
                            key={i}
                            title={s.arabicText || `جملة ${i + 1}`}
                            className={`w-5 h-5 rounded text-[9px] flex items-center justify-center border transition-all ${
                              s.sentenceStatus === 'completed'
                                ? (currentSentenceIdx === i && playingSegRef.current === seg)
                                  ? 'bg-violet-500/30 border-violet-400 text-violet-200'
                                  : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                                : s.sentenceStatus === 'failed'
                                ? 'bg-red-500/20 border-red-500/30 text-red-400'
                                : s.sentenceStatus === 'tts' || s.sentenceStatus === 'translating'
                                ? 'bg-amber-500/20 border-amber-500/30 text-amber-400 animate-pulse'
                                : 'bg-slate-700/50 border-slate-600/50 text-slate-500'
                            }`}
                          >
                            {statusLabel(s.sentenceStatus)}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Progress text while processing */}
                    {job.status === 'processing' && isActive && job.progress && (
                      <p className="text-[10px] text-slate-500 mt-1.5">{job.progress}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Cookies */}
        <div className="border border-slate-800 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowCookies(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-slate-400 hover:text-slate-300 hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Cookie className="w-4 h-4" />
              <span>كوكيز يوتيوب</span>
              {hasCookies && (
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">
                  محفوظة ✓
                </span>
              )}
            </div>
            {showCookies ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showCookies && (
            <div className="px-4 pb-4 space-y-3 border-t border-slate-800">
              <p className="text-xs text-slate-500 mt-3">
                إذا طلب يوتيوب تسجيل الدخول، أضف كوكيز المتصفح هنا (Netscape format).
              </p>
              {hasCookies ? (
                <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                  <span className="text-xs text-emerald-400">✅ كوكيز محفوظة وجاهزة</span>
                  <Button
                    size="sm" variant="ghost"
                    onClick={handleDeleteCookies}
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    حذف
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    value={cookieText}
                    onChange={e => setCookieText(e.target.value)}
                    placeholder={"# Netscape HTTP Cookie File\n.youtube.com  TRUE  /  ..."}
                    className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-600 font-mono text-xs h-24 resize-none"
                    dir="ltr"
                  />
                  <Button
                    onClick={handleSaveCookies}
                    disabled={cookiesSaving || !cookieText.trim()}
                    size="sm"
                    className="w-full bg-violet-600 hover:bg-violet-500"
                  >
                    {cookiesSaving ? <Loader2 className="w-3 h-3 animate-spin ml-1" /> : null}
                    حفظ الكوكيز
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
