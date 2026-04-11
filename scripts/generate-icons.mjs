// Tab Manager Pro — icon generator
// Run: node scripts/generate-icons.mjs

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
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // RGBA
  const ihdr = makeChunk('IHDR', ihdrData);

  const rowLen = 1 + size * 4;
  const raw = Buffer.alloc(rowLen * size);
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0; // filter: none
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
  return new Uint8Array(size * size * 4); // RGBA
}

function setPixel(buf, size, x, y, r, g, b, a) {
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const i = (y * size + x) * 4;
  // alpha blending
  const srcA = a / 255;
  const dstA = buf[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA === 0) return;
  buf[i]     = Math.round((r * srcA + buf[i]     * dstA * (1 - srcA)) / outA);
  buf[i + 1] = Math.round((g * srcA + buf[i + 1] * dstA * (1 - srcA)) / outA);
  buf[i + 2] = Math.round((b * srcA + buf[i + 2] * dstA * (1 - srcA)) / outA);
  buf[i + 3] = Math.round(outA * 255);
}

function fillRect(buf, size, x, y, w, h, r, g, b, a = 255) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(buf, size, Math.round(x + dx), Math.round(y + dy), r, g, b, a);
    }
  }
}

function fillRoundedRect(buf, size, x, y, w, h, radius, r, g, b, a = 255) {
  const rad = Math.min(radius, w / 2, h / 2);
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const px = x + dx;
      const py = y + dy;

      // 모서리 라운딩 체크
      let inside = true;
      let cornerDist = 0;

      // 왼쪽 위
      if (dx < rad && dy < rad) {
        cornerDist = Math.sqrt((rad - dx) ** 2 + (rad - dy) ** 2);
        inside = cornerDist <= rad + 0.5;
      }
      // 오른쪽 위
      else if (dx >= w - rad && dy < rad) {
        cornerDist = Math.sqrt((dx - (w - rad - 1)) ** 2 + (rad - dy) ** 2);
        inside = cornerDist <= rad + 0.5;
      }
      // 왼쪽 아래
      else if (dx < rad && dy >= h - rad) {
        cornerDist = Math.sqrt((rad - dx) ** 2 + (dy - (h - rad - 1)) ** 2);
        inside = cornerDist <= rad + 0.5;
      }
      // 오른쪽 아래
      else if (dx >= w - rad && dy >= h - rad) {
        cornerDist = Math.sqrt((dx - (w - rad - 1)) ** 2 + (dy - (h - rad - 1)) ** 2);
        inside = cornerDist <= rad + 0.5;
      }

      if (inside) {
        // 안티앨리어싱: 경계에서 알파 조절
        let edgeAlpha = a;
        if (cornerDist > rad - 0.5 && cornerDist <= rad + 0.5) {
          edgeAlpha = Math.round(a * (rad + 0.5 - cornerDist));
        }
        setPixel(buf, size, Math.round(px), Math.round(py), r, g, b, edgeAlpha);
      }
    }
  }
}

// ── 아이콘 렌더링 ──

