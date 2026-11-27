/** 从 MP4 头部（或尾部 moov）嗅探视频编码，供云端文件在后台预览时展示编码并选择解码器。 */
const VIDEO_FORMATS: Record<string, string> = {
  avc1: 'H.264（AVC）',
  avc3: 'H.264（AVC）',
  hvc1: 'HEVC（H.265）',
  hev1: 'HEVC（H.265）',
  hevc: 'HEVC（H.265）',
  av01: 'AV1',
  vp08: 'VP8',
  vp09: 'VP9',
  mp4v: 'MPEG-4',
};

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);
const CHUNK = 2 * 1024 * 1024;
const cache = new Map<string, string>();

function u32(bytes: Uint8Array, offset: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(offset, false);
}

function fourcc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

function parseStsd(bytes: Uint8Array, start: number, end: number): string {
  let pos = start + 4; // version + flags
  if (pos + 4 > end) return '';
  const count = u32(bytes, pos);
  pos += 4;
  for (let i = 0; i < count && pos + 8 <= end; i++) {
    const size = u32(bytes, pos);
    const format = fourcc(bytes, pos + 4).toLowerCase();
    if (VIDEO_FORMATS[format]) return VIDEO_FORMATS[format];
    if (size < 8) break;
    pos += size;
  }
  return '';
}

function walk(bytes: Uint8Array, start: number, end: number, depth = 0): string {
  let pos = start;
  while (pos + 8 <= end && depth < 8) {
    let size = u32(bytes, pos);
    const type = fourcc(bytes, pos + 4);
    let header = 8;
    if (size === 1) {
      if (pos + 16 > end) return '';
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      size = Number(view.getBigUint64(pos + 8, false));
      header = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < header || pos + size > end) return '';
    if (type === 'stsd') {
      const found = parseStsd(bytes, pos + header, pos + size);
      if (found) return found;
    } else if (CONTAINERS.has(type)) {
      const found = walk(bytes, pos + header, pos + size, depth + 1);
      if (found) return found;
    }
    pos += size;
  }
  return '';
}

async function fetchRange(url: string, range: string): Promise<Uint8Array> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { Range: range },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) return new Uint8Array();
    // 某些代理忽略 Range 返回整片，不能把几十 MB 全读进内存。
    const length = Number(response.headers.get('content-length') || 0);
    if (response.status !== 206 && length > CHUNK * 2) {
      void response.body?.cancel();
      return new Uint8Array();
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return new Uint8Array();
  } finally {
    clearTimeout(timer);
  }
}

/** 返回「MP4 / HEVC（H.265）」这类文案；探测失败返回空串。 */
export async function sniffMp4Codec(url: string): Promise<string> {
  if (!url) return '';
  if (cache.has(url)) return cache.get(url) || '';
  const head = await fetchRange(url, `bytes=0-${CHUNK - 1}`);
  let codec = head.length ? walk(head, 0, head.length) : '';
  if (!codec) {
    const tail = await fetchRange(url, `bytes=-${CHUNK}`);
    codec = tail.length ? walk(tail, 0, tail.length) : '';
  }
  const label = codec ? `MP4 / ${codec}` : '';
  cache.set(url, label);
  return label;
}
