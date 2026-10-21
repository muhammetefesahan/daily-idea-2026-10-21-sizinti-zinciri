// Sızıntı Zinciri: ekrana dokunmayan hesaplar (test.mjs bunları sınar)
// Ben burada gerçek şifre tutmuyorum. Sadece "A, B, C" gibi şifre grubu etiketleri var.

export const STATUS = {
  leaked: 'sızdı',
  takeable: 'ele geçebilir',
  risk: 'risk altında',
  safe: 'güvende'
};

const WEIGHT = { leaked: 3, takeable: 3, risk: 1, safe: 0 };

export function cleanAccounts(list) {
  const ids = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const id = String(raw.id || '').trim();
    const ad = String(raw.ad || '').trim();
    if (!id || !ad || ids.has(id)) continue;
    ids.add(id);
    out.push({
      id,
      ad,
      grup: String(raw.grup || '').trim().toUpperCase(),
      kurtarma: String(raw.kurtarma || '').trim(),
      ikiAdim: Boolean(raw.ikiAdim),
      onem: [1, 2, 3].includes(Number(raw.onem)) ? Number(raw.onem) : 2
    });
  }
  // kendine ya da olmayan hesaba bağlı kurtarmayı boşalt
  for (const a of out) if (a.kurtarma === a.id || !ids.has(a.kurtarma)) a.kurtarma = '';
  return out;
}

// breached: sızdığını duyduğum hesapların id listesi
export function analyze(accounts, breached) {
  const list = cleanAccounts(accounts);
  const byId = new Map(list.map(a => [a.id, a]));
  const leakedIds = new Set([...(breached || [])].filter(id => byId.has(id)));
  const leakedGroups = new Map(); // grup -> sızan hesabın id'si
  for (const id of leakedIds) {
    const a = byId.get(id);
    if (a.grup && !leakedGroups.has(a.grup)) leakedGroups.set(a.grup, id);
  }

  const result = new Map(list.map(a => [a.id, { status: 'safe', reasons: [], via: null, from: null }]));
  const taken = new Set();

  for (const a of list) {
    const r = result.get(a.id);
    if (leakedIds.has(a.id)) {
      r.status = 'leaked';
      r.reasons.push('Bu hesabın şifresi sızdı.');
      if (!a.ikiAdim) taken.add(a.id);
      else r.reasons.push('İki adımlı doğrulama açık, bu biraz koruyor.');
    } else if (a.grup && leakedGroups.has(a.grup)) {
      r.from = leakedGroups.get(a.grup);
      r.reasons.push(`Aynı şifreyi (grup ${a.grup}) sızan ${byId.get(r.from).ad} hesabında da kullanıyorum.`);
      if (a.ikiAdim) r.status = 'risk';
      else { r.status = 'takeable'; taken.add(a.id); }
    }
  }

  // Kurtarma e-postası ele geçerse, ona bağlı hesabın şifresi sıfırlanabilir. Zincir bitene kadar yürüyorum.
  let changed = true;
  while (changed) {
    changed = false;
    for (const a of list) {
      if (!a.kurtarma || !taken.has(a.kurtarma) || taken.has(a.id)) continue;
      const r = result.get(a.id);
      const via = byId.get(a.kurtarma);
      const text = `Kurtarma e-postası ${via.ad} ele geçebilir; oradan şifresi sıfırlanabilir.`;
      if (r.via === a.kurtarma) continue;
      r.via = a.kurtarma;
      if (!r.from) r.from = a.kurtarma;
      r.reasons.push(text);
      if (a.ikiAdim) {
        if (r.status === 'safe') { r.status = 'risk'; changed = true; }
      } else {
        if (r.status !== 'leaked') r.status = 'takeable';
        taken.add(a.id);
        changed = true;
      }
    }
  }

  // Kaç hesap bu hesabı kurtarma e-postası olarak kullanıyor (dolaylı da)
  const dependents = new Map(list.map(a => [a.id, 0]));
  for (const a of list) {
    const seen = new Set([a.id]);
    let cur = a.kurtarma;
    while (cur && !seen.has(cur)) {
      dependents.set(cur, dependents.get(cur) + 1);
      seen.add(cur);
      cur = byId.get(cur).kurtarma;
    }
  }

  const rows = list.map(a => {
    const r = result.get(a.id);
    return {
      ...a,
      status: r.status,
      label: STATUS[r.status],
      reasons: r.reasons,
      chain: chainTo(a.id, byId, result),
      dependents: dependents.get(a.id),
      score: WEIGHT[r.status] * 10 + a.onem * 3 + dependents.get(a.id) * 2
    };
  });
  return rows;
}

