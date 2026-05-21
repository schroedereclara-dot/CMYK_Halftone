'use strict';

let previewCanvas = null;

let isPanning = false;
let lastMouseX = 0;
let lastMouseY = 0;

const CH_COLORS = {
  c: 'rgba(0,180,200,0.9)',
  m: 'rgba(200,0,140,0.9)',
  y: 'rgba(240,200,0,0.9)',
  k: 'rgba(0,0,0,0.95)'
};

const halftoneCache = {
  c: null,
  m: null,
  y: null,
  k: null
};

const EXPORT_SCALE = 3;

const PAPER_SIZES_MM = {
  A1: { width: 594, height: 841 },
  A2: { width: 420, height: 594 },
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 }
};

const SRA_SIZES_MM = {
  A1: { width: 640, height: 900 },
  A2: { width: 450, height: 640 },
  A3: { width: 320, height: 450 },
  A4: { width: 225, height: 320 },
  A5: { width: 160, height: 225 }
};

const EXPORT_DPI = 300;
const PNG_PPM = Math.round(EXPORT_DPI * 39.37007874);

function mmToPx(mm, dpi = EXPORT_DPI) {
  return Math.round((mm / 25.4) * dpi);
}

function setup() {
  const container = document.getElementById('canvas-container');
  const w = Math.max(container.offsetWidth, 200);
  const h = Math.max(container.offsetHeight, 200);

  previewCanvas = createCanvas(w, h);
  previewCanvas.parent('canvas-container');

  initUI();
}

function draw() {
  background(0);

  if (!uploaded || !sourceCanvas) {
    fill(160);
    textSize(16);
    textAlign(CENTER, CENTER);
    text(
      'Lade ein Bild hoch, um CMYK-Halftone zu erzeugen und zu experimentieren.',
      width / 2,
      height / 2
    );
    return;
  }

  if (!preview) {
    fill(20);
    noStroke();
    rect(0, 0, width, height);

    fill(200);
    textSize(14);
    textAlign(CENTER, CENTER);
    text(
      'Vorschau ist deaktiviert.\nAktiviere „Vorschau“ im Panel, um das Raster zu sehen.',
      width / 2,
      height / 2
    );
    return;
  }

  const chanData = getCMYKGraysCached();
  if (!chanData) return;
  const { w, h } = chanData;

  if (halftoneDirty) {
    halftoneCache.c = halftoneChannelCombined('c', chanData, getShapeForChannel('c'), true, 1, true);
    halftoneCache.m = halftoneChannelCombined('m', chanData, getShapeForChannel('m'), true, 1, true);
    halftoneCache.y = halftoneChannelCombined('y', chanData, getShapeForChannel('y'), true, 1, true);
    halftoneCache.k = halftoneChannelCombined('k', chanData, getShapeForChannel('k'), true, 1, true);
    halftoneDirty = false;
  }

  const kCan = halftoneCache.k;
  const cCan = halftoneCache.c;
  const mCan = halftoneCache.m;
  const yCan = halftoneCache.y;

  const baseScale = Math.min(width / w, height / h);
  const scale = baseScale * previewZoom;
  const drawW = w * scale;
  const drawH = h * scale;
  const sx = (width - drawW) / 2 + panOffsetX;
  const sy = (height - drawH) / 2 + panOffsetY;

  noStroke();
  fill(220);
  rect(sx, sy, drawW, drawH);

  drawingContext.save();
  drawingContext.translate(sx, sy);
  drawingContext.scale(scale, scale);

  drawingContext.globalCompositeOperation = 'multiply';
  if (showK && kCan) drawingContext.drawImage(kCan, 0, 0);
  if (showC && cCan) drawingContext.drawImage(cCan, 0, 0);
  if (showM && mCan) drawingContext.drawImage(mCan, 0, 0);
  if (showY && yCan) drawingContext.drawImage(yCan, 0, 0);

  drawingContext.restore();
}

function windowResized() {
  const container = document.getElementById('canvas-container');
  if (container) resizeCanvas(container.offsetWidth, container.offsetHeight);
}

function mousePressed() {
  if (!uploaded || !sourceCanvas) return;

  if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
    isPanning = true;
    lastMouseX = mouseX;
    lastMouseY = mouseY;

    const canvasContainer = document.getElementById('canvas-container');
    if (canvasContainer) canvasContainer.classList.add('panning');
  }
}

