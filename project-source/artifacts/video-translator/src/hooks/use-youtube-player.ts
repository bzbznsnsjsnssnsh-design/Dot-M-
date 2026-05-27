import { useEffect, useRef, useCallback } from "react";

export type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getVideoData: () => { title: string; video_id: string };
  getPlayerState: () => number;
  setVolume: (v: number) => void;
  getVolume: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
};

export const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
};

interface UseYouTubePlayerOptions {
  containerId: string;
  videoId: string | null;
  onReady?: (player: YTPlayer) => void;
  onStateChange?: (state: number) => void;
  onError?: (code: number) => void;
}

declare global {
  interface Window {
    YT: {
      Player: new (elementId: string, options: object) => YTPlayer;
      PlayerState: Record<string, number>;
    };
    onYouTubeIframeAPIReady: () => void;
    _ytAPILoading?: boolean;
    _ytAPICallbacks: Array<() => void>;
  }
}

function loadYouTubeAPI(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  return new Promise((resolve) => {
    if (!window._ytAPICallbacks) window._ytAPICallbacks = [];
    window._ytAPICallbacks.push(resolve);
    if (!window._ytAPILoading) {
      window._ytAPILoading = true;
      const prevReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prevReady?.();
        (window._ytAPICallbacks || []).forEach(cb => cb());
        window._ytAPICallbacks = [];
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
  });
}

export function useYouTubePlayer(options: UseYouTubePlayerOptions) {
  const { containerId, videoId, onReady, onStateChange, onError } = options;
  const playerRef = useRef<YTPlayer | null>(null);
  const onReadyRef = useRef(onReady);
  const onStateChangeRef = useRef(onStateChange);
  const onErrorRef = useRef(onError);

  onReadyRef.current = onReady;
  onStateChangeRef.current = onStateChange;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!videoId) {
      if (playerRef.current) {
        (playerRef.current as any)?.destroy?.();
        playerRef.current = null;
      }
      return;
    }

    let destroyed = false;

    loadYouTubeAPI().then(() => {
      if (destroyed) return;
      if (playerRef.current) {
        (playerRef.current as any)?.destroy?.();
        playerRef.current = null;
      }

      const container = document.getElementById(containerId);
      if (!container) return;

      const inner = document.createElement("div");
      inner.id = containerId + "_inner";
      container.innerHTML = "";
      container.appendChild(inner);

      playerRef.current = new window.YT.Player(inner.id, {
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          playsinline: 1,
          fs: 0,
        },
        events: {
          onReady: (event: any) => {
            onReadyRef.current?.(event.target);
          },
          onStateChange: (event: any) => {
            onStateChangeRef.current?.(event.data);
          },
          onError: (event: any) => {
            onErrorRef.current?.(event.data);
          },
        },
      });
    });

    return () => {
      destroyed = true;
      try {
        (playerRef.current as any)?.destroy?.();
      } catch {}
      playerRef.current = null;
    };
  }, [videoId, containerId]);

  const getPlayer = useCallback(() => playerRef.current, []);

  return { getPlayer, playerRef };
}