// Sızıntıdan bu hesaba gelen yol: [sızan, ..., bu hesap]
function chainTo(id, byId, result) {
  const path = [];
  const seen = new Set();
  let cur = id;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    path.unshift(byId.get(cur).ad);
    cur = result.get(cur).from;
  }
  return path;
}

// Yapılacaklar: önce tehlikedekiler, sonra risk altındakiler. Kurtarma e-postaları öne çıkar.
export function plan(rows) {
  const steps = [];
  const todo = rows.filter(r => r.status !== 'safe').sort((a, b) => b.score - a.score || a.ad.localeCompare(b.ad, 'tr'));
  for (const r of todo) {
    const items = [`${r.ad} şifresini yeni ve sadece ona ait bir şifreyle değiştir.`];
    if (!r.ikiAdim) items.push(`${r.ad} için iki adımlı doğrulamayı aç.`);
    if (r.dependents > 0) items.push(`${r.dependents} hesabın kurtarma e-postası bu; önce bunu güvene al.`);
    if (r.status === 'leaked') items.push(`${r.ad} oturumlarını kapat ve son girişlere bak.`);
    steps.push({ id: r.id, ad: r.ad, status: r.status, label: r.label, items });
  }
  return steps;
}

export function summary(rows) {
  const out = { leaked: 0, takeable: 0, risk: 0, safe: 0 };
  for (const r of rows) out[r.status]++;
  return out;
}

export function exportBackup(accounts, breached, done) {
  return JSON.stringify({ surum: 1, hesaplar: cleanAccounts(accounts), sizanlar: [...breached], yapilanlar: [...done] }, null, 2);
}

export function importBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Bu dosya JSON değil.'); }
  if (!data || !Array.isArray(data.hesaplar)) throw new Error('Yedekte hesap listesi yok.');
  const hesaplar = cleanAccounts(data.hesaplar);
  const ids = new Set(hesaplar.map(a => a.id));
  return {
    hesaplar,
    sizanlar: new Set((data.sizanlar || []).filter(id => ids.has(id))),
    yapilanlar: new Set((data.yapilanlar || []).map(String))
  };
}

export const SAMPLE = [
  { id: 'gmail', ad: 'Gmail', grup: 'A', kurtarma: '', ikiAdim: false, onem: 3 },
  { id: 'pixiv', ad: 'pixiv', grup: 'A', kurtarma: 'gmail', ikiAdim: false, onem: 1 },
  { id: 'instagram', ad: 'Instagram', grup: 'B', kurtarma: 'gmail', ikiAdim: false, onem: 2 },
  { id: 'steam', ad: 'Steam', grup: 'B', kurtarma: 'gmail', ikiAdim: true, onem: 2 },
  { id: 'discord', ad: 'Discord', grup: 'A', kurtarma: 'gmail', ikiAdim: true, onem: 2 },
  { id: 'okul', ad: 'Okul sistemi', grup: 'D', kurtarma: 'outlook', ikiAdim: false, onem: 2 },
  { id: 'outlook', ad: 'Outlook', grup: 'D', kurtarma: '', ikiAdim: false, onem: 2 },
  { id: 'banka', ad: 'Banka', grup: 'C', kurtarma: '', ikiAdim: true, onem: 3 }
];