function mouseDragged() {
  if (!isPanning) return;
  const dx = mouseX - lastMouseX;
  const dy = mouseY - lastMouseY;
  panOffsetX += dx;
  panOffsetY += dy;
  lastMouseX = mouseX;
  lastMouseY = mouseY;
}

function mouseReleased() {
  isPanning = false;
  const canvasContainer = document.getElementById('canvas-container');
  if (canvasContainer) canvasContainer.classList.remove('panning');
}

function getShapeForChannel(ch) {
  if (ch === 'c') return shapeC === 'global' ? dotShape : shapeC;
  if (ch === 'm') return shapeM === 'global' ? dotShape : shapeM;
  if (ch === 'y') return shapeY === 'global' ? dotShape : shapeY;
  if (ch === 'k') return shapeK === 'global' ? dotShape : shapeK;
  return dotShape;
}

function getCMYKGraysCached() {
  if (
    cachedCMYK &&
    cachedWidth === sourceCanvas.width &&
    cachedHeight === sourceCanvas.height
  ) {
    return cachedCMYK;
  }

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const imgd = sourceCtx.getImageData(0, 0, w, h);
  const data = imgd.data;
  const len = w * h;

  const C = new Uint8ClampedArray(len);
  const M = new Uint8ClampedArray(len);
  const Y = new Uint8ClampedArray(len);
  const K = new Uint8ClampedArray(len);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const Kval = 255 - Math.max(r, g, b);
    const Cprime = 255 - r;
    const Mprime = 255 - g;
    const Yprime = 255 - b;

    const c = Math.max(0, Cprime - Kval);
    const m = Math.max(0, Mprime - Kval);
    const y = Math.max(0, Yprime - Kval);

    C[p] = c;
    M[p] = m;
    Y[p] = y;
    K[p] = Kval;
  }

  cachedCMYK = { C, M, Y, K, w, h };
  cachedWidth = w;
  cachedHeight = h;
  return cachedCMYK;
}

function halftoneChannelCombined(channel, chanData, shape, useColor, scaleFactor, isPreview) {
  const { C, M, Y, K, w, h } = chanData;
  const src = { c: C, m: M, y: Y, k: K }[channel];
  const sf = scaleFactor || 1;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * sf));
  canvas.height = Math.max(1, Math.round(h * sf));
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = useColor ? CH_COLORS[channel] : 'black';

  let screenDeg = 0;
  let imageDeg = 0;
  let sizeFactor = 1.0;

  if (channel === 'c') {
    screenDeg = screenAngleC;
    imageDeg = angleC;
    sizeFactor = dotSizeFactorC;
  } else if (channel === 'm') {
    screenDeg = screenAngleM;
    imageDeg = angleM;
    sizeFactor = dotSizeFactorM;
  } else if (channel === 'y') {
    screenDeg = screenAngleY;
    imageDeg = angleY;
    sizeFactor = dotSizeFactorY;
  } else if (channel === 'k') {
    screenDeg = screenAngleK;
    imageDeg = angleK;
    sizeFactor = dotSizeFactorK;
  }

  const screenRad = (screenDeg * Math.PI) / 180;
  const cosS = Math.cos(screenRad);
  const sinS = Math.sin(screenRad);

  const imageRad = (-imageDeg * Math.PI) / 180;
  const cosI = Math.cos(imageRad);
  const sinI = Math.sin(imageRad);

  let step = Math.max(2, Math.round(spacing * sf));
  if (isPreview && fastPreview) {
    step = Math.max(2, Math.round(step * 1.8));
  }

  const maxRadius = dotSize * sizeFactor * sf;
  const halfW = canvas.width / 2;
  const halfH = canvas.height / 2;

  const diag = Math.sqrt(canvas.width * canvas.width + canvas.height * canvas.height);
  const gridMinX = -diag * 0.5;
  const gridMaxX = diag * 0.5;
  const gridMinY = -diag * 0.5;
  const gridMaxY = diag * 0.5;

  for (let gy = gridMinY; gy <= gridMaxY; gy += step) {
    for (let gx = gridMinX; gx <= gridMaxX; gx += step) {
      const px = halfW + (gx * cosS - gy * sinS);
      const py = halfH + (gx * sinS + gy * cosS);

      if (px < 0 || px >= canvas.width || py < 0 || py >= canvas.height) continue;

      const dx = px - halfW;
      const dy = py - halfH;

      const sx = Math.round((cosI * dx - sinI * dy) / sf + w / 2);
      const sy = Math.round((sinI * dx + cosI * dy) / sf + h / 2);

      if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;

      const idx = sy * w + sx;
      const gray = src[idx];
      const ink = gray / 255.0;
      if (ink <= 0.01) continue;

      const radius = Math.max(0.2, ink * maxRadius * density);
      const size = radius * 2;

      let drawX = px;
      let drawY = py;

      if (jitter > 0) {
        const maxOffset = step * jitter * 0.5;
        drawX += (Math.random() * 2 - 1) * maxOffset;
        drawY += (Math.random() * 2 - 1) * maxOffset;
      }

      drawDotShape(ctx, drawX, drawY, radius, size, shape);
    }
  }

  return canvas;
}

