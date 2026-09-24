'use strict';
const { $, $$, esc, ikona, obavijest, spremi, dropzona, velicina } = AB;
pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

$$('input[name="smjer"]').forEach(r => r.addEventListener('change', () => document.body.classList.toggle('u-slike', r.value === 'slike' && r.checked)));

const MM = 72 / 25.4;
const STRANICE = { a4: [210, 297], a5: [148, 210], letter: [215.9, 279.4] };
function napredak(sel, udio) {
  const el = $(sel);
  el.hidden = udio === null;
  if (udio !== null) el.firstElementChild.style.width = Math.round(udio * 100) + '%';
}

// ================= SLIKE U PDF =================
let slike = [];   // { id, ime, url, bitmap, rot }
let brojac = 0;

async function dodajSlike(dat) {
  const s = dat.filter(f => f.type.startsWith('image/'));
  if (!s.length) return obavijest('Odaberi slike (JPG, PNG, WEBP…).');
  for (const f of s) {
    try {
      const bitmap = await createImageBitmap(f, { imageOrientation: 'from-image' });
      slike.push({ id: ++brojac, ime: f.name, url: URL.createObjectURL(f), bitmap, rot: 0, png: f.type === 'image/png' });
    } catch { obavijest(`„${f.name}” se ne može otvoriti.`); }
  }
  if (slike.length && $('#imePdf').value === 'slike.pdf' && s.length) $('#imePdf').value = slike[0].ime.replace(/\.[^.]+$/, '') + '.pdf';
  nacrtajSlike();
}

function nacrtajSlike() {
  $('#napraviPdf').disabled = !slike.length;
  $('#popisSlika').innerHTML = slike.map((s, i) => `
    <div class="sl" draggable="true" data-i="${i}">
      <div class="okvir"><img src="${s.url}" alt="" style="transform:rotate(${s.rot}deg)${s.rot % 180 ? ` scale(${Math.min(s.bitmap.width, s.bitmap.height) / Math.max(s.bitmap.width, s.bitmap.height)})` : ''}"></div>
      <span class="ime" title="${esc(s.ime)}">${i + 1}. ${esc(s.ime)}</span>
      <div class="alatke">
        <button type="button" data-r="lijevo" aria-label="Pomakni ulijevo">‹</button>
        <button type="button" data-r="rot" aria-label="Rotiraj">${ikona('rotiraj')}</button>
        <button type="button" data-r="brisi" aria-label="Ukloni">${ikona('x')}</button>
        <button type="button" data-r="desno" aria-label="Pomakni udesno">›</button>
      </div>
    </div>`).join('');
}
$('#popisSlika').addEventListener('click', e => {
  const b = e.target.closest('[data-r]'); if (!b) return;
  const i = +b.closest('.sl').dataset.i, r = b.dataset.r;
  if (r === 'rot') slike[i].rot = (slike[i].rot + 90) % 360;
  if (r === 'brisi') { URL.revokeObjectURL(slike[i].url); slike.splice(i, 1); }
  if (r === 'lijevo' && i > 0) [slike[i - 1], slike[i]] = [slike[i], slike[i - 1]];
  if (r === 'desno' && i < slike.length - 1) [slike[i + 1], slike[i]] = [slike[i], slike[i + 1]];
  nacrtajSlike();
});
let vuce = null;
$('#popisSlika').addEventListener('dragstart', e => { const k = e.target.closest('.sl'); if (k) { vuce = +k.dataset.i; k.classList.add('vuce'); e.dataTransfer.setData('text/plain', '' + vuce); } });
$('#popisSlika').addEventListener('dragover', e => { if (vuce === null) return; e.preventDefault(); $$('.sl.cilj').forEach(x => x.classList.remove('cilj')); e.target.closest('.sl')?.classList.add('cilj'); });
$('#popisSlika').addEventListener('drop', e => { e.preventDefault(); const k = e.target.closest('.sl'); if (k && vuce !== null) { const [s] = slike.splice(vuce, 1); slike.splice(+k.dataset.i, 0, s); } vuce = null; nacrtajSlike(); });
$('#popisSlika').addEventListener('dragend', () => { vuce = null; nacrtajSlike(); });

// slika (s rotacijom i smanjenjem) → bajtovi JPG ili PNG
async function pripremi(s, maks) {
  const okomito = s.rot % 180 !== 0;
  let w = s.bitmap.width, h = s.bitmap.height;
  const k = maks ? Math.min(1, maks / Math.max(w, h)) : 1;
  w = Math.round(w * k); h = Math.round(h * k);
  const c = document.createElement('canvas');
  c.width = okomito ? h : w; c.height = okomito ? w : h;
  const x = c.getContext('2d');
  if (!s.png) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
  x.translate(c.width / 2, c.height / 2);
  x.rotate(s.rot * Math.PI / 180);
  x.drawImage(s.bitmap, -w / 2, -h / 2, w, h);
  const blob = await new Promise(ok => c.toBlob(ok, s.png ? 'image/png' : 'image/jpeg', .9));
  return { bajtovi: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height, png: s.png };
}

