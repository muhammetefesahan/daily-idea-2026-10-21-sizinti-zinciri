import assert from 'node:assert/strict';
import { SAMPLE, analyze, plan, summary, cleanAccounts, exportBackup, importBackup } from './core.mjs';

let checks = 0;
const ok = fn => { fn(); checks++; };
const find = (rows, id) => rows.find(r => r.id === id);

// 1. Örnekte pixiv sızınca
const rows = analyze(SAMPLE, ['pixiv']);
ok(() => assert.equal(find(rows, 'pixiv').status, 'leaked'));
ok(() => assert.equal(find(rows, 'gmail').status, 'takeable'));        // aynı şifre, iki adım yok
ok(() => assert.equal(find(rows, 'discord').status, 'risk'));          // aynı şifre ama iki adım açık
ok(() => assert.equal(find(rows, 'instagram').status, 'takeable'));    // kurtarması Gmail
ok(() => assert.equal(find(rows, 'steam').status, 'risk'));            // kurtarması Gmail, iki adım açık
ok(() => assert.equal(find(rows, 'banka').status, 'safe'));
ok(() => assert.equal(find(rows, 'okul').status, 'safe'));
ok(() => assert.deepEqual(find(rows, 'instagram').chain, ['pixiv', 'Gmail', 'Instagram']));
ok(() => assert.equal(find(rows, 'gmail').dependents, 4));
ok(() => assert.deepEqual(summary(rows), { leaked: 1, takeable: 2, risk: 2, safe: 3 }));

// 2. Sıralamada önce Gmail (4 hesabın kurtarma e-postası)
const steps = plan(rows);
ok(() => assert.equal(steps[0].ad, 'Gmail'));
ok(() => assert.equal(steps.length, 5));
ok(() => assert.ok(steps[0].items.some(t => t.includes('4 hesabın kurtarma'))));
ok(() => assert.ok(!find(steps, 'discord').items.some(t => t.includes('iki adımlı doğrulamayı aç'))));

// 3. Hiç sızıntı yoksa herkes güvende, yapılacak yok
const calm = analyze(SAMPLE, []);
ok(() => assert.ok(calm.every(r => r.status === 'safe')));
ok(() => assert.equal(plan(calm).length, 0));

// 4. Uzun zincir: A sızdı -> B (kurtarma A) -> C (kurtarma B) -> D (kurtarma C)
const long = [
  { id: 'a', ad: 'A', grup: 'X' },
  { id: 'b', ad: 'B', grup: 'Y', kurtarma: 'a' },
  { id: 'c', ad: 'C', grup: 'Z', kurtarma: 'b' },
  { id: 'd', ad: 'D', grup: 'W', kurtarma: 'c' }
];
const lr = analyze(long, ['a']);
ok(() => assert.equal(find(lr, 'd').status, 'takeable'));
ok(() => assert.deepEqual(find(lr, 'd').chain, ['A', 'B', 'C', 'D']));

// 5. İki adım zinciri durduruyor: B'de iki adım açıksa C güvende kalıyor
const stop = analyze(long.map(a => a.id === 'b' ? { ...a, ikiAdim: true } : a), ['a']);
ok(() => assert.equal(find(stop, 'b').status, 'risk'));
ok(() => assert.equal(find(stop, 'c').status, 'safe'));

// 6. Döngü takılmıyor: iki hesap birbirinin kurtarması
const loop = analyze([{ id: 'p', ad: 'P', grup: 'A', kurtarma: 'q' }, { id: 'q', ad: 'Q', grup: 'B', kurtarma: 'p' }], ['p']);
ok(() => assert.equal(find(loop, 'q').status, 'takeable'));

// 7. Bozuk veriler temizleniyor
const clean = cleanAccounts([
  { id: 'x', ad: 'X', grup: 'a', kurtarma: 'x', onem: 9 },
  { id: 'x', ad: 'Kopya' },
  { id: 'y', ad: '' },
  { id: 'z', ad: 'Z', kurtarma: 'yok-boyle-hesap' }
]);
ok(() => assert.equal(clean.length, 2));
ok(() => assert.equal(clean[0].grup, 'A'));
ok(() => assert.equal(clean[0].kurtarma, ''));
ok(() => assert.equal(clean[0].onem, 2));
ok(() => assert.equal(clean[1].kurtarma, ''));

// 8. Yedek indirip yükleyince aynı sonuç
const back = importBackup(exportBackup(SAMPLE, new Set(['pixiv']), new Set(['gmail:0'])));
ok(() => assert.deepEqual(analyze(back.hesaplar, back.sizanlar), rows));
ok(() => assert.ok(back.yapilanlar.has('gmail:0')));
ok(() => assert.throws(() => importBackup('merhaba'), /JSON değil/));
ok(() => assert.throws(() => importBackup('{"a":1}'), /hesap listesi yok/));

// 9. Yedekte şifre alanı yok
ok(() => assert.ok(!/sifre"|password/i.test(exportBackup(SAMPLE, new Set(), new Set()))));

console.log(`${checks} kontrol geçti.`);