function drawDotShape(ctx, x, y, radius, size, shape) {
  const s = shape || dotShape;
  ctx.beginPath();

  if (s === 'circle') {
    ctx.moveTo(x + radius, y);
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (s === 'square') {
    ctx.rect(x - radius, y - radius, size, size);
    ctx.fill();
    return;
  }

  if (s === 'line') {
    const lineWidth = Math.max(1, radius * 0.4);
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.rect(-radius, -lineWidth / 2, size, lineWidth);
    ctx.restore();
    ctx.fill();
    return;
  }

  if (s === 'triangle') {
    const h = radius * Math.sqrt(3);
    ctx.moveTo(x, y - (2 / 3) * h);
    ctx.lineTo(x - radius, y + (1 / 3) * h);
    ctx.lineTo(x + radius, y + (1 / 3) * h);
    ctx.closePath();
    ctx.fill();
    return;
  }

  if (s === 'star') {
    const outer = radius;
    const inner = radius * 0.45;
    const spikes = 5;
    let rot = -Math.PI / 2;
    const step = Math.PI / spikes;

    ctx.moveTo(x + Math.cos(rot) * outer, y + Math.sin(rot) * outer);
    for (let i = 0; i < spikes; i++) {
      rot += step;
      ctx.lineTo(x + Math.cos(rot) * inner, y + Math.sin(rot) * inner);
      rot += step;
      ctx.lineTo(x + Math.cos(rot) * outer, y + Math.sin(rot) * outer);
    }
    ctx.closePath();
    ctx.fill();
    return;
  }

  if (s === 'asterisk') {
    const armLength = radius;
    const armWidth = Math.max(1, radius * 0.35);

    ctx.save();
    ctx.translate(x, y);
    const angles = [0, Math.PI / 3, (2 * Math.PI) / 3];
    angles.forEach(a => {
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.rect(-armLength, -armWidth / 2, armLength * 2, armWidth);
      ctx.fill();
      ctx.restore();
    });
    ctx.restore();
    return;
  }

  ctx.moveTo(x + radius, y);
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function getChannelPrintName(channel) {
  if (channel === 'c') return 'Cyan';
  if (channel === 'm') return 'Magenta';
  if (channel === 'y') return 'Yellow';
  if (channel === 'k') return 'Black';
  return 'Channel';
}

function channelVisible(ch) {
  return (
    (ch === 'c' && showC) ||
    (ch === 'm' && showM) ||
    (ch === 'y' && showY) ||
    (ch === 'k' && showK)
  );
}

function releaseCanvasMemory(canvas, ctx) {
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = 1;
  canvas.height = 1;
}

function computeContainPlacement(srcWidth, srcHeight, destWidth, destHeight) {
  const scale = Math.min(destWidth / srcWidth, destHeight / srcHeight);
  const drawWidth = Math.round(srcWidth * scale);
  const drawHeight = Math.round(srcHeight * scale);
  const offsetX = Math.round((destWidth - drawWidth) / 2);
  const offsetY = Math.round((destHeight - drawHeight) / 2);
  return { drawWidth, drawHeight, offsetX, offsetY, scale };
}

function getOrientedSizePx(sizeMm, isLandscape) {
  const w = mmToPx(sizeMm.width);
  const h = mmToPx(sizeMm.height);
  return isLandscape
    ? { width: Math.max(w, h), height: Math.min(w, h) }
    : { width: Math.min(w, h), height: Math.max(w, h) };
}

function getPrintLayout(formatLabel, sourceWidth, sourceHeight) {
  if (!formatLabel || formatLabel === 'original') {
    const outerWidth = sourceWidth * EXPORT_SCALE;
    const outerHeight = sourceHeight * EXPORT_SCALE;
    return {
      orientation: sourceWidth > sourceHeight ? 'landscape' : 'portrait',
      artboardWidth: outerWidth,
      artboardHeight: outerHeight,
      outerWidth,
      outerHeight,
      artOffsetX: 0,
      artOffsetY: 0,
      formatName: 'original',
      outerFormatName: 'original'
    };
  }

  const isLandscape = sourceWidth > sourceHeight;
  const aSizePx = getOrientedSizePx(PAPER_SIZES_MM[formatLabel], isLandscape);
  const sraSizePx = getOrientedSizePx(SRA_SIZES_MM[formatLabel], isLandscape);

  const artOffsetX = Math.round((sraSizePx.width - aSizePx.width) / 2);
  const artOffsetY = Math.round((sraSizePx.height - aSizePx.height) / 2);

  return {
    orientation: isLandscape ? 'landscape' : 'portrait',
    artboardWidth: aSizePx.width,
    artboardHeight: aSizePx.height,
    outerWidth: sraSizePx.width,
    outerHeight: sraSizePx.height,
    artOffsetX,
    artOffsetY,
    formatName: formatLabel,
    outerFormatName: `SRA${formatLabel.slice(1)}`
  };
}

function drawRegistrationMark(ctx, x, y, scale = 1) {
  const outerR = 24 * scale;
  const innerR = 8 * scale;
  const cross = 34 * scale;

  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = 'black';
  ctx.fillStyle = 'black';
  ctx.lineWidth = Math.max(2, 2 * scale);

  ctx.beginPath();
  ctx.arc(0, 0, outerR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, innerR, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-cross, 0);
  ctx.lineTo(cross, 0);
  ctx.moveTo(0, -cross);
  ctx.lineTo(0, cross);
  ctx.stroke();

  ctx.restore();
}

function drawDiagonalRegistrationMarks(ctx, outerWidth, outerHeight) {
  const inset = 42;
  drawRegistrationMark(ctx, inset, inset, 1);
  drawRegistrationMark(ctx, outerWidth - inset, outerHeight - inset, 1);
}

function drawScreenprintHeader(ctx, channel, formatLabel, outerFormatName, artOffsetX, artOffsetY) {
  const channelName = getChannelPrintName(channel);
  const labelText = `(${channel.toUpperCase()}) Layer ${channelName} ${formatLabel} / ${outerFormatName}`;

  ctx.save();
  ctx.fillStyle = 'black';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = '700 34px Arial';
  ctx.fillText(labelText, artOffsetX, Math.max(10, artOffsetY - 54));
  ctx.restore();
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32ToBytes(num) {
  return new Uint8Array([
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255
  ]);
}

function asciiBytes(str) {
  return new Uint8Array([...str].map(ch => ch.charCodeAt(0)));
}

function makeChunk(type, data) {
  const typeBytes = asciiBytes(type);
  const lengthBytes = uint32ToBytes(data.length);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  const crcBytes = uint32ToBytes(crc32(crcInput));

  const out = new Uint8Array(4 + 4 + data.length + 4);
  out.set(lengthBytes, 0);
  out.set(typeBytes, 4);
  out.set(data, 8);
  out.set(crcBytes, 8 + data.length);
  return out;
}

function insertPhysChunk(pngBytes, ppm = PNG_PPM) {
  const signatureLength = 8;
  let offset = signatureLength;

  const chunks = [];
  chunks.push(pngBytes.slice(0, signatureLength));

  let inserted = false;

  while (offset < pngBytes.length) {
    const length =
      (pngBytes[offset] << 24) |
      (pngBytes[offset + 1] << 16) |
      (pngBytes[offset + 2] << 8) |
      pngBytes[offset + 3];

    const type = String.fromCharCode(
      pngBytes[offset + 4],
      pngBytes[offset + 5],
      pngBytes[offset + 6],
      pngBytes[offset + 7]
    );

    const chunkEnd = offset + 12 + length;
    const chunk = pngBytes.slice(offset, chunkEnd);
    chunks.push(chunk);

    if (type === 'IHDR' && !inserted) {
      const data = new Uint8Array(9);
      data.set(uint32ToBytes(ppm), 0);
      data.set(uint32ToBytes(ppm), 4);
      data[8] = 1;
      chunks.push(makeChunk('pHYs', data));
      inserted = true;
    }

    offset = chunkEnd;
  }

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(totalLength);
  let pos = 0;
  chunks.forEach(chunk => {
    out.set(chunk, pos);
    pos += chunk.length;
  });

  return out;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canvasToPngBlobWith300Dpi(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('PNG export failed'));
        return;
      }

      try {
        const arr = new Uint8Array(await blob.arrayBuffer());
        const patched = insertPhysChunk(arr, PNG_PPM);
        resolve(new Blob([patched], { type: 'image/png' }));
      } catch (err) {
        reject(err);
      }
    }, 'image/png');
  });
}