function renderIcon(size) {
  const buf = createCanvas(size);
  const s = size; // 축약
  const u = s / 128; // 128px 기준 단위 스케일

  // 배경: 둥근 사각형 + 그라디언트 (위: 밝은 남색, 아래: 짙은 남색)
  const bgRadius = Math.round(24 * u);
  for (let y = 0; y < s; y++) {
    const t = y / s;
    const r = Math.round(30 + 15 * t);   // 30 → 45
    const g = Math.round(100 + 30 * t);   // 100 → 130
    const b = Math.round(220 - 30 * t);   // 220 → 190
    for (let x = 0; x < s; x++) {
      // 배경 둥근 사각형 판정
      let inside = true;
      let cornerDist = 0;
      const rad = bgRadius;

      if (x < rad && y < rad) {
        cornerDist = Math.sqrt((rad - x) ** 2 + (rad - y) ** 2);
        inside = cornerDist <= rad + 0.5;
      } else if (x >= s - rad && y < rad) {
        cornerDist = Math.sqrt((x - (s - rad - 1)) ** 2 + (rad - y) ** 2);
        inside = cornerDist <= rad + 0.5;
      } else if (x < rad && y >= s - rad) {
        cornerDist = Math.sqrt((rad - x) ** 2 + (y - (s - rad - 1)) ** 2);
        inside = cornerDist <= rad + 0.5;
      } else if (x >= s - rad && y >= s - rad) {
        cornerDist = Math.sqrt((x - (s - rad - 1)) ** 2 + (y - (s - rad - 1)) ** 2);
        inside = cornerDist <= rad + 0.5;
      }

      if (inside) {
        let a = 255;
        if (cornerDist > rad - 0.5 && cornerDist <= rad + 0.5) {
          a = Math.round(255 * (rad + 0.5 - cornerDist));
        }
        setPixel(buf, s, x, y, r, g, b, a);
      }
    }
  }

  // 탭 모양 3개 (겹쳐진 카드 스택)
  const margin = Math.round(18 * u);
  const tabW = Math.round(s - margin * 2);
  const tabH = Math.round(22 * u);
  const tabRadius = Math.round(6 * u);
  const tabHeaderH = Math.round(8 * u);
  const tabHeaderW = Math.round(28 * u);
  const tabHeaderRadius = Math.round(4 * u);

  const tabs = [
    { y: Math.round(28 * u), color: [255, 255, 255], alpha: 140 },  // 뒤쪽 (반투명)
    { y: Math.round(46 * u), color: [255, 255, 255], alpha: 200 },  // 중간
    { y: Math.round(64 * u), color: [255, 255, 255], alpha: 255 },  // 앞쪽 (불투명)
  ];

  for (const tab of tabs) {
    // 탭 헤더 (상단 작은 돌출부)
    fillRoundedRect(
      buf, s,
      margin, tab.y - tabHeaderH + tabHeaderRadius,
      tabHeaderW, tabHeaderH,
      tabHeaderRadius,
      tab.color[0], tab.color[1], tab.color[2], tab.alpha,
    );

    // 탭 본체
    fillRoundedRect(
      buf, s,
      margin, tab.y,
      tabW, tabH,
      tabRadius,
      tab.color[0], tab.color[1], tab.color[2], tab.alpha,
    );
  }

  // 앞쪽 탭 안에 컬러 도트 3개 (그룹 색상 시각화)
  const frontTabY = tabs[2].y;
  const dotR = Math.round(3.5 * u);
  const dotY = Math.round(frontTabY + tabH / 2);
  const dotColors = [
    [26, 115, 232],   // blue
    [217, 48, 37],    // red
    [249, 171, 0],    // yellow
  ];
  const dotGap = Math.round(14 * u);
  const dotStartX = Math.round(margin + 14 * u);

  for (let i = 0; i < 3; i++) {
    const cx = dotStartX + i * dotGap;
    const cy = dotY;
    const [dr, dg, db] = dotColors[i];

    // 원 그리기
    for (let dy = -dotR - 1; dy <= dotR + 1; dy++) {
      for (let dx = -dotR - 1; dx <= dotR + 1; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= dotR + 0.5) {
          let a = 255;
          if (dist > dotR - 0.5) a = Math.round(255 * (dotR + 0.5 - dist));
          setPixel(buf, s, Math.round(cx + dx), Math.round(cy + dy), dr, dg, db, a);
        }
      }
    }
  }

  // 앞쪽 탭에 가로 라인 2개 (텍스트 힌트)
  const lineY1 = Math.round(frontTabY + tabH / 2 - 1 * u);
  const lineY2 = Math.round(frontTabY + tabH / 2 + 3 * u);
  const lineX = Math.round(dotStartX + 3 * dotGap);
  const lineW = Math.round(tabW - (lineX - margin) - 10 * u);
  const lineH = Math.max(1, Math.round(1.5 * u));

  fillRect(buf, s, lineX, lineY1, lineW, lineH, 200, 210, 220, 180);
  fillRect(buf, s, lineX, lineY2, Math.round(lineW * 0.6), lineH, 200, 210, 220, 140);

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
