import React, { useState, useRef, useEffect, useCallback } from 'react';
import YouTube from 'react-youtube';
import {
  Play, Square, Youtube, Volume2, VolumeX, Loader2, CheckCircle2,
  Cookie, ChevronDown, ChevronUp, Trash2, Globe, BookOpen,
  SkipBack, SkipForward, Clock, Mic, Maximize2, Video,
  MessageCircle, Send, X, Bot, User,
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
const SEGMENT_STEP  = 59;
const POLL_MS       = 600;
const MAX_RETRIES   = 2;
const NAV_GRACE_MS  = 1500;

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
  videoSlowRatio?:  number;
}

interface SegJob {
  jobId:            string;
  status:           'processing' | 'completed' | 'failed';
  progress:         string;
  suggestedRate:    number | null;
  audioDurationSec: number | null;
  sentences:        StoredSentence[] | null;
}

interface AiMessage {
  role: 'user' | 'assistant';
  text: string;
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
  translationEngine: TranslationEngine,
  sourceLanguage?: string,
): Promise<string> {
  const r = await fetch('/api/translate/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoUrl, startTime, voice, translationEngine, forceAudioExtraction: true,
      ...(sourceLanguage ? { sourceLanguage } : {}),
    }),
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

// ─── Whisper supported languages ──────────────────────────────────────────────
const WHISPER_LANGUAGES: { code: string; name: string; nameAr: string }[] = [
  { code: 'af', name: 'Afrikaans',    nameAr: 'الأفريكانية' },
  { code: 'am', name: 'Amharic',      nameAr: 'الأمهرية' },
  { code: 'ar', name: 'Arabic',       nameAr: 'العربية' },
  { code: 'as', name: 'Assamese',     nameAr: 'الأسامية' },
  { code: 'az', name: 'Azerbaijani',  nameAr: 'الأذربيجانية' },
  { code: 'ba', name: 'Bashkir',      nameAr: 'الباشكيرية' },
  { code: 'be', name: 'Belarusian',   nameAr: 'البيلاروسية' },
  { code: 'bg', name: 'Bulgarian',    nameAr: 'البلغارية' },
  { code: 'bn', name: 'Bengali',      nameAr: 'البنغالية' },
  { code: 'bo', name: 'Tibetan',      nameAr: 'التبتية' },
  { code: 'br', name: 'Breton',       nameAr: 'البريتانية' },
  { code: 'bs', name: 'Bosnian',      nameAr: 'البوسنية' },
  { code: 'ca', name: 'Catalan',      nameAr: 'الكتالانية' },
  { code: 'cs', name: 'Czech',        nameAr: 'التشيكية' },
  { code: 'cy', name: 'Welsh',        nameAr: 'الويلزية' },
  { code: 'da', name: 'Danish',       nameAr: 'الدنماركية' },
  { code: 'de', name: 'German',       nameAr: 'الألمانية' },
  { code: 'el', name: 'Greek',        nameAr: 'اليونانية' },
  { code: 'en', name: 'English',      nameAr: 'الإنجليزية' },
  { code: 'es', name: 'Spanish',      nameAr: 'الإسبانية' },
  { code: 'et', name: 'Estonian',     nameAr: 'الإستونية' },
  { code: 'eu', name: 'Basque',       nameAr: 'الباسكية' },
  { code: 'fa', name: 'Persian',      nameAr: 'الفارسية' },
  { code: 'fi', name: 'Finnish',      nameAr: 'الفنلندية' },
  { code: 'fo', name: 'Faroese',      nameAr: 'الفاروية' },
  { code: 'fr', name: 'French',       nameAr: 'الفرنسية' },
  { code: 'gl', name: 'Galician',     nameAr: 'الغاليسية' },
  { code: 'gu', name: 'Gujarati',     nameAr: 'الغوجاراتية' },
  { code: 'ha', name: 'Hausa',        nameAr: 'الهوسا' },
  { code: 'haw', name: 'Hawaiian',    nameAr: 'الهاوايية' },
  { code: 'he', name: 'Hebrew',       nameAr: 'العبرية' },
  { code: 'hi', name: 'Hindi',        nameAr: 'الهندية' },
  { code: 'hr', name: 'Croatian',     nameAr: 'الكرواتية' },
  { code: 'ht', name: 'Haitian Creole', nameAr: 'الكريولية الهايتية' },
  { code: 'hu', name: 'Hungarian',    nameAr: 'الهنغارية' },
  { code: 'hy', name: 'Armenian',     nameAr: 'الأرمنية' },
  { code: 'id', name: 'Indonesian',   nameAr: 'الإندونيسية' },
  { code: 'is', name: 'Icelandic',    nameAr: 'الأيسلندية' },
  { code: 'it', name: 'Italian',      nameAr: 'الإيطالية' },
  { code: 'ja', name: 'Japanese',     nameAr: 'اليابانية' },
  { code: 'jw', name: 'Javanese',     nameAr: 'الجاوية' },
  { code: 'ka', name: 'Georgian',     nameAr: 'الجورجية' },
  { code: 'kk', name: 'Kazakh',       nameAr: 'الكازاخية' },
  { code: 'km', name: 'Khmer',        nameAr: 'الخميرية' },
  { code: 'kn', name: 'Kannada',      nameAr: 'الكانادا' },
  { code: 'ko', name: 'Korean',       nameAr: 'الكورية' },
  { code: 'la', name: 'Latin',        nameAr: 'اللاتينية' },
  { code: 'lb', name: 'Luxembourgish', nameAr: 'اللوكسمبورغية' },
  { code: 'ln', name: 'Lingala',      nameAr: 'اللينغالا' },
  { code: 'lo', name: 'Lao',          nameAr: 'اللاوية' },
  { code: 'lt', name: 'Lithuanian',   nameAr: 'الليتوانية' },
  { code: 'lv', name: 'Latvian',      nameAr: 'اللاتفية' },
  { code: 'mg', name: 'Malagasy',     nameAr: 'الملغاشية' },
  { code: 'mi', name: 'Maori',        nameAr: 'الماورية' },
  { code: 'mk', name: 'Macedonian',   nameAr: 'المقدونية' },
  { code: 'ml', name: 'Malayalam',    nameAr: 'المالايالامية' },
  { code: 'mn', name: 'Mongolian',    nameAr: 'المنغولية' },
  { code: 'mr', name: 'Marathi',      nameAr: 'الماراثية' },
  { code: 'ms', name: 'Malay',        nameAr: 'الملايوية' },
  { code: 'mt', name: 'Maltese',      nameAr: 'المالطية' },
  { code: 'my', name: 'Myanmar',      nameAr: 'البورمية' },
  { code: 'ne', name: 'Nepali',       nameAr: 'النيبالية' },
  { code: 'nl', name: 'Dutch',        nameAr: 'الهولندية' },
  { code: 'nn', name: 'Norwegian Nynorsk', nameAr: 'النرويجية نينورسك' },
  { code: 'no', name: 'Norwegian',    nameAr: 'النرويجية' },
  { code: 'oc', name: 'Occitan',      nameAr: 'الأوكسيتانية' },
  { code: 'pa', name: 'Punjabi',      nameAr: 'البنجابية' },
  { code: 'pl', name: 'Polish',       nameAr: 'البولندية' },
  { code: 'ps', name: 'Pashto',       nameAr: 'البشتونية' },
  { code: 'pt', name: 'Portuguese',   nameAr: 'البرتغالية' },
  { code: 'ro', name: 'Romanian',     nameAr: 'الرومانية' },
  { code: 'ru', name: 'Russian',      nameAr: 'الروسية' },
  { code: 'sa', name: 'Sanskrit',     nameAr: 'السنسكريتية' },
  { code: 'sd', name: 'Sindhi',       nameAr: 'السندية' },
  { code: 'si', name: 'Sinhala',      nameAr: 'السنهالية' },
  { code: 'sk', name: 'Slovak',       nameAr: 'السلوفاكية' },
  { code: 'sl', name: 'Slovenian',    nameAr: 'السلوفينية' },
  { code: 'sn', name: 'Shona',        nameAr: 'الشونا' },
  { code: 'so', name: 'Somali',       nameAr: 'الصومالية' },
  { code: 'sq', name: 'Albanian',     nameAr: 'الألبانية' },
  { code: 'sr', name: 'Serbian',      nameAr: 'الصربية' },
  { code: 'su', name: 'Sundanese',    nameAr: 'السوندانية' },
  { code: 'sv', name: 'Swedish',      nameAr: 'السويدية' },
  { code: 'sw', name: 'Swahili',      nameAr: 'السواحيلية' },
  { code: 'ta', name: 'Tamil',        nameAr: 'التاميلية' },
  { code: 'te', name: 'Telugu',       nameAr: 'التيلوغو' },
  { code: 'tg', name: 'Tajik',        nameAr: 'الطاجيكية' },
  { code: 'th', name: 'Thai',         nameAr: 'التايلاندية' },
  { code: 'tk', name: 'Turkmen',      nameAr: 'التركمانية' },
  { code: 'tl', name: 'Tagalog',      nameAr: 'التاغالوغية' },
  { code: 'tr', name: 'Turkish',      nameAr: 'التركية' },
  { code: 'tt', name: 'Tatar',        nameAr: 'التترية' },
  { code: 'uk', name: 'Ukrainian',    nameAr: 'الأوكرانية' },
  { code: 'ur', name: 'Urdu',         nameAr: 'الأردية' },
  { code: 'uz', name: 'Uzbek',        nameAr: 'الأوزبكية' },
  { code: 'vi', name: 'Vietnamese',   nameAr: 'الفيتنامية' },
  { code: 'yi', name: 'Yiddish',      nameAr: 'اليديشية' },
  { code: 'yo', name: 'Yoruba',       nameAr: 'اليوروبا' },
  { code: 'zh', name: 'Chinese',      nameAr: 'الصينية' },
  { code: 'zu', name: 'Zulu',         nameAr: 'الزولو' },
];

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
  const preloadRef          = useRef<HTMLAudioElement>(null);
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
  const preloadTriggeredRef = useRef<string>('');
  const syncLoopRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRateRef        = useRef<number>(1.0);
  const autoMutedRef        = useRef(false);   // tracks if we muted the video
  const aiChatBottomRef     = useRef<HTMLDivElement>(null);

  // ── state ─────────────────────────────────────────────────────────────────
  const [jobs,                setJobs]               = useState<Map<number, SegJob>>(new Map());
  const [activeSeg,           setActiveSeg]          = useState<number>(-1);
  const [processingProgress,  setProcessingProgress] = useState('');
  const [isRunning,           setIsRunning]          = useState(false);
  const [ytReady,             setYtReady]            = useState(false);
  const [duration,            setDuration]           = useState(0);
  const [selectedVoice,       setSelectedVoice]      = useState('');
  const [selectedEngine,      setSelectedEngine]     = useState<TranslationEngine>('google');
  const [selectedLanguage,    setSelectedLanguage]   = useState('');
  const [langSearch,          setLangSearch]         = useState('');
  const [showLangDropdown,    setShowLangDropdown]   = useState(false);
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
  const [muteOriginal,        setMuteOriginal]       = useState(true);  // كتم الصوت الأصلي

  // ── AI chat state ─────────────────────────────────────────────────────────
  const [showAiPanel,   setShowAiPanel]   = useState(false);
  const [aiMessages,    setAiMessages]    = useState<AiMessage[]>([]);
  const [aiInput,       setAiInput]       = useState('');
  const [aiLoading,     setAiLoading]     = useState(false);

  const { data: modelsData } = useGetTtsModels();

  useEffect(() => { fetchCookiesStatus().then(setHasCookies); }, []);

  useEffect(() => {
    if (modelsData?.voices?.length && !selectedVoice)
      setSelectedVoice(modelsData.voices[0].id);
  }, [modelsData, selectedVoice]);

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

  // ── Mute / unmute original video ─────────────────────────────────────────
  const muteVideo = useCallback(() => {
    if (videoRef.current) videoRef.current.muted = true;
    else { try { ytRef.current?.mute?.(); } catch {} }
    autoMutedRef.current = true;
  }, []);

  const unmuteVideo = useCallback(() => {
    if (videoRef.current) videoRef.current.muted = false;
    else { try { ytRef.current?.unMute?.(); } catch {} }
    autoMutedRef.current = false;
  }, []);

  // Keep mute in sync with toggle while running
  useEffect(() => {
    if (!isRunning) return;
    if (muteOriginal) muteVideo(); else unmuteVideo();
  }, [muteOriginal, isRunning, muteVideo, unmuteVideo]);

  // ── Cancel any pending canplay listener ───────────────────────────────────
  const cancelPendingLoad = useCallback(() => {
    const audio = audioRef.current;
    if (audio && pendingCanplayRef.current) {
      audio.removeEventListener('canplay', pendingCanplayRef.current);
      pendingCanplayRef.current = null;
    }
  }, []);

  // ── Preload next sentence ─────────────────────────────────────────────────
  const preloadSentenceAudio = useCallback((seg: number, sentIdx: number) => {
    const job  = jobsRef.current.get(seg);
    const sent = job?.sentences?.[sentIdx];
    if (!sent?.audioUrl || sent.sentenceStatus !== 'completed') return;
    const el = preloadRef.current;
    if (!el) return;
    const target = new URL(sent.audioUrl, window.location.href).href;
    if (preloadTriggeredRef.current === target) return;
    preloadTriggeredRef.current = target;
    el.src = sent.audioUrl;
    el.preload = 'auto';
    el.load();
  }, []);

  // ── Apply video playback rate ─────────────────────────────────────────────
  const applyVideoRate = useCallback((rate: number) => {
    const clamped = Math.max(0.25, Math.min(2.0, rate));
    if (Math.abs(videoRateRef.current - clamped) < 0.01) return;
    videoRateRef.current = clamped;
    if (videoRef.current) {
      videoRef.current.playbackRate = clamped;
    } else if (ytRef.current?.setPlaybackRate) {
      const ytRates = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5];
      const nearest = ytRates.reduce((a, b) =>
        Math.abs(b - clamped) < Math.abs(a - clamped) ? b : a
      );
      try { ytRef.current.setPlaybackRate(nearest); } catch {}
    }
  }, []);

  // ── Load & play a sentence audio (with offset for mid-sentence entry) ─────
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

    // Case 1: same URL already loaded → seek & play
    if (audio.src === targetHref && !audio.ended) {
      if (startTime > 0) audio.currentTime = startTime;
      if (audio.paused) audio.play().catch(() => {});
      preloadSentenceAudio(seg, sentIdx + 1);
      return;
    }

    // Case 2: preloaded → instant start
    const preloadEl = preloadRef.current;
    const preloadHref = preloadEl?.src ? new URL(preloadEl.src, window.location.href).href : '';
    const isPreloaded = preloadHref === targetHref && !!preloadEl && preloadEl.readyState >= 2;

    if (isPreloaded) {
      audio.src = audioUrl;
      audio.currentTime = Math.max(0, startTime);
      audio.play().catch(() => {});
      preloadTriggeredRef.current = '';
      preloadSentenceAudio(seg, sentIdx + 1);
      return;
    }

    // Case 3: load normally
    const onReady = () => {
      pendingCanplayRef.current = null;
      audio.currentTime = Math.max(0, startTime);
      audio.play().catch(() => {});
    };
    pendingCanplayRef.current = onReady;
    audio.addEventListener('canplay', onReady, { once: true });
    audio.src = audioUrl;
    audio.load();

    preloadSentenceAudio(seg, sentIdx + 1);
  }, [cancelPendingLoad, preloadSentenceAudio]);

  // ── Jump to next/previous sentence ────────────────────────────────────────
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

  // ── VIDEO-LED SYNC LOOP ────────────────────────────────────────────────────
  //
  // DESIGN (v2 — fully video-led):
  //   • Video time is the SINGLE source of truth for what sentence is active.
  //   • Subtitle text ALWAYS reflects the sentence the video is currently in.
  //   • Audio switches immediately when video enters a new sentence window.
  //   • Drift correction: expectedAudioPos = videoProgress / videoSlowRatio
  //   • Large drift (>250ms) → seek audio; small drift → rate correction.
  //   • Original video audio is muted while TTS is active.
  //
  const startSyncLoop = useCallback(() => {
    if (syncLoopRef.current) clearInterval(syncLoopRef.current);

    syncLoopRef.current = setInterval(() => {
      const videoTime = videoRef.current
        ? videoRef.current.currentTime
        : (ytRef.current?.getCurrentTime?.() ?? 0);

      if (!ytRef.current && !videoRef.current) return;

      // ── Seek detection: reset audio when user jumps >3s ──────────────────
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

      const step = stepRef.current;
      const seg  = getSegStart(videoTime, step);

      activeSegRef.current = seg;
      setActiveSeg(seg);

      const job = jobsRef.current.get(seg);
      if (!job?.sentences) { lastVideoTimeRef.current = videoTime; return; }

      const relTime     = Math.max(0, videoTime - seg);
      const sentenceIdx = job.sentences.findIndex(
        s => relTime >= s.videoStart && relTime < s.videoEnd
      );

      videoSentIdxRef.current = sentenceIdx;

      if (Date.now() < navGraceRef.current) {
        lastVideoTimeRef.current = videoTime;
        return;
      }

      const audio       = audioRef.current;
      const audioActive = !!(audio && !audio.paused && !audio.ended && audio.src);

      if (sentenceIdx >= 0) {
        const s = job.sentences[sentenceIdx];

        // ── 1. SUBTITLE always from video time (not audio position) ─────────
        if (sentenceIdx !== currentSentIdxRef.current) {
          currentSentIdxRef.current = sentenceIdx;
          setCurrentSentenceIdx(sentenceIdx);
        }
        const newText = s.arabicText || null;
        if (newText !== currentSentTextRef.current) {
          currentSentTextRef.current = newText;
          setCurrentSentence(newText);
        }
        if (s.originalDuration && s.ttsDuration && s.speedRatio &&
            (s.originalDuration !== (currentSpeedInfo?.orig ?? -1))) {
          setCurrentSpeedInfo({ orig: s.originalDuration, tts: s.ttsDuration, ratio: s.speedRatio });
        }

        // ── 2. Apply per-sentence video rate ────────────────────────────────
        const vsr = s.videoSlowRatio ?? 1.0;
        applyVideoRate(vsr);

        // ── 3. Handle pending sentence (waiting for audio to be ready) ──────
        const pending = pendingNextSentRef.current;
        if (pending >= 0 && pending === sentenceIdx) {
          const ps = job.sentences[pending];
          if (ps?.audioUrl && ps.sentenceStatus === 'completed') {
            pendingNextSentRef.current = -1;
            // fall through to load it below
          } else {
            lastVideoTimeRef.current = videoTime;
            return; // still waiting
          }
        } else if (pending >= 0 && sentenceIdx > pending + 1) {
          pendingNextSentRef.current = -1; // give up on stale pending
        }

        if (s.audioUrl && s.sentenceStatus === 'completed') {
          // Expected audio cursor given video position within this sentence.
          // Formula: expectedPos = videoProgress / videoSlowRatio
          // This works because: audioDuration = originalDuration / videoSlowRatio
          const videoProgress    = Math.max(0, relTime - s.videoStart);
          const expectedAudioPos = videoProgress / vsr;

          // ── 4. Switch audio immediately when sentence changes ─────────────
          if (audioLoadedForSent.current !== sentenceIdx) {
            const safeStart = Math.min(
              expectedAudioPos,
              Math.max(0, (s.audioDuration ?? s.originalDuration ?? 0) - 0.1)
            );
            loadSentenceAudio(seg, sentenceIdx, s.audioUrl, Math.max(0, safeStart));
            lastVideoTimeRef.current = videoTime;
            return;
          }

          // ── 5. Drift correction (video-driven) ────────────────────────────
          if (audioActive && audio) {
            const error = expectedAudioPos - audio.currentTime;

            if (Math.abs(error) > 0.30) {
              // Large drift → seek audio directly
              const seekTo = Math.max(0, Math.min(
                expectedAudioPos,
                (audio.duration || 999) - 0.05
              ));
              audio.currentTime = seekTo;
              audio.playbackRate = 1.0;
            } else if (Math.abs(error) > 0.06) {
              // Small drift → adjust playback rate (gentle correction)
              const corrRate = Math.max(0.65, Math.min(2.0, 1.0 + error * 2.5));
              if (Math.abs((audio.playbackRate || 1.0) - corrRate) > 0.03) {
                audio.playbackRate = corrRate;
              }
            } else if (Math.abs((audio.playbackRate || 1.0) - 1.0) > 0.03) {
              audio.playbackRate = 1.0;
            }

            // ── Proactive preload: < 0.8s remaining ─────────────────────────
            const timeLeft = (audio.duration || 0) - audio.currentTime;
            if (timeLeft > 0 && timeLeft < 0.8) {
              const nextIdx = audioLoadedForSent.current + 1;
              if (nextIdx < job.sentences.length) {
                preloadSentenceAudio(seg, nextIdx);
              } else {
                const nextSeg = seg + stepRef.current;
                const nextJob = jobsRef.current.get(nextSeg);
                if (nextJob?.sentences?.[0]?.sentenceStatus === 'completed') {
                  preloadSentenceAudio(nextSeg, 0);
                }
              }
            }

          } else if (!audioActive && audio && !audio.ended && audio.src && audio.paused) {
            // Audio is loaded but paused (video was paused) → resume
            audio.play().catch(() => {});
          } else if (!audioActive && audio && audio.ended) {
            // Audio ended slightly before video exits sentence — wait silently
          } else if (!audioActive && audioLoadedForSent.current < 0) {
            // Nothing loaded yet → start this sentence
            const safeStart = Math.min(
              expectedAudioPos,
              Math.max(0, (s.audioDuration ?? s.originalDuration ?? 0) - 0.1)
            );
            loadSentenceAudio(seg, sentenceIdx, s.audioUrl, Math.max(0, safeStart));
          }
        } else if (s.sentenceStatus !== 'completed') {
          // Sentence not ready: mark as pending so we start it once it's done
          if (pendingNextSentRef.current < 0) {
            pendingNextSentRef.current = sentenceIdx;
          }
        }

      } else {
        // ── Between sentences: pause audio and clear display ─────────────────
        if (currentSentIdxRef.current >= 0) {
          if (audio && !audio.paused) audio.pause();
          currentSentIdxRef.current  = -1;
          audioLoadedForSent.current = -1;
          pendingNextSentRef.current = -1;
          currentSentTextRef.current = null;
          setCurrentSentenceIdx(-1);
          setCurrentSentence(null);
          setCurrentSpeedInfo(null);
          applyVideoRate(1.0);
        }
      }

      lastVideoTimeRef.current = videoTime;
    }, 80); // 80ms interval for better sync precision
  }, [loadSentenceAudio, preloadSentenceAudio, applyVideoRate, currentSpeedInfo]);

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
      const jobId = await postProcess(url, seg, selectedVoice, selectedEngine, selectedLanguage || undefined);
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
  }, [url, selectedVoice, selectedEngine, selectedLanguage, pollJob, syncJobs]);

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

    // ── Mute original video audio when TTS starts ─────────────────────────
    if (muteOriginal) muteVideo();

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
  }, [isValid, selectedVoice, selectedEngine, selectedLanguage, url, duration, muteOriginal,
      syncJobs, startSegJob, startSyncLoop, stopSyncLoop, muteVideo]);

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
    // Restore video speed and unmute
    applyVideoRate(1.0);
    if (autoMutedRef.current) unmuteVideo();
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
  }, [stopSyncLoop, applyVideoRate, unmuteVideo]);

  useEffect(() => () => stopSyncLoop(), [stopSyncLoop]);

  // ── HTML5 video seek handler ───────────────────────────────────────────────
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const onSeeked = () => { lastSeekCheckRef.current = vid.currentTime; };
    vid.addEventListener('seeked', onSeeked);
    return () => vid.removeEventListener('seeked', onSeeked);
  }, [directVideoUrl]);

  // ── audio.ended: backup handler (sync loop handles the primary case) ───────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onEnded = () => {
      // With video-led sync, the sync loop will start the next sentence when
      // the video enters its window. We just clear the loaded state so the
      // loop doesn't think this sentence is still active.
      const seg    = playingSegRef.current;
      const curIdx = audioLoadedForSent.current;
      if (seg < 0 || curIdx < 0) return;

      const job = jobsRef.current.get(seg);
      if (!job?.sentences) return;

      // Advance to next sentence in advance (for audio.ended happening
      // just before video exits the sentence — unlikely but safe fallback)
      const videoIdx = videoSentIdxRef.current;
      const nextIdx  = videoIdx > curIdx ? videoIdx : curIdx + 1;

      if (nextIdx < job.sentences.length) {
        const next = job.sentences[nextIdx];
        if (next?.audioUrl && next.sentenceStatus === 'completed') {
          // Pre-load it; sync loop will decide exact start position
          preloadSentenceAudio(seg, nextIdx);
        } else {
          pendingNextSentRef.current = nextIdx;
        }
      } else {
        // Last sentence of segment — preload first of next
        const nextSeg = seg + stepRef.current;
        const nextJob = jobsRef.current.get(nextSeg);
        if (nextJob?.sentences?.[0]?.sentenceStatus === 'completed') {
          preloadSentenceAudio(nextSeg, 0);
        }
      }
    };

    audio.addEventListener('ended', onEnded);
    return () => audio.removeEventListener('ended', onEnded);
  }, [preloadSentenceAudio]);

  // ── Cookies handlers ──────────────────────────────────────────────────────
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

  // ── Segment sentence summary ───────────────────────────────────────────────
  const getSentenceSummary = (job: SegJob) => {
    if (!job.sentences) return null;
    const total     = job.sentences.length;
    const completed = job.sentences.filter(s => s.sentenceStatus === 'completed').length;
    return { total, completed };
  };

  // ── AI Chat ───────────────────────────────────────────────────────────────
  // مساعد ذكاء اصطناعي مدمج — يعمل بـ Pollinations AI (مجاني، بدون مفتاح)
  const sendAiMessage = useCallback(async () => {
    if (!aiInput.trim() || aiLoading) return;
    const userMsg = aiInput.trim();
    setAiInput('');
    setAiMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setAiLoading(true);

    // Build context from current translation state
    const ctxParts: string[] = [];
    if (videoTitle)      ctxParts.push(`عنوان الفيديو: "${videoTitle}"`);
    if (currentSentence) ctxParts.push(`الجملة المترجمة الحالية: "${currentSentence}"`);

    const systemPart =
      `أنت مساعد ذكاء اصطناعي متخصص في تطبيق مترجم الفيديو العربي. ` +
      `تساعد المستخدم على فهم الترجمة، شرح المعاني، والإجابة عن أسئلته باللغة العربية. ` +
      (ctxParts.length ? `[السياق: ${ctxParts.join(' | ')}] ` : '');

    const fullPrompt = `${systemPart}\n\nسؤال المستخدم: ${userMsg}`;

    try {
      const resp = await fetch(
        `https://text.pollinations.ai/${encodeURIComponent(fullPrompt)}`,
        { signal: AbortSignal.timeout(30_000) }
      );
      const text = resp.ok ? (await resp.text()).trim() : '';
      setAiMessages(prev => [...prev, {
        role: 'assistant',
        text: text || 'لم أتمكن من الحصول على رد. حاول مرة أخرى.',
      }]);
    } catch {
      setAiMessages(prev => [...prev, {
        role: 'assistant',
        text: 'انتهت مهلة الاتصال. تأكد من اتصال الإنترنت وحاول مجدداً.',
      }]);
    } finally {
      setAiLoading(false);
    }
  }, [aiInput, aiLoading, videoTitle, currentSentence]);

  // Auto-scroll AI chat to bottom
  useEffect(() => {
    if (showAiPanel && aiChatBottomRef.current) {
      aiChatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiMessages, showAiPanel]);

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

          {/* Source Language Selector */}
          <div className="space-y-1.5 relative">
            <label className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              لغة الفيديو الأصلية
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLangDropdown(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm hover:border-slate-600 transition-colors"
              >
                <span>
                  {selectedLanguage
                    ? (WHISPER_LANGUAGES.find(l => l.code === selectedLanguage)?.nameAr ?? selectedLanguage)
                    : '🔍 كشف تلقائي (Auto Detect)'}
                </span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${showLangDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {showLangDropdown && (
                <div className="absolute z-50 top-full mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-slate-700">
                    <input
                      autoFocus
                      type="text"
                      value={langSearch}
                      onChange={e => setLangSearch(e.target.value)}
                      placeholder="ابحث عن اللغة..."
                      className="w-full px-2 py-1.5 text-sm bg-slate-700 text-slate-100 rounded-md outline-none placeholder-slate-400"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => { setSelectedLanguage(''); setLangSearch(''); setShowLangDropdown(false); }}
                      className={`w-full text-right px-3 py-2 text-sm hover:bg-slate-700 transition-colors ${selectedLanguage === '' ? 'bg-violet-500/20 text-violet-200' : 'text-slate-300'}`}
                    >
                      🔍 كشف تلقائي (Auto Detect)
                    </button>
                    {WHISPER_LANGUAGES
                      .filter(l =>
                        !langSearch ||
                        l.nameAr.includes(langSearch) ||
                        l.name.toLowerCase().includes(langSearch.toLowerCase()) ||
                        l.code.toLowerCase().startsWith(langSearch.toLowerCase())
                      )
                      .map(l => (
                        <button
                          key={l.code}
                          type="button"
                          onClick={() => { setSelectedLanguage(l.code); setLangSearch(''); setShowLangDropdown(false); }}
                          className={`w-full text-right px-3 py-2 text-sm hover:bg-slate-700 transition-colors flex justify-between items-center ${selectedLanguage === l.code ? 'bg-violet-500/20 text-violet-200' : 'text-slate-300'}`}
                        >
                          <span className="text-slate-500 text-xs">{l.code}</span>
                          <span>{l.nameAr}</span>
                        </button>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
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

          {/* Mute toggle */}
          <div className="flex items-center justify-between bg-slate-800/40 rounded-lg px-3 py-2 border border-slate-700/30">
            <div className="flex items-center gap-2">
              {muteOriginal
                ? <VolumeX className="w-4 h-4 text-amber-400 shrink-0" />
                : <Volume2  className="w-4 h-4 text-emerald-400 shrink-0" />}
              <div>
                <p className="text-xs font-medium text-slate-300">
                  {muteOriginal ? 'الصوت الأصلي: مكتوم' : 'الصوت الأصلي: مُفعَّل'}
                </p>
                <p className="text-[10px] text-slate-500">
                  {muteOriginal ? 'يُسمع صوت TTS فقط' : 'يُسمع الصوت الأصلي مع TTS'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setMuteOriginal(v => !v)}
              className={`relative w-10 h-5 rounded-full transition-colors ${muteOriginal ? 'bg-amber-500/40' : 'bg-emerald-500/40'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform shadow ${
                muteOriginal ? 'right-0.5 bg-amber-400' : 'left-0.5 bg-emerald-400'
              }`} />
            </button>
          </div>

        </Card>

        {/* Video Player (YouTube or HTML5) */}
        {isValid && (
          <Card className="bg-slate-900/50 border-slate-800/60 overflow-hidden">
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              <div className="absolute inset-0">
                {videoId ? (
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

        {/* Current Sentence Display */}
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

            {/* Speed info */}
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

        {/* Segments status */}
        {hasStarted && jobs.size > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              حالة المقاطع
            </p>
            <div className="space-y-2">
              {[...jobs.entries()].sort((a, b) => a[0] - b[0]).map(([seg, job]) => {
                const summary  = getSentenceSummary(job);
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

        {/* ─── AI ASSISTANT PANEL ──────────────────────────────────────────────── */}
        <div className="border border-violet-800/40 rounded-xl overflow-hidden bg-slate-900/40">
          <button
            onClick={() => setShowAiPanel(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-violet-500/20 border border-violet-500/40 flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-violet-400" />
              </div>
              <span className="text-violet-300 font-medium">مساعد الذكاء الاصطناعي</span>
              <span className="text-[10px] bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded-full">
                مجاني • مدمج
              </span>
            </div>
            {showAiPanel ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          <AnimatePresence>
            {showAiPanel && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="border-t border-violet-800/30"
              >
                {/* Chat messages */}
                <div className="max-h-72 overflow-y-auto px-4 py-3 space-y-3">
                  {aiMessages.length === 0 ? (
                    <div className="text-center py-6">
                      <Bot className="w-8 h-8 text-violet-400/40 mx-auto mb-2" />
                      <p className="text-xs text-slate-500">اسألني عن الترجمة، معاني الكلمات، أو أي شيء آخر!</p>
                      <div className="flex flex-wrap gap-1.5 justify-center mt-3">
                        {['ما معنى هذه الجملة؟', 'اشرح الترجمة', 'ما موضوع الفيديو؟'].map(q => (
                          <button
                            key={q}
                            onClick={() => { setAiInput(q); }}
                            className="text-[11px] bg-violet-500/10 border border-violet-500/20 text-violet-300 px-2 py-1 rounded-full hover:bg-violet-500/20 transition-colors"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      {aiMessages.map((msg, i) => (
                        <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          {msg.role === 'assistant' && (
                            <div className="w-6 h-6 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0 mt-0.5">
                              <Bot className="w-3 h-3 text-violet-400" />
                            </div>
                          )}
                          <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-violet-600/30 border border-violet-500/20 text-violet-100 rounded-tr-sm'
                              : 'bg-slate-800/80 border border-slate-700/50 text-slate-200 rounded-tl-sm'
                          }`}>
                            {msg.text}
                          </div>
                          {msg.role === 'user' && (
                            <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                              <User className="w-3 h-3 text-slate-300" />
                            </div>
                          )}
                        </div>
                      ))}
                      {aiLoading && (
                        <div className="flex gap-2 justify-start">
                          <div className="w-6 h-6 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0">
                            <Bot className="w-3 h-3 text-violet-400" />
                          </div>
                          <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl rounded-tl-sm px-3 py-2">
                            <div className="flex gap-1">
                              {[0, 1, 2].map(i => (
                                <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400"
                                  animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
                                  transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.18 }} />
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={aiChatBottomRef} />
                    </>
                  )}
                </div>

                {/* Input area */}
                <div className="px-4 pb-4 pt-2 border-t border-slate-800/60">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={aiInput}
                      onChange={e => setAiInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage(); } }}
                      placeholder="اكتب سؤالك هنا..."
                      disabled={aiLoading}
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-violet-500/50 transition-colors disabled:opacity-50"
                    />
                    <button
                      onClick={sendAiMessage}
                      disabled={aiLoading || !aiInput.trim()}
                      className="w-9 h-9 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0"
                    >
                      {aiLoading
                        ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                        : <Send className="w-4 h-4 text-white" />}
                    </button>
                    {aiMessages.length > 0 && !aiLoading && (
                      <button
                        onClick={() => setAiMessages([])}
                        className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors shrink-0 border border-slate-700"
                        title="مسح المحادثة"
                      >
                        <X className="w-4 h-4 text-slate-400" />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-600 mt-1.5 text-center">
                    مشغَّل بـ Pollinations AI • مجاني تماماً • يعمل بدون مفتاح
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
