import { useState, useMemo } from 'react';

function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?\n]+)/
  );
  return match ? match[1] : null;
}

function buildDirectVideoUrl(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    // pixeldrain: /u/<id> → /api/file/<id>
    if (u.hostname === 'pixeldrain.com') {
      if (u.pathname.startsWith('/u/')) {
        return `https://pixeldrain.com/api/file/${u.pathname.slice(3)}`;
      }
      if (u.pathname.startsWith('/api/file/')) return url;
    }
    // Direct media file extensions
    const ext = u.pathname.split('.').pop()?.toLowerCase() ?? '';
    if (['mp4', 'webm', 'ogg', 'mov', 'mkv', 'm4v'].includes(ext)) return url;
    return null;
  } catch {
    return null;
  }
}

export function useYoutubeUrl() {
  const [url, setUrl] = useState('');

  const videoId = useMemo(() => extractYouTubeId(url), [url]);

  const directVideoUrl = useMemo(() => {
    if (videoId) return null; // YouTube takes priority
    return buildDirectVideoUrl(url);
  }, [url, videoId]);

  const isValid = !!(videoId || directVideoUrl);

  return { url, setUrl, videoId, directVideoUrl, isValid };
}