function renderChannelToFinalPrintCanvas(ch, chanData, layout) {
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = layout.outerWidth;
  finalCanvas.height = layout.outerHeight;
  const finalCtx = finalCanvas.getContext('2d');

  finalCtx.clearRect(0, 0, finalCanvas.width, finalCanvas.height);

  const placed = halftoneChannelCombined(
    ch,
    chanData,
    getShapeForChannel(ch),
    false,
    layout.artboardWidth / chanData.w,
    false
  );

  const placement = computeContainPlacement(
    placed.width,
    placed.height,
    layout.artboardWidth,
    layout.artboardHeight
  );

  finalCtx.drawImage(
    placed,
    0,
    0,
    placed.width,
    placed.height,
    layout.artOffsetX + placement.offsetX,
    layout.artOffsetY + placement.offsetY,
    placement.drawWidth,
    placement.drawHeight
  );

  releaseCanvasMemory(placed, placed.getContext('2d'));
  return { canvas: finalCanvas, ctx: finalCtx };
}

async function downloadAsJpeg() {
  if (!uploaded || !sourceCanvas) return;

  const chanData = getCMYKGraysCached();
  if (!chanData) return;
  const { w, h } = chanData;

  const canvas = document.createElement('canvas');
  canvas.width = w * EXPORT_SCALE;
  canvas.height = h * EXPORT_SCALE;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'multiply';

  const channels = ['k', 'c', 'm', 'y'];
  channels.forEach(ch => {
    if (!channelVisible(ch)) return;
    const can = halftoneChannelCombined(ch, chanData, getShapeForChannel(ch), true, EXPORT_SCALE, false);
    ctx.drawImage(can, 0, 0);
    releaseCanvasMemory(can, can.getContext('2d'));
  });

  const link = document.createElement('a');
  link.download = 'cmyk_halftone_preview.jpg';
  link.href = canvas.toDataURL('image/jpeg', 0.95);
  link.click();

  releaseCanvasMemory(canvas, ctx);
}

