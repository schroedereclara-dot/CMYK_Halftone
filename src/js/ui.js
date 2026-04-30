// src/js/ui.js
'use strict';

// Bild / Quelle
let originalImg = null;
let sourceCanvas = null;
let sourceCtx = null;
let uploaded = false;

// Globale Parameter
let dotSize = 10;
let spacing = 10;
let density = 1.0;
let preview = true;
let jitter = 0.0;

// Preview Zoom (nur Darstellung)
let previewZoom = 1.0;

// Pan-Offset (nur Darstellung)
let panOffsetX = 0;
let panOffsetY = 0;

// Performance-Preview (geringeres Sampling in der Vorschau)
let fastPreview = false;

// Globale Punktform
let dotShape = 'circle';

// Kanal-spezifische Formen ('global' = nutze dotShape)
let shapeC = 'global';
let shapeM = 'global';
let shapeY = 'global';
let shapeK = 'global';

// Per-Kanal Punktgröße (Faktor auf global)
let dotSizeFactorC = 1.0;
let dotSizeFactorM = 1.0;
let dotSizeFactorY = 1.0;
let dotSizeFactorK = 1.0;

// Image-Winkel (Motiv)
let angleC = 0, angleM = 0, angleY = 0, angleK = 0;

// Screen-Winkel (Raster)
let screenAngleC = 75, screenAngleM = 15, screenAngleY = 0, screenAngleK = 45;

// Sichtbarkeit der Kanäle
let showC = true;
let showM = true;
let showY = true;
let showK = true;

// CMYK-Cache
let cachedCMYK = null;
let cachedWidth = 0;
let cachedHeight = 0;

// Halftone neu berechnen?
let halftoneDirty = true;

// Fullscreen-State
let isFullscreenMode = false;

// Zustand Advanced-Panel
let advancedVisible = false;

// von sketch.js aufgerufen
function initUI() {
  setupControls();
  setupImageUpload();
  setupFullscreenToggle();
  setupAdvancedToggle();
}

