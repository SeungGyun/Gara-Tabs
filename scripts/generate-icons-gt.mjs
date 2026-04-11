// Gara-Tabs — 3-colored-folders icon generator
// Concept: 3 folders in different colors, stacked/overlapping
// Style: clean, colorful, minimalist
// Run: node scripts/generate-icons-gt.mjs

import { writeFileSync, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';

// ── PNG 인코딩 유틸 ──

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

function encodePNG(size, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6; // RGBA
  const ihdr = makeChunk('IHDR', ihdrData);

  const rowLen = 1 + size * 4;
  const raw = Buffer.alloc(rowLen * size);
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0;
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * rowLen + 1 + x * 4;
      raw[dst] = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
      raw[dst + 3] = pixels[src + 3];
    }
  }

  const idat = makeChunk('IDAT', deflateSync(raw, { level: 9 }));
  const iend = makeChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

// ── 드로잉 유틸 ──

function createCanvas(size) {
  return new Uint8Array(size * size * 4);
}

function setPixel(buf, size, x, y, r, g, b, a) {
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const i = (y * size + x) * 4;
  const srcA = a / 255;
  const dstA = buf[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA === 0) return;
  buf[i]     = Math.round((r * srcA + buf[i]     * dstA * (1 - srcA)) / outA);
  buf[i + 1] = Math.round((g * srcA + buf[i + 1] * dstA * (1 - srcA)) / outA);
  buf[i + 2] = Math.round((b * srcA + buf[i + 2] * dstA * (1 - srcA)) / outA);
  buf[i + 3] = Math.round(outA * 255);
}

function fillRoundedRect(buf, size, x, y, w, h, radius, r, g, b, a = 255) {
  const rad = Math.min(radius, w / 2, h / 2);
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const px = x + dx;
      const py = y + dy;
      let inside = true;
      let cornerDist = 0;

      if (dx < rad && dy < rad) {
        cornerDist = Math.sqrt((rad - dx) ** 2 + (rad - dy) ** 2);
        inside = cornerDist <= rad + 0.5;
      } else if (dx >= w - rad && dy < rad) {
        cornerDist = Math.sqrt((dx - (w - rad - 1)) ** 2 + (rad - dy) ** 2);
        inside = cornerDist <= rad + 0.5;
      } else if (dx < rad && dy >= h - rad) {
        cornerDist = Math.sqrt((rad - dx) ** 2 + (dy - (h - rad - 1)) ** 2);
        inside = cornerDist <= rad + 0.5;
      } else if (dx >= w - rad && dy >= h - rad) {
        cornerDist = Math.sqrt((dx - (w - rad - 1)) ** 2 + (dy - (h - rad - 1)) ** 2);
        inside = cornerDist <= rad + 0.5;
      }

      if (inside) {
        let edgeAlpha = a;
        if (cornerDist > rad - 0.5 && cornerDist <= rad + 0.5) {
          edgeAlpha = Math.round(a * (rad + 0.5 - cornerDist));
        }
        setPixel(buf, size, Math.round(px), Math.round(py), r, g, b, edgeAlpha);
      }
    }
  }
}

// ── 폴더 한 개 렌더 (탭 귀 + 본체) ──

function renderFolder(buf, s, fx, fy, fw, fh, tabW, tabH, radius, r, g, b, a = 255) {
  const tabR = Math.max(1, Math.round(radius * 0.7));

  // 탭 귀 (좌상단 돌출)
  fillRoundedRect(buf, s, fx, fy, tabW, tabH + tabR, tabR, r, g, b, a);

  // 본체
  fillRoundedRect(buf, s, fx, fy + tabH, fw, fh, radius, r, g, b, a);
}

// ── 아이콘 렌더링 ──

function renderIcon(size) {
  const buf = createCanvas(size);
  const s = size;
  const u = s / 128;
  const R = (v) => Math.round(v * u);

  // 3 폴더 색상 (Chrome 탭 그룹 컬러 기반)
  const folders = [
    { color: [66, 133, 244],  alpha: 200 },  // 파랑 (뒤)
    { color: [251, 188, 0],   alpha: 220 },  // 노랑 (중간)
    { color: [234, 67, 53],   alpha: 255 },  // 빨강 (앞)
  ];

  // 폴더 크기
  const fw = R(90);       // 폴더 본체 너비
  const fh = R(64);       // 폴더 본체 높이
  const tabW = R(38);     // 탭 귀 너비
  const tabH = R(14);     // 탭 귀 높이
  const radius = R(10);   // 모서리 반경

  // 오프셋 — 뒤에서 앞으로 내려가며 오른쪽으로 이동
  const offsetX = R(12);  // 폴더 간 가로 오프셋
  const offsetY = R(18);  // 폴더 간 세로 오프셋

  // 전체를 캔버스 중앙에 배치
  const totalW = fw + offsetX * 2;
  const totalH = fh + tabH + offsetY * 2;
  const startX = Math.round((s - totalW) / 2);
  const startY = Math.round((s - totalH) / 2);

  for (let i = 0; i < folders.length; i++) {
    const fx = startX + i * offsetX;
    const fy = startY + i * offsetY;
    const [r, g, b] = folders[i].color;
    const a = folders[i].alpha;

    renderFolder(buf, s, fx, fy, fw, fh, tabW, tabH, radius, r, g, b, a);
  }

  return encodePNG(s, buf);
}

// ── 생성 ──

mkdirSync('src/assets/icons', { recursive: true });

for (const size of [16, 48, 128]) {
  const png = renderIcon(size);
  writeFileSync(`src/assets/icons/icon${size}.png`, png);
  console.log(`icon${size}.png — ${png.length} bytes`);
}

console.log('Done.');
