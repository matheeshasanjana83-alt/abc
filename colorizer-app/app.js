(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const app = $('#app');
  const ageGate = $('#ageGate');
  const stage = $('#stage');
  const originalPreview = $('#originalPreview');
  const canvas = $('#colorCanvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const fileInput = $('#fileInput');
  const dropZone = $('#dropZone');
  const compareRange = $('#compareRange');
  const compareHandle = $('#compareHandle');
  const fileName = $('#fileName');
  const processStatus = $('#processStatus');
  const statusDetail = $('#statusDetail');
  const rightsCheck = $('#rightsCheck');
  const renderButton = $('#renderButton');
  const downloadButton = $('#downloadButton');
  const emptyState = $('#emptyState');
  const zoomLabel = $('#zoomLabel');

  const controls = {
    shadow: $('#shadowColor'),
    mid: $('#midColor'),
    highlight: $('#highlightColor'),
    coverage: $('#coverage'),
    vibrance: $('#vibrance'),
    contrast: $('#contrast'),
    warmth: $('#warmth')
  };

  const presets = {
    sakura: { shadow: '#322B57', mid: '#D56E91', highlight: '#F9DEB5', coverage: 78, vibrance: 18, contrast: 12, warmth: 6 },
    midnight: { shadow: '#1F2859', mid: '#546CBC', highlight: '#D9EAFF', coverage: 82, vibrance: 12, contrast: 18, warmth: -17 },
    sunset: { shadow: '#843E4F', mid: '#EC8B6B', highlight: '#FFF0BC', coverage: 73, vibrance: 23, contrast: 7, warmth: 28 },
    neon: { shadow: '#1F2454', mid: '#D84FAD', highlight: '#B9FBE8', coverage: 86, vibrance: 35, contrast: 20, warmth: -5 }
  };

  let sourceImage = new Image();
  let sourceLoaded = false;
  let currentObjectUrl = null;
  let zoom = 1;
  let renderTimer;

  function hexToRgb(hex) {
    const value = hex.replace('#', '');
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16)
    };
  }

  function clamp(value) { return Math.max(0, Math.min(255, value)); }
  function mix(a, b, weight) { return a + (b - a) * weight; }
  function updateColorWell(input, prefix) {
    const color = input.value.toUpperCase();
    $(`.${prefix}-well`).style.background = color;
    $(`#${prefix}Hex`).textContent = color;
  }
  function setRangeFill(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const percent = ((Number(input.value) - min) / (max - min)) * 100;
    input.style.setProperty('--fill', `${percent}%`);
  }
  function updateRangeLabel(input) {
    const unit = input === controls.coverage ? '%' : '';
    $(`#${input.id}Value`).textContent = `${input.value}${unit}`;
    setRangeFill(input);
  }

  function syncUi() {
    updateColorWell(controls.shadow, 'shadow');
    updateColorWell(controls.mid, 'mid');
    updateColorWell(controls.highlight, 'highlight');
    Object.values(controls).filter((item) => item.type === 'range').forEach(updateRangeLabel);
  }

  function updateActionState() {
    const enabled = rightsCheck.checked && sourceLoaded;
    renderButton.disabled = !enabled;
    downloadButton.disabled = !enabled;
  }

  function setStatus(title, detail, isWorking = false) {
    processStatus.textContent = title;
    statusDetail.textContent = detail;
    $('.pulse').style.background = isWorking ? '#e6a154' : '#70a77c';
  }

  function resizeCanvas() {
    if (!sourceLoaded) return;
    const maxDimension = 2000;
    const scale = Math.min(1, maxDimension / Math.max(sourceImage.naturalWidth, sourceImage.naturalHeight));
    canvas.width = Math.max(1, Math.round(sourceImage.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceImage.naturalHeight * scale));
  }

  function applyColorPass() {
    if (!sourceLoaded) return;
    resizeCanvas();

    const source = document.createElement('canvas');
    source.width = canvas.width;
    source.height = canvas.height;
    const sourceContext = source.getContext('2d', { willReadFrequently: true });
    sourceContext.drawImage(sourceImage, 0, 0, source.width, source.height);

    const imageData = sourceContext.getImageData(0, 0, source.width, source.height);
    const data = imageData.data;
    const shadow = hexToRgb(controls.shadow.value);
    const mid = hexToRgb(controls.mid.value);
    const highlight = hexToRgb(controls.highlight.value);
    const coverage = Number(controls.coverage.value) / 100;
    const vibrance = Number(controls.vibrance.value) / 50;
    const contrast = Number(controls.contrast.value) / 100;
    const warmth = Number(controls.warmth.value) / 50;

    for (let i = 0; i < data.length; i += 4) {
      const originalR = data[i];
      const originalG = data[i + 1];
      const originalB = data[i + 2];
      const alpha = data[i + 3];
      if (alpha === 0) continue;

      const luminance = (originalR * 0.2126 + originalG * 0.7152 + originalB * 0.0722) / 255;
      const lowerHalf = luminance < .5;
      const colorStart = lowerHalf ? shadow : mid;
      const colorEnd = lowerHalf ? mid : highlight;
      const point = lowerHalf ? luminance * 2 : (luminance - .5) * 2;
      let r = mix(colorStart.r, colorEnd.r, point);
      let g = mix(colorStart.g, colorEnd.g, point);
      let b = mix(colorStart.b, colorEnd.b, point);

      // Preserve a little original material in lower coverage and amplify palette distance at higher vibrance.
      const average = (r + g + b) / 3;
      r = mix(average, r, 1 + vibrance * .32);
      g = mix(average, g, 1 + vibrance * .32);
      b = mix(average, b, 1 + vibrance * .32);

      r = r + warmth * 20;
      b = b - warmth * 18;
      r = (r - 127.5) * (1 + contrast) + 127.5;
      g = (g - 127.5) * (1 + contrast) + 127.5;
      b = (b - 127.5) * (1 + contrast) + 127.5;

      data[i] = clamp(mix(originalR, r, coverage));
      data[i + 1] = clamp(mix(originalG, g, coverage));
      data[i + 2] = clamp(mix(originalB, b, coverage));
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.putImageData(imageData, 0, 0);
    setStatus('Color pass ready', '— Palette mapped locally');
  }

  function scheduleRender() {
    if (!sourceLoaded) return;
    setStatus('Adjusting', '— Updating the palette', true);
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(applyColorPass, 80);
  }

  function setComparison(value) {
    canvas.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
    compareHandle.style.left = `${value}%`;
  }

  function setZoom(nextZoom) {
    zoom = Math.max(.8, Math.min(1.35, nextZoom));
    stage.style.setProperty('--zoom', zoom);
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  }

  function loadSource(src, name = 'untitled-artwork') {
    sourceLoaded = false;
    updateActionState();
    setStatus('Loading canvas', '— Preparing your illustration', true);
    sourceImage = new Image();
    sourceImage.onload = () => {
      sourceLoaded = true;
      originalPreview.src = src;
      originalPreview.alt = `Original preview: ${name}`;
      fileName.textContent = name;
      emptyState.hidden = true;
      setZoom(1);
      applyColorPass();
      updateActionState();
    };
    sourceImage.onerror = () => {
      sourceLoaded = false;
      setStatus('Could not load', '— Try a PNG, JPG, WebP, or SVG');
      emptyState.hidden = false;
      updateActionState();
    };
    sourceImage.src = src;
  }

  function readFile(file) {
    if (!file) return;
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.type) || file.size > 15 * 1024 * 1024) {
      setStatus('File not accepted', '— Use PNG, JPG, WebP, or SVG under 15 MB');
      return;
    }
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = URL.createObjectURL(file);
    loadSource(currentObjectUrl, file.name);
  }

  function applyPreset(presetName) {
    const preset = presets[presetName];
    Object.entries(preset).forEach(([key, value]) => { controls[key].value = value; });
    $$('.preset-card').forEach((button) => button.classList.toggle('active', button.dataset.preset === presetName));
    syncUi();
    scheduleRender();
  }

  function randomHex() {
    const hue = Math.floor(Math.random() * 360);
    const saturation = 48 + Math.floor(Math.random() * 30);
    const lightness = 28 + Math.floor(Math.random() * 20);
    const c = (1 - Math.abs(2 * lightness / 100 - 1)) * saturation / 100;
    const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
    const m = lightness / 100 - c / 2;
    const [r, g, b] = hue < 60 ? [c,x,0] : hue < 120 ? [x,c,0] : hue < 180 ? [0,c,x] : hue < 240 ? [0,x,c] : hue < 300 ? [x,0,c] : [c,0,x];
    return `#${[r,g,b].map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  }

  $('#acceptGate').addEventListener('click', () => {
    ageGate.classList.add('is-hidden');
    app.setAttribute('aria-hidden', 'false');
  });
  $('#exitGate').addEventListener('click', () => {
    $('.gate-card').innerHTML = '<div class="gate-mark">S</div><p class="eyebrow">SESSION CLOSED</p><h1>Thanks for checking in.</h1><p class="gate-copy">This workspace is restricted to responsible, adult fictional illustration. You can close this tab now.</p>';
  });

  $('#uploadButton').addEventListener('click', () => fileInput.click());
  $('#emptyUploadButton').addEventListener('click', () => fileInput.click());
  $('#demoButton').addEventListener('click', () => loadSource('assets/demo-line-art.svg', 'studio-demo.svg'));
  fileInput.addEventListener('change', ({ target }) => readFile(target.files[0]));

  ['dragenter', 'dragover'].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.style.outline = '2px dashed #bd7084';
    dropZone.style.outlineOffset = '-8px';
  }));
  ['dragleave', 'drop'].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.style.outline = '';
    dropZone.style.outlineOffset = '';
  }));
  dropZone.addEventListener('drop', (event) => readFile(event.dataTransfer.files[0]));

  compareRange.addEventListener('input', (event) => setComparison(event.target.value));
  $$('.view-choice').forEach((button) => button.addEventListener('click', () => {
    $$('.view-choice').forEach((choice) => choice.classList.toggle('active', choice === button));
    stage.classList.remove('view-compare', 'view-color', 'view-original');
    stage.classList.add(`view-${button.dataset.view}`);
  }));

  Object.entries(controls).forEach(([key, input]) => {
    input.addEventListener('input', () => {
      if (key === 'shadow' || key === 'mid' || key === 'highlight') updateColorWell(input, key);
      else updateRangeLabel(input);
      $$('.preset-card').forEach((card) => card.classList.remove('active'));
      scheduleRender();
    });
  });

  $$('.preset-card').forEach((button) => button.addEventListener('click', () => applyPreset(button.dataset.preset)));
  $('#randomizeButton').addEventListener('click', () => {
    controls.shadow.value = randomHex();
    controls.mid.value = randomHex();
    controls.highlight.value = '#FFF4D6';
    syncUi();
    $$('.preset-card').forEach((card) => card.classList.remove('active'));
    scheduleRender();
  });
  $('#resetButton').addEventListener('click', () => applyPreset('sakura'));
  $('#adjustCollapse').addEventListener('click', (event) => {
    const isCollapsed = $('#sliders').classList.toggle('is-collapsed');
    event.currentTarget.textContent = isCollapsed ? '+' : '−';
    event.currentTarget.setAttribute('aria-expanded', String(!isCollapsed));
  });

  rightsCheck.addEventListener('change', updateActionState);
  renderButton.addEventListener('click', () => {
    setStatus('Applying color pass', '— Rendering full local preview', true);
    window.setTimeout(applyColorPass, 100);
  });
  downloadButton.addEventListener('click', () => {
    if (!sourceLoaded) return;
    const link = document.createElement('a');
    const safeName = fileName.textContent.replace(/\.[^/.]+$/, '').replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
    link.download = `${safeName || 'spectra'}-color-pass.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    setStatus('PNG downloaded', '— Your color pass is saved locally');
  });
  $('#zoomIn').addEventListener('click', () => setZoom(zoom + .1));
  $('#zoomOut').addEventListener('click', () => setZoom(zoom - .1));

  syncUi();
  setComparison(compareRange.value);
  loadSource('assets/demo-line-art.svg', 'studio-demo.svg');
})();
