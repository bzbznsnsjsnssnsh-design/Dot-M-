import { writeFile, unlink, access } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { constants } from "fs";

const COOKIES_FILE = join(tmpdir(), "yt-cookies.txt");

export function getCookiesPath(): string {
  return COOKIES_FILE;
}

export async function hasCookies(): Promise<boolean> {
  try {
    await access(COOKIES_FILE, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function saveCookies(content: string): Promise<void> {
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  const hasCookieLines = lines.some(l => l.includes(".youtube.com") || l.includes("google.com"));

  if (!hasCookieLines) {
    throw new Error("ملف الكوكيز لا يحتوي على كوكيز يوتيوب أو جوجل صحيحة");
  }

  await writeFile(COOKIES_FILE, content, "utf-8");
}

export async function deleteCookies(): Promise<void> {
  try {
    await unlink(COOKIES_FILE);
  } catch { /* ignore */ }
}
