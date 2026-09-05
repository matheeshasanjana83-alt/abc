(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const maxFiles = 30;
  const acceptedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
  const canvas = $('#resultCanvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const sourceImage = new Image();
  const originalImage = $('#originalImage');
  const imageStage = $('#imageStage');
  const comparison = $('#comparison');
  const comparisonHandle = $('#comparisonHandle');
  const pageList = $('#pageList');
  const dropHint = $('#dropHint');
  const pageUpload = $('#pageUpload');
  const controls = { dark: $('#darkColor'), mid: $('#midColor'), light: $('#lightColor'), coverage: $('#coverage'), ink: $('#ink'), intensity: $('#intensity'), warmth: $('#warmth') };
  const palettes = {
    rose: { dark: '#332556', mid: '#D26F91', light: '#FFE4BF', coverage: 76, ink: 84, intensity: 22, warmth: 8 },
    night: { dark: '#1E2455', mid: '#5271BF', light: '#DFECFF', coverage: 82, ink: 88, intensity: 19, warmth: -16 },
    gold: { dark: '#823F4D', mid: '#E99560', light: '#FFF1B9', coverage: 72, ink: 82, intensity: 24, warmth: 27 },
    aqua: { dark: '#1C3B59', mid: '#AD5EAB', light: '#D0FFE8', coverage: 86, ink: 86, intensity: 33, warmth: -5 }
  };
  const pages = [];
  let currentPageIndex = -1;
  let isReady = false;
  let renderDelay;

  const hexToRgb = (hex) => { const v = hex.replace('#',''); return { r: parseInt(v.substring(0,2),16), g: parseInt(v.substring(2,4),16), b: parseInt(v.substring(4,6),16) }; };
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const blend = (start, end, amount) => start + (end - start) * amount;

  function updateStatus(title, detail, working = false) {
    $('#processingText').textContent = title;
    $('#processingDetail').textContent = `— ${detail}`;
    $('#processingDot').style.background = working ? '#e4a45d' : '#6fa77b';
  }
  function setRangeUi(input) {
    const fill = ((+input.value - +input.min) / (+input.max - +input.min)) * 100;
    input.style.setProperty('--fill', `${fill}%`);
    $(`#${input.id}Readout`).textContent = `${input.value}${['coverage','ink'].includes(input.id) ? '%' : ''}`;
  }
  function setColorUi(input, type) {
    const hex = input.value.toUpperCase();
    $(`#${type}Swatch`).style.background = hex;
    $(`#${type}Value`).textContent = hex;
  }
  function syncUi() {
    setColorUi(controls.dark, 'dark'); setColorUi(controls.mid, 'mid'); setColorUi(controls.light, 'light');
    [controls.coverage, controls.ink, controls.intensity, controls.warmth].forEach(setRangeUi);
  }
  function updateActions() {
    const enabled = isReady && $('#rights').checked;
    $('#applyButton').disabled = !enabled;
    $('#downloadButton').disabled = !enabled;
  }
  function fitCanvas() {
    const largestSide = Math.max(sourceImage.naturalWidth, sourceImage.naturalHeight);
    const scale = Math.min(1, 2200 / largestSide);
    canvas.width = Math.max(1, Math.round(sourceImage.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceImage.naturalHeight * scale));
  }
  function renderColor() {
    if (!isReady) return;
    fitCanvas();
    const scratch = document.createElement('canvas');
    scratch.width = canvas.width; scratch.height = canvas.height;
    const scratchCtx = scratch.getContext('2d', { willReadFrequently: true });
    scratchCtx.drawImage(sourceImage, 0, 0, scratch.width, scratch.height);
    const pixels = scratchCtx.getImageData(0, 0, scratch.width, scratch.height);
    const data = pixels.data;
    const dark = hexToRgb(controls.dark.value), mid = hexToRgb(controls.mid.value), light = hexToRgb(controls.light.value);
    const coverage = +controls.coverage.value / 100;
    const inkProtection = +controls.ink.value / 100;
    const intensity = +controls.intensity.value / 50;
    const warmth = +controls.warmth.value / 40;
    for (let pos = 0; pos < data.length; pos += 4) {
      const oR = data[pos], oG = data[pos+1], oB = data[pos+2];
      if (data[pos+3] === 0) continue;
      const luma = (oR * .2126 + oG * .7152 + oB * .0722) / 255;
      const from = luma < .5 ? dark : mid, to = luma < .5 ? mid : light;
      const t = luma < .5 ? luma * 2 : (luma - .5) * 2;
      let r = blend(from.r, to.r, t), g = blend(from.g, to.g, t), b = blend(from.b, to.b, t);
      const avg = (r+g+b)/3, saturation = 1 + intensity*.38;
      r = blend(avg, r, saturation); g = blend(avg, g, saturation); b = blend(avg, b, saturation);
      r += warmth * 15; b -= warmth * 14;
      // Preserve line-work in darker regions; white paper remains soft and clean.
      const localCoverage = coverage * (1 - Math.max(0, (.26 - luma) / .26) * inkProtection);
      data[pos] = clamp(blend(oR, r, localCoverage));
      data[pos+1] = clamp(blend(oG, g, localCoverage));
      data[pos+2] = clamp(blend(oB, b, localCoverage));
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.putImageData(pixels, 0, 0);
    updateStatus('Color pass ready', 'processed only on this device');
  }
  function scheduleRender() {
    if (!isReady) return;
    updateStatus('Updating colors', 'remapping page locally', true);
    clearTimeout(renderDelay);
    renderDelay = setTimeout(renderColor, 70);
  }
  function syncStageHeight() {
    document.documentElement.style.setProperty('--stage-height', `${imageStage.clientHeight}px`);
  }
  function setComparison(value) {
    canvas.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
    comparisonHandle.style.left = `${value}%`;
  }
  function renderQueue() {
    pageList.innerHTML = '';
    pages.forEach((page, index) => {
      const button = document.createElement('button');
      button.className = `queue-page${index === currentPageIndex ? ' active' : ''}`;
      button.type = 'button'; button.title = page.file.name;
      button.innerHTML = `<img src="${page.url}" alt="Manga page ${index + 1}"><span>${String(index+1).padStart(2,'0')}</span>`;
      button.addEventListener('click', () => selectPage(index));
      pageList.appendChild(button);
    });
    dropHint.hidden = pages.length > 0;
    $('#pageCount').textContent = `${pages.length} ${pages.length === 1 ? 'PAGE' : 'PAGES'}`;
    $('#clearAll').disabled = pages.length === 0;
    $('#previousPage').disabled = currentPageIndex < 1;
    $('#nextPage').disabled = currentPageIndex === -1 || currentPageIndex >= pages.length - 1;
    $('#pagePosition').textContent = currentPageIndex === -1 ? '— / —' : `${currentPageIndex + 1} / ${pages.length}`;
  }
  function selectPage(index) {
    const page = pages[index]; if (!page) return;
    isReady = false; updateActions(); currentPageIndex = index; renderQueue();
    updateStatus('Loading page', 'preparing your local canvas', true);
    sourceImage.onload = () => {
      isReady = true;
      originalImage.src = page.url; originalImage.alt = `Original page ${index + 1}: ${page.file.name}`;
      $('#currentFileLabel').textContent = page.file.name;
      $('#imageSize').textContent = `${sourceImage.naturalWidth} × ${sourceImage.naturalHeight}`;
      $('#welcomeStage').hidden = true;
      renderColor(); updateActions();
    };
    sourceImage.onerror = () => { isReady = false; updateActions(); updateStatus('Could not load page', 'choose a supported image file'); };
    sourceImage.src = page.url;
  }
  function addFiles(fileList) {
    const incoming = [...fileList];
    const availableSlots = maxFiles - pages.length;
    const valid = incoming.filter((file) => acceptedTypes.includes(file.type) && file.size <= 15 * 1024 * 1024).slice(0, availableSlots);
    if (!valid.length) { updateStatus('No compatible page added', 'PNG, JPG, WebP, or SVG under 15 MB'); return; }
    valid.forEach((file) => pages.push({ file, url: URL.createObjectURL(file) }));
    selectPage(currentPageIndex === -1 ? 0 : currentPageIndex);
    if (incoming.length > valid.length) updateStatus('Some pages skipped', `up to ${maxFiles} files, 15 MB each`);
  }
  function chooseFiles() { pageUpload.click(); }
  function clearSession() {
    pages.forEach((page) => URL.revokeObjectURL(page.url)); pages.splice(0); currentPageIndex = -1; isReady = false;
    originalImage.removeAttribute('src'); ctx.clearRect(0,0,canvas.width,canvas.height); canvas.width = 0; canvas.height = 0;
    $('#welcomeStage').hidden = false; $('#currentFileLabel').textContent = 'No page selected'; $('#imageSize').textContent = '—';
    updateStatus('Waiting for a page', 'local-only workspace'); updateActions(); renderQueue();
  }
  function applyPalette(name) {
    const palette = palettes[name];
    Object.entries(palette).forEach(([key,value]) => controls[key].value = value);
    $$('.mood').forEach((mood) => mood.classList.toggle('active', mood.dataset.mood === name)); syncUi(); scheduleRender();
  }
  function randomColor(lightnessMin, lightnessMax) {
    const h = Math.floor(Math.random()*360), s = 43 + Math.floor(Math.random()*37), l = lightnessMin + Math.floor(Math.random()*(lightnessMax-lightnessMin));
    const c = (1-Math.abs(2*l/100-1))*s/100, x=c*(1-Math.abs((h/60)%2-1)), m=l/100-c/2;
    const [r,g,b] = h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
    return '#'+[r,g,b].map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('').toUpperCase();
  }

  $('#enterApp').addEventListener('click', () => { $('#ageModal').classList.add('hidden'); $('#app').setAttribute('aria-hidden','false'); });
  $('#closeApp').addEventListener('click', () => { $('#ageModal').hidden = true; $('#closedMessage').hidden = false; });
  pageUpload.addEventListener('change', (event) => { addFiles(event.target.files); event.target.value = ''; });
  $('#welcomeUpload').addEventListener('click', chooseFiles);
  $('.upload-button').addEventListener('click', () => {});
  ['dragenter','dragover'].forEach(type => $('.page-rail').addEventListener(type, event => { event.preventDefault(); $('.page-rail').style.outline = '2px dashed #b9677d'; $('.page-rail').style.outlineOffset = '-5px'; }));
  ['dragleave','drop'].forEach(type => $('.page-rail').addEventListener(type, event => { event.preventDefault(); $('.page-rail').style.outline = ''; $('.page-rail').style.outlineOffset = ''; }));
  $('.page-rail').addEventListener('drop', event => addFiles(event.dataTransfer.files));
  comparison.addEventListener('input', event => setComparison(event.target.value));
  $$('.view-toggle button').forEach(button => button.addEventListener('click', () => { $$('.view-toggle button').forEach(item=>item.classList.toggle('active',item===button)); imageStage.classList.remove('color-view','original-view'); if(button.dataset.view === 'color') imageStage.classList.add('color-view'); if(button.dataset.view === 'original') imageStage.classList.add('original-view'); }));
  $('#previousPage').addEventListener('click', () => selectPage(currentPageIndex-1)); $('#nextPage').addEventListener('click', () => selectPage(currentPageIndex+1));
  Object.entries(controls).forEach(([key,input]) => input.addEventListener('input', () => { if(['dark','mid','light'].includes(key)) setColorUi(input,key); else setRangeUi(input); $$('.mood').forEach(mood=>mood.classList.remove('active')); scheduleRender(); }));
  $$('.mood').forEach(button => button.addEventListener('click', () => applyPalette(button.dataset.mood)));
  $('#shufflePalette').addEventListener('click', () => { controls.dark.value=randomColor(20,38); controls.mid.value=randomColor(43,62); controls.light.value=randomColor(75,92); syncUi(); $$('.mood').forEach(mood=>mood.classList.remove('active')); scheduleRender(); });
  $('#resetSettings').addEventListener('click', () => applyPalette('rose'));
  $('#tuneToggle').addEventListener('click', event => { const collapsed=$('#tuningControls').classList.toggle('collapsed'); event.currentTarget.textContent=collapsed?'+':'−'; event.currentTarget.setAttribute('aria-expanded',String(!collapsed)); });
  $('#rights').addEventListener('change', updateActions);
  $('#applyButton').addEventListener('click', () => { updateStatus('Applying color pass', 'rendering the current page locally', true); setTimeout(renderColor,100); });
  $('#downloadButton').addEventListener('click', () => { if(!isReady) return; const link=document.createElement('a'); const name=pages[currentPageIndex].file.name.replace(/\.[^/.]+$/,'').replace(/[^a-z0-9_-]/gi,'-').toLowerCase(); link.href=canvas.toDataURL('image/png'); link.download=`${name || 'manga-page'}-color.png`; link.click(); updateStatus('PNG saved', 'downloaded to your device'); });
  $('#clearAll').addEventListener('click', clearSession);
  $('#privacyButton').addEventListener('click', () => $('#privacyPanel').hidden=false); $('#closePrivacy').addEventListener('click', () => $('#privacyPanel').hidden=true);
  syncUi(); syncStageHeight(); setComparison(comparison.value); renderQueue();
  new ResizeObserver(syncStageHeight).observe(imageStage);
})();