// -------------------- Controls --------------------
function setupControls() {
  const dotSizeEl = document.getElementById('dotSize');
  const spacingEl = document.getElementById('spacing');
  const densityEl = document.getElementById('density');
  const jitterEl = document.getElementById('jitter');
  const previewEl = document.getElementById('preview');
  const fastPreviewEl = document.getElementById('fastPreview');

  const zoomEl = document.getElementById('previewZoom');
  const zoomValueEl = document.getElementById('zoomValue');

  const globalShapeButtons = document.querySelectorAll('.global-shape-btn');
  const shapeButtons = document.querySelectorAll('.shape-btn[data-channel]');

  const dotSizeCEl = document.getElementById('dotSizeC');
  const dotSizeMEl = document.getElementById('dotSizeM');
  const dotSizeYEl = document.getElementById('dotSizeY');
  const dotSizeKEl = document.getElementById('dotSizeK');

  const angleCEl = document.getElementById('angleC');
  const angleMEl = document.getElementById('angleM');
  const angleYEl = document.getElementById('angleY');
  const angleKEl = document.getElementById('angleK');

  const imgAngleCEl = document.getElementById('imgAngleC');
  const imgAngleMEl = document.getElementById('imgAngleM');
  const imgAngleYEl = document.getElementById('imgAngleY');
  const imgAngleKEl = document.getElementById('imgAngleK');

  const channelCEnabledEl = document.getElementById('channelCEnabled');
  const channelMEnabledEl = document.getElementById('channelMEnabled');
  const channelYEnabledEl = document.getElementById('channelYEnabled');
  const channelKEnabledEl = document.getElementById('channelKEnabled');

  const presetBtn = document.getElementById('anglesPresetBtn');
  const downloadJpegBtn = document.getElementById('downloadJpeg');
  const downloadLayersBtn = document.getElementById('downloadLayers');
  const resetBtn = document.getElementById('resetBtn');

  if (dotSizeEl) {
    dotSizeEl.addEventListener('input', (e) => {
      dotSize = Number(e.target.value);
      document.getElementById('dotSizeValue').textContent = dotSize;
      halftoneDirty = true;
    });
  }

  if (spacingEl) {
    spacingEl.addEventListener('input', (e) => {
      spacing = Number(e.target.value);
      document.getElementById('spacingValue').textContent = spacing;
      halftoneDirty = true;
    });
  }

  if (densityEl) {
    densityEl.addEventListener('input', (e) => {
      density = Number(e.target.value);
      document.getElementById('densityValue').textContent = density.toFixed(1);
      halftoneDirty = true;
    });
  }

  if (jitterEl) {
    jitterEl.addEventListener('input', (e) => {
      jitter = Number(e.target.value);
      document.getElementById('jitterValue').textContent = jitter.toFixed(2);
      halftoneDirty = true;
    });
  }

  // Preview Zoom
  if (zoomEl && zoomValueEl) {
    zoomEl.addEventListener('input', (e) => {
      const val = Number(e.target.value); // 50–300
      previewZoom = val / 100.0;
      zoomValueEl.textContent = val;
    });
  }

  // Performance-Preview
  if (fastPreviewEl) {
    fastPreviewEl.addEventListener('change', (e) => {
      fastPreview = e.target.checked;
      halftoneDirty = true;
    });
  }

  if (previewEl) {
    previewEl.addEventListener('change', (e) => {
      preview = e.target.checked;
    });
  }

  // globale Shape-Buttons
  globalShapeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const shp = btn.dataset.globalShape;
      dotShape = shp;
      globalShapeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      halftoneDirty = true;
    });
  });

  // per-Channel Dot-Size
  if (dotSizeCEl) {
    dotSizeCEl.addEventListener('input', (e) => {
      dotSizeFactorC = Number(e.target.value);
      document.getElementById('dotSizeCValue').textContent = dotSizeFactorC.toFixed(2);
      halftoneDirty = true;
    });
  }
  if (dotSizeMEl) {
    dotSizeMEl.addEventListener('input', (e) => {
      dotSizeFactorM = Number(e.target.value);
      document.getElementById('dotSizeMValue').textContent = dotSizeFactorM.toFixed(2);
      halftoneDirty = true;
    });
  }
  if (dotSizeYEl) {
    dotSizeYEl.addEventListener('input', (e) => {
      dotSizeFactorY = Number(e.target.value);
      document.getElementById('dotSizeYValue').textContent = dotSizeFactorY.toFixed(2);
      halftoneDirty = true;
    });
  }
  if (dotSizeKEl) {
    dotSizeKEl.addEventListener('input', (e) => {
      dotSizeFactorK = Number(e.target.value);
      document.getElementById('dotSizeKValue').textContent = dotSizeFactorK.toFixed(2);
      halftoneDirty = true;
    });
  }

  // Screen-Winkel
  if (angleCEl) {
    angleCEl.addEventListener('input', (e) => {
      screenAngleC = Number(e.target.value);
      document.getElementById('angleCValue').textContent = screenAngleC;
      halftoneDirty = true;
    });
  }
  if (angleMEl) {
    angleMEl.addEventListener('input', (e) => {
      screenAngleM = Number(e.target.value);
      document.getElementById('angleMValue').textContent = screenAngleM;
      halftoneDirty = true;
    });
  }
  if (angleYEl) {
    angleYEl.addEventListener('input', (e) => {
      screenAngleY = Number(e.target.value);
      document.getElementById('angleYValue').textContent = screenAngleY;
      halftoneDirty = true;
    });
  }
  if (angleKEl) {
    angleKEl.addEventListener('input', (e) => {
      screenAngleK = Number(e.target.value);
      document.getElementById('angleKValue').textContent = screenAngleK;
      halftoneDirty = true;
    });
  }

  // Image-Winkel
  if (imgAngleCEl) {
    imgAngleCEl.addEventListener('input', (e) => {
      angleC = Number(e.target.value);
      document.getElementById('imgAngleCValue').textContent = angleC;
      halftoneDirty = true;
    });
  }
  if (imgAngleMEl) {
    imgAngleMEl.addEventListener('input', (e) => {
      angleM = Number(e.target.value);
      document.getElementById('imgAngleMValue').textContent = angleM;
      halftoneDirty = true;
    });
  }
  if (imgAngleYEl) {
    imgAngleYEl.addEventListener('input', (e) => {
      angleY = Number(e.target.value);
      document.getElementById('imgAngleYValue').textContent = angleY;
      halftoneDirty = true;
    });
  }
  if (imgAngleKEl) {
    imgAngleKEl.addEventListener('input', (e) => {
      angleK = Number(e.target.value);
      document.getElementById('imgAngleKValue').textContent = angleK;
      halftoneDirty = true;
    });
  }

  // Kanal-Sichtbarkeit
  if (channelCEnabledEl) {
    channelCEnabledEl.addEventListener('change', (e) => {
      showC = e.target.checked;
      halftoneDirty = true;
    });
  }
  if (channelMEnabledEl) {
    channelMEnabledEl.addEventListener('change', (e) => {
      showM = e.target.checked;
      halftoneDirty = true;
    });
  }
  if (channelYEnabledEl) {
    channelYEnabledEl.addEventListener('change', (e) => {
      showY = e.target.checked;
      halftoneDirty = true;
    });
  }
  if (channelKEnabledEl) {
    channelKEnabledEl.addEventListener('change', (e) => {
      showK = e.target.checked;
      halftoneDirty = true;
    });
  }

  // Kanal-Shape-Buttons
  shapeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const ch = btn.dataset.channel;
      const shp = btn.dataset.shape;

      if (ch === 'c') shapeC = shp;
      if (ch === 'm') shapeM = shp;
      if (ch === 'y') shapeY = shp;
      if (ch === 'k') shapeK = shp;

      const row = btn.parentElement;
      if (row) {
        row.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
      }
      btn.classList.add('active');

      halftoneDirty = true;
    });
  });

  markInitialChannelShapeButtons();

  if (presetBtn) {
    presetBtn.addEventListener('click', () => {
      screenAngleC = 75;
      screenAngleM = 15;
      screenAngleY = 0;
      screenAngleK = 45;

      angleCEl.value = screenAngleC;
      angleMEl.value = screenAngleM;
      angleYEl.value = screenAngleY;
      angleKEl.value = screenAngleK;

      document.getElementById('angleCValue').textContent = screenAngleC;
      document.getElementById('angleMValue').textContent = screenAngleM;
      document.getElementById('angleYValue').textContent = screenAngleY;
      document.getElementById('angleKValue').textContent = screenAngleK;

      halftoneDirty = true;
    });
  }

  if (downloadJpegBtn) downloadJpegBtn.addEventListener('click', downloadAsJpeg);
  if (downloadLayersBtn) downloadLayersBtn.addEventListener('click', downloadAsLayers);

  if (resetBtn) resetBtn.addEventListener('click', resetParametersOnly);
}

