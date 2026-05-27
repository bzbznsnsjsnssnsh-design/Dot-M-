import { execFile } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { homedir } from "os";
import { existsSync } from "fs";

const execFileAsync = promisify(execFile);

const workspaceRoot = join(homedir(), "workspace");
const pythonLibsBin = join(workspaceRoot, ".pythonlibs", "bin");
const python3Bin = join(pythonLibsBin, "python3");

function getPythonBin(): string {
  if (existsSync(python3Bin)) return python3Bin;
  return "python3";
}

export async function synthesizeEdgeTTS(
  text: string,
  voice: string,
  speed: number,
  outputPath: string
): Promise<void> {
  const ratePercent = Math.round((speed - 1.0) * 100);
  const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

  const pyBin = getPythonBin();
  await execFileAsync(pyBin, [
    "-m", "edge_tts",
    "--voice", voice,
    "--rate", rateStr,
    "--text", text,
    "--write-media", outputPath,
  ], {
    timeout: 90_000,
    maxBuffer: 50 * 1024 * 1024,
  });
}

export const EDGE_TTS_VOICES = [
  { id: "ar-SA-HamedNeural",           name: "🇸🇦 حامد - السعودية",           lang: "ar-SA" },
  { id: "ar-SA-ZariyahNeural",         name: "🇸🇦 ذرية - السعودية",           lang: "ar-SA" },
  { id: "ar-EG-ShakirNeural",          name: "🇪🇬 شاكر - مصر",               lang: "ar-EG" },
  { id: "ar-EG-SalmaNeural",           name: "🇪🇬 سلمى - مصر",               lang: "ar-EG" },
  { id: "ar-IQ-BasselNeural",          name: "🇮🇶 باسل - العراق",             lang: "ar-IQ" },
  { id: "ar-IQ-RanaNeural",            name: "🇮🇶 رنا - العراق",              lang: "ar-IQ" },
  { id: "ar-KW-FahedNeural",           name: "🇰🇼 فهد - الكويت",              lang: "ar-KW" },
  { id: "ar-KW-NouraNeural",           name: "🇰🇼 نورا - الكويت",             lang: "ar-KW" },
  { id: "ar-MA-JamalNeural",           name: "🇲🇦 جمال - المغرب",             lang: "ar-MA" },
  { id: "ar-MA-MounaNeural",           name: "🇲🇦 منى - المغرب",              lang: "ar-MA" },
  { id: "en-US-JennyMultilingualNeural", name: "🌍 Jenny - متعدد اللغات",    lang: "en-US" },
  { id: "en-US-RyanMultilingualNeural",  name: "🌍 Ryan - متعدد اللغات",     lang: "en-US" },
  { id: "fr-FR-RemyMultilingualNeural",  name: "🇫🇷 Remy - متعدد اللغات",    lang: "fr-FR" },
  { id: "fr-FR-VivienneMultilingualNeural", name: "🇫🇷 Vivienne - متعدد اللغات", lang: "fr-FR" },
];
