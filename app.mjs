// Sızıntı Zinciri: ekran ve düğmeler
import { SAMPLE, STATUS, analyze, plan, summary, cleanAccounts, exportBackup, importBackup } from './core.mjs';

const $ = id => document.getElementById(id);
const STORE = 'sizinti-zinciri-v1';
const IMPORTANCE = { 1: 'az önemli', 2: 'orta önemli', 3: 'çok önemli' };

let accounts = [];
let breached = new Set();
let done = new Set(); // "hesapId:adımSırası"

/* ---------- kayıt (sadece bu tarayıcı) ---------- */
function save() {
  try { localStorage.setItem(STORE, exportBackup(accounts, breached, done)); } catch { /* gizli sekme */ }
}
function load() {
  try {
    const text = localStorage.getItem(STORE);
    if (!text) return false;
    ({ hesaplar: accounts, sizanlar: breached, yapilanlar: done } = importBackup(text));
    return true;
  } catch { return false; }
}

function slug(ad) {
  const base = ad.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'hesap';
  let id = base, n = 2;
  while (accounts.some(a => a.id === id)) id = `${base}-${n++}`;
  return id;
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function recoveryOptions(selected, self) {
  return '<option value="">Yok</option>' + accounts.filter(a => a.id !== self)
    .map(a => `<option value="${esc(a.id)}"${a.id === selected ? ' selected' : ''}>${esc(a.ad)}</option>`).join('');
}

/* ---------- çizim ---------- */
function render() {
  accounts = cleanAccounts(accounts);
  const rows = analyze(accounts, breached);
  const byId = new Map(rows.map(r => [r.id, r]));

  $('sKurtarma').innerHTML = recoveryOptions($('sKurtarma').value, null).replace('>Yok<', '>Yok / bilmiyorum<');

  $('tbody').innerHTML = accounts.map(a => {
    const r = byId.get(a.id), on = breached.has(a.id);
    return `<tr class="${on ? 'leaked' : ''}" data-id="${esc(a.id)}">
      <td><span class="name">${esc(a.ad)}</span><span class="imp">${IMPORTANCE[a.onem]}</span></td>
      <td class="grp"><input type="text" data-f="grup" value="${esc(a.grup)}" maxlength="3" aria-label="${esc(a.ad)} şifre grubu"></td>
      <td><select data-f="kurtarma" aria-label="${esc(a.ad)} kurtarma e-postası">${recoveryOptions(a.kurtarma, a.id)}</select></td>
      <td><input type="checkbox" data-f="ikiAdim"${a.ikiAdim ? ' checked' : ''} aria-label="${esc(a.ad)} iki adımlı doğrulama"></td>
      <td><span class="badge b-${r.status}" title="${esc(r.reasons.join(' '))}">${r.label}</span></td>
      <td style="white-space:nowrap"><button type="button" class="leakBtn${on ? ' on' : ''}" data-act="leak">${on ? 'Sızdı ✓' : 'Sızdı'}</button>
        <button type="button" class="del" data-act="del" aria-label="${esc(a.ad)} hesabını sil">✕</button></td>
    </tr>`;
  }).join('');
  $('empty').hidden = accounts.length > 0;

  const s = summary(rows);
  $('stats').innerHTML = ['leaked', 'takeable', 'risk', 'safe']
    .map(k => `<div class="stat ${k}"><b>${s[k]}</b><span>${STATUS[k]}</span></div>`).join('');

  // zincirler: sızıntıdan başka hesaba uzananlar
  const chains = rows.filter(r => r.chain.length > 1).sort((a, b) => b.chain.length - a.chain.length);
  $('chains').innerHTML = chains.map(r => `<div class="chain">${r.chain.map((n, i) =>
    `<span class="node${i === 0 ? ' first' : ''}${i === r.chain.length - 1 ? ' last' : ''}">${esc(n)}</span>`).join('<i>→</i>')}
    <span class="badge b-${r.status}">${r.label}</span></div>`).join('');

  const steps = plan(rows);
  $('plan').innerHTML = steps.map(st => {
    const r = byId.get(st.id);
    const allDone = st.items.every((_, i) => done.has(`${st.id}:${i}`));
    return `<li class="${allDone ? 'done' : ''}"><h3>${esc(st.ad)} <span class="badge b-${st.status}">${st.label}</span></h3>
      <ul>${st.items.map((t, i) => `<li><input type="checkbox" data-done="${esc(st.id)}:${i}"${done.has(`${st.id}:${i}`) ? ' checked' : ''} id="d-${esc(st.id)}-${i}"><label for="d-${esc(st.id)}-${i}">${esc(t)}</label></li>`).join('')}</ul>
      <p class="why">Neden: ${esc(r.reasons.join(' '))}</p></li>`;
  }).join('');
  $('calm').hidden = breached.size > 0;
  save();
}

/* ---------- olaylar ---------- */
$('fAdd').addEventListener('submit', e => {
  e.preventDefault();
  const ad = $('iAd').value.trim(), grup = $('iGrup').value.trim().toUpperCase();
  if (!ad || !grup) return;
  accounts.push({ id: slug(ad), ad, grup, kurtarma: $('sKurtarma').value, ikiAdim: $('cIki').checked, onem: +$('sOnem').value });
  $('iAd').value = ''; $('cIki').checked = false; $('iAd').focus();
  render(); toast(`${ad} eklendi`);
});

$('tbody').addEventListener('click', e => {
  const btn = e.target.closest('button[data-act]'); if (!btn) return;
  const id = btn.closest('tr').dataset.id;
  if (btn.dataset.act === 'leak') breached.has(id) ? breached.delete(id) : breached.add(id);
  if (btn.dataset.act === 'del') {
    const a = accounts.find(x => x.id === id);
    if (!confirm(`${a.ad} silinsin mi?`)) return;
    accounts = accounts.filter(x => x.id !== id); breached.delete(id);
  }
  render();
});

$('tbody').addEventListener('change', e => {
  const f = e.target.dataset.f; if (!f) return;
  const a = accounts.find(x => x.id === e.target.closest('tr').dataset.id);
  a[f] = f === 'ikiAdim' ? e.target.checked : e.target.value;
  render();
});

$('plan').addEventListener('change', e => {
  const k = e.target.dataset.done; if (!k) return;
  e.target.checked ? done.add(k) : done.delete(k);
  render();
});

$('bSample').onclick = () => {
  if (accounts.length && !confirm('Örnek, şu anki listemin yerine geçsin mi?')) return;
  accounts = SAMPLE.map(a => ({ ...a })); breached = new Set(['pixiv']); done = new Set();
  render(); toast('Örnek kondu: pixiv sızdı');
};
$('bClear').onclick = () => {
  if (accounts.length && !confirm('Bütün liste silinsin mi?')) return;
  accounts = []; breached = new Set(); done = new Set(); render();
};

$('bExport').onclick = () => {
  const blob = new Blob([exportBackup(accounts, breached, done)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'sizinti-zinciri-yedek.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('iImport').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = importBackup(await file.text());
    if (accounts.length && !confirm('Yedek, şu anki listemin yerine geçsin mi?')) return;
    ({ hesaplar: accounts, sizanlar: breached, yapilanlar: done } = data);
    render(); toast('Yedek yüklendi');
  } catch (err) { toast(err.message); }
  e.target.value = '';
});

function toast(text) {
  const t = $('toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), 1800);
}

if (!load()) { accounts = SAMPLE.map(a => ({ ...a })); breached = new Set(['pixiv']); }
render();