async function downloadAsLayers(formatLabel = 'original') {
  if (!uploaded || !sourceCanvas) return;

  const chanData = getCMYKGraysCached();
  if (!chanData) return;
  const { w, h } = chanData;
  const layout = getPrintLayout(formatLabel, w, h);

  const channels = ['c', 'm', 'y', 'k'];

  for (const ch of channels) {
    if (!channelVisible(ch)) continue;

    const rendered = renderChannelToFinalPrintCanvas(ch, chanData, layout);
    const canvas = rendered.canvas;
    const ctx = rendered.ctx;

    const blob = await canvasToPngBlobWith300Dpi(canvas);
    downloadBlob(blob, `halftone_${ch}_${layout.formatName}_${layout.outerFormatName}.png`);

    releaseCanvasMemory(canvas, ctx);
  }
}

async function downloadAsLabeledLayers(formatLabel = 'original') {
  if (!uploaded || !sourceCanvas) return;

  const chanData = getCMYKGraysCached();
  if (!chanData) return;
  const { w, h } = chanData;
  const layout = getPrintLayout(formatLabel, w, h);

  const channels = ['c', 'm', 'y', 'k'];

  for (const ch of channels) {
    if (!channelVisible(ch)) continue;

    const rendered = renderChannelToFinalPrintCanvas(ch, chanData, layout);
    const canvas = rendered.canvas;
    const ctx = rendered.ctx;

    drawScreenprintHeader(
      ctx,
      ch,
      layout.formatName,
      layout.outerFormatName,
      layout.artOffsetX,
      layout.artOffsetY
    );

    drawDiagonalRegistrationMarks(ctx, canvas.width, canvas.height);

    const blob = await canvasToPngBlobWith300Dpi(canvas);
    downloadBlob(blob, `halftone_${ch}_${layout.formatName}_${layout.outerFormatName}_labeled.png`);

    releaseCanvasMemory(canvas, ctx);
  }
}