function markInitialChannelShapeButtons() {
  document.querySelectorAll('.shape-row').forEach(row => {
    const gBtn = row.querySelector('[data-shape="global"]');
    if (gBtn) gBtn.classList.add('active');
  });
}

// -------------------- Advanced Toggle --------------------
function setupAdvancedToggle() {
  const btn = document.getElementById('advancedToggleBtn');
  const panel = document.getElementById('advancedPanel');
  if (!btn || !panel) return;

  // Startzustand: sichtbar (wie vorher "open")
  advancedVisible = true;
  panel.classList.add('visible');

  btn.addEventListener('click', () => {
    advancedVisible = !advancedVisible;
    if (advancedVisible) {
      panel.classList.add('visible');
    } else {
      panel.classList.remove('visible');
    }
  });
}

// -------------------- Fullscreen / Panel Hide --------------------
function setupFullscreenToggle() {
  const body = document.body;
  const toggleBtn = document.getElementById('panel-toggle-btn');
  const restoreBtn = document.getElementById('panel-restore-btn');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      isFullscreenMode = true;
      body.classList.add('fullscreen-mode');
      if (typeof windowResized === 'function') {
        windowResized();
      }
    });
  }

  if (restoreBtn) {
    restoreBtn.addEventListener('click', () => {
      isFullscreenMode = false;
      body.classList.remove('fullscreen-mode');
      if (typeof windowResized === 'function') {
        windowResized();
      }
    });
  }
}

