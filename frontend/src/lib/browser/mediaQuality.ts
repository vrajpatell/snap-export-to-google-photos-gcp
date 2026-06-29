export type MediaCategory = "photo" | "video" | "unknown";

export interface MediaQualityInfo {
  detectedMime?: string;
  extension?: string;
  category: MediaCategory;
  width?: number;
  height?: number;
  orientation?: string | number;
  exifDate?: string;
  warnings: string[];
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
  heic: "image/heic", heif: "image/heif", mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", webm: "video/webm",
};
const EXT_BY_MIME: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/gif": ["gif"], "image/webp": ["webp"],
  "image/heic": ["heic"], "image/heif": ["heif"], "video/mp4": ["mp4", "m4v"], "video/quicktime": ["mov"], "video/webm": ["webm"],
};
const SUPPORTED = new Set(Object.keys(EXT_BY_MIME));

export function extensionFor(path: string): string {
  const base = path.split("/").pop() || path;
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot + 1).toLowerCase();
}

export function categoryForMime(mime?: string): MediaCategory {
  if (mime?.startsWith("image/")) return "photo";
  if (mime?.startsWith("video/")) return "video";
  return "unknown";
}

async function detectByMagic(blob: Blob): Promise<string | undefined> {
  const bytes = new Uint8Array(await blob.slice(0, 4100).arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (String.fromCharCode(...bytes.slice(0, 3)) === "GIF") return "image/gif";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  const box = String.fromCharCode(...bytes.slice(4, 12));
  if (box.startsWith("ftyp")) {
    const brand = String.fromCharCode(...bytes.slice(8, 16));
    if (/heic|heix|hevc|hevx|mif1|msf1/i.test(brand)) return "image/heic";
    if (/qt\s\s/i.test(brand)) return "video/quicktime";
    if (/mp4|isom|M4V/i.test(brand)) return "video/mp4";
  }
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "video/webm";
  return undefined;
}

function imageDimensionsFromBytes(mime: string | undefined, bytes: Uint8Array): Pick<MediaQualityInfo, "width" | "height"> {
  if (mime === "image/png" && bytes.length > 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mime === "image/gif" && bytes.length > 10) return { width: bytes[6] | (bytes[7] << 8), height: bytes[8] | (bytes[9] << 8) };
  return {};
}

export async function inspectMediaBlob(blob: Blob, filename: string): Promise<MediaQualityInfo> {
  const extension = extensionFor(filename);
  const declared = MIME_BY_EXTENSION[extension];
  const detectedMime = (await detectByMagic(blob)) ?? declared;
  const warnings: string[] = [];
  if (declared && detectedMime && declared !== detectedMime && !EXT_BY_MIME[detectedMime]?.includes(extension)) {
    warnings.push(`File extension .${extension} does not match detected ${detectedMime}.`);
  }
  if (!detectedMime || !SUPPORTED.has(detectedMime)) warnings.push("Unsupported media type.");
  const head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  return { detectedMime, extension, category: categoryForMime(detectedMime), ...imageDimensionsFromBytes(detectedMime, head), warnings };
}

export function isSupportedMime(mime?: string): boolean {
  return Boolean(mime && SUPPORTED.has(mime));
}