$('#napraviPdf').onclick = async () => {
  const gumb = $('#napraviPdf');
  gumb.disabled = true;
  try {
    const doc = await PDFLib.PDFDocument.create();
    const vel = $('#velicina').value, ori = $('#orijentacija').value, marg = +$('#margina').value * MM;
    const maks = $('#kvaliteta').value === 'orig' ? 0 : +$('#kvaliteta').value;
    for (let i = 0; i < slike.length; i++) {
      napredak('#napredakPdf', i / slike.length);
      const p = await pripremi(slike[i], maks);
      const img = p.png ? await doc.embedPng(p.bajtovi) : await doc.embedJpg(p.bajtovi);
      if (vel === 'slika') {
        // 1 px = 1/150 inča, da dimenzije stranice budu razumne
        const pw = p.w * 72 / 150, ph = p.h * 72 / 150;
        doc.addPage([pw, ph]).drawImage(img, { x: 0, y: 0, width: pw, height: ph });
        continue;
      }
      let [sw, sh] = STRANICE[vel].map(v => v * MM);
      const polozeno = ori === 'polozeno' || (ori === 'auto' && p.w > p.h);
      if (polozeno) [sw, sh] = [sh, sw];
      const str = doc.addPage([sw, sh]);
      const mw = sw - 2 * marg, mh = sh - 2 * marg, k = Math.min(mw / p.w, mh / p.h);
      const dw = p.w * k, dh = p.h * k;
      str.drawImage(img, { x: (sw - dw) / 2, y: (sh - dh) / 2, width: dw, height: dh });
    }
    doc.setProducer('app-bonic Slike u PDF');
    const bajtovi = await doc.save();
    const ime = ($('#imePdf').value.trim() || 'slike').replace(/[\\/:*?"<>|]/g, '-').replace(/(\.pdf)?$/i, '.pdf');
    spremi(new Blob([bajtovi], { type: 'application/pdf' }), ime);
    obavijest(`PDF je spreman (${velicina(bajtovi.length)}).`);
  } catch (e) {
    console.error(e);
    obavijest('Nije uspjelo: ' + e.message);
  } finally {
    napredak('#napredakPdf', null);
    gumb.disabled = !slike.length;
  }
};

// ================= PDF U SLIKE =================
let pdf = null, pdfIme = '';
async function ucitajPdf([f]) {
  if (!f || !(f.type === 'application/pdf' || /\.pdf$/i.test(f.name))) return obavijest('Odaberi PDF datoteku.');
  try { pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise; }
  catch (e) { return obavijest(e.name === 'PasswordException' ? 'PDF je zaštićen lozinkom.' : 'PDF se ne može otvoriti.'); }
  pdfIme = f.name.replace(/\.pdf$/i, '');
  $('#pdfInfo').textContent = `${f.name} — ${pdf.numPages} ${AB.mn(pdf.numPages, 'stranica', 'stranice', 'stranica')}`;
  $('#uSlike').disabled = false;
  $('#popisStranica').innerHTML = '';
  const n = Math.min(pdf.numPages, 60);
  for (let i = 1; i <= n; i++) {
    const s = await pdf.getPage(i), v0 = s.getViewport({ scale: 1 });
    const v = s.getViewport({ scale: 200 / Math.max(v0.width, v0.height) });
    const c = document.createElement('canvas'); c.width = v.width; c.height = v.height;
    await s.render({ canvasContext: c.getContext('2d'), viewport: v }).promise;
    const k = document.createElement('div');
    k.className = 'sl';
    k.innerHTML = `<div class="okvir"></div><a href="#" class="preuzmi" data-str="${i}">${ikona('preuzmi')} Stranica ${i}</a>`;
    k.firstElementChild.appendChild(c);
    $('#popisStranica').appendChild(k);
  }
  if (pdf.numPages > n) $('#pdfInfo').textContent += ` (prikazano prvih ${n})`;
}

function rasponStranica(tekst, n) {
  if (!tekst.trim()) return Array.from({ length: n }, (_, i) => i + 1);
  const van = new Set();
  for (const dio of tekst.split(/[,;]/).map(x => x.trim()).filter(Boolean)) {
    const m = dio.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!m) throw new Error(`„${dio}” nije ispravan raspon.`);
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (a < 1 || b > n || a > b) throw new Error(`Raspon „${dio}” izlazi izvan 1–${n}.`);
    for (let i = a; i <= b; i++) van.add(i);
  }
  return [...van];
}

async function stranicaUBlob(i) {
  const s = await pdf.getPage(i), jpg = $('#format').value === 'jpg';
  const v = s.getViewport({ scale: +$('#dpi').value / 72 });
  const c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height);
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  await s.render({ canvasContext: x, viewport: v }).promise;
  const blob = await new Promise(ok => c.toBlob(ok, jpg ? 'image/jpeg' : 'image/png', .9));
  c.width = c.height = 0;
  return { blob, ime: `${pdfIme}-str-${String(i).padStart(3, '0')}.${jpg ? 'jpg' : 'png'}` };
}

$('#popisStranica').addEventListener('click', async e => {
  const a = e.target.closest('[data-str]'); if (!a) return;
  e.preventDefault();
  const r = await stranicaUBlob(+a.dataset.str);
  spremi(r.blob, r.ime);
});

$('#uSlike').onclick = async () => {
  const gumb = $('#uSlike');
  gumb.disabled = true;
  try {
    const str = rasponStranica($('#rasponPdf').value, pdf.numPages);
    if (str.length === 1) { const r = await stranicaUBlob(str[0]); spremi(r.blob, r.ime); return; }
    const zip = new JSZip();
    for (let k = 0; k < str.length; k++) {
      napredak('#napredakSlike', k / str.length);
      const r = await stranicaUBlob(str[k]);
      zip.file(r.ime, r.blob);
    }
    spremi(await zip.generateAsync({ type: 'blob' }), pdfIme + '-slike.zip');
    obavijest(`Pretvoreno ${str.length} ${AB.mn(str.length, 'stranica', 'stranice', 'stranica')}.`);
  } catch (e) { obavijest(e.message); }
  finally { napredak('#napredakSlike', null); gumb.disabled = false; }
};

dropzona($('#dropSlike'), dodajSlike, { accept: 'image/*' });
dropzona($('#dropPdf'), ucitajPdf, { accept: 'application/pdf,.pdf', visestruko: false });