// -------------------- Reset --------------------
function resetParametersOnly() {
  dotSize = 10;
  spacing = 10;
  density = 1.0;
  jitter = 0.0;

  previewZoom = 1.0;
  const zoomEl = document.getElementById('previewZoom');
  const zoomValueEl = document.getElementById('zoomValue');
  if (zoomEl) zoomEl.value = 100;
  if (zoomValueEl) zoomValueEl.textContent = 100;

  panOffsetX = 0;
  panOffsetY = 0;

  fastPreview = false;
  const fastPreviewEl = document.getElementById('fastPreview');
  if (fastPreviewEl) fastPreviewEl.checked = false;

  dotShape = 'circle';
  shapeC = 'global';
  shapeM = 'global';
  shapeY = 'global';
  shapeK = 'global';

  dotSizeFactorC = 1.0;
  dotSizeFactorM = 1.0;
  dotSizeFactorY = 1.0;
  dotSizeFactorK = 1.0;

  screenAngleC = 75;
  screenAngleM = 15;
  screenAngleY = 0;
  screenAngleK = 45;

  angleC = 0;
  angleM = 0;
  angleY = 0;
  angleK = 0;

  showC = true;
  showM = true;
  showY = true;
  showK = true;

  preview = true;

  document.getElementById('dotSize').value = 10;
  document.getElementById('dotSizeValue').textContent = 10;

  document.getElementById('spacing').value = 10;
  document.getElementById('spacingValue').textContent = 10;

  document.getElementById('density').value = 1;
  document.getElementById('densityValue').textContent = '1.0';

  document.getElementById('jitter').value = 0;
  document.getElementById('jitterValue').textContent = '0.00';

  document.querySelectorAll('.global-shape-btn').forEach(btn => btn.classList.remove('active'));
  const globalCircle = document.querySelector('.global-shape-btn[data-global-shape="circle"]');
  if (globalCircle) globalCircle.classList.add('active');

  const setDot = (idSlider, idLabel) => {
    const elS = document.getElementById(idSlider);
    const elL = document.getElementById(idLabel);
    if (elS) elS.value = 1;
    if (elL) elL.textContent = '1.00';
  };
  setDot('dotSizeC', 'dotSizeCValue');
  setDot('dotSizeM', 'dotSizeMValue');
  setDot('dotSizeY', 'dotSizeYValue');
  setDot('dotSizeK', 'dotSizeKValue');

  const setAng = (idSlider, idLabel, value) => {
    const s = document.getElementById(idSlider);
    const l = document.getElementById(idLabel);
    if (s) s.value = value;
    if (l) l.textContent = value;
  };
  setAng('angleC', 'angleCValue', 75);
  setAng('angleM', 'angleMValue', 15);
  setAng('angleY', 'angleYValue', 0);
  setAng('angleK', 'angleKValue', 45);

  setAng('imgAngleC', 'imgAngleCValue', 0);
  setAng('imgAngleM', 'imgAngleMValue', 0);
  setAng('imgAngleY', 'imgAngleYValue', 0);
  setAng('imgAngleK', 'imgAngleKValue', 0);

  ['C', 'M', 'Y', 'K'].forEach(ch => {
    const cb = document.getElementById(`channel${ch}Enabled`);
    if (cb) cb.checked = true;
  });

  document.getElementById('preview').checked = true;

  document.querySelectorAll('.shape-row').forEach(row => {
    row.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
    const gBtn = row.querySelector('[data-shape="global"]');
    if (gBtn) gBtn.classList.add('active');
  });

  // Advanced Panel wieder sichtbar machen
  const panel = document.getElementById('advancedPanel');
  if (panel) {
    panel.classList.add('visible');
    advancedVisible = true;
  }

  halftoneDirty = true;
}

// -------------------- Image Upload --------------------
function setupImageUpload() {
  const fileInput = document.getElementById('imageUpload');
  const dropZone = document.getElementById('dropZone');

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) loadImageFile(e.target.files[0]);
    });
  }

  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) loadImageFile(e.dataTransfer.files[0]);
    });
  }
}

function loadImageFile(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      originalImg = img;

      const maxSide = 1600;
      let w = img.width;
      let h = img.height;
      const scale = Math.min(1, maxSide / Math.max(w, h));
      w = Math.round(w * scale);
      h = Math.round(h * scale);

      if (!sourceCanvas) {
        sourceCanvas = document.createElement('canvas');
        sourceCtx = sourceCanvas.getContext('2d');
      }

      sourceCanvas.width = w;
      sourceCanvas.height = h;
      sourceCtx.clearRect(0, 0, w, h);
      sourceCtx.drawImage(img, 0, 0, w, h);

      cachedCMYK = null;
      cachedWidth = w;
      cachedHeight = h;

      uploaded = true;
      halftoneDirty = true;
      console.log('Bild geladen, skaliert auf:', w, 'x', h);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}
