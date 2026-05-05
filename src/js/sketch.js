// src/js/sketch.js
'use strict';

// p5-Canvas Referenz
let previewCanvas = null;

// Drag-State für Pan
let isPanning = false;
let lastMouseX = 0;
let lastMouseY = 0;

// Farben für Preview
const CH_COLORS = {
  c: 'rgba(0,180,200,0.9)',
  m: 'rgba(200,0,140,0.9)',
  y: 'rgba(240,200,0,0.9)',
  k: 'rgba(0,0,0,0.95)'
};

// Halftone-Cache (Preview)
const halftoneCache = {
  c: null,
  m: null,
  y: null,
  k: null
};

// Export-Scale (Faktor für höhere Auflösung beim Export)
const EXPORT_SCALE = 3; // bei Bedarf 2 oder 4 testen

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
    text('Lade ein Bild hoch, um CMYK-Halftone zu erzeugen und zu experimentieren.', width / 2, height / 2);
    return;
  }

  if (!preview) return;

  const chanData = getCMYKGraysCached();
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
  if (container) {
    resizeCanvas(container.offsetWidth, container.offsetHeight);
  }
}

// Maus-Events für Pan
function mousePressed() {
  if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
    isPanning = true;
    lastMouseX = mouseX;
    lastMouseY = mouseY;
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
}

// effektive Shape pro Kanal
function getShapeForChannel(ch) {
  if (ch === 'c') return shapeC === 'global' ? dotShape : shapeC;
  if (ch === 'm') return shapeM === 'global' ? dotShape : shapeM;
  if (ch === 'y') return shapeY === 'global' ? dotShape : shapeY;
  if (ch === 'k') return shapeK === 'global' ? dotShape : shapeK;
  return dotShape;
}

// CMYK-Separation + Cache
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

// Halftone pro Kanal, optional farbig / schwarz + Scale
// isPreview: true = Preview (Speed-Option gültig), false = Export (immer volle Dichte)
function halftoneChannelCombined(channel, chanData, shape, useColor, scaleFactor, isPreview) {
  const { C, M, Y, K, w, h } = chanData;
  const src = { c: C, m: M, y: Y, k: K }[channel];

  const sf = scaleFactor || 1;

  const canvas = document.createElement('canvas');
  canvas.width = w * sf;
  canvas.height = h * sf;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (useColor) {
    ctx.fillStyle = CH_COLORS[channel];
  } else {
    ctx.fillStyle = 'black';
  }

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

  let step = Math.max(2, Math.round(spacing));
  if (isPreview && fastPreview) {
    step = Math.max(2, Math.round(step * 1.8));
  }

  const maxRadius = dotSize * sizeFactor;

  const halfW = w / 2;
  const halfH = h / 2;

  // Erweiterte Bounds, damit die rotierte Grid-Fläche das ganze Bild sicher abdeckt
  const diag = Math.sqrt(w * w + h * h);
  const gridMinX = -diag * 0.5;
  const gridMaxX = diag * 0.5;
  const gridMinY = -diag * 0.5;
  const gridMaxY = diag * 0.5;

  for (let gy = gridMinY; gy <= gridMaxY; gy += step) {
    for (let gx = gridMinX; gx <= gridMaxX; gx += step) {
      // Gedrehtes Screen-Grid global über die Fläche
      const px = halfW + (gx * cosS - gy * sinS);
      const py = halfH + (gx * sinS + gy * cosS);

      if (px < 0 || px >= w || py < 0 || py >= h) continue;

      const dx = px - halfW;
      const dy = py - halfH;

      // optionaler Bildwinkel: nur Sampling des Bildes, nicht das Screen-Grid selbst
      const sx = Math.round(cosI * dx - sinI * dy + halfW);
      const sy = Math.round(sinI * dx + cosI * dy + halfH);

      if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;

      const idx = sy * w + sx;
      const gray = src[idx];
      const ink = gray / 255.0;
      if (ink <= 0.01) continue;

      const radius = Math.max(0.2, ink * maxRadius * density) * sf;
      const size = radius * 2;

      let drawX = px * sf;
      let drawY = py * sf;

      if (jitter > 0) {
        const maxOffset = step * jitter * 0.5 * sf;
        drawX += (Math.random() * 2 - 1) * maxOffset;
        drawY += (Math.random() * 2 - 1) * maxOffset;
      }

      drawDotShape(ctx, drawX, drawY, radius, size, shape);
    }
  }

  return canvas;
}

// Punktformen
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

  // Fallback
  ctx.moveTo(x + radius, y);
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

// Export-Funktionen (JPEG + Layer) – nutzen immer volle Dichte
function downloadAsJpeg() {
  if (!uploaded || !sourceCanvas) return;

  const chanData = getCMYKGraysCached();
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
    const showFlag =
      (ch === 'c' && showC) ||
      (ch === 'm' && showM) ||
      (ch === 'y' && showY) ||
      (ch === 'k' && showK);
    if (!showFlag) return;

    const can = halftoneChannelCombined(ch, chanData, getShapeForChannel(ch), true, EXPORT_SCALE, false);
    ctx.drawImage(can, 0, 0);
  });

  const link = document.createElement('a');
  link.download = 'cmyk_halftone_preview.jpg';
  link.href = canvas.toDataURL('image/jpeg', 0.95);
  link.click();
}

function downloadAsLayers() {
  if (!uploaded || !sourceCanvas) return;

  const chanData = getCMYKGraysCached();
  const { w, h } = chanData;

  const channels = ['c', 'm', 'y', 'k'];
  channels.forEach(ch => {
    const showFlag =
      (ch === 'c' && showC) ||
      (ch === 'm' && showM) ||
      (ch === 'y' && showY) ||
      (ch === 'k' && showK);
    if (!showFlag) return;

    const canvas = document.createElement('canvas');
    canvas.width = w * EXPORT_SCALE;
    canvas.height = h * EXPORT_SCALE;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'black';

    const can = halftoneChannelCombined(ch, chanData, getShapeForChannel(ch), false, EXPORT_SCALE, false);
    ctx.drawImage(can, 0, 0);

    const link = document.createElement('a');
    link.download = `halftone_${ch}_hires.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
}