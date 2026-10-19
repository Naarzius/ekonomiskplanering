/* Ekonomisk planering — gränssnitt */
(function () {
  'use strict';

  var AR = Modell.AR;                 // aktivt tioårsfönster (visning)
  var ALLA_AR = Modell.ALLA_AR;       // alla år modellen räknar (lagring)
  var ARKIV = Modell.ARKIV;
  var BAS_SISTA = Modell.BAS_SISTA;
  var LAGRINGSNYCKEL = 'ekplan_v2';
  // Plats 7 (violett) är reserverad för det kombinerade scenariot.
  var SERIEFARGER = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-3)', 'var(--serie-4)',
                     'var(--serie-5)', 'var(--serie-6)', 'var(--serie-8)'];
  var KOMBINERAD_FARG = 'var(--serie-7)';
  var KOMB_ID = 'kombinerat';
  var BAS_INDATA = Modell.basIndata();

  var S = {
    scenarier: [], aktivId: 'bas', jamforId: 'bas',
    ar: Modell.AR[Math.min(2, Modell.AR.length - 1)],
    enhet: 'mnkr', flik: 'oversikt', rrLage: 'scenario', visaArkiv: false,
    jamforValda: {}, kombinerade: {}, utfallda: {},
    panelBredd: 272, panelDold: false, cache: {}
  };

  // ============================================================ formatering
  function skala(v) { return S.enhet === 'mnkr' ? v / 1000 : v; }
  function fmt(v, dec) {
    if (v === null || v === undefined || !isFinite(v)) return '–';
    return v.toLocaleString('sv-SE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function tal(v) { return fmt(skala(v), 0); }
  function talD(v) { return fmt(skala(v), S.enhet === 'mnkr' ? 1 : 0); }
  function delta(v, dec) {
    var s = fmt(skala(v), dec === undefined ? (S.enhet === 'mnkr' ? 1 : 0) : dec);
    return (v > 0 ? '+' : '') + s;
  }
  function pct(v, dec) { return fmt(v * 100, dec === undefined ? 1 : dec) + ' %'; }
  // "1 procentenhet" men "0,50 procentenheter"
  function procentenheter(v) {
    var pp = v * 100;
    var hel = Math.abs(pp - Math.round(pp)) < 0.005;
    return fmt(pp, hel ? 0 : 2) + (hel && Math.round(pp) === 1 ? ' procentenhet' : ' procentenheter');
  }

  // <input type="number"> kräver punkt som decimaltecken och inga tusentalsmellanslag.
  function inmat(v, dec) {
    if (v === null || v === undefined || !isFinite(v)) return '';
    return v.toFixed(dec || 0);
  }
  function enhetsnamn() { return S.enhet === 'mnkr' ? 'mnkr' : 'tkr'; }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function num(x, standard) {
    var v = parseFloat(String(x).replace(/\s/g, '').replace(',', '.'));
    return isFinite(v) ? v : (standard || 0);
  }

  // ============================================================ scenarier
  function nyttId() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function migrera(ind) {
    var bas = Modell.kopia(BAS_INDATA);
    function fyll(mal, kalla) {
      Object.keys(kalla).forEach(function (k) {
        if (mal[k] === undefined || mal[k] === null) mal[k] = Modell.kopia(kalla[k]);
        // typeof null === 'object'. Utan null-vakten anropades fyll(mal, null)
        // för varje fält som är null i basen — t.ex. prognoskalla — och
        // Object.keys(null) kastade. Följden blev att las() fångade felet och
        // ersatte ALLA scenarier med standarduppsättningen, så fort ett enda
        // scenario hade läst in en prognos eller en investeringsspec.
        else if (kalla[k] !== null && typeof kalla[k] === 'object' &&
                 !Array.isArray(kalla[k]) && mal[k] && typeof mal[k] === 'object') {
          fyll(mal[k], kalla[k]);
        }
      });
      return mal;
    }
    return fyll(ind || {}, bas);
  }

  function skapaScenario(namn, byggare) {
    var ind = Modell.kopia(BAS_INDATA);
    if (byggare) byggare(ind);
    return { id: nyttId(), namn: namn, indata: ind, skapad: new Date().toISOString() };
  }

  function standardscenarier() {
    var lista = [{ id: 'bas', namn: 'Basplan', las: true, indata: Modell.kopia(BAS_INDATA),
                   beskrivning: 'Styrelsebudget 2026–2030, framskriven därefter med samma drivare som sista planåret.' }];

    lista.push(skapaScenario('Kv Ekoxen 300 mnkr', function (ind) {
      var p = null;
      ind.projekt.forEach(function (x) { if (x.projektnr === '3109') p = x; });
      if (!p) {
        p = { id: 'ekoxen', namn: '3109 Kv Ekoxen, nybyggnad', projektnr: '3109', typ: 'Nyinvest',
              kategori: 'Bostäder', aktiv: true, kalla: 'eget', spend: {}, ib_varde: 0,
              aktiverbart: 0, aktiveringsar: null, sats: 0.021, iAvskrModell: true, hyra: null, kommentar: '' };
        ind.projekt.push(p);
      }
      p.namn = '3109 Kv Ekoxen, nybyggnad';
      p.spend = fordela(300000 - 6100, 2027, 2031, 'klocka');
      p.spend[2026] = 100;
      p.aktiverbart = 300000;
      p.aktiveringsar = 2031;
      p.sats = 0.021;
      p.iAvskrModell = true;
      p.kategori = 'Bostäder';
      p.hyra = { kvm: 6000, hyra_kvm: 2350, drift_kvm: 550, vakans: 0.1,
                 arshyra: 6000 * 2350 / 1000, driftkostnad: 6000 * 550 / 1000 };
      p.kommentar = 'Scenario: full nyproduktion om 300 mnkr, ca 85 lgh / 6 000 kvm BOA.';
    }));
    lista[lista.length - 1].beskrivning =
      'Kv Ekoxen byggs i full skala. Utgiften fördelas 2027–2031, aktiveras 2031 och ger hyresintäkter därefter.';

    lista.push(skapaScenario('Ränta +1 procentenhet', function (ind) {
      ind.ranta.uppgang = 0.01; ind.ranta.uppgang_fran = 2027; ind.ranta.genomslag = 'bindning';
    }));
    lista[lista.length - 1].beskrivning =
      'Marknadsräntan stiger 1,0 procentenhet från 2027. Genomslaget begränsas av räntebindningen.';

    // Fyra omvärldsscenarier med satser hämtade ur publicerad statistik.
    // Källorna står i respektive beskrivning.
    function satt(ind, nyckel, varde) {
      ALLA_AR.forEach(function (y) { if (y >= 2027) ind.drivare[nyckel][y] = varde; });
    }

    lista.push(skapaScenario('Taxor och byggkostnader enligt utfallet', function (ind) {
      satt(ind, 'varme', 0.092); satt(ind, 'vatten', 0.109); satt(ind, 'sophamtning', 0.073);
      satt(ind, 'el', 0.050); satt(ind, 'entreprenad', 0.035);
      satt(ind, 'loneokning', 0.030); satt(ind, 'forsakring', 0.050);
    }));
    lista[lista.length - 1].beskrivning =
      'Kostnaderna fortsätter i den takt som senast uppmätts. Fjärrvärme 9,2 %, VA 10,9 % och ' +
      'avfall 7,3 % enligt Nils Holgerssonrapporten 2025; byggkostnadsindex för flerbostadshus ' +
      '3,5 % i augusti 2026; löner 3,0 % enligt märket; försäkring 5 % för bostadsfastigheter. ' +
      'Planen antar 5–6 % på värme, 6 % på vatten och 2,2 % på löner och entreprenader.';

    lista.push(skapaScenario('Ränteuppgång och svag hyresuppgörelse', function (ind) {
      ind.ranta.uppgang = 0.0075; ind.ranta.uppgang_fran = 2027; ind.ranta.genomslag = 'bindning';
      satt(ind, 'hyra_bostader', 0.027); satt(ind, 'loneokning', 0.030);
    }));
    lista[lista.length - 1].beskrivning =
      'Riksbanken höjer 0,75 procentenheter från 2027 — vid räntebeskedet i augusti 2026 lämnades ' +
      'styrräntan på 1,75 % men banken varnade för att en höjning kan bli aktuell senare under året. ' +
      'Samtidigt stannar hyresförhandlingarna på 2,7 %, i linje med att 2026 gav den lägsta ' +
      'uppgörelsen sedan 2021 (3,4 % i riket). Löner 3,0 % enligt märket.';

    lista.push(skapaScenario('Räntebanan håller', function (ind) {
      ind.ranta.uppgang = -0.0040; ind.ranta.uppgang_fran = 2027; ind.ranta.genomslag = 'bindning';
    }));
    lista[lista.length - 1].beskrivning =
      'Styrräntan ligger kvar nära 1,75 % och når enligt Riksbankens räntebana omkring 2,0 % först ' +
      '2028. Basplanen räknar med att bolagets egen snittränta stiger under perioden. Här antas ' +
      '0,40 procentenheter lägre från 2027, vilket ger utrymme för marginal och borgensavgift ovanpå ' +
      'Riksbankens bana.';

    lista.push(skapaScenario('Hyran kompenserar kostnadsläget', function (ind) {
      satt(ind, 'hyra_bostader', 0.042); satt(ind, 'loneokning', 0.030);
      satt(ind, 'varme', 0.070); satt(ind, 'vatten', 0.080); satt(ind, 'sophamtning', 0.060);
      satt(ind, 'entreprenad', 0.035); satt(ind, 'forsakring', 0.050);
    }));
    lista[lista.length - 1].beskrivning =
      'Samma kostnadstryck som i det negativa scenariot, men något dämpat — och med täckning i ' +
      'hyran: 4,2 % mot planens 3,2 fallande till 2,7 %. Det är kostnadsutvecklingen som är ' +
      'förhandlingsargumentet, och taxorna ligger långt över KPI. Värme 7 %, vatten 8 %, avfall 6 %, ' +
      'entreprenader 3,5 %, löner 3,0 %.';

    return lista;
  }

  function fordela(belopp, start, slut, form) {
    var n = Math.max(1, slut - start + 1), v = [], sum = 0;
    for (var i = 0; i < n; i++) {
      var w;
      if (form === 'jamn') w = 1;
      else if (form === 'framtung') w = n - i;
      else if (form === 'baktung') w = i + 1;
      else w = Math.sin(Math.PI * (i + 0.5) / n) + 0.18;  // klocka
      v.push(w); sum += w;
    }
    var ut = {};
    ALLA_AR.forEach(function (y) { ut[y] = 0; });
    for (var k = 0; k < n; k++) {
      var y = start + k;
      if (y >= Modell.BAS_AR && y <= Modell.AR_SISTA) ut[y] = Math.round(belopp * v[k] / sum);
    }
    return ut;
  }

  // ------------------------------------------------------------ kombination
  function kombinationsDelar() {
    return S.scenarier.filter(function (s) { return s.id !== 'bas' && S.kombinerade[s.id]; });
  }

  var _komb = null, _kombNyckel = null;
  function kombinerat() {
    var delar = kombinationsDelar();
    if (delar.length < 2) return null;
    var nyckel = delar.map(function (s) { return s.id; }).join('|') + '#' + S.cacheVersion;
    if (_komb && _kombNyckel === nyckel) return _komb;
    var k = Modell.kombineraIndata(BAS_INDATA, delar);
    _komb = { id: KOMB_ID, namn: 'Kombinerat', las: true, syntetisk: true, delar: delar,
      konflikter: k.konflikter, indata: k.indata,
      beskrivning: delar.length + ' delar lagda ovanpå basplanen: ' +
        delar.map(function (d) { return d.namn; }).join(' + ') + '.' };
    _kombNyckel = nyckel;
    return _komb;
  }

  // Alla valbara scenarier, inklusive det härledda kombinerade.
  function lista() {
    var k = kombinerat();
    return k ? S.scenarier.concat([k]) : S.scenarier;
  }

  function aktiv() { return hamta(S.aktivId) || S.scenarier[0]; }
  function hamta(id) { var f = null; lista().forEach(function (s) { if (s.id === id) f = s; }); return f; }
  function farg(id) {
    if (id === KOMB_ID) return KOMBINERAD_FARG;
    var i = 0; S.scenarier.forEach(function (s, k) { if (s.id === id) i = k; });
    return SERIEFARGER[i % SERIEFARGER.length];
  }
  function resultat(id) {
    var s = hamta(id);
    if (!s) return null;
    var nyckel = id === KOMB_ID ? _kombNyckel : id;
    if (!S.cache[nyckel]) S.cache[nyckel] = Modell.berakna(s.indata);
    return S.cache[nyckel];
  }
  function rensaCache(id) {
    if (id) { delete S.cache[id]; } else { S.cache = {}; }
    S.cacheVersion = (S.cacheVersion || 0) + 1;
    _komb = null; _kombNyckel = null; _delCache = {};
  }

  // Resultatnivå för en godtycklig delmängd av delarna, med cache.
  var _delCache = {};
  function nivaFor(delar, ar) {
    var nyckel = delar.map(function (s) { return s.id; }).join('|') + '#' + (S.cacheVersion || 0);
    if (!_delCache[nyckel]) {
      _delCache[nyckel] = delar.length
        ? Modell.berakna(Modell.kombineraIndata(BAS_INDATA, delar).indata)
        : resultat('bas');
    }
    return _delCache[nyckel].rad.resultat_ef[ar];
  }

  // ============================================================ lagring
  function spara() {
    try {
      localStorage.setItem(LAGRINGSNYCKEL, JSON.stringify({
        version: 1, aktivId: S.aktivId, jamforId: S.jamforId, ar: S.ar,
        enhet: S.enhet, flik: S.flik, kombinerade: S.kombinerade, visaArkiv: S.visaArkiv, utfallda: S.utfallda,
        panelBredd: S.panelBredd, panelDold: S.panelDold,
        scenarier: S.scenarier.map(function (s) {
          return { id: s.id, namn: s.namn, las: s.las, beskrivning: s.beskrivning,
                   skapad: s.skapad, indata: s.id === 'bas' ? null : s.indata };
        })
      }));
    } catch (e) { /* lagring full eller blockerad — appen fungerar ändå */ }
  }

  // Om lagringen inte går att tolka får den INTE tyst ersättas av standard-
  // scenarierna — då försvinner timmar av arbete utan att någon märker det.
  // Det trasiga sparas undan och användaren får veta var det ligger.
  function raddaTrasigLagring(rå, fel) {
    var nyckel = LAGRINGSNYCKEL + '_trasig_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
    var sparad = false;
    try { localStorage.setItem(nyckel, rå); sparad = true; } catch (e) {}
    setTimeout(function () {
      dialog('Kunde inte läsa sparade scenarier',
        '<p class="hjalp">Appen startade med standardscenarierna eftersom det sparade läget inte gick ' +
        'att tolka: <b>' + esc(fel && fel.message ? fel.message : String(fel)) + '</b></p>' +
        (sparad
          ? '<p class="hjalp">Det du hade sparat är <b>inte borta</b> — det ligger kvar under nyckeln ' +
            '<code>' + esc(nyckel) + '</code> i webbläsarens lagring för den här sidan. Hör av dig ' +
            'innan du rensar webbläsardata, så går det att rädda.</p>'
          : '<p class="hjalp">Det gick tyvärr inte att spara undan det trasiga läget heller — ' +
            'lagringen kan vara full.</p>'),
        [{ text: 'Stäng', primar: true }]);
    }, 300);
  }

  function las() {
    var rå = null;
    try { rå = localStorage.getItem(LAGRINGSNYCKEL); } catch (e) { rå = null; }
    if (!rå) { S.scenarier = standardscenarier(); return; }
    try {
      var d = JSON.parse(rå);
      S.scenarier = (d.scenarier || []).map(function (s) {
        return { id: s.id, namn: s.namn, las: s.las, beskrivning: s.beskrivning, skapad: s.skapad,
                 indata: s.id === 'bas' ? Modell.kopia(BAS_INDATA) : migrera(s.indata) };
      });
      if (!S.scenarier.length) S.scenarier = standardscenarier();
      S.kombinerade = d.kombinerade || {};
      S.aktivId = d.aktivId || S.scenarier[0].id;
      S.jamforId = d.jamforId || 'bas';
      S.ar = d.ar || S.ar; S.enhet = d.enhet || 'mnkr'; S.flik = d.flik || 'oversikt';
      S.visaArkiv = !!d.visaArkiv;
      S.utfallda = d.utfallda || {};
      S.panelBredd = d.panelBredd || 272;
      S.panelDold = !!d.panelDold;
      if (!hamta(S.aktivId)) S.aktivId = S.scenarier[0].id;
      if (!hamta(S.jamforId)) S.jamforId = S.scenarier[0].id;
    } catch (e) {
      S.scenarier = standardscenarier();
      S.aktivId = 'bas'; S.jamforId = 'bas'; S.kombinerade = {};
      raddaTrasigLagring(rå, e);
    }
  }

  // ============================================================ dialog
  function dialog(rubrik, innehall, knappar) {
    var d = document.getElementById('dialog');
    document.getElementById('dialog-rubrik').textContent = rubrik;
    var i = document.getElementById('dialog-innehall');
    i.innerHTML = '';
    if (typeof innehall === 'string') i.innerHTML = innehall; else i.appendChild(innehall);
    var f = document.getElementById('dialog-fot');
    f.innerHTML = '';
    (knappar || [{ text: 'Stäng' }]).forEach(function (k) {
      var b = document.createElement('button');
      b.className = 'knapp' + (k.primar ? ' primar' : '');
      b.textContent = k.text;
      b.onclick = function () { if (!k.gor || k.gor(i) !== false) d.close(); };
      f.appendChild(b);
    });
    d.showModal();
    var forsta = i.querySelector('input,select,textarea');
    if (forsta) setTimeout(function () { forsta.focus(); }, 30);
    return i;
  }

  // ============================================================ kontextmeny
  var _meny = null;
  function stangMeny() {
    if (_meny) { _meny.remove(); _meny = null; }
    document.removeEventListener('mousedown', utanforMeny, true);
    document.removeEventListener('keydown', menyTangent, true);
  }
  // Stäng bara på klick UTANFÖR menyn. Stänger vi på mousedown var som helst
  // hinner knappen försvinna innan klicket landar, och menyvalet gör inget.
  function utanforMeny(e) {
    if (_meny && _meny.contains(e.target)) return;
    stangMeny();
  }
  function menyTangent(e) { if (e.key === 'Escape') { e.stopPropagation(); stangMeny(); } }

  function kontextmeny(x, y, poster) {
    stangMeny();
    var m = document.createElement('div');
    m.className = 'kontextmeny';
    m.setAttribute('role', 'menu');
    poster.forEach(function (p) {
      if (p.avdelare) { m.appendChild(document.createElement('hr')); return; }
      var b = document.createElement('button');
      b.setAttribute('role', 'menuitem');
      b.textContent = p.text;
      if (p.fara) b.className = 'fara';
      if (p.avaktiv) b.disabled = true;
      b.onclick = function () { stangMeny(); if (p.gor) p.gor(); };
      m.appendChild(b);
    });
    document.body.appendChild(m);
    var b = m.getBoundingClientRect();
    m.style.left = Math.min(x, window.innerWidth - b.width - 8) + 'px';
    m.style.top = Math.min(y, window.innerHeight - b.height - 8) + 'px';
    _meny = m;
    setTimeout(function () {
      document.addEventListener('mousedown', utanforMeny, true);
      document.addEventListener('keydown', menyTangent, true);
      var f = m.querySelector('button:not([disabled])');
      if (f) f.focus();
    }, 0);
  }

  function scenariomeny(s, x, y) {
    var poster = [];
    if (s.las) {
      poster.push({ text: s.syntetisk ? 'Gör om till eget scenario…' : 'Duplicera och redigera…',
        gor: function () { duplicera(s, true); } });
    } else {
      poster.push({ text: 'Redigera antaganden…', gor: function () { scenarioDialog(s); } });
      poster.push({ text: 'Byt namn…', gor: function () { namnDialog(s); } });
      poster.push({ text: 'Duplicera', gor: function () { duplicera(s, false); } });
    }
    poster.push({ avdelare: true });
    poster.push({ text: 'Öppna fullständiga antaganden',
      gor: function () { S.aktivId = s.id; S.flik = 'antaganden'; render(); } });
    poster.push({ text: s.id === S.jamforId ? 'Används som jämförelse' : 'Jämför mot den här',
      avaktiv: s.id === S.jamforId,
      gor: function () { S.jamforId = s.id; render(); } });
    if (!s.las) {
      poster.push({ text: S.kombinerade[s.id] ? 'Ta ur kombinationen' : 'Ta med i kombinationen',
        gor: function () {
          S.kombinerade[s.id] = !S.kombinerade[s.id];
          _komb = null; _kombNyckel = null;
          if (kombinationsDelar().length >= 2) S.aktivId = KOMB_ID;
          else if (S.aktivId === KOMB_ID) S.aktivId = 'bas';
          render();
        } });
    }
    poster.push({ text: 'Exportera scenariot', gor: function () { exportera([s]); } });
    if (!s.las) {
      poster.push({ avdelare: true });
      poster.push({ text: 'Ta bort', fara: true, gor: function () { taBort(s); } });
    }
    kontextmeny(x, y, poster);
  }

  function duplicera(s, redigera) {
    var ny = { id: nyttId(), namn: s.syntetisk ? 'Kombinerat scenario' : s.namn + ' (kopia)',
      beskrivning: s.beskrivning, indata: Modell.kopia(s.indata), skapad: new Date().toISOString() };
    S.scenarier.push(ny);
    S.aktivId = ny.id;
    render();
    if (redigera) scenarioDialog(ny);
  }

  function taBort(s) {
    if (s.las) return;
    if (!confirm('Ta bort scenariot ' + s.namn + '?')) return;
    S.scenarier = S.scenarier.filter(function (x) { return x.id !== s.id; });
    rensaCache(s.id);
    delete S.jamforValda[s.id];
    delete S.kombinerade[s.id];
    if (S.aktivId === s.id) S.aktivId = S.scenarier[0].id;
    if (S.jamforId === s.id) S.jamforId = S.scenarier[0].id;
    render();
  }

  function namnDialog(s) {
    var i = dialog('Byt namn',
      '<label class="falt"><span>Namn</span><input type="text" id="b-namn" value="' + esc(s.namn) + '"></label>' +
      '<label class="falt"><span>Beskrivning</span><input type="text" id="b-besk" value="' + esc(s.beskrivning || '') + '"></label>',
      [{ text: 'Avbryt' }, { text: 'Spara', primar: true, gor: function () {
        s.namn = i.querySelector('#b-namn').value.trim() || s.namn;
        s.beskrivning = i.querySelector('#b-besk').value.trim();
        render();
      } }]);
  }

  function exportera(lista) {
    var d = { app: 'Ekonomisk planering', version: 1, exporterad: new Date().toISOString(),
      scenarier: lista.map(function (s) {
        return { id: s.id, namn: s.namn, las: s.syntetisk ? false : s.las,
                 beskrivning: s.beskrivning, indata: s.indata };
      }) };
    var b = new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = (lista.length === 1 ? 'Scenario ' + lista[0].namn.replace(/[^\wåäöÅÄÖ -]/g, '') : 'Scenarier') +
      ' ' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  // Ett sparat scenario läst via "Läs in fil…". Basplanen hoppas över — den
  // kommer alltid ur arbetsboken och ska inte kunna skrivas över av en fil.
  function lasScenariofil(d) {
    var nya = (d.scenarier || []).filter(function (s) { return s.id !== 'bas'; });
    if (!nya.length) { alert('Filen innehöll inga scenarier att läsa in.'); return; }
    nya.forEach(function (s) {
      S.scenarier.push({ id: nyttId(), namn: s.namn + ' (inläst)', beskrivning: s.beskrivning,
        indata: migrera(s.indata), skapad: new Date().toISOString() });
    });
    rensaCache();
    render();
    alert(nya.length === 1 ? 'Scenariot "' + nya[0].namn + '" lästes in.'
                           : nya.length + ' scenarier lästes in.');
  }

  // ============================================================ excel-export
  // Hela modellen som arbetsbok: det aktiva scenariot rad för rad, plus en
  // jämförelse över samtliga scenarier. Beloppen följer enhetsväljaren, så det
  // som ligger i filen är det som står på skärmen.
  var INDRAG = { delsumma: '', post: '    ', underpost: '        ', resultat: '' };

  function arrubriker(forsta) {
    return [{ v: forsta, f: 'rub' }].concat(AR.map(function (y) { return { v: y, f: 'rub' }; }));
  }
  function arbredd(forstaBredd) {
    var b = [forstaBredd];
    AR.forEach(function () { b.push(11); });
    return b;
  }
  // En rad där varje år hämtas ur en funktion.
  function arrad(etikett, hamta, format, etikettformat) {
    return [{ v: etikett, f: etikettformat || 'txt' }].concat(AR.map(function (y) {
      var v = hamta(y);
      return (v === null || v === undefined || !isFinite(v)) ? null : { v: v, f: format };
    }));
  }

  function bladOversikt(s, r) {
    var ind = s.indata, rader = [];
    rader.push([{ v: 'Ekonomisk planering och scenarioanalys', f: 'titel' }]);
    rader.push(null);
    function meta(a, b) { rader.push([{ v: a, f: 'fet' }, b]); }
    meta('Scenario', s.namn);
    if (s.beskrivning) meta('Beskrivning', s.beskrivning);
    if (s.syntetisk && s.delar) meta('Härlett ur', s.delar.map(function (d) { return d.namn; }).join(' + '));
    meta('Jämförs mot', (hamta(S.jamforId) || {}).namn || '–');
    meta('Belopp i', enhetsnamn());
    meta('Planhorisont', AR[0] + '–' + AR[AR.length - 1]);
    meta('Arbetsbokens plan', Modell.BAS_AR + '–' + BAS_SISTA + ', därefter framskrivning');
    meta('Skuldbana', ind.skuldkalla === 'finansrapport'
      ? 'Låst mot budgetarbetsbokens skuldnivåer'
      : 'Beräknad ur kassaflödet, som fliken Fin behov');
    if (ind.prognoskalla && ind.prognoskalla.namn) {
      meta('Inläst prognos', ind.prognoskalla.namn +
        (ind.prognoskalla.ar ? ' (' + ind.prognoskalla.ar + ')' : ''));
    }
    meta('Exporterad', new Date().toLocaleString('sv-SE').slice(0, 16));
    rader.push(null);

    rader.push([{ v: 'Nyckeltal', f: 'fet' }]);
    rader.push(arrubriker('Nyckeltal'));
    rader.push(arrad('Resultat efter finansnetto', function (y) { return skala(r.rad.resultat_ef[y]); }, 'tal1', 'fet'));
    rader.push(arrad('Driftnetto', function (y) { return skala(r.nyckeltal[y].driftnetto); }, 'tal'));
    rader.push(arrad('Driftnettomarginal', function (y) { return r.nyckeltal[y].driftnetto_marginal; }, 'pct'));
    rader.push(arrad('Räntetäckningsgrad', function (y) { return r.nyckeltal[y].rantetackning; }, 'dec2'));
    rader.push(arrad('Räntetäckningsgrad exkl. avskrivningar', function (y) { return r.nyckeltal[y].rantetackning_exkl_avskr; }, 'dec2'));
    rader.push(arrad('Personalkostnader', function (y) { return skala(r.nyckeltal[y].personalkostnad); }, 'tal'));
    rader.push(arrad('Kassaflöde från driften', function (y) { return skala(r.skuld[y].kassaflode_drift); }, 'tal'));
    rader.push(arrad('Kassaflöde efter investeringar', function (y) { return skala(r.nyckeltal[y].kassaflode_efter_invest); }, 'tal'));
    rader.push(arrad('Effektiv genomsnittsränta', function (y) { return r.skuld[y].effektiv_ranta; }, 'pct2'));
    return { namn: 'Översikt', rader: rader, bredd: arbredd(38), frysRad: 0, frysKol: 1 };
  }

  function bladResultat(s, r) {
    var rader = [];
    rader.push([{ v: 'Resultaträkning — ' + s.namn, f: 'titel' }]);
    rader.push([{ v: 'Belopp i ' + enhetsnamn() + '. Kostnader anges med minustecken.', f: 'txt' }]);
    rader.push(null);
    rader.push(arrubriker('Post'));
    rrRadlista(r).forEach(function (rd) {
      var stark = rd.niva === 'delsumma' || rd.niva === 'resultat';
      rader.push(arrad((INDRAG[rd.niva] || '') + rd.etikett,
        function (y) { return skala(r.rad[rd.nyckel][y]); },
        stark ? 'fettal' : 'tal', stark ? 'fet' : 'txt'));
    });
    return { namn: 'Resultaträkning', rader: rader, bredd: arbredd(42), frysRad: 4, frysKol: 1 };
  }

  function bladInvesteringar(s, r) {
    var ind = s.indata, rader = [];
    rader.push([{ v: 'Investeringar — ' + s.namn, f: 'titel' }]);
    rader.push([{ v: 'Belopp i ' + enhetsnamn() + '. Utbetalt per år enligt investeringsspecen.', f: 'txt' }]);
    rader.push(null);
    rader.push([{ v: 'Projekt', f: 'rub' }, { v: 'Projektnr', f: 'rub' }, { v: 'Typ', f: 'rub' },
                { v: 'Grupp', f: 'rub' }, { v: 'Aktivt', f: 'rub' }]
      .concat(AR.map(function (y) { return { v: y, f: 'rub' }; }))
      .concat([{ v: 'Summa', f: 'rub' }]));

    ind.projekt.slice().sort(function (a, b) {
      return (a.grupp || '').localeCompare(b.grupp || '', 'sv') || (a.namn || '').localeCompare(b.namn || '', 'sv');
    }).forEach(function (p) {
      var summa = 0;
      var celler = [p.namn, p.projektnr || '', p.typ || '', p.grupp || '', p.aktiv ? 'Ja' : 'Nej'];
      AR.forEach(function (y) {
        var v = p.spend[y] || 0;
        summa += v;
        celler.push(v ? { v: skala(v), f: 'tal' } : null);
      });
      celler.push(summa ? { v: skala(summa), f: 'tal' } : null);
      rader.push(celler);
    });

    rader.push(null);
    function summarad(etikett, hamta, fet) {
      var celler = [{ v: etikett, f: fet ? 'fet' : 'txt' }, null, null, null, null], summa = 0;
      AR.forEach(function (y) {
        var v = hamta(y);
        summa += v;
        celler.push({ v: skala(v), f: fet ? 'fettal' : 'tal' });
      });
      celler.push({ v: skala(summa), f: fet ? 'fettal' : 'tal' });
      rader.push(celler);
    }
    summarad('Nyproduktion', function (y) { return r.invest[y].nyproduktion; });
    summarad('Underhåll och ombyggnad', function (y) { return r.invest[y].underhall; });
    summarad('varav antagen volym bortom specen', function (y) { return (ind.ovrig_volym && ind.ovrig_volym[y]) || 0; });
    summarad('Total investeringsvolym', function (y) { return r.invest[y].total; }, true);
    rader.push(null);
    summarad('Avskrivningar, befintligt bestånd', function (y) { return r.avskr[y].bas + r.avskr[y].utfasning; });
    summarad('Avskrivningar, underhållsinvesteringar', function (y) { return r.avskr[y].underhall; });
    summarad('Avskrivningar, nyproduktion', function (y) { return r.avskr[y].nyproduktion; });
    summarad('Avskrivningar totalt', function (y) { return r.avskr[y].total; }, true);
    return { namn: 'Investeringar', rader: rader,
      bredd: [40, 10, 14, 14, 8].concat(AR.map(function () { return 11; })).concat([12]),
      frysRad: 4, frysKol: 1 };
  }

  function bladRanta(s, r) {
    var ind = s.indata, rader = [];
    rader.push([{ v: 'Ränta och skuld — ' + s.namn, f: 'titel' }]);
    rader.push([{ v: 'Belopp i ' + enhetsnamn() + '. Posterna summerar från ingående till utgående skuld.', f: 'txt' }]);
    rader.push(null);
    rader.push(arrubriker('Post'));
    rader.push(arrad('Ingående låneskuld', function (y) { return skala(r.skuld[y].ing); }, 'fettal', 'fet'));
    rader.push(arrad('Investeringar', function (y) { return skala(r.invest[y].total); }, 'tal'));
    rader.push(arrad('Kassaflöde från driften', function (y) { return skala(-r.skuld[y].kassaflode_drift); }, 'tal'));
    rader.push(arrad('Koncernbidrag', function (y) { return skala(-(ind.koncernbidrag[y] || 0)); }, 'tal'));
    rader.push(arrad('Försäljningar', function (y) { return skala(-(ind.forsaljning[y] || 0)); }, 'tal'));
    rader.push(arrad('Övriga kassaflöden', function (y) { return skala(ind.ovrigt_kassaflode[y] || 0); }, 'tal'));
    rader.push(arrad('Utgående låneskuld', function (y) { return skala(r.skuld[y].ut); }, 'fettal', 'fet'));
    rader.push(arrad('Genomsnittlig låneskuld', function (y) { return skala(r.skuld[y].snitt); }, 'tal'));
    rader.push(null);
    rader.push(arrad('Grundränta', function (y) { return skala(r.skuld[y].grundranta); }, 'tal'));
    rader.push(arrad('Effekt av ränteuppgång', function (y) { return skala(r.skuld[y].ranterisk); }, 'tal'));
    rader.push(arrad('Borgensavgift till kommunen', function (y) { return skala(r.skuld[y].borgensavgift); }, 'tal'));
    rader.push(arrad('Räntekostnad totalt', function (y) { return skala(r.rad.rantekostnader[y]); }, 'fettal', 'fet'));
    rader.push(null);
    rader.push(arrad('Effektiv genomsnittsränta', function (y) { return r.skuld[y].effektiv_ranta; }, 'pct2'));
    rader.push(arrad('Räntebana', function (y) { return ind.ranta.bana[y]; }, 'pct2'));
    rader.push(arrad('Rörlig exponering', function (y) { return ind.ranta.rorlig[y]; }, 'pct'));
    rader.push(arrad('Bindningstid, år', function (y) { return ind.ranta.bindningstid[y]; }, 'dec2'));
    rader.push(arrad('Genomslag av scenariots ränteuppgång', function (y) { return r.skuld[y].genomslag; }, 'pct'));
    return { namn: 'Ränta och skuld', rader: rader, bredd: arbredd(38), frysRad: 4, frysKol: 1 };
  }

  function bladAntaganden(s, r) {
    var ind = s.indata, rader = [];
    rader.push([{ v: 'Antaganden — ' + s.namn, f: 'titel' }]);
    rader.push([{ v: 'Årlig förändringstakt per kostnadsdrivare.', f: 'txt' }]);
    rader.push(null);
    rader.push([{ v: 'Drivare', f: 'rub' }, { v: 'Grupp', f: 'rub' }]
      .concat(AR.map(function (y) { return { v: y, f: 'rub' }; })));
    Modell.DRIVARE.forEach(function (d) {
      var k = ind.drivare[d.nyckel];
      if (!k) return;
      rader.push([d.etikett, d.grupp].concat(AR.map(function (y) {
        return (k[y] === null || k[y] === undefined) ? null : { v: k[y], f: 'pct' };
      })));
    });
    rader.push(null);
    rader.push([{ v: 'Övriga antaganden', f: 'fet' }]);
    function post(a, b, f) { rader.push([a, null, (b === null || b === undefined) ? null : { v: b, f: f }]); }
    post('Ränteuppgång i scenariot', ind.ranta.uppgang, 'pct2');
    rader.push(['Gäller från och med', null, ind.ranta.uppgang_fran]);
    rader.push(['Genomslagsmodell', null, ind.ranta.genomslag]);
    post('Borgensavgift, andel av snittskuld', ind.ranta.borgensavgift, 'pct2');
    post('Personalandel av central administration', ind.personalandel_adm, 'pct');
    post('Avskrivningssats, underhållsinvesteringar', ind.satser && ind.satser.underhall, 'pct');
    post('Avskrivningssats, nyproduktion bostäder', ind.satser && ind.satser.nyprod_bostader, 'pct');
    return { namn: 'Antaganden', rader: rader,
      bredd: [42, 20].concat(AR.map(function () { return 11; })), frysRad: 4, frysKol: 1 };
  }

  function bladJamforelse() {
    var alla = lista(), rader = [];
    rader.push([{ v: 'Scenariojämförelse', f: 'titel' }]);
    rader.push([{ v: 'Belopp i ' + enhetsnamn() + '.', f: 'txt' }]);
    rader.push(null);
    [['Resultat efter finansnetto', function (x, y) { return skala(x.rad.resultat_ef[y]); }, 'tal1'],
     ['Låneskuld vid årets slut', function (x, y) { return skala(x.skuld[y].ut); }, 'tal'],
     ['Räntetäckningsgrad', function (x, y) { return x.nyckeltal[y].rantetackning; }, 'dec2'],
     ['Investeringsvolym', function (x, y) { return skala(x.invest[y].total); }, 'tal']
    ].forEach(function (matt, i) {
      if (i) rader.push(null);
      rader.push([{ v: matt[0], f: 'fet' }]);
      rader.push(arrubriker('Scenario'));
      alla.forEach(function (sc) {
        var x = resultat(sc.id);
        rader.push(arrad(sc.namn, function (y) { return matt[1](x, y); }, matt[2]));
      });
    });
    return { namn: 'Scenariojämförelse', rader: rader, bredd: arbredd(42), frysKol: 1 };
  }

  function exporteraExcel() {
    var s = aktiv(), r = resultat(S.aktivId);
    var knapp = document.getElementById('knapp-exportera');
    if (knapp) { knapp.disabled = true; knapp.textContent = 'Skriver…'; }
    function klar() {
      if (knapp) { knapp.disabled = false; knapp.textContent = 'Exportera Excel'; }
    }
    SkrivXlsx.bok([
      bladOversikt(s, r), bladResultat(s, r), bladInvesteringar(s, r),
      bladRanta(s, r), bladAntaganden(s, r), bladJamforelse()
    ]).then(function (blob) {
      SkrivXlsx.ladda(blob, 'Ekonomisk planering - ' + s.namn + ' - ' +
        new Date().toISOString().slice(0, 10) + '.xlsx');
      klar();
    }).catch(function (e) {
      klar();
      alert('Kunde inte skriva Excel-filen.\n\n' + (e && e.message ? e.message : e));
    });
  }

  // ============================================================ redigera scenario
  // Spakarna anges som avvikelse i procentenheter mot basplanen. Det är så man
  // tänker om ett scenario, och det gäller alla år från och med startåret.
  var SPAKAR = [
    { grupp: 'Ränta' },
    { typ: 'ranta_uppgang', etikett: 'Ränteuppgång', enhet: 'pp' },
    { typ: 'ranta_genomslag', etikett: 'Genomslagsmodell' },
    { grupp: 'Intäkter' },
    { typ: 'drivare', nyckel: 'hyra_bostader', etikett: 'Hyreshöjning bostäder' },
    { typ: 'drivare', nyckel: 'hyra_lokaler', etikett: 'Hyreshöjning lokaler' },
    { typ: 'drivare', nyckel: 'hyra_garage', etikett: 'Hyreshöjning garage / P-plats' },
    { grupp: 'Kostnader' },
    { typ: 'drivare', nyckel: 'loneokning', etikett: 'Löneökning' },
    { typ: 'drivare', nyckel: 'entreprenad', etikett: 'Entreprenader och material' },
    { typ: 'drivare', nyckel: 'forsakring', etikett: 'Försäkringar' },
    { typ: 'drivare', nyckel: 'vinter', etikett: 'Vinterkostnader' },
    { typ: 'drivare', nyckel: 'it', etikett: 'IT och databehandling' },
    { typ: 'drivare', nyckel: 'varme', etikett: 'Värme' },
    { typ: 'drivare', nyckel: 'vatten', etikett: 'Vatten' },
    { typ: 'drivare', nyckel: 'underhall', etikett: 'Underhållskostnader' },
    { grupp: 'Investeringar' },
    { typ: 'ovrig_volym', etikett: 'Investeringsvolym bortom specen', enhet: 'mnkr/år' }
  ];

  // Första året där scenariot avviker från basplanen — används som startår.
  function forstaAvvikelsear(ind) {
    var bd = Modell.basDrivare(), tidigast = null;
    Object.keys(bd).forEach(function (k) {
      if (!ind.drivare[k]) return;
      ALLA_AR.forEach(function (y) {
        if (Math.abs(ind.drivare[k][y] - bd[k][y]) > 1e-9 && (tidigast === null || y < tidigast)) tidigast = y;
      });
    });
    ALLA_AR.forEach(function (y) {
      if (Math.abs((ind.ovrig_volym[y] || 0) - (BAS_INDATA.ovrig_volym[y] || 0)) > 0.5 &&
          (tidigast === null || y < tidigast)) tidigast = y;
    });
    if (ind.ranta.uppgang && (tidigast === null || ind.ranta.uppgang_fran < tidigast)) {
      tidigast = ind.ranta.uppgang_fran;
    }
    return tidigast || AR[Math.min(1, AR.length - 1)];
  }

  function scenarioDialog(s) {
    if (s.las) { duplicera(s, true); return; }
    var arb = Modell.kopia(s.indata);          // arbetskopia — ångras vid Avbryt
    var bd = Modell.basDrivare();
    var fran = forstaAvvikelsear(arb);

    function rad(sp, i) {
      if (sp.grupp) {
        return '<tr class="gruppdel"><td colspan="4">' + esc(sp.grupp) + '</td></tr>';
      }
      var bas = '', varde = '', enhet = sp.enhet || 'pp';
      if (sp.typ === 'drivare') {
        bas = fmt(bd[sp.nyckel][fran] * 100, 1) + ' %';
        varde = inmat((arb.drivare[sp.nyckel][fran] - bd[sp.nyckel][fran]) * 100, 2);
      } else if (sp.typ === 'ranta_uppgang') {
        bas = '0,0 pp';
        varde = inmat((arb.ranta.uppgang || 0) * 100, 2);
      } else if (sp.typ === 'ranta_genomslag') {
        return '<tr><td class="etikett">' + esc(sp.etikett) + '</td><td class="svag">Räntebindning</td>' +
          '<td colspan="2"><select data-sp="' + i + '">' +
          [['rorlig', 'Rörlig del'], ['bindning', 'Räntebindning'], ['direkt', 'Direkt, hela skulden']]
            .map(function (g) {
              return '<option value="' + g[0] + '"' + (arb.ranta.genomslag === g[0] ? ' selected' : '') +
                '>' + g[1] + '</option>';
            }).join('') + '</select></td></tr>';
      } else if (sp.typ === 'ovrig_volym') {
        bas = fmt(BAS_INDATA.ovrig_volym[fran] / 1000, 0) + ' mnkr';
        varde = inmat(arb.ovrig_volym[fran] / 1000, 0);
      }
      var andrad = sp.typ === 'ovrig_volym'
        ? Math.abs(arb.ovrig_volym[fran] - BAS_INDATA.ovrig_volym[fran]) > 0.5
        : Math.abs(num(varde)) > 1e-9;
      return '<tr' + (andrad ? ' class="andrad"' : '') + '><td class="etikett">' + esc(sp.etikett) + '</td>' +
        '<td class="svag">' + bas + '</td>' +
        '<td><div class="spakfalt"><input type="number" data-sp="' + i + '" step="' +
          (sp.typ === 'ovrig_volym' ? 25 : 0.25) + '" value="' + varde + '">' +
          '<span class="spakenhet">' + enhet + '</span></div></td>' +
        '<td>' + (andrad ? '<button class="knapp liten tyst" data-nolla="' + i + '">Nollställ</button>' : '') + '</td></tr>';
    }

    function bygg() {
      return '<div class="falt-rad">' +
          '<label class="falt"><span>Namn</span><input type="text" id="sd-namn" value="' + esc(s.namn) + '"></label>' +
          '<label class="falt"><span>Ändringarna gäller från år</span><select id="sd-fran">' +
            AR.map(function (y) {
              return '<option value="' + y + '"' + (y === fran ? ' selected' : '') + '>' + y + '</option>';
            }).join('') + '</select></label>' +
        '</div>' +
        '<label class="falt"><span>Beskrivning</span><input type="text" id="sd-besk" value="' +
          esc(s.beskrivning || '') + '" placeholder="Vad prövar scenariot?"></label>' +
        '<div class="tabellsvep"><table class="data spaktabell"><thead><tr>' +
          '<th class="etikett">Antagande</th><th>Basplan ' + fran + '</th><th>Avvikelse</th><th></th>' +
          '</tr></thead><tbody>' + SPAKAR.map(rad).join('') + '</tbody></table></div>' +
        '<div class="notis info" id="sd-effekt"></div>' +
        '<p class="hjalp">Avvikelsen gäller alla år från ' + fran + ' och framåt. ' +
          'Investeringsprojekt och finare justeringar görs på flikarna <b>Investeringar</b> och <b>Antaganden</b>.</p>';
    }

    var i = dialog('Redigera ' + s.namn, bygg(), [
      { text: 'Avbryt' },
      { text: 'Spara', primar: true, gor: function () {
        s.namn = i.querySelector('#sd-namn').value.trim() || s.namn;
        s.beskrivning = i.querySelector('#sd-besk').value.trim();
        s.indata = arb;
        rensaCache(s.id);
        S.aktivId = s.id;
        render();
      } }
    ]);

    function satt(sp, el) {
      var v = num(el.value);
      if (sp.typ === 'drivare') {
        ALLA_AR.forEach(function (y) {
          arb.drivare[sp.nyckel][y] = bd[sp.nyckel][y] + (y >= fran ? v / 100 : 0);
        });
      } else if (sp.typ === 'ranta_uppgang') {
        arb.ranta.uppgang = v / 100;
        arb.ranta.uppgang_fran = fran;
      } else if (sp.typ === 'ranta_genomslag') {
        arb.ranta.genomslag = el.value;
      } else if (sp.typ === 'ovrig_volym') {
        ALLA_AR.forEach(function (y) { if (y >= fran) arb.ovrig_volym[y] = v * 1000; });
      }
    }

    function effekt() {
      var r = Modell.berakna(arb), b = resultat('bas');
      var y = S.ar, d = r.rad.resultat_ef[y] - b.rad.resultat_ef[y];
      var lagst = Infinity, lagstAr = y;
      AR.forEach(function (a) {
        if (r.rad.resultat_ef[a] < lagst) { lagst = r.rad.resultat_ef[a]; lagstAr = a; }
      });
      i.querySelector('#sd-effekt').innerHTML =
        '<div>Resultat ' + y + ': <b>' + talD(r.rad.resultat_ef[y]) + ' ' + enhetsnamn() + '</b> ' +
        '<span class="' + (Math.abs(d) < 50 ? 'noll' : (d > 0 ? 'upp' : 'ned')) + '">' +
        delta(d) + ' mot basplanen</span>. ' +
        'Lägsta år är ' + lagstAr + ' med <b class="' + (lagst < 0 ? 'ned' : '') + '">' + talD(lagst) + '</b>, ' +
        'räntetäckningsgrad <b class="' + (r.nyckeltal[lagstAr].rantetackning < 1 ? 'ned' : '') + '">' +
        fmt(r.nyckeltal[lagstAr].rantetackning, 2) + '</b>.</div>';
    }

    function koppla() {
      i.querySelectorAll('[data-sp]').forEach(function (el) {
        var sp = SPAKAR[+el.dataset.sp];
        el.onchange = function () { satt(sp, el); rita(); };
        if (el.tagName === 'INPUT') el.oninput = function () { satt(sp, el); effekt(); };
      });
      i.querySelectorAll('[data-nolla]').forEach(function (b) {
        b.onclick = function () {
          var sp = SPAKAR[+b.dataset.nolla];
          if (sp.typ === 'drivare') ALLA_AR.forEach(function (y) { arb.drivare[sp.nyckel][y] = bd[sp.nyckel][y]; });
          else if (sp.typ === 'ranta_uppgang') arb.ranta.uppgang = 0;
          else if (sp.typ === 'ovrig_volym') {
            ALLA_AR.forEach(function (y) { arb.ovrig_volym[y] = BAS_INDATA.ovrig_volym[y]; });
          }
          rita();
        };
      });
      i.querySelector('#sd-fran').onchange = function () {
        fran = +this.value;
        // flytta om befintliga avvikelser till det nya startåret
        SPAKAR.forEach(function (sp) {
          if (sp.typ !== 'drivare') return;
          var d = null;
          ALLA_AR.forEach(function (y) {
            var av = arb.drivare[sp.nyckel][y] - bd[sp.nyckel][y];
            if (Math.abs(av) > 1e-9 && d === null) d = av;
          });
          if (d === null) return;
          ALLA_AR.forEach(function (y) { arb.drivare[sp.nyckel][y] = bd[sp.nyckel][y] + (y >= fran ? d : 0); });
        });
        if (arb.ranta.uppgang) arb.ranta.uppgang_fran = fran;
        rita();
      };
      effekt();
    }

    function rita() {
      var namn = i.querySelector('#sd-namn').value, besk = i.querySelector('#sd-besk').value;
      i.innerHTML = bygg();
      i.querySelector('#sd-namn').value = namn;
      i.querySelector('#sd-besk').value = besk;
      koppla();
    }
    koppla();
  }

  // ============================================================ rendering
  // Vilka flikar innehåller ändringar i det aktiva scenariot.
  function flikarMedAndring() {
    var s = aktiv(), ut = {};
    if (!s || s.id === 'bas') return ut;
    var d = Modell.diffIndata(BAS_INDATA, s.indata);
    d.falt.forEach(function (f) {
      var t = f.stig[0];
      if (t === 'ranta') ut.ranta = true;
      else if (t === 'ovrig_volym') ut.investeringar = true;
      else ut.antaganden = true;
    });
    if (d.projekt.lagg.length || d.projekt.andra.length || d.projekt.taBort.length) ut.investeringar = true;
    return ut;
  }

  function renderScenariobar() {
    var s = aktiv(), e = document.getElementById('scenariobar');
    var las = !!s.las, egen = s.id !== 'bas' && !s.syntetisk;
    var a = egen ? andringar(s.indata) : null;
    e.innerHTML =
      '<span class="sb-prick"></span>' +
      '<span class="sb-namn">' + esc(s.namn) + '</span>' +
      (s.id === 'bas' ? '<span class="marke-liten">Låst — styrelsebudgeten</span>'
        : (s.syntetisk ? '<span class="marke-liten">Härlett ur ' + s.delar.length + ' delar</span>' : '')) +
      // Delarna räknas upp i notisen direkt under baren — upprepas inte här.
      '<span class="sb-andr">' + (egen
        ? (a.antal ? 'Ändrar <b>' + esc(a.grupper.slice(0, 4).join(', ')) +
            (a.grupper.length > 4 ? ' m.fl.' : '') + '</b> mot basplanen'
          : 'Inga ändringar mot basplanen ännu')
        : (s.syntetisk ? 'Delarnas sammanlagda utfall — se uppräkningen nedan'
          : 'Duplicera för att göra egna antaganden')) + '</span>' +
      '<span class="sb-hoger">' +
        '<button class="knapp liten' + (egen ? ' primar' : '') + '" id="sb-redigera">' +
        (las ? 'Duplicera och redigera…' : 'Redigera…') + '</button></span>';
    document.getElementById('sb-redigera').onclick = function () { scenarioDialog(s); };
  }

  function render() {
    // Det kombinerade scenariot kan ha försvunnit sedan förra renderingen.
    if (!hamta(S.aktivId)) S.aktivId = 'bas';
    if (!hamta(S.jamforId)) S.jamforId = 'bas';
    document.documentElement.style.setProperty('--scenariofarg', farg(S.aktivId));
    renderScenariobar();
    renderArval();
    renderSidopanel();
    renderKpi();
    renderFlikar();
    renderFlik();
    spara();
  }

  function renderArval() {
    var e = document.getElementById('arval');
    var visaArkiv = S.visaArkiv && ARKIV.length;
    var ar = visaArkiv ? ALLA_AR : AR;
    if (ar.indexOf(S.ar) < 0) S.ar = AR[Math.min(2, AR.length - 1)];

    e.innerHTML =
      (ARKIV.length ? '<button id="arkivtoggle" class="arkivknapp" aria-pressed="' + !!visaArkiv + '">' +
        (visaArkiv ? '‹ Dölj arkiv' : ARKIV.length + ' arkiverade år ›') + '</button>' : '') +
      ar.map(function (y) {
        var kl = [];
        if (y < Modell.AR_FORSTA) kl.push('arkiverad');
        if (y > BAS_SISTA) kl.push('prognosmark');
        return '<button data-ar="' + y + '" aria-pressed="' + (y === S.ar) + '"' +
          (kl.length ? ' class="' + kl.join(' ') + '"' : '') +
          ' title="' + (y < Modell.AR_FORSTA ? 'Arkiverat år — passerat'
            : (y > BAS_SISTA ? 'Framskrivning bortom arbetsbokens plan' : 'Inom arbetsbokens plan')) + '">' +
          y + '</button>';
      }).join('');

    e.querySelectorAll('button[data-ar]').forEach(function (b) {
      b.onclick = function () { S.ar = +b.dataset.ar; render(); };
    });
    var at = document.getElementById('arkivtoggle');
    if (at) at.onclick = function () { S.visaArkiv = !S.visaArkiv; render(); };
  }

  // ------------------------------------------------------------ sidopanel
  function renderSidopanel() {
    var el = document.getElementById('scenariolista');
    var alla = lista(), jr = resultat(S.jamforId);
    var antalKryss = kombinationsDelar().length;

    el.innerHTML = alla.map(function (s) {
      var r = resultat(s.id);
      var d = r.rad.resultat_ef[S.ar] - jr.rad.resultat_ef[S.ar];
      var kl = s.id === S.jamforId ? 'noll' : (Math.abs(d) < 50 ? 'noll' : (d > 0 ? 'upp' : 'ned'));
      var kryss = s.id === 'bas'
        ? '<span class="kryssplats" title="Basplanen är alltid grunden">·</span>'
        : (s.syntetisk
          ? '<span class="kryssplats">◆</span>'
          : '<input type="checkbox" class="kombkryss" data-komb="' + s.id + '"' +
            (S.kombinerade[s.id] ? ' checked' : '') +
            ' title="Ta med i kombinationen" aria-label="Ta med ' + esc(s.namn) + ' i kombinationen">');
      return '<div class="scenariorad' + (s.syntetisk ? ' syntetisk' : '') + '">' + kryss +
        '<button class="scenariokort" data-id="' + s.id + '" aria-current="' + (s.id === S.aktivId) + '">' +
        '<span class="prick" style="background:' + farg(s.id) + '"></span>' +
        '<span class="namn" title="' + esc(s.namn) + '">' + esc(s.namn) +
          (s.syntetisk ? ' <span class="antal">' + s.delar.length + '</span>' : '') + '</span>' +
        '<span class="delta ' + kl + '">' + (s.id === S.jamforId ? '–' : delta(d, 0)) + '</span></button></div>';
    }).join('') +
      (antalKryss === 1
        ? '<p class="kombhint">Kryssa för minst två scenarier för att se dem lagda ovanpå varandra.</p>'
        : (antalKryss === 0
          ? '<p class="kombhint">Kryssa för flera scenarier för att lägga ihop dem och se effekten av varje del.</p>' : ''));

    el.querySelectorAll('.scenariokort').forEach(function (b) {
      var s = hamta(b.dataset.id);
      b.onclick = function () { S.aktivId = b.dataset.id; render(); };
      b.ondblclick = function () { S.aktivId = b.dataset.id; scenarioDialog(s); };
      b.oncontextmenu = function (e) {
        e.preventDefault();
        S.aktivId = b.dataset.id;
        render();
        scenariomeny(hamta(b.dataset.id), e.clientX, e.clientY);
      };
      b.title = (s && s.las ? '' : 'Dubbelklicka för att redigera. ') + 'Högerklicka för fler val.';
    });
    el.querySelectorAll('.kombkryss').forEach(function (c) {
      c.onchange = function () {
        S.kombinerade[c.dataset.komb] = c.checked;
        _komb = null; _kombNyckel = null;
        if (kombinationsDelar().length >= 2) S.aktivId = KOMB_ID;
        else if (S.aktivId === KOMB_ID) S.aktivId = 'bas';
        render();
        // omritningen byter ut kryssrutan — flytta tillbaka fokus
        var ny = document.querySelector('.kombkryss[data-komb="' + c.dataset.komb + '"]');
        if (ny) ny.focus();
      };
    });

    var jv = document.getElementById('jamforval');
    jv.innerHTML = alla.map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === S.jamforId ? ' selected' : '') + '>' + esc(s.namn) + '</option>';
    }).join('');
    jv.onchange = function () { S.jamforId = jv.value; render(); };

    document.getElementById('knapp-ta-bort').disabled = !!aktiv().las;
    document.getElementById('knapp-byt-namn').disabled = !!aktiv().las;
    renderSnabbspakar();
  }

  function renderSnabbspakar() {
    var s = aktiv(), ind = s.indata, e = document.getElementById('snabbspakar');
    var lastLage = !!s.las;
    var bd = Modell.basDrivare();
    var hyraDelta = (ind.drivare.hyra_bostader[2028] - bd.hyra_bostader[2028]);
    // Volymen är bara meningsfull för år som investeringsspecen inte täcker.
    var volymAr = BAS_SISTA + 1;
    ALLA_AR.forEach(function (y) { if (y <= BAS_SISTA) return; });
    var uhInv = ind.ovrig_volym[volymAr] || 0;

    e.innerHTML =
      '<div class="spak"><div class="spak-rad"><span>Ränteuppgång</span><b>' +
        (ind.ranta.uppgang >= 0 ? '+' : '') + fmt(ind.ranta.uppgang * 100, 2) + ' pp</b></div>' +
        '<input type="range" id="sp-ranta" min="-1" max="3" step="0.25" value="' + inmat(ind.ranta.uppgang * 100, 2) + '"' +
        (lastLage ? ' disabled' : '') + '></div>' +

      '<div class="spak"><div class="spak-rad"><span>Genomslag</span></div>' +
        '<div class="segment" id="sp-genomslag" style="width:100%">' +
        [['rorlig', 'Rörlig'], ['bindning', 'Bindning'], ['direkt', 'Direkt']].map(function (g) {
          return '<button data-g="' + g[0] + '" style="flex:1" aria-pressed="' +
            (ind.ranta.genomslag === g[0]) + '"' + (lastLage ? ' disabled' : '') + '>' + g[1] + '</button>';
        }).join('') + '</div></div>' +

      '<div class="spak"><div class="spak-rad"><span>Hyreshöjning, avvikelse</span><b>' +
        (hyraDelta >= 0 ? '+' : '') + fmt(hyraDelta * 100, 2) + ' pp</b></div>' +
        '<input type="range" id="sp-hyra" min="-2" max="2" step="0.25" value="' + inmat(hyraDelta * 100, 2) + '"' +
        (lastLage ? ' disabled' : '') + '></div>' +

      '<div class=\"spak\"><div class=\"spak-rad\"><span>Volym efter ' + BAS_SISTA + '</span><b>' +
        fmt(uhInv / 1000, 0) + ' mnkr/år</b></div>' +
        '<input type="range" id="sp-uh" min="400" max="1100" step="25" value="' + Math.round(uhInv / 1000) + '"' +
        (lastLage ? ' disabled' : '') + '></div>' +

      (lastLage ? '<div class="notis" style="margin-top:4px">' + (s.syntetisk
        ? 'Kombinerat är härlett ur delarna. Ändra i respektive del, eller <b>Duplicera</b> för att få ett eget scenario.'
        : 'Basplanen är låst. <b>Duplicera</b> den för att ändra.') + '</div>' : '');

    if (lastLage) return;
    var fran = 2027;
    e.querySelector('#sp-ranta').oninput = function () {
      andra(function (i) { i.ranta.uppgang = num(this.value) / 100; if (!i.ranta.uppgang_fran) i.ranta.uppgang_fran = fran; }.bind(this));
    };
    e.querySelectorAll('#sp-genomslag button').forEach(function (b) {
      b.onclick = function () { andra(function (i) { i.ranta.genomslag = b.dataset.g; }); };
    });
    e.querySelector('#sp-hyra').oninput = function () {
      var d = num(this.value) / 100;
      andra(function (i) {
        AR.forEach(function (y) { if (y >= fran) i.drivare.hyra_bostader[y] = bd.hyra_bostader[y] + d; });
      });
    };
    e.querySelector('#sp-uh').oninput = function () {
      var v = num(this.value) * 1000;
      andra(function (i) { ALLA_AR.forEach(function (y) { if (y > BAS_SISTA) i.ovrig_volym[y] = v; }); });
    };
  }

  // Ändrar aktivt scenario. Duplicerar basplanen automatiskt om den är låst.
  function andra(f) {
    var s = aktiv();
    if (s.las) return;
    f(s.indata);
    rensaCache(s.id);
    render();
  }

  // ------------------------------------------------------------ kpi
  function renderKpi() {
    var r = resultat(S.aktivId), j = resultat(S.jamforId), y = S.ar;
    var samma = S.aktivId === S.jamforId;
    var kort = [
      { rub: 'Resultat efter fin. poster', v: r.rad.resultat_ef[y], j: j.rad.resultat_ef[y],
        serie: r.rad.resultat_ef, bra: 1 },
      { rub: 'Räntekostnad', v: r.rad.rantekostnader[y], j: j.rad.rantekostnader[y],
        serie: r.rad.rantekostnader, bra: 1 },
      { rub: 'Avskrivningar', v: r.rad.avskrivningar[y], j: j.rad.avskrivningar[y],
        serie: r.rad.avskrivningar, bra: 1 },
      { rub: 'Låneskuld vid årets slut', v: r.skuld[y].ut, j: j.skuld[y].ut,
        serie: seriaAv(r.skuld, 'ut'), bra: -1 },
      { rub: 'Investeringsvolym', v: r.invest[y].total, j: j.invest[y].total,
        serie: seriaAv(r.invest, 'total'), bra: -1 }
    ];
    document.getElementById('kpi').innerHTML = kort.map(function (k, i) {
      var d = k.v - k.j;
      var kl = samma || Math.abs(d) < 25 ? 'noll' : ((d * k.bra) > 0 ? 'upp' : 'ned');
      return '<div class="kpi"><div class="rub">' + k.rub + '</div>' +
        '<div class="varde tal">' + talD(k.v) + '<span class="enh">' + enhetsnamn() + '</span></div>' +
        '<div class="fot"><span class="diff ' + kl + '">' +
          (samma ? '&nbsp;' : delta(d) + ' mot ' + esc(hamta(S.jamforId).namn)) + '</span>' +
        '<span class="mini" id="mini' + i + '"></span></div></div>';
    }).join('');
    kort.forEach(function (k, i) {
      Diagram.minidiagram(document.getElementById('mini' + i), k.serie, AR, farg(S.aktivId));
    });
  }

  function seriaAv(objekt, falt) {
    var ut = {};
    AR.forEach(function (y) { ut[y] = objekt[y] ? objekt[y][falt] : null; });
    return ut;
  }

  // ------------------------------------------------------------ flikar
  var FLIKAR = [
    ['oversikt', 'Översikt'], ['resultat', 'Resultaträkning'], ['investeringar', 'Investeringar'],
    ['ranta', 'Ränta & skuld'], ['antaganden', 'Antaganden'], ['jamfor', 'Jämför scenarier']
  ];
  function renderFlikar() {
    var e = document.getElementById('flikar'), andrade = flikarMedAndring();
    e.innerHTML = FLIKAR.map(function (f) {
      return '<button role="tab" data-f="' + f[0] + '" aria-selected="' + (S.flik === f[0]) + '"' +
        (andrade[f[0]] ? ' title="Scenariot har justeringar här"' : '') + '>' + f[1] +
        (andrade[f[0]] ? '<span class="flikprick"></span>' : '') + '</button>';
    }).join('');
    e.querySelectorAll('button').forEach(function (b) {
      b.onclick = function () { S.flik = b.dataset.f; render(); };
    });
  }

  function kort(rubrik, hjalp, kropp, verktyg) {
    return '<section class="kort"><header><div><h3>' + rubrik + '</h3></div>' +
      (verktyg ? '<div class="verktyg">' + verktyg + '</div>' : '') + '</header>' +
      (hjalp ? '<p class="hjalp">' + hjalp + '</p>' : '') + kropp + '</section>';
  }

  function teckenforklaring(poster) {
    return '<div class="teckenforklaring">' + poster.map(function (p) {
      return '<span' + (p.titel ? ' class="harforklaring" title="' + esc(p.titel) + '"' : '') + '>' +
        '<i style="background:' + p.farg + '"></i>' + esc(p.namn) + '</span>';
    }).join('') + '</div>';
  }

  function renderFlik() {
    var e = document.getElementById('flikinnehall');
    ({ oversikt: flikOversikt, resultat: flikResultat, investeringar: flikInvesteringar,
       ranta: flikRanta, antaganden: flikAntaganden, jamfor: flikJamfor }[S.flik] || flikOversikt)(e);
  }

  // ============================================================ ÖVERSIKT
  function flikOversikt(e) {
    var r = resultat(S.aktivId), j = resultat(S.jamforId);
    var samma = S.aktivId === S.jamforId;
    var an = aktiv().namn, jn = hamta(S.jamforId).namn;

    var html = '';
    if (ARKIV.length) {
      html += '<div class="notis varning"><div><b>Horisonten har flyttats fram till ' +
        AR[0] + '–' + AR[AR.length - 1] + '.</b> ' +
        (ARKIV.length === 1 ? 'Året ' + ARKIV[0] + ' har passerat och ligger i arkivet'
          : 'Åren ' + ARKIV[0] + '–' + ARKIV[ARKIV.length - 1] + ' har passerat och ligger i arkivet') +
        ' — de räknas fortfarande med i skuldbanan men ligger utanför planeringsfönstret. ' +
        'Arkiverade år innehåller fortfarande planvärden, inte utfall. Kör ' +
        '<b>verktyg\\extrahera_underlag.py</b> mot en uppdaterad arbetsbok för att ersätta dem med verkligt utfall.</div></div>';
    }
    if (aktiv().beskrivning || S.aktivId !== 'bas') {
      html += '<div class="notis info"><div><b>' + esc(an) + '.</b> ' +
        (aktiv().beskrivning ? esc(aktiv().beskrivning) + ' ' : '') +
        (S.aktivId === 'bas' || aktiv().syntetisk ? '' : esc(andringstext(aktiv().indata))) + '</div></div>';
    }
    if (aktiv().syntetisk && aktiv().konflikter.length) {
      var kf = aktiv().konflikter;
      html += '<div class="notis varning"><div><b>' + kf.length +
        (kf.length === 1 ? ' fält ändras' : ' fält ändras') + ' av flera delar.</b> Den del som ligger sist vinner. ' +
        kf.slice(0, 4).map(function (k) {
          return esc(faltnamn(k.falt)) + ' (' + esc(k.nya) + ' före ' + esc(k.forra) + ')';
        }).join(', ') + (kf.length > 4 ? ' med flera' : '') + '.</div></div>';
    }
    if (aktiv().syntetisk) html += delarKort(r);

    // Serier: när ett kombinerat scenario är valt ritas varje del för sig
    // bredvid summan, så att man ser både helheten och varje dels egen bana.
    var serier = [];
    if (aktiv().syntetisk) {
      serier.push({ namn: 'Basplan', id: 'bas', streckad: true });
      aktiv().delar.forEach(function (d) { serier.push({ namn: d.namn, id: d.id, tunn: true }); });
      serier.push({ namn: 'Kombinerat', id: KOMB_ID, tjock: true });
    } else {
      serier.push({ namn: an, id: S.aktivId });
      if (!samma) serier.push({ namn: jn, id: S.jamforId, streckad: true });
    }
    function seriePost(f) {
      return serier.map(function (s) {
        var rr = resultat(s.id), v = {};
        AR.forEach(function (y) { v[y] = f(rr, y); });
        return { namn: s.namn, varden: v, farg: farg(s.id), streckad: s.streckad };
      });
    }
    function legend() {
      return teckenforklaring(serier.map(function (s) {
        var fk = scenarioForklaring((hamta(s.id) || {}).indata || {});
        return { namn: s.namn, farg: farg(s.id),
                 titel: fk.length ? fk.map(function (p) {
                   return p.rubrik + ': ' + p.text.replace(/<[^>]+>/g, '');
                 }).join('\n') : (s.id === 'bas' ? 'Styrelsebudgeten, oförändrad.' : '') };
      }));
    }

    html += kort('Resultat efter finansiella poster',
      aktiv().syntetisk
        ? 'Varje del ritas för sig ovanpå basplanen, och den tjockare linjen är alla delar tillsammans. Håll muspekaren över diagrammet för värden, eller över namnen under för hur varje del räknas.'
        : 'Hela planeringshorisonten. Åren till och med ' + BAS_SISTA +
          ' bygger på styrelsebudgeten med plan; därefter framskrivning.',
      '<div class="diagram" id="d-resultat"></div>' + legend());

    if (!samma) {
      var poster = Modell.brygga(j, r, S.ar);
      var netto = r.rad.resultat_ef[S.ar] - j.rad.resultat_ef[S.ar];
      var kropp = poster.length
        ? '<div class="brygghuvud"><span>' + esc(jn) + '</span><b class="tal">' + talD(j.rad.resultat_ef[S.ar]) + '</b>' +
            '<span class="pil">→</span><span>' + esc(an) + '</span><b class="tal">' + talD(r.rad.resultat_ef[S.ar]) + '</b>' +
            '<span class="netto ' + (netto >= 0 ? 'upp' : 'ned') + '">' + delta(netto) + ' ' + enhetsnamn() + '</span></div>' +
          '<div class="diagram" id="d-brygga"></div>'
        : '<div class="tomtext">' + esc(an) + ' ger ingen märkbar effekt ' + S.ar +
          '. Välj ett senare år i listen högst upp.</div>';
      html += kort('Vad förklarar skillnaden ' + S.ar + '?',
        'Varje stapel är en effekt på resultatet. Blått lyfter, rött sänker. Summan längst ner är hela skillnaden mot ' + esc(jn) + '.',
        kropp);
    }

    html += '<div class="rutnat-2">' +
      kort('Låneskuld vid årets slut', 'Skulden rullas fram ur kassaflödet: investeringar minus kassaflöde från driften.',
        '<div class="diagram" id="d-skuld"></div>' + legend()) +
      kort('Räntekostnadens delar', 'Grundränta, effekt av antagen ränteuppgång och borgensavgift till kommunen.',
        '<div class="diagram" id="d-ranta"></div>' +
        teckenforklaring([{ namn: 'Grundränta', farg: 'var(--serie-1)' },
                          { namn: 'Ränteuppgång', farg: 'var(--serie-2)' },
                          { namn: 'Borgensavgift', farg: 'var(--serie-3)' }])) +
      '</div>';

    html += forklaringKort(aktiv().syntetisk ? aktiv().delar
      : (S.aktivId === 'bas' ? [] : [aktiv()]));
    html += kort('Nyckeltal', '', nyckeltalTabell(r, j, samma));
    e.innerHTML = html;
    if (aktiv().syntetisk) ritaDelar(r);

    Diagram.linje(document.getElementById('d-resultat'),
      { ar: AR, serier: mnkr(seriePost(function (rr, y) { return rr.rad.resultat_ef[y]; })),
        hojd: aktiv().syntetisk ? 330 : 300, enhet: enhetsnamn(),
        formatera: function (v) { return fmt(v, 0); },
        formateraTip: function (v) { return fmt(v, S.enhet === 'mnkr' ? 1 : 0); } });

    if (!samma && document.getElementById('d-brygga')) {
      var brP = Modell.brygga(j, r, S.ar);
      var dec = S.enhet === 'mnkr' ? 1 : 0;
      Diagram.brygga(document.getElementById('d-brygga'), {
        visaStart: false,
        slut: { namn: 'Summa skillnad', varde: skala(r.rad.resultat_ef[S.ar] - j.rad.resultat_ef[S.ar]) },
        poster: brP.map(function (p) { return { etikett: p.etikett, varde: skala(p.varde) }; }),
        formatera: function (v) { return fmt(v, 0); },
        formateraVarde: function (v) { return fmt(v, dec); },
        formateraTip: function (v) { return fmt(v, dec) + ' ' + enhetsnamn(); }
      });
    }

    Diagram.linje(document.getElementById('d-skuld'),
      { ar: AR, serier: mnkr(seriePost(function (rr, y) { return rr.skuld[y].ut; })),
        hojd: 230, enhet: enhetsnamn(), nollbas: false,
        formatera: function (v) { return fmt(v, 0); } });

    Diagram.staplar(document.getElementById('d-ranta'), {
      ar: AR, hojd: 230, enhet: enhetsnamn(), formatera: function (v) { return fmt(v, 0); },
      serier: mnkr([
        { namn: 'Grundränta', varden: negera(seriaAv(r.skuld, 'grundranta')), farg: 'var(--serie-1)' },
        { namn: 'Ränteuppgång', varden: negera(seriaAv(r.skuld, 'ranterisk')), farg: 'var(--serie-2)' },
        { namn: 'Borgensavgift', varden: negera(seriaAv(r.skuld, 'borgensavgift')), farg: 'var(--serie-3)' }
      ])
    });
  }

  // Läsbart namn på ett indatafält, för konfliktmeddelandet.
  var FALTNAMN = {
    'ranta.uppgang': 'ränteuppgång', 'ranta.uppgang_fran': 'startår för ränteuppgång',
    'ranta.genomslag': 'genomslagsmodell', 'ranta.borgensavgift': 'borgensavgift',
    'satser.underhall': 'avskrivningssats underhåll', 'skuld_ib': 'ingående låneskuld'
  };
  function faltnamn(stig) {
    if (FALTNAMN[stig]) return FALTNAMN[stig];
    var d = stig.split('.');
    if (d[0] === 'drivare') return 'hyra/kostnad ' + (Modell.DRIVARE.filter(function (x) {
      return x.nyckel === d[1]; })[0] || { etikett: d[1] }).etikett.toLowerCase() + ' ' + (d[2] || '');
    if (d[0] === 'ovrig_volym') return 'investeringsvolym ' + (d[1] || '');
    if (d[0] === 'projekt') return 'projekt';
    if (d[0] === 'ranta') return 'ränta ' + d.slice(1).join(' ');
    return stig;
  }

  // Kort sammanfattning av vad ett scenario ändrar mot basplanen, så att
  // oavsiktliga ändringar syns i stället för att gömma sig i antagandena.
  function andringsGrupp(stig) {
    var d = stig.split('.');
    if (d[0] === 'drivare') {
      var dr = Modell.DRIVARE.filter(function (x) { return x.nyckel === d[1]; })[0];
      return dr ? dr.etikett.toLowerCase() : d[1];
    }
    if (d[0] === 'ranta') {
      if (d[1] === 'uppgang' || d[1] === 'uppgang_fran' || d[1] === 'genomslag') return 'ränteuppgång';
      if (d[1] === 'bana') return 'räntebana';
      if (d[1] === 'bindningstid' || d[1] === 'rorlig') return 'räntebindning';
      return 'borgensavgift';
    }
    if (d[0] === 'ovrig_volym') return 'investeringsvolym';
    if (d[0] === 'blockjustering') {
      var b = null;
      Modell.BLOCK.forEach(function (x) { if (x.nyckel === d[1]) b = x; });
      return 'prognos: ' + (b ? b.etikett.toLowerCase() : d[1]);
    }
    if (d[0] === 'prognoskalla') return 'inläst prognos';
    if (d[0] === 'satser') return 'avskrivningssatser';
    if (d[0] === 'koncernbidrag') return 'koncernbidrag';
    if (d[0] === 'forsaljning') return 'försäljningar';
    if (d[0] === 'ovrigt_kassaflode' || d[0] === 'skuld_ib') return 'kassaflöde och skuld';
    return d[0];
  }

  function andringar(indata) {
    var d = Modell.diffIndata(BAS_INDATA, indata);
    var grupper = [], sedda = {};
    d.falt.forEach(function (f) {
      var g = andringsGrupp(f.stig.join('.'));
      if (!sedda[g]) { sedda[g] = true; grupper.push(g); }
    });
    var np = d.projekt.lagg.length + d.projekt.andra.length + d.projekt.taBort.length;
    if (np) grupper.push(np === 1 ? '1 projekt' : np + ' projekt');
    return { antal: Modell.antalAndringar(d), grupper: grupper };
  }

  function andringstext(indata) {
    var a = andringar(indata);
    if (!a.antal) return 'Inga ändringar mot basplanen.';
    var g = a.grupper.slice(0, 4).join(', ') + (a.grupper.length > 4 ? ' med flera' : '');
    return 'Ändrar ' + g + '.';
  }

  // ------------------------------------------------------------ hur räknas scenariot
  // Genererar en mekanisk förklaring ur indata, så att det inte råder tvivel om
  // vad "minus en procentenhet" faktiskt betyder i modellen.
  function scenarioForklaring(ind) {
    var bd = Modell.basDrivare(), ut = [];
    var sista = ALLA_AR[ALLA_AR.length - 1];

    Modell.DRIVARE.forEach(function (d) {
      var ar = ALLA_AR.filter(function (y) {
        return Math.abs(ind.drivare[d.nyckel][y] - bd[d.nyckel][y]) > 1e-9;
      });
      if (!ar.length) return;
      var d0 = ind.drivare[d.nyckel][ar[0]] - bd[d.nyckel][ar[0]];
      var samma = ar.every(function (y) {
        return Math.abs((ind.drivare[d.nyckel][y] - bd[d.nyckel][y]) - d0) < 1e-9;
      });
      var tillSlutet = ar[ar.length - 1] === sista && ar.length === sista - ar[0] + 1;
      var kvot = 1;
      ALLA_AR.forEach(function (y) {
        if (y < ar[0]) return;
        kvot *= (1 + ind.drivare[d.nyckel][y]) / (1 + bd[d.nyckel][y]);
      });
      var exempel = ar.slice(0, 3).map(function (y) {
        return y + ' ' + fmt(bd[d.nyckel][y] * 100, 1) + ' → ' + fmt(ind.drivare[d.nyckel][y] * 100, 1) + ' %';
      }).join(' · ');
      var traffar = Object.keys(Modell.RAD_DRIVARE)
        .filter(function (k) { return Modell.RAD_DRIVARE[k] === d.nyckel; })
        .map(function (k) { return Modell.ETIKETT[k] || k; });
      if (d.nyckel === 'loneokning') traffar = ['Personalkostnader i fastighetskostnader', 'Personal i central administration'];

      ut.push({
        rubrik: d.etikett,
        text: '<b>' + esc(d.etikett) + '</b> ' + (d0 > 0 ? 'höjs' : 'sänks') + ' ' +
          procentenheter(Math.abs(d0)) + ' ' +
          (samma && tillSlutet ? '<b>varje år från ' + ar[0] + ' och framåt</b>'
            : 'åren ' + ar[0] + '–' + ar[ar.length - 1]) +
          ' — inte som en engångseffekt. ' + exempel + (ar.length > 3 ? ' · osv' : '') + '.',
        effekt: 'Förändringen ackumuleras år för år. Nivån ligger <b>' +
          (kvot >= 1 ? '+' : '') + fmt((kvot - 1) * 100, 1) + ' %</b> mot basplanen ' + sista + '.',
        verkar: traffar.length ? 'Verkar på: ' + traffar.join(' · ') + '.' : ''
      });
    });

    // inläst prognos
    var bj = ind.blockjustering || {};
    Object.keys(bj).forEach(function (blk) {
      var b = null;
      Modell.BLOCK.forEach(function (x) { if (x.nyckel === blk) b = x; });
      var ar = ALLA_AR.filter(function (y) { return bj[blk][y] && Math.abs(bj[blk][y] - 1) > 1e-9; });
      if (!b || !ar.length) return;
      var kv = bj[blk][ar[0]];
      var barFram = ar.length > 1;
      ut.push({
        rubrik: b.etikett,
        text: '<b>' + esc(b.etikett) + '</b> sätts enligt prognosen för ' + ar[0] + ': ' +
          (kv >= 1 ? '+' : '') + fmt((kv - 1) * 100, 1) + ' % mot basplanen.',
        effekt: barFram
          ? 'Nivån bärs fram — samma avvikelse gäller till och med ' + ar[ar.length - 1] + '.'
          : 'Engångseffekt — bara ' + ar[0] + ' ändras, åren efter ligger kvar på basplanen.',
        verkar: b.rader
          ? 'Fördelas på blockets rader efter deras inbördes proportioner.'
          : 'Justerar det beräknade beloppet.'
      });
    });

    // ränta
    if (Math.abs(ind.ranta.uppgang - BAS_INDATA.ranta.uppgang) > 1e-9 ||
        ind.ranta.genomslag !== BAS_INDATA.ranta.genomslag) {
      var lagen = {
        rorlig: 'Uppgången träffar bara den rörligt satta delen av skulden.',
        bindning: 'Uppgången slår igenom successivt i takt med att räntebindningen löper ut.',
        direkt: 'Uppgången läggs på hela skulden direkt.'
      };
      var g = ALLA_AR.filter(function (y) { return y >= ind.ranta.uppgang_fran; })
        .slice(0, 4).map(function (y) {
          return y + ' ' + fmt(Modell.genomslag(ind, y) * 100, 0) + ' %';
        }).join(' · ');
      ut.push({
        rubrik: 'Ränteuppgång',
        text: '<b>Marknadsräntan</b> ' + (ind.ranta.uppgang >= 0 ? 'stiger' : 'faller') + ' ' +
          procentenheter(Math.abs(ind.ranta.uppgang)) + ' <b>från ' +
          ind.ranta.uppgang_fran + '</b> och ligger kvar på den nivån — det är en nivåförskjutning, ' +
          'inte en höjning varje år.',
        effekt: (lagen[ind.ranta.genomslag] || '') +
          ' Andel av skulden som fått den nya räntan: ' + g + '.',
        verkar: 'Verkar på räntekostnaden, som i sin tur påverkar resultatet och därmed låneskulden.'
      });
    }

    // underhållsinvestering
    var uhAr = ALLA_AR.filter(function (y) {
      return Math.abs(ind.ovrig_volym[y] - BAS_INDATA.ovrig_volym[y]) > 0.5;
    });
    if (uhAr.length) {
      ut.push({
        rubrik: 'Underhållsinvestering',
        text: '<b>Underhålls- och ombyggnadsvolymen</b> ändras från ' +
          tal(BAS_INDATA.ovrig_volym[uhAr[0]]) + ' till <b>' + tal(ind.ovrig_volym[uhAr[0]]) +
          ' ' + enhetsnamn() + '</b> per år från ' + uhAr[0] + '.',
        effekt: 'Utgiften ökar låneskulden direkt, och varje årsvolym lägger till ett nytt ' +
          'avskrivningslager på ' + pct(ind.satser.underhall, 1) + ' med halvårskonvention.',
        verkar: ''
      });
    }

    // projekt
    var pd = Modell.diffIndata(BAS_INDATA, ind).projekt;
    pd.lagg.concat(pd.andra.map(function (a) {
      var p = null; ind.projekt.forEach(function (x) { if (x.id === a.id) p = x; }); return p;
    })).forEach(function (p) {
      if (!p) return;
      var bp = null;
      BAS_INDATA.projekt.forEach(function (x) { if (x.id === p.id) bp = x; });
      if (bp && bp.aktiv !== p.aktiv && !p.aktiv) {
        ut.push({ rubrik: p.namn, text: '<b>' + esc(p.namn) + '</b> är avstängt och räknas inte med.',
          effekt: 'Både utgiften och den avskrivning projektet skulle gett faller bort.', verkar: '' });
        return;
      }
      var ar2 = ALLA_AR.filter(function (y) { return Math.abs(p.spend[y] || 0) > 0.5; });
      var sum = 0; ALLA_AR.forEach(function (y) { sum += p.spend[y] || 0; });
      ut.push({
        rubrik: p.namn,
        text: '<b>' + esc(p.namn) + '</b>: utgift <b>' + tal(sum) + ' ' + enhetsnamn() + '</b>' +
          (ar2.length ? ' fördelad ' + ar2[0] + '–' + ar2[ar2.length - 1] : '') +
          (p.aktiveringsar ? ', aktiveras ' + p.aktiveringsar : ', ingen aktivering') + '.',
        effekt: (p.aktiverbart && p.aktiveringsar
          ? 'Avskrivning ' + tal(p.aktiverbart * p.sats) + ' ' + enhetsnamn() + ' per år från ' +
            p.aktiveringsar + ' (halv effekt aktiveringsåret). '
          : 'Ger ingen avskrivning i modellen. ') +
          (p.hyra && p.hyra.arshyra
            ? 'Hyresintäkt ' + tal(p.hyra.arshyra) + ' och driftkostnad ' + tal(p.hyra.driftkostnad) +
              ' ' + enhetsnamn() + ' per år när projektet står färdigt.'
            : 'Ingen hyresintäkt inlagd.'),
        verkar: 'Utgiften ökar låneskulden och därmed räntekostnaden.'
      });
    });

    return ut;
  }

  function forklaringKort(scenarier) {
    var block = scenarier.map(function (s) {
      var f = scenarioForklaring(s.indata);
      if (!f.length) return '';
      return '<div class="fork-block">' +
        (scenarier.length > 1
          ? '<div class="fork-namn"><span class="prick-liten" style="background:' + farg(s.id) + '"></span>' +
            esc(s.namn) + '</div>' : '') +
        f.map(function (p) {
          return '<div class="fork-post"><div>' + p.text + '</div>' +
            '<div class="fork-effekt">' + p.effekt + '</div>' +
            (p.verkar ? '<div class="fork-verkar">' + esc(p.verkar) + '</div>' : '') + '</div>';
        }).join('') + '</div>';
    }).join('');
    if (!block.replace(/\s/g, '')) return '';
    return kort('Så räknas scenariot',
      'Genererat ur scenariots faktiska antaganden, inte ur beskrivningen.', block);
  }

  // ------------------------------------------------------------ effekt per del
  // Stegvis effekt: varje del läggs på ovanpå de föregående, så att summan blir
  // exakt hela skillnaden. Ensam effekt: delen mot basplanen för sig.
  function delarKort(r) {
    var delar = aktiv().delar, y = S.ar;
    var basNiva = resultat('bas').rad.resultat_ef[y];
    var forra = basNiva, steg = [];
    delar.forEach(function (s, i) {
      var niva = nivaFor(delar.slice(0, i + 1), y);
      var ensam = nivaFor([s], y) - basNiva;
      steg.push({ namn: s.namn, id: s.id, stegvis: niva - forra, ensam: ensam, niva: niva });
      forra = niva;
    });
    var totalt = forra - basNiva;
    var summaEnsam = steg.reduce(function (a, x) { return a + x.ensam; }, 0);
    var samspel = totalt - summaEnsam;

    var tabell = '<div class="tabellsvep"><table class="data" id="delar-tabell"><thead><tr>' +
      '<th class="etikett">Del</th><th>Stegvis effekt</th><th>Effekt ensam</th><th>Nivå efter</th>' +
      '<th class="vansterstall">Ändrar</th></tr></thead><tbody>' +
      steg.map(function (x) {
        var a = andringar(hamta(x.id).indata);
        return '<tr><td class="etikett"><span class="prick-liten" style="background:' + farg(x.id) + '"></span>' +
          esc(x.namn) + '</td>' +
          '<td class="' + (x.stegvis >= 0 ? 'diff-plus' : 'diff-minus') + '">' + delta(x.stegvis) + '</td>' +
          '<td class="' + (x.ensam >= 0 ? 'diff-plus' : 'diff-minus') + '">' + delta(x.ensam) + '</td>' +
          '<td>' + talD(x.niva) + '</td>' +
          '<td class="vansterstall svag">' + esc(a.grupper.slice(0, 3).join(', ') +
            (a.grupper.length > 3 ? ' m.fl.' : '')) + '</td></tr>';
      }).join('') +
      (Math.abs(samspel) > 50
        ? '<tr><td class="etikett">Samspel mellan delarna</td><td class="' +
          (samspel >= 0 ? 'diff-plus' : 'diff-minus') + '">' + delta(samspel) +
          '</td><td>–</td><td>–</td><td class="vansterstall svag">delarna möts</td></tr>' : '') +
      '<tr class="niva-resultat"><td class="etikett">Kombinerat mot basplanen</td>' +
      '<td class="' + (totalt >= 0 ? 'diff-plus' : 'diff-minus') + '">' + delta(totalt) + '</td>' +
      '<td>' + delta(summaEnsam) + '</td><td>' + talD(forra) + '</td><td></td></tr>' +
      '</tbody></table></div>';

    var hjalp = 'Varje del läggs på i tur och ordning. <b>Stegvis effekt</b> är vad delen tillför ' +
      'givet de som ligger ovanför, och de summerar till hela skillnaden. <b>Effekt ensam</b> är delen mot ' +
      'basplanen för sig, oberoende av ordningen. ' +
      (Math.abs(samspel) > 50
        ? 'Skillnaden på ' + delta(samspel) + ' ' + enhetsnamn() + ' är samspelet: ' +
          (aktiv().konflikter.length
            ? 'dels att delarna förstärker eller dämpar varandra, dels att flera delar ändrar samma fält — se varningen ovan.'
            : 'delarna förstärker eller dämpar varandra när de möts.')
        : 'Delarna påverkar varandra knappt.');

    return kort('Effekt av varje del ' + y, hjalp,
      '<div class="diagram" id="d-delar"></div>' + tabell);
  }

  function ritaDelar(r) {
    var delar = aktiv().delar, y = S.ar;
    var basNiva = resultat('bas').rad.resultat_ef[y], forra = basNiva, poster = [];
    delar.forEach(function (s, i) {
      var niva = nivaFor(delar.slice(0, i + 1), y);
      poster.push({ etikett: s.namn, varde: skala(niva - forra) });
      forra = niva;
    });
    var dec = S.enhet === 'mnkr' ? 1 : 0;
    Diagram.brygga(document.getElementById('d-delar'), {
      visaStart: false,
      slut: { namn: 'Kombinerat mot basplanen', varde: skala(forra - basNiva) },
      poster: poster,
      formatera: function (v) { return fmt(v, 0); },
      formateraVarde: function (v) { return fmt(v, dec); },
      formateraTip: function (v) { return fmt(v, dec) + ' ' + enhetsnamn(); }
    });
  }

  function negera(s) { var u = {}; AR.forEach(function (y) { u[y] = -(s[y] || 0); }); return u; }
  function mnkr(serier) {
    return serier.map(function (s) {
      var v = {};
      AR.forEach(function (y) { v[y] = (s.varden[y] === null || s.varden[y] === undefined) ? null : skala(s.varden[y]); });
      return { namn: s.namn, varden: v, farg: s.farg, streckad: s.streckad };
    });
  }

  // Definitionerna speglar hur modellen faktiskt räknar (modell.js, steg 5–6).
  // Ändras beräkningen ska texten här ändras med den.
  var NYCKELTAL_FORK = {
    'Resultat efter finansnetto':
      ['Planens bottenrad, och det tal scenarierna jämförs på. Nettoomsättningen minus ' +
       'fastighetskostnader, underhåll, fastighetsskatt och avskrivningar, minus central ' +
       'administration, plus resultat från intresseföretag och omsättningstillgångar, minus ' +
       'räntekostnader. Bolagsskatt ligger utanför.',
       'Rörelseresultat + finansnetto'],
    'Driftnetto':
      ['Nettoomsättningen minus alla fastighetsrelaterade kostnader: drift, underhåll och ' +
       'fastighetsskatt. Ligger före central administration, avskrivningar och räntor, så talet ' +
       'kan inte jämföras rakt av med räntekostnaden.',
       'Nettoomsättning − fastighetskostnader − underhåll − fastighetsskatt'],
    'Driftnettomarginal':
      ['Hur stor andel av hyresintäkten som är kvar när fastighetsdriften är betald. Faller ' +
       'marginalen fortare än hyran stiger är det kostnadsdrivarna, inte volymen, som läcker.',
       'Driftnetto ÷ nettoomsättning'],
    'Räntetäckningsgrad':
      ['Resultatet före räntekostnader i förhållande till räntekostnaderna — alltså inklusive ' +
       'både central administration och avskrivningar. Under 1,00 räcker resultatet inte till ' +
       'räntan, och talet visas i rött.',
       '(Resultat efter finansnetto + räntekostnader) ÷ räntekostnader'],
    'Räntetäckningsgrad exkl. avskrivningar':
      ['Samma mått med avskrivningarna tillbakalagda, även avskrivningar på maskiner och ' +
       'inventarier. Det är den här varianten långivare oftast ser på, eftersom avskrivningar ' +
       'inte kostar pengar.',
       '(Resultat efter finansnetto + räntekostnader + avskrivningar) ÷ räntekostnader'],
    'Personalkostnader':
      ['Löner och sociala kostnader i både fastighetskostnaderna (ändamål 311 och 321) och den ' +
       'centrala administrationen. Administrationens del är ett antagande — 55 % av ändamål 619 ' +
       '— eftersom arbetsboken inte bryter ut den. Drivs av antagandet om löneökning.',
       'Ändamål 311 + 321 + 55 % av 619'],
    'Kassaflöde från driften':
      ['Resultatet efter finansnetto med avskrivningarna tillbakalagda: pengarna verksamheten ' +
       'genererar innan investeringar. Rörelsekapitalets förändring ingår inte.',
       'Resultat efter finansnetto + avskrivningar'],
    'Kassaflöde efter investeringar':
      ['Driftens kassaflöde minus årets hela investeringsvolym, nyproduktion såväl som underhåll ' +
       'och ombyggnad. Minus betyder att året inte är självfinansierat. Koncernbidrag och ' +
       'försäljningar ligger utanför det här talet och tas in först när låneskulden rullas fram.',
       'Kassaflöde från driften − investeringsvolym'],
    'Effektiv genomsnittsränta':
      ['Räntebanans nivå plus antagen ränteuppgång, med det genomslag bindningstiden ger det året. ' +
       'Borgensavgiften till kommunen ligger utanför och redovisas för sig i Räntekostnadens delar.',
       'Räntebana + ränteuppgång × genomslag']
  };

  function nyckeltalTabell(r, j, samma) {
    var rader = [
      ['Resultat efter finansnetto', function (x, y) {
        var v = x.rad.resultat_ef[y];
        return '<span class="' + (v < 0 ? 'ned' : '') + '">' + tal(v) + '</span>';
      }, 'nyckelrad'],
      ['Driftnetto', function (x, y) { return tal(x.nyckeltal[y].driftnetto); }],
      ['Driftnettomarginal', function (x, y) { return pct(x.nyckeltal[y].driftnetto_marginal); }],
      ['Räntetäckningsgrad', function (x, y) {
        var v = x.nyckeltal[y].rantetackning;
        return '<span class="' + (v < 1 ? 'ned' : '') + '">' + fmt(v, 2) + ' ggr</span>';
      }],
      ['Räntetäckningsgrad exkl. avskrivningar', function (x, y) {
        return fmt(x.nyckeltal[y].rantetackning_exkl_avskr, 2) + ' ggr';
      }],
      ['Personalkostnader', function (x, y) { return tal(x.nyckeltal[y].personalkostnad); }],
      ['Kassaflöde från driften', function (x, y) { return tal(x.skuld[y].kassaflode_drift); }],
      ['Kassaflöde efter investeringar', function (x, y) { return tal(x.nyckeltal[y].kassaflode_efter_invest); }],
      ['Effektiv genomsnittsränta', function (x, y) { return pct(x.skuld[y].effektiv_ranta, 2); }]
    ];
    function etikett(namn) {
      var f = NYCKELTAL_FORK[namn];
      if (!f) return esc(namn);
      return '<span tabindex="0" data-fork="' + esc(f[0]) + '" data-formel="' + esc(f[1]) +
        '" data-rubrik="' + esc(namn) + '">' + esc(namn) + '</span>';
    }
    return '<div class="tabellsvep"><table class="data"><thead><tr><th class="etikett">Nyckeltal</th>' +
      AR.map(function (y) {
        return '<th class="' + (y > BAS_SISTA ? 'prognoshuvud' : '') + (y === BAS_SISTA + 1 ? ' kant' : '') + '">' + y + '</th>';
      }).join('') + '</tr></thead><tbody>' +
      rader.map(function (rad) {
        return '<tr' + (rad[2] ? ' class="' + rad[2] + '"' : '') + '><td class="etikett">' + etikett(rad[0]) + '</td>' +
          AR.map(function (y) { return '<td' + (y === BAS_SISTA + 1 ? ' class="kant"' : '') + '>' + rad[1](r, y) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="hjalp" style="margin:10px 0 0">Håll pekaren över ett nyckeltal för att se hur det räknas. ' +
      (AR.some(function (y) { return y > BAS_SISTA; })
        ? 'Streckad linje markerar övergången till framskrivning bortom arbetsbokens plan.' : '') + '</p>';
  }

  // ============================================================ RESULTATRÄKNING
  // Radordningen delas av skärmtabellen och Excel-exporten så att de inte kan
  // glida isär. niva: delsumma | post | underpost | resultat.
  function rrRadlista(r) {
    var rader = [];
    function laggTill(nyckel, niva, foralder) {
      rader.push({ nyckel: nyckel, etikett: Modell.ETIKETT[nyckel] || nyckel,
                   niva: niva, foralder: foralder || null });
    }
    laggTill('nettoomsattning', 'delsumma');
    Modell.RR_STRUKTUR[0].barn.forEach(function (b) { laggTill(b, 'post', 'nettoomsattning'); });
    if (r.rad.nyprod_hyra[Modell.AR_SISTA] || r.rad.nyprod_hyra[S.ar]) laggTill('nyprod_hyra', 'post', 'nettoomsattning');
    laggTill('fastighetskostnader', 'delsumma');
    Modell.FK_KOMPONENTER.forEach(function (k) { laggTill(k.nyckel, 'post', 'fastighetskostnader'); });
    laggTill('driftkostnader', 'delsumma');
    Modell.RR_STRUKTUR[2].barn.forEach(function (b) { laggTill(b, 'post', 'driftkostnader'); });
    if (r.rad.nyprod_drift[Modell.AR_SISTA] || r.rad.nyprod_drift[S.ar]) laggTill('nyprod_drift', 'post', 'driftkostnader');
    laggTill('underhallskostnader', 'delsumma');
    Modell.RR_STRUKTUR[3].barn.forEach(function (b) { laggTill(b, 'post', 'underhallskostnader'); });
    laggTill('fastighetsskatt', 'delsumma');
    laggTill('avskrivningar', 'delsumma');
    laggTill('bruttoresultat', 'resultat');
    laggTill('administration', 'delsumma');
    Modell.RR_STRUKTUR[6].barn.forEach(function (b) {
      laggTill(b, 'post', 'administration');
      if (b === 'ovrig_adm') {
        Modell.ADM_KOMPONENTER.forEach(function (k) { laggTill(k.nyckel, 'underpost', 'ovrig_adm'); });
      }
    });
    laggTill('rorelseresultat', 'resultat');
    laggTill('rantekostnader', 'delsumma');
    laggTill('resultat_ef', 'resultat');
    return rader;
  }

  function flikResultat(e) {
    var r = resultat(S.aktivId), j = resultat(S.jamforId);
    var diffLage = S.rrLage === 'differens';
    var visa = diffLage ? null : (S.rrLage === 'bas' ? resultat('bas') : r);

    var verktyg = '<div class="segment" id="rr-lage">' +
      [['scenario', 'Scenario'], ['differens', 'Differens'], ['bas', 'Basplan']].map(function (l) {
        return '<button data-l="' + l[0] + '" aria-pressed="' + (S.rrLage === l[0]) + '">' + l[1] + '</button>';
      }).join('') + '</div>' +
      '<button class="knapp liten tyst" id="rr-allt">Fäll ut alla</button>' +
      '<button class="knapp liten" id="rr-kopiera">Kopiera</button>' +
      '<button class="knapp liten" id="rr-csv">CSV</button>';

    var rader = rrRadlista(r);

    // vilka rader har barn, och hur många
    var antalBarn = {}, foralderAv = {};
    rader.forEach(function (rd) {
      foralderAv[rd.nyckel] = rd.foralder;
      if (rd.foralder) antalBarn[rd.foralder] = (antalBarn[rd.foralder] || 0) + 1;
    });
    function utfalld(nyckel) { return !!S.utfallda[nyckel]; }
    function synlig(rd) {
      var f = rd.foralder;
      while (f) { if (!utfalld(f)) return false; f = foralderAv[f]; }
      return true;
    }

    function cell(nyckel, y) {
      if (!diffLage) return { text: tal(visa.rad[nyckel][y]), kl: '' };
      var d = r.rad[nyckel][y] - j.rad[nyckel][y];
      if (Math.abs(d) < 0.5) return { text: '–', kl: 'noll' };
      return { text: delta(d, 0), kl: d > 0 ? 'diff-plus' : 'diff-minus' };
    }

    var tabell = '<div class="tabellsvep"><table class="data" id="rr-tabell"><thead><tr>' +
      '<th class="etikett">Resultaträkning, ' + enhetsnamn() + '</th>' +
      AR.map(function (y) {
        return '<th class="' + (y > BAS_SISTA ? 'prognoshuvud' : '') + (y === BAS_SISTA + 1 ? ' kant' : '') + '">' + y + '</th>';
      }).join('') + '</tr></thead><tbody>' +
      rader.filter(synlig).map(function (rad) {
        var barn = antalBarn[rad.nyckel] || 0;
        var etikett = barn
          ? '<button class="fallknapp" data-fall="' + rad.nyckel + '" aria-expanded="' +
            utfalld(rad.nyckel) + '"><span class="chevron">▸</span>' + esc(rad.etikett) +
            '<span class="antalposter">' + barn + '</span></button>'
          : esc(rad.etikett);
        return '<tr class="niva-' + rad.niva + (barn ? ' fallbar' : '') + '">' +
          '<td class="etikett">' + etikett + '</td>' +
          AR.map(function (y) {
            var c = cell(rad.nyckel, y);
            return '<td class="' + c.kl + (y === BAS_SISTA + 1 ? ' kant' : '') + '">' + c.text + '</td>';
          }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';

    var framskrivet = AR.filter(function (y) { return y > BAS_SISTA; });
    var hjalp = (diffLage
      ? 'Skillnad mellan ' + esc(aktiv().namn) + ' och ' + esc(hamta(S.jamforId).namn) +
        '. Grönt förbättrar resultatet, rött försämrar.'
      : 'Alla belopp i ' + enhetsnamn() + '. Åren till och med ' + BAS_SISTA +
        ' är hämtade ur styrelsebudgeten' +
        (framskrivet.length ? '; ' + framskrivet[0] + '–' + framskrivet[framskrivet.length - 1] +
          ' är framskrivning' : '') + '.') +
      ' Klicka på en delsumma för att se posterna bakom. Kopiering och CSV tar med de rader som visas.';

    e.innerHTML = kort('Resultaträkning', hjalp, tabell, verktyg);

    e.querySelectorAll('#rr-lage button').forEach(function (b) {
      b.onclick = function () { S.rrLage = b.dataset.l; render(); };
    });
    e.querySelectorAll('[data-fall]').forEach(function (b) {
      b.onclick = function () {
        S.utfallda[b.dataset.fall] = !S.utfallda[b.dataset.fall];
        renderFlik();
        spara();
        var ny = document.querySelector('[data-fall="' + b.dataset.fall + '"]');
        if (ny) ny.focus();
      };
    });
    var alla = Object.keys(antalBarn);
    var allaUte = alla.every(function (k) { return S.utfallda[k]; });
    var ra = document.getElementById('rr-allt');
    ra.textContent = allaUte ? 'Fäll ihop alla' : 'Fäll ut alla';
    ra.onclick = function () {
      alla.forEach(function (k) { S.utfallda[k] = !allaUte; });
      renderFlik(); spara();
    };
    document.getElementById('rr-kopiera').onclick = function () { kopieraTabell('rr-tabell', '\t', this); };
    document.getElementById('rr-csv').onclick = function () { laddaNerCsv('rr-tabell', 'resultatrakning'); };
  }

  function tabellRader(id) {
    var t = document.getElementById(id), ut = [];
    t.querySelectorAll('tr').forEach(function (tr) {
      var rad = [];
      tr.querySelectorAll('th,td').forEach(function (c) {
        var i = c.querySelector('input');
        rad.push(i ? i.value : c.textContent.trim());
      });
      if (rad.length) ut.push(rad);
    });
    return ut;
  }
  function kopieraTabell(id, sep, knapp) {
    var txt = tabellRader(id).map(function (r) { return r.join(sep); }).join('\n');
    navigator.clipboard.writeText(txt).then(function () {
      var t = knapp.textContent; knapp.textContent = 'Kopierat';
      setTimeout(function () { knapp.textContent = t; }, 1400);
    });
  }
  function laddaNerCsv(id, namn) {
    var txt = tabellRader(id).map(function (r) {
      return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(';');
    }).join('\r\n');
    var b = new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = namn + ' ' + aktiv().namn.replace(/[^\wåäöÅÄÖ -]/g, '') + '.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  // ============================================================ INVESTERINGAR
  function flikInvesteringar(e) {
    var s = aktiv(), ind = s.indata, r = resultat(S.aktivId);
    var lastLage = !!s.las;
    var spec = Modell.underlag.investeringar.summa;

    var sistaSpecar = 0;
    ALLA_AR.forEach(function (y) { if (typeof spec[String(y)] === 'number') sistaSpecar = y; });

    var html = kort('Investeringsvolym per år',
      'Åren till och med ' + sistaSpecar + ' kommer rad för rad ur investeringsspecen. ' +
      'Därefter används en antagen volym, eftersom specen inte sträcker sig längre.',
      '<div class="diagram" id="d-invest"></div>' +
      teckenforklaring([{ namn: 'Underhåll och ombyggnad', farg: 'var(--serie-1)' },
                        { namn: 'Nyproduktion', farg: 'var(--serie-2)' }]));

    // Avstämning mot specens egen summarad
    var avvikelse = AR.filter(function (y) { return y <= sistaSpecar; }).map(function (y) {
      return { y: y, d: r.invest[y].total - (spec[String(y)] || 0) };
    }).filter(function (x) { return Math.abs(x.d) > 500; });
    html += '<div class="notis ' + (avvikelse.length ? 'varning' : 'info') + '"><div>' +
      (avvikelse.length
        ? '<b>Avviker från investeringsspecens summarad</b> ' +
          avvikelse.map(function (x) { return x.y + ': ' + delta(x.d, 0); }).join(', ') + ' ' + enhetsnamn() +
          '. Det är väntat i ett scenario där projekt ändrats.'
        : '<b>Stämmer mot investeringsspecen</b> för alla år den täcker (' +
          AR.filter(function (y) { return y <= sistaSpecar; })[0] + '–' + sistaSpecar + ').') +
      ' Källa: ' + esc(Modell.underlag.meta.kalla_invest.split('\\').pop()) + '.</div></div>';

    html += kort('Investeringsvolym bortom specen',
      'Specen slutar ' + sistaSpecar + '. För åren efter antas den här volymen, som räknas som underhåll ' +
      'och ombyggnad och ger nya avskrivningslager (' + pct(ind.satser.underhall, 1) + ' per år, halvårskonvention).',
      '<div class="tabellsvep"><table class="data" id="uh-tabell"><thead><tr><th class="etikett">Post, ' + enhetsnamn() + '</th>' +
        AR.map(function (y) { return '<th class="' + (y > BAS_SISTA ? 'prognoshuvud' : '') + '">' + y + '</th>'; }).join('') +
        '</tr></thead><tbody>' +
        '<tr class="niva-post"><td class="etikett">Ur investeringsspecen</td>' +
        AR.map(function (y) {
          return '<td>' + (y <= sistaSpecar ? tal(r.invest[y].total - (ind.ovrig_volym[y] || 0)) : '·') + '</td>';
        }).join('') + '</tr><tr' +
        (ALLA_AR.some(function (y) {
          return Math.abs(ind.ovrig_volym[y] - BAS_INDATA.ovrig_volym[y]) > 0.5;
        }) ? ' class="andrad-rad"' : '') + '><td class="etikett">Antagen volym därefter</td>' +
        AR.map(function (y) {
          var avvik = Math.abs(ind.ovrig_volym[y] - BAS_INDATA.ovrig_volym[y]) > 0.5;
          return '<td' + (avvik ? ' class="andrad"' : '') + '><input type="number" data-y="' + y +
            '" value="' + Math.round(skala(ind.ovrig_volym[y])) +
            '" step="' + (S.enhet === 'mnkr' ? 10 : 10000) + '"' + (lastLage ? ' disabled' : '') + '></td>';
        }).join('') + '</tr>' +
        '<tr class="niva-resultat"><td class="etikett">Total investeringsvolym</td>' +
        AR.map(function (y) { return '<td>' + tal(r.invest[y].total) + '</td>'; }).join('') +
        '</tr></tbody></table></div>');

    html += kort('Investeringsprojekt',
      'Alla projekt ur investeringsspecen, både nyproduktion och om- och tillbyggnad. ' +
      'Ett projekt påverkar resultatet på tre sätt: utgiften ökar låneskulden och därmed räntan, ' +
      'aktiveringen startar avskrivningen, och färdiga bostäder ger hyresintäkter. ' +
      (lastLage
        ? '<b>Scenariot är låst</b> — basplanen ska återge styrelsebudgeten exakt, och det ' +
          'kombinerade scenariot räknas fram ur sina delar. Duplicera för att lägga till projekt ' +
          'eller ändra utgifter.'
        : 'Skriv utgiften per år direkt i rutnätet, slå av och på projekt med reglaget, och öppna ' +
          '<b>Ändra…</b> längst till höger för kategori, aktivering, avskrivning och hyresintäkt.'),
      projektTabell(ind, lastLage),
      lastLage
        ? '<button class="knapp liten" id="proj-lasupp">Duplicera och redigera…</button>'
        : '<button class="knapp primar liten" id="nytt-projekt">+ Nytt projekt</button>');

    html += kort('Avskrivningstrappa',
      'Befintlig stock ligger som bas, utfasningen tar bort färdigavskrivna komponenter och varje investeringsår läggs på som ett eget lager.',
      '<div class="diagram" id="d-avskr"></div>' +
      teckenforklaring([{ namn: 'Befintlig stock efter utfasning', farg: 'var(--serie-1)' },
                        { namn: 'Underhållsinvesteringar', farg: 'var(--serie-2)' },
                        { namn: 'Nyproduktion', farg: 'var(--serie-3)' }]));

    e.innerHTML = html;

    Diagram.staplar(document.getElementById('d-invest'), {
      ar: AR, hojd: 260, enhet: enhetsnamn(), formatera: function (v) { return fmt(v, 0); },
      serier: mnkr([
        { namn: 'Underhåll och ombyggnad', varden: seriaAv(r.invest, 'underhall'), farg: 'var(--serie-1)' },
        { namn: 'Nyproduktion', varden: seriaAv(r.invest, 'nyproduktion'), farg: 'var(--serie-2)' }
      ])
    });

    var bas = {}, uh = {}, ny = {};
    AR.forEach(function (y) {
      bas[y] = -(r.avskr[y].bas + r.avskr[y].utfasning);
      uh[y] = -r.avskr[y].underhall;
      ny[y] = -r.avskr[y].nyproduktion;
    });
    Diagram.staplar(document.getElementById('d-avskr'), {
      ar: AR, hojd: 260, enhet: enhetsnamn(), formatera: function (v) { return fmt(v, 0); },
      serier: mnkr([{ namn: 'Befintlig stock efter utfasning', varden: bas, farg: 'var(--serie-1)' },
                    { namn: 'Underhållsinvesteringar', varden: uh, farg: 'var(--serie-2)' },
                    { namn: 'Nyproduktion', varden: ny, farg: 'var(--serie-3)' }])
    });

    if (lastLage) {
      var lu = document.getElementById('proj-lasupp');
      if (lu) lu.onclick = function () { scenarioDialog(aktiv()); };
      return;
    }
    e.querySelectorAll('#uh-tabell input').forEach(function (inp) {
      inp.onchange = function () {
        var v = num(inp.value) * (S.enhet === 'mnkr' ? 1000 : 1);
        andra(function (i) { i.ovrig_volym[+inp.dataset.y] = v; });
      };
    });
    kopplaProjektTabell(e);
    var np = document.getElementById('nytt-projekt');
    if (np) np.onclick = function () { projektDialog(null); };
  }

  // Skiljer sig projektet från basplanens motsvarighet?
  function projektAvviker(p) {
    var bp = null;
    BAS_INDATA.projekt.forEach(function (x) { if (x.id === p.id) bp = x; });
    if (!bp) return true;                     // tillagt i scenariot
    if (bp.aktiv !== p.aktiv) return true;
    if (bp.aktiveringsar !== p.aktiveringsar) return true;
    if (Math.abs((bp.aktiverbart || 0) - (p.aktiverbart || 0)) > 0.5) return true;
    if (Math.abs((bp.sats || 0) - (p.sats || 0)) > 1e-9) return true;
    if (!!bp.hyra !== !!p.hyra) return true;
    return ALLA_AR.some(function (y) { return Math.abs((bp.spend[y] || 0) - (p.spend[y] || 0)) > 0.5; });
  }

  function projektTabell(ind, lastLage) {
    var ordnade = ind.projekt.filter(function (p) { return p.grupp !== 'underhall'; })
      .concat(ind.projekt.filter(function (p) { return p.grupp === 'underhall'; }));
    var forraGrupp = null;
    var rader = ordnade.map(function (p) {
      var rubrik = '';
      if (p.grupp !== forraGrupp) {
        forraGrupp = p.grupp;
        rubrik = '<tr class="gruppdel"><td class="etikett" colspan="' + (AR.length + 5) + '">' +
          (p.grupp === 'underhall' ? 'Underhåll och ombyggnad' : 'Nyproduktion och övriga nyinvesteringar') +
          '</td></tr>';
      }
      return rubrik + projektRad(p, lastLage);
    }).join('');
    return projektTabellRam(ind, rader, lastLage);
  }

  function projektRad(p, lastLage) {
    var summa = 0;
    AR.forEach(function (y) { summa += p.spend[y] || 0; });
    var saknarAvskr = !p.aktiveringsar || !p.aktiverbart;
    var avvik = projektAvviker(p);
    return '<tr class="' + (p.aktiv ? '' : 'avstangd ') + (avvik ? 'andrad-rad' : '') +
      '" data-id="' + p.id + '">' +
      '<td class="etikett"><label class="vaxel"><input type="checkbox" data-pa="' + p.id + '"' +
        (p.aktiv ? ' checked' : '') + (lastLage ? ' disabled' : '') +
        ' aria-label="Ta med ' + esc(p.namn) + '"><span class="reglage"></span></label> ' +
        esc(p.namn) +
        (p.kalla === 'eget' ? ' <span class="marke-liten">eget</span>' : '') +
        (saknarAvskr && summa > 0 ? ' <span class="marke-liten sak" title="Projektet ger ingen avskrivning i modellen">ingen avskrivning</span>' : '') +
        '</td>' +
      '<td>' + esc(p.kategori || '–') + '</td>' +
      '<td>' + (p.aktiveringsar || '–') + '</td>' +
      AR.map(function (y) {
        if (lastLage) return '<td>' + (p.spend[y] ? tal(p.spend[y]) : '·') + '</td>';
        // Utgiften per år redigeras direkt i rutnätet. Noll lämnas tomt så att
        // tabellen inte fylls av nollor man måste läsa förbi.
        return '<td><input type="number" class="spendcell" data-spend="' + p.id + '" data-y="' + y +
          '" step="' + (S.enhet === 'mnkr' ? '1' : '500') + '" value="' +
          (p.spend[y] ? inmat(skala(p.spend[y]), S.enhet === 'mnkr' ? 1 : 0) : '') +
          '" aria-label="' + esc(p.namn) + ', utgift ' + y + '"></td>';
      }).join('') +
      '<td><b>' + (summa ? tal(summa) : '·') + '</b></td>' +
      '<td>' + (lastLage ? '' : '<button class="knapp liten tyst" data-red="' + p.id + '">Ändra…</button>') + '</td></tr>';
  }

  function projektTabellRam(ind, rader, lastLage) {
    // kolumnsummor per år
    var sumPa = {}, sumAv = {}, totPa = 0, totAv = 0, antalAv = 0;
    AR.forEach(function (y) { sumPa[y] = 0; sumAv[y] = 0; });
    ind.projekt.forEach(function (p) {
      if (!p.aktiv) antalAv++;
      AR.forEach(function (y) {
        var v = p.spend[y] || 0;
        if (p.aktiv) { sumPa[y] += v; totPa += v; } else { sumAv[y] += v; totAv += v; }
      });
    });
    var uh = {}, tot = {}, totUh = 0, totAlla = 0;
    AR.forEach(function (y) {
      uh[y] = ind.ovrig_volym[y] || 0;
      tot[y] = sumPa[y] + uh[y];
      totUh += uh[y]; totAlla += tot[y];
    });
    void ind;

    function fotrad(etikett, varden, total, kl) {
      return '<tr class="' + (kl || '') + '"><td class="etikett">' + etikett + '</td><td></td><td></td>' +
        AR.map(function (y) {
          return '<td>' + (Math.abs(varden[y]) > 0.5 ? tal(varden[y]) : '·') + '</td>';
        }).join('') +
        '<td><b>' + tal(total) + '</b></td><td></td></tr>';
    }

    var fot = fotrad('Summa aktiva projekt', sumPa, totPa, 'summa-rad') +
      (antalAv ? fotrad('Varav avstängda, ej medräknade (' + antalAv + ')', sumAv, totAv, 'summa-svag') : '') +
      fotrad('Antagen volym bortom specen', uh, totUh, 'summa-svag') +
      fotrad('Total investeringsvolym', tot, totAlla, 'summa-total');

    return '<div class="tabellsvep"><table class="data" id="proj-tabell"><thead><tr>' +
      '<th class="etikett">Projekt</th><th>Kategori</th><th>Aktiveras</th>' +
      AR.map(function (y) { return '<th class="' + (y > BAS_SISTA ? 'prognoshuvud' : '') + '">' + y + '</th>'; }).join('') +
      '<th>Summa</th><th></th></tr></thead><tbody>' + rader + '</tbody>' +
      '<tfoot>' + fot + '</tfoot></table></div>';
  }

  // En ändring river hela vyn och bygger den på nytt, så cellen man står i
  // måste sökas upp igen efteråt. Fokus läses av precis före renderingen, inte
  // när ändringen gjordes, så att den som redan tabbat vidare hamnar rätt.
  function medBehallenFokus(gor) {
    var a = document.activeElement, valj = null, fran = null, till = null;
    if (a && a.dataset && a.dataset.spend) {
      valj = '[data-spend="' + a.dataset.spend + '"][data-y="' + a.dataset.y + '"]';
      try { fran = a.selectionStart; till = a.selectionEnd; } catch (e) {}
    }
    gor();
    if (!valj) return;
    var n = document.querySelector(valj);
    if (!n) return;
    n.focus();
    if (fran !== null) { try { n.setSelectionRange(fran, till); } catch (e) {} }
  }

  // Ändringar samlas upp medan man skriver och läggs in i modellen när man
  // pausar eller lämnar cellen. Alla väntande celler skrivs, inte bara den
  // sista — annars tappas en siffra man snabbt tabbat förbi.
  var _spendKo = {}, _spendTimer = null;
  function koaSpend(id, ar, varde) {
    if (!_spendKo[id]) _spendKo[id] = {};
    _spendKo[id][ar] = varde;
    clearTimeout(_spendTimer);
    _spendTimer = setTimeout(spolaSpend, 400);
  }
  function spolaSpend() {
    clearTimeout(_spendTimer);
    _spendTimer = null;
    var ko = _spendKo;
    _spendKo = {};
    if (!Object.keys(ko).length) return;
    medBehallenFokus(function () {
      andra(function (ind) {
        ind.projekt.forEach(function (p) {
          if (!ko[p.id]) return;
          var fore = 0;
          ALLA_AR.forEach(function (y) { fore += p.spend[y] || 0; });
          Object.keys(ko[p.id]).forEach(function (y) { p.spend[+y] = ko[p.id][y]; });
          // Avskrivningsunderlaget måste följa med utgiften, annars ändras
          // skuld och ränta men inte avskrivningen. Det justeras med
          // *skillnaden*, inte räknas om från grunden: arbetsbokens egen
          // totalkalkyl och spec-filens IB-kolumn säger emot varandra för ett
          // par projekt, och en omräkning skulle tyst skriva över källan.
          if (p.aktiveringsar) {
            var efter = 0;
            ALLA_AR.forEach(function (y) { efter += p.spend[y] || 0; });
            p.aktiverbart = Math.max(0, (p.aktiverbart || 0) + (efter - fore));
          }
        });
      });
    });
  }

  function kopplaProjektTabell(e) {
    e.querySelectorAll('[data-pa]').forEach(function (c) {
      c.onchange = function () {
        andra(function (i) {
          i.projekt.forEach(function (p) { if (p.id === c.dataset.pa) p.aktiv = c.checked; });
        });
      };
    });
    e.querySelectorAll('input.spendcell').forEach(function (inp) {
      function las() {
        var v = inp.value.trim();
        return v === '' ? 0 : Math.round(num(v) * (S.enhet === 'mnkr' ? 1000 : 1));
      }
      inp.oninput = function () { koaSpend(inp.dataset.spend, +inp.dataset.y, las()); };
      inp.onchange = function () {
        koaSpend(inp.dataset.spend, +inp.dataset.y, las());
        spolaSpend();
      };
    });
    e.querySelectorAll('[data-red]').forEach(function (b) {
      b.onclick = function () {
        var p = null;
        aktiv().indata.projekt.forEach(function (x) { if (x.id === b.dataset.red) p = x; });
        projektDialog(p);
      };
    });
  }

  // ------------------------------------------------------------ projektdialog
  function projektDialog(befintlig) {
    var p = befintlig || {
      id: nyttId(), namn: '', projektnr: null, typ: 'Nyinvest', kategori: 'Bostäder',
      aktiv: true, kalla: 'eget', spend: fordela(0, 2027, 2030, 'klocka'), ib_varde: 0,
      aktiverbart: 0, aktiveringsar: 2030, sats: 0.021, iAvskrModell: true, hyra: null, kommentar: ''
    };
    var totalt = 0;
    AR.forEach(function (y) { totalt += p.spend[y] || 0; });
    var h = p.hyra || { kvm: 0, hyra_kvm: 2350, drift_kvm: 550, vakans: 0.1 };

    var div = document.createElement('div');
    div.innerHTML =
      '<label class="falt"><span>Projektnamn</span><input type="text" id="f-namn" value="' + esc(p.namn) + '"></label>' +
      '<div class="falt-rad-3">' +
        '<label class="falt"><span>Kategori</span><select id="f-kat">' +
          ['Bostäder', 'Lokaler', 'Mark', 'Ombyggnad'].map(function (k) {
            return '<option' + (p.kategori === k ? ' selected' : '') + '>' + k + '</option>';
          }).join('') + '</select></label>' +
        '<label class="falt"><span>Aktiveringsår</span><select id="f-akt">' +
          '<option value="">Ingen aktivering</option>' +
          AR.map(function (y) { return '<option value="' + y + '"' + (p.aktiveringsar === y ? ' selected' : '') + '>' + y + '</option>'; }).join('') +
          '</select></label>' +
        '<label class="falt"><span>Avskrivningssats %</span><input type="number" id="f-sats" step="0.1" value="' + inmat(p.sats * 100, 1) + '"></label>' +
      '</div>' +

      '<h4 style="margin:14px 0 8px;font-size:12px;color:var(--ink-2)">Investeringsutgift</h4>' +
      '<div class="falt-rad-3">' +
        '<label class="falt"><span>Utgift kvar ' + Modell.AR_FORSTA + '–' + Modell.AR_SISTA + ', mnkr</span>' +
          '<input type="number" id="f-total" step="10" value="' + inmat(totalt / 1000, 0) + '"></label>' +
        '<label class="falt"><span>Startår</span><select id="f-start">' +
          AR.map(function (y) { return '<option value="' + y + '">' + y + '</option>'; }).join('') + '</select></label>' +
        '<label class="falt"><span>Slutår</span><select id="f-slut">' +
          AR.map(function (y) { return '<option value="' + y + '">' + y + '</option>'; }).join('') + '</select></label>' +
      '</div>' +
      '<label class="falt"><span>Fördelning över åren</span><div class="segment" id="f-form" style="width:100%">' +
        [['klocka', 'Klockform'], ['jamn', 'Jämn'], ['framtung', 'Framtung'], ['baktung', 'Baktung'], ['manuell', 'Manuell']]
          .map(function (f, i) {
            return '<button data-f="' + f[0] + '" style="flex:1" aria-pressed="' + (i === 0 ? 'false' : 'false') + '">' + f[1] + '</button>';
          }).join('') + '</div></label>' +
      '<div class="tabellsvep"><table class="data"><thead><tr>' +
        AR.map(function (y) { return '<th>' + y + '</th>'; }).join('') + '</tr></thead><tbody><tr>' +
        AR.map(function (y) { return '<td><input type="number" class="f-ar" data-y="' + y + '" step="5" value="' + inmat((p.spend[y] || 0) / 1000, 0) + '"></td>'; }).join('') +
        '</tr></tbody></table></div>' +
      '<p class="hjalp" id="f-summa" style="margin:6px 0 0"></p>' +

      '<h4 style="margin:16px 0 8px;font-size:12px;color:var(--ink-2)">Hyresintäkt när projektet är färdigt <span style="font-weight:400">(valfritt)</span></h4>' +
      '<div class="falt-rad-3">' +
        '<label class="falt"><span>Uthyrbar yta, kvm</span><input type="number" id="f-kvm" step="100" value="' + inmat(h.kvm, 0) + '"></label>' +
        '<label class="falt"><span>Hyra, kr/kvm/år</span><input type="number" id="f-hyra" step="50" value="' + inmat(h.hyra_kvm, 0) + '"></label>' +
        '<label class="falt"><span>Driftkostnad, kr/kvm/år</span><input type="number" id="f-drift" step="25" value="' + inmat(h.drift_kvm, 0) + '"></label>' +
      '</div>' +
      '<label class="falt"><span>Vakans första två åren, %</span><input type="number" id="f-vakans" step="5" value="' + inmat(h.vakans * 100, 0) + '"></label>' +
      '<div class="notis info" id="f-avkastning"></div>' +
      '<label class="falt"><span>Kommentar</span><input type="text" id="f-kommentar" value="' + esc(p.kommentar) + '"></label>';

    var i = dialog(befintlig ? 'Ändra projekt' : 'Nytt projekt', div, [
      befintlig && befintlig.kalla === 'eget'
        ? { text: 'Ta bort', gor: function () {
            andra(function (ind) {
              ind.projekt = ind.projekt.filter(function (x) { return x.id !== p.id; });
            });
          } }
        : null,
      { text: 'Avbryt' },
      { text: 'Spara', primar: true, gor: function () { return sparaProjekt(); } }
    ].filter(Boolean));

    var forsta = null, sista = null;
    AR.forEach(function (y) { if (p.spend[y]) { if (forsta === null) forsta = y; sista = y; } });
    i.querySelector('#f-start').value = forsta || 2027;
    i.querySelector('#f-slut').value = sista || 2030;

    function arFalt() { return Array.prototype.slice.call(i.querySelectorAll('.f-ar')); }
    function uppdatera() {
      var s = 0;
      arFalt().forEach(function (f) { s += num(f.value); });
      i.querySelector('#f-summa').innerHTML = 'Utgift i planperioden <b>' + fmt(s, 0) +
        ' mnkr</b> plus tidigare upparbetat ' + fmt((p.ib_varde || 0) / 1000, 1) +
        ' mnkr ger en total projektkalkyl på <b>' + fmt(s + (p.ib_varde || 0) / 1000, 0) + ' mnkr</b>, ' +
        'vilket är beloppet som aktiveras och skrivs av.';
      var kvm = num(i.querySelector('#f-kvm').value);
      var hyr = kvm * num(i.querySelector('#f-hyra').value) / 1000;
      var dr = kvm * num(i.querySelector('#f-drift').value) / 1000;
      var bas = Math.max(1, s * 1000 + (p.ib_varde || 0));   // aktiverbart belopp i tkr
      var avskr = bas / 1000 * num(i.querySelector('#f-sats').value) / 100;
      i.querySelector('#f-avkastning').innerHTML = kvm
        ? '<div>Årshyra <b>' + fmt(hyr / 1000, 1) + ' mnkr</b>, driftnetto <b>' + fmt((hyr - dr) / 1000, 1) +
          ' mnkr</b> vilket ger <b>' + pct((hyr - dr) / bas, 2) +
          '</b> direktavkastning på investeringen. Avskrivningen blir ' + fmt(avskr, 1) + ' mnkr per år.</div>'
        : '<div>Ange uthyrbar yta för att räkna med hyresintäkter. Lämnas fältet tomt påverkar projektet bara utgift, skuld, ränta och avskrivning. ' +
          'Avskrivningen blir ' + fmt(avskr, 1) + ' mnkr per år.</div>';
    }
    function fordelaOm(form) {
      var tot = num(i.querySelector('#f-total').value) * 1000;
      var st = +i.querySelector('#f-start').value, sl = +i.querySelector('#f-slut').value;
      if (sl < st) sl = st;
      var d = fordela(tot, st, sl, form);
      arFalt().forEach(function (f) { f.value = inmat((d[+f.dataset.y] || 0) / 1000, 0); });
      uppdatera();
    }
    i.querySelectorAll('#f-form button').forEach(function (b) {
      b.onclick = function () {
        i.querySelectorAll('#f-form button').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
        if (b.dataset.f !== 'manuell') fordelaOm(b.dataset.f);
      };
    });
    ['#f-total', '#f-start', '#f-slut'].forEach(function (sel) {
      i.querySelector(sel).onchange = function () {
        var vald = i.querySelector('#f-form button[aria-pressed="true"]');
        fordelaOm(vald && vald.dataset.f !== 'manuell' ? vald.dataset.f : 'klocka');
      };
    });
    i.querySelectorAll('input').forEach(function (f) { f.addEventListener('input', uppdatera); });
    uppdatera();

    function sparaProjekt() {
      var namn = i.querySelector('#f-namn').value.trim();
      if (!namn) { i.querySelector('#f-namn').focus(); return false; }
      // Rutan visar bara det rullande fönstret. Arkiverade år måste bäras över,
      // annars nollas ett projekts tidigare utgift så fort fönstret flyttats.
      var spend = {};
      ALLA_AR.forEach(function (y) { spend[y] = p.spend[y] || 0; });
      AR.forEach(function (y) { spend[y] = 0; });
      arFalt().forEach(function (f) { spend[+f.dataset.y] = num(f.value) * 1000; });
      var tot = 0;
      ALLA_AR.forEach(function (y) { tot += spend[y]; });
      var kvm = num(i.querySelector('#f-kvm').value);
      var akt = i.querySelector('#f-akt').value;
      andra(function (ind) {
        var mal = null;
        ind.projekt.forEach(function (x) { if (x.id === p.id) mal = x; });
        if (!mal) { mal = p; ind.projekt.push(mal); }
        // Läs av det gamla läget INNAN något skrivs över.
        var gammalSpend = 0;
        ALLA_AR.forEach(function (y) { gammalSpend += (mal.spend && mal.spend[y]) || 0; });
        var hadeUnderlag = !!(mal.aktiveringsar && mal.aktiverbart);
        mal.namn = namn;
        mal.kategori = i.querySelector('#f-kat').value;
        mal.aktiveringsar = akt ? +akt : null;
        mal.sats = num(i.querySelector('#f-sats').value) / 100;
        // Samma deltaregel som rutnätet: ett projekt som redan har ett
        // avskrivningsunderlag ur arbetsboken behåller det, justerat med
        // utgiftsändringen. Först när projektet saknar underlag härleds det ur
        // utgiften. Utan detta revalverades varje projekt man öppnade och
        // sparade — avskrivningarna hoppade ~18 mnkr per år.
        mal.spend = spend;
        mal.aktiverbart = !akt ? 0
          : (hadeUnderlag ? Math.max(0, mal.aktiverbart + (tot - gammalSpend))
                          : tot + (mal.ib_varde || 0));
        mal.iAvskrModell = !!akt;
        mal.kommentar = i.querySelector('#f-kommentar').value;
        mal.hyra = kvm ? {
          kvm: kvm,
          hyra_kvm: num(i.querySelector('#f-hyra').value),
          drift_kvm: num(i.querySelector('#f-drift').value),
          vakans: num(i.querySelector('#f-vakans').value) / 100,
          arshyra: kvm * num(i.querySelector('#f-hyra').value) / 1000,
          driftkostnad: kvm * num(i.querySelector('#f-drift').value) / 1000
        } : null;
      });
    }
  }

  // ============================================================ RÄNTA & SKULD
  function flikRanta(e) {
    var s = aktiv(), ind = s.indata, r = resultat(S.aktivId), lastLage = !!s.las;

    var html = kort('Ränteuppgång',
      'Hur snabbt en ränteuppgång slår igenom beror på räntebindningen. <b>Rörlig</b> träffar bara den rörliga delen, som arbetsbokens ränteriskmått. <b>Bindning</b> låter den bundna stocken sättas om successivt. <b>Direkt</b> lägger uppgången på hela skulden direkt.',
      '<div class="falt-rad-3">' +
        '<label class="falt"><span>Ränteuppgång, procentenheter</span><input type="number" id="r-upp" step="0.25"' +
          (ind.ranta.uppgang ? ' class="andrad"' : '') + ' value="' +
          inmat(ind.ranta.uppgang * 100, 2) + '"' + (lastLage ? ' disabled' : '') + '></label>' +
        '<label class="falt"><span>Slår igenom från år</span><select id="r-fran"' + (lastLage ? ' disabled' : '') + '>' +
          AR.map(function (y) { return '<option value="' + y + '"' + (ind.ranta.uppgang_fran === y ? ' selected' : '') + '>' + y + '</option>'; }).join('') +
          '</select></label>' +
        '<label class="falt"><span>Genomslagsmodell</span><select id="r-modell"' + (lastLage ? ' disabled' : '') + '>' +
          [['rorlig', 'Rörlig del'], ['bindning', 'Räntebindning'], ['direkt', 'Direkt, hela skulden']].map(function (g) {
            return '<option value="' + g[0] + '"' + (ind.ranta.genomslag === g[0] ? ' selected' : '') + '>' + g[1] + '</option>';
          }).join('') + '</select></label>' +
      '</div>' +
      '<p class="hjalp" style="margin:4px 0 6px">Andel av skulden som fått den nya räntan:</p>' +
      '<div class="diagram" id="d-genomslag"></div>');

    html += kort('Känslighet i resultatet',
      'Resultat efter finansiella poster vid olika ränteuppgång, med scenariots övriga antaganden och vald genomslagsmodell.',
      kanslighetsTabell(ind));

    html += kort('Ränteantaganden per år', '',
      '<div class="tabellsvep"><table class="data" id="r-tabell"><thead><tr><th class="etikett">Antagande</th>' +
      AR.map(function (y) { return '<th class="' + (y > BAS_SISTA ? 'prognoshuvud' : '') + '">' + y + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      radInmatning('Genomsnittlig ränta, %', ind.ranta.bana, 100, 2, 'bana', lastLage, 0.05) +
      radInmatning('Räntebindningstid, år', ind.ranta.bindningstid, 1, 1, 'bindningstid', lastLage, 0.1) +
      radInmatning('Exponering rörlig ränta, %', ind.ranta.rorlig, 100, 1, 'rorlig', lastLage, 1) +
      '<tr class="niva-post"><td class="etikett">Effektiv ränta inkl. uppgång, %</td>' +
      AR.map(function (y) { return '<td>' + fmt(r.skuld[y].effektiv_ranta * 100, 2) + '</td>'; }).join('') + '</tr>' +
      '<tr class="niva-post"><td class="etikett">Borgensavgift, % av snittskuld</td>' +
      AR.map(function () { return '<td>' + fmt(ind.ranta.borgensavgift * 100, 3) + '</td>'; }).join('') + '</tr>' +
      '</tbody></table></div>');

    var fb = (Modell.underlag.investeringar.finbehov || {});
    html += kort('Vad skuldbanan följer',
      'Två källor säger olika saker. Bolagets egen finansieringskalkyl i investeringsspecen räknar ' +
      'fram lånebehovet ur kassaflödet, med avskrivningarna återlagda. Budgetarbetsboken anger i ' +
      'stället en skuldbana rakt av. Välj vilken modellen ska följa.',
      '<div class="segment" id="sk-kalla" style="margin-bottom:10px">' +
      [['kassaflode', 'Ur kassaflödet (Fin behov)'], ['finansrapport', 'Budgetarbetsbokens skuldbana']]
        .map(function (k) {
          return '<button data-k="' + k[0] + '" aria-pressed="' +
            ((ind.skuldkalla || 'kassaflode') === k[0]) + '"' + (lastLage ? ' disabled' : '') + '>' +
            k[1] + '</button>';
        }).join('') + '</div>' +
      '<div class="tabellsvep"><table class="data"><thead><tr><th class="etikett">Låneskuld, ' + enhetsnamn() +
        '</th>' + AR.map(function (y) {
          return '<th class="' + (y > BAS_SISTA ? 'prognoshuvud' : '') + '">' + y + '</th>'; }).join('') +
        '</tr></thead><tbody>' +
      '<tr class="niva-resultat"><td class="etikett">Modellen</td>' +
        AR.map(function (y) { return '<td>' + tal(r.skuld[y].ut) + '</td>'; }).join('') + '</tr>' +
      '<tr class="niva-post"><td class="etikett">Lånebehov enligt Fin behov</td>' +
        AR.map(function (y) {
          var v = fb.behov && fb.behov[String(y)];
          return '<td>' + (typeof v === 'number' ? tal(-v) : '·') + '</td>';
        }).join('') + '</tr>' +
      '<tr class="niva-post"><td class="etikett">Skuldförändring i modellen</td>' +
        AR.map(function (y) { return '<td>' + tal(r.skuld[y].forandring) + '</td>'; }).join('') + '</tr>' +
      '<tr class="niva-post"><td class="etikett">Budgetarbetsbokens angivna skuld</td>' +
        AR.map(function (y) {
          var v = Modell.underlag.finans.skuld_ub.varden[String(y)];
          return '<td>' + (typeof v === 'number' ? tal(v) : '·') + '</td>';
        }).join('') + '</tr>' +
      '</tbody></table></div>' +
      '<p class="hjalp" style="margin:10px 0 0">Skillnaden mellan modellen och Fin behov beror på att ' +
      'modellen räknar fram resultatet själv, medan Fin behov använder ett inskrivet resultat per år.</p>');

    html += kort('Skuldens uppbyggnad',
      'Ingående skuld plus investeringar minus kassaflödet från driften. Koncernbidrag och försäljningar ' +
      'är inbetalningar och minskar lånebehovet, med samma tecken som i fliken Fin behov.',
      '<div class="tabellsvep"><table class="data" id="sk-tabell"><thead><tr><th class="etikett">' + enhetsnamn() + '</th>' +
      AR.map(function (y) { return '<th class="' + (y > BAS_SISTA ? 'prognoshuvud' : '') + '">' + y + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      skuldRad('Ingående låneskuld', function (y) { return r.skuld[y].ing; }, 'delsumma') +
      skuldRad('Investeringar', function (y) { return r.invest[y].total; }, 'post') +
      skuldRad('Kassaflöde från driften', function (y) { return -r.skuld[y].kassaflode_drift; }, 'post') +
      skuldRad('Koncernbidrag och utdelning', function (y) { return -(ind.koncernbidrag[y] || 0); }, 'post') +
      skuldRad('Försäljningar', function (y) { return -(ind.forsaljning[y] || 0); }, 'post') +
      skuldRad('Avstämningspost', function (y) { return ind.ovrigt_kassaflode[y] || 0; }, 'post') +
      skuldRad('Utgående låneskuld', function (y) { return r.skuld[y].ut; }, 'resultat') +
      skuldRad('Snittskuld under året', function (y) { return r.skuld[y].snitt; }, 'post') +
      '</tbody></table></div>' +
      '<p class="hjalp" style="margin:10px 0 0">Positiva tal ökar skulden, negativa minskar den.</p>');

    e.innerHTML = html;
    Diagram.genomslagskurva(document.getElementById('d-genomslag'), ind, Modell);

    if (lastLage) return;
    e.querySelectorAll('#sk-kalla button').forEach(function (b) {
      b.onclick = function () {
        andra(function (i) {
          i.skuldkalla = b.dataset.k;
          if (b.dataset.k === 'finansrapport') Modell.kalibreraMotFinansrapport(i);
          else {
            i.skuld_ib = BAS_INDATA.skuld_ib;
            ALLA_AR.forEach(function (y) { i.ovrigt_kassaflode[y] = 0; i.skuld_justering[y] = 0; });
          }
        });
      };
    });
    document.getElementById('r-upp').onchange = function () {
      var v = num(this.value) / 100; andra(function (i) { i.ranta.uppgang = v; });
    };
    document.getElementById('r-fran').onchange = function () {
      var v = +this.value; andra(function (i) { i.ranta.uppgang_fran = v; });
    };
    document.getElementById('r-modell').onchange = function () {
      var v = this.value; andra(function (i) { i.ranta.genomslag = v; });
    };
    e.querySelectorAll('#r-tabell input').forEach(function (inp) {
      inp.onchange = function () {
        var v = num(inp.value) / num(inp.dataset.skala, 1), f = inp.dataset.falt, y = +inp.dataset.y;
        andra(function (i) { i.ranta[f][y] = v; });
      };
    });
  }

  function radInmatning(etikett, serie, skalfaktor, dec, falt, lastLage, steg) {
    var bas = BAS_INDATA.ranta[falt] || {};
    var radAvvik = ALLA_AR.some(function (y) { return Math.abs(serie[y] - bas[y]) > 1e-9; });
    return '<tr' + (radAvvik ? ' class="andrad-rad"' : '') + '><td class="etikett">' + etikett + '</td>' +
      AR.map(function (y) {
        var avvik = Math.abs(serie[y] - bas[y]) > 1e-9;
        return '<td' + (avvik ? ' class="andrad"' : '') + '><input type="number" data-falt="' + falt +
          '" data-y="' + y + '" data-skala="' + skalfaktor + '" step="' + steg + '" value="' +
          inmat(serie[y] * skalfaktor, dec) + '"' + (lastLage ? ' disabled' : '') + '></td>';
      }).join('') + '</tr>';
  }

  function skuldRad(etikett, f, niva) {
    return '<tr class="niva-' + niva + '"><td class="etikett">' + etikett + '</td>' +
      AR.map(function (y) { return '<td>' + tal(f(y)) + '</td>'; }).join('') + '</tr>';
  }

  function kanslighetsTabell(ind) {
    var steg = [-0.5, 0, 0.5, 1, 1.5, 2, 3];
    var bas = resultat('bas');
    var rader = steg.map(function (pp) {
      var i = Modell.kopia(ind);
      i.ranta.uppgang = pp / 100;
      if (pp !== 0 && !i.ranta.uppgang_fran) i.ranta.uppgang_fran = 2027;
      var r = Modell.berakna(i);
      var minsta = Infinity;
      AR.forEach(function (y) { minsta = Math.min(minsta, r.rad.resultat_ef[y]); });
      return '<tr' + (Math.abs(pp / 100 - ind.ranta.uppgang) < 1e-9 ? ' class="niva-resultat"' : '') + '>' +
        '<td class="etikett">' + (pp > 0 ? '+' : '') + fmt(pp, pp % 1 ? 1 : 0) + ' pp</td>' +
        AR.map(function (y) {
          var v = r.rad.resultat_ef[y];
          return '<td class="' + (v < 0 ? 'diff-minus' : '') + '">' + tal(v) + '</td>';
        }).join('') +
        '<td class="' + (minsta < 0 ? 'diff-minus' : '') + '"><b>' + tal(minsta) + '</b></td></tr>';
    }).join('');
    return '<div class="tabellsvep"><table class="data"><thead><tr>' +
      '<th class="etikett">Ränteuppgång</th>' +
      AR.map(function (y) { return '<th class="' + (y > BAS_SISTA ? 'prognoshuvud' : '') + '">' + y + '</th>'; }).join('') +
      '<th>Lägsta år</th></tr></thead><tbody>' + rader + '</tbody></table></div>' +
      '<p class="hjalp" style="margin:10px 0 0">Resultat efter finansiella poster i ' + enhetsnamn() +
      '. Markerad rad är scenariots nuvarande antagande. Basplanens lägsta år är ' +
      tal(Math.min.apply(null, AR.map(function (y) { return bas.rad.resultat_ef[y]; }))) + '.</p>';
  }

  // ============================================================ ANTAGANDEN
  function flikAntaganden(e) {
    var s = aktiv(), ind = s.indata, lastLage = !!s.las, bd = Modell.basDrivare();

    function drivarGrupp(grupp) {
      var ingar = Modell.DRIVARE.filter(function (d) { return d.grupp === grupp; });
      if (!ingar.length) return '';
      return '<tr class="gruppdel"><td class="etikett" colspan="' + (AR.length + 1) + '">' +
        esc(grupp) + '</td></tr>' + ingar.map(function (d) {
        var radAvvik = ALLA_AR.some(function (y) {
          return Math.abs(ind.drivare[d.nyckel][y] - bd[d.nyckel][y]) > 1e-9;
        });
        return '<tr' + (radAvvik ? ' class="andrad-rad"' : '') + '>' +
          '<td class="etikett"' + (d.hjalp ? ' title="' + esc(d.hjalp) + '"' : '') + '>' +
          esc(d.etikett) + (d.hjalp ? ' <span class="info-prick">i</span>' : '') + '</td>' +
          AR.map(function (y) {
            var avvik = Math.abs(ind.drivare[d.nyckel][y] - bd[d.nyckel][y]) > 1e-9;
            return '<td' + (avvik ? ' class="andrad"' : '') + '><input type="number" data-d="' + d.nyckel +
              '" data-y="' + y + '" step="0.1" value="' +
              inmat(ind.drivare[d.nyckel][y] * 100, 1) + '"' + (lastLage ? ' disabled' : '') + '></td>';
          }).join('') + '</tr>';
      }).join('');
    }
    function huvud(rub) {
      return '<thead><tr><th class="etikett">' + rub + '</th>' +
        AR.map(function (y) { return '<th class="' + (y > BAS_SISTA ? 'prognoshuvud' : '') + '">' + y + '</th>'; }).join('') +
        '</tr></thead>';
    }

    function drivarRubrik(namn) {
      return '<tr class="gruppdel"><td class="etikett" colspan="' + (AR.length + 1) + '">' + namn + '</td></tr>';
    }

    var framskrivet = AR.filter(function (y) { return y > BAS_SISTA; });
    var html = '<div class="notis info"><div>Procentsatserna är årlig förändring. Basplanens satser kommer ' +
      'från styrdelen i arbetsboken' +
      (framskrivet.length ? '; satserna för ' + framskrivet[0] + '–' + framskrivet[framskrivet.length - 1] +
        ' är framskrivning av ' + BAS_SISTA : '') + '. ' +
      (lastLage ? 'Det här scenariot är låst och går inte att ändra.'
        : 'Rader och fält där <b>' + esc(s.namn) + '</b> avviker från basplanen är markerade ' +
          '<span class="fargprov"></span> i scenariots färg.') + '</div></div>';

    html += kort('Intäktsdrivare', 'Hyreshöjningarna verkar på bruttohyrorna. Hyresbortfall och rabatter följer bostadshyran eftersom de är andelar av den.',
      '<div class="tabellsvep"><table class="data drivartabell">' + huvud('Årlig höjning, %') +
      '<tbody>' + drivarGrupp('Intäkter') + '</tbody></table></div>');

    html += kostnadsstrukturKort(ind, lastLage);

    html += kort('Kostnadsdrivare',
      'Löneökningen driver personaldelen i både fastighetskostnader och central administration. ' +
      'De övriga posterna har brutits ut just för att de historiskt rör sig annorlunda än inflationen.',
      '<div class="tabellsvep"><table class="data drivartabell">' + huvud('Årlig ökning, %') +
      '<tbody>' + drivarGrupp('Personal') + drivarGrupp('Fastighetskostnader') +
      drivarGrupp('Taxor och media') + drivarGrupp('Kostnader') + drivarGrupp('Övrigt') +
      '</tbody></table></div>');

    html += kort('Avskrivningssatser', 'Satserna styr hur snabbt investeringarna belastar resultatet.',
      '<div class="falt-rad-3">' +
      [['underhall', 'Underhållsinvestering'], ['nyprod_bostader', 'Nyproduktion bostäder'],
       ['nyprod_lokaler', 'Nyproduktion lokaler'], ['mark', 'Mark och exploatering'],
       ['utfasning', 'Utfasning färdigavskrivet']].map(function (k) {
        var avvik = Math.abs(ind.satser[k[0]] - BAS_INDATA.satser[k[0]]) > 1e-9;
        return '<label class="falt"><span>' + k[1] + ', %</span><input type="number" data-sats="' + k[0] +
          '" step="0.1"' + (avvik ? ' class="andrad"' : '') + ' value="' +
          inmat(ind.satser[k[0]] * 100, 2) + '"' + (lastLage ? ' disabled' : '') + '></label>';
      }).join('') + '</div>');

    html += kort('Kassaflöde och finansiering',
      'Avstämningsposten är skillnaden mellan modellens kassaflöde och finansrapportens angivna skuldbana 2026–2030. För 2031–2033 används genomsnittet av 2027–2030.',
      '<div class="tabellsvep"><table class="data" id="kf-tabell">' + huvud('Post, ' + enhetsnamn()) + '<tbody>' +
      kfRad('Koncernbidrag och utdelning', ind.koncernbidrag, 'koncernbidrag', lastLage) +
      kfRad('Försäljningar', ind.forsaljning, 'forsaljning', lastLage) +
      kfRad('Avstämningspost', ind.ovrigt_kassaflode, 'ovrigt_kassaflode', lastLage) +
      '</tbody></table></div>' +
      '<p class="hjalp" style="margin:10px 0 0">Ingående låneskuld vid planperiodens start: <b>' +
      tal(ind.skuld_ib) + ' ' + enhetsnamn() + '</b>.</p>');

    html += kort('Återställ', '',
      '<div class="radgrupp"><button class="knapp" id="ater-drivare"' + (lastLage ? ' disabled' : '') +
      '>Återställ drivare till basplanen</button>' +
      '<button class="knapp" id="ater-allt"' + (lastLage ? ' disabled' : '') +
      '>Återställ hela scenariot</button></div>');

    e.innerHTML = html;
    if (lastLage) return;

    e.querySelectorAll('.drivartabell input').forEach(function (inp) {
      inp.onchange = function () {
        var v = num(inp.value) / 100, d = inp.dataset.d, y = +inp.dataset.y;
        andra(function (i) { i.drivare[d][y] = v; });
      };
    });
    e.querySelectorAll('[data-komp]').forEach(function (inp) {
      inp.onchange = function () {
        var v = num(inp.value) / 100, k = inp.dataset.komp;
        andra(function (i) { i.komponenter[k] = v; });
      };
    });
    var ap = document.getElementById('adm-personal');
    if (ap) ap.onchange = function () {
      var v = Math.max(0, Math.min(1, num(ap.value) / 100));
      andra(function (i) { i.personalandel_adm = v; });
    };
    e.querySelectorAll('[data-sats]').forEach(function (inp) {
      inp.onchange = function () {
        var v = num(inp.value) / 100, k = inp.dataset.sats;
        andra(function (i) { i.satser[k] = v; });
      };
    });
    e.querySelectorAll('#kf-tabell input').forEach(function (inp) {
      inp.onchange = function () {
        var v = num(inp.value) * (S.enhet === 'mnkr' ? 1000 : 1), f = inp.dataset.f, y = +inp.dataset.y;
        andra(function (i) { i[f][y] = v; });
      };
    });
    document.getElementById('ater-drivare').onclick = function () {
      andra(function (i) { i.drivare = Modell.kopia(BAS_INDATA.drivare); });
    };
    document.getElementById('ater-allt').onclick = function () {
      if (!confirm('Återställ ' + aktiv().namn + ' till basplanens antaganden? Alla ändringar i scenariot försvinner.')) return;
      andra(function () {});
      var s2 = aktiv();
      s2.indata = Modell.kopia(BAS_INDATA);
      rensaCache(s2.id); render();
    };
  }

  // ------------------------------------------------------------ kostnadsstruktur
  // Fastighetskostnaderna finns bara som en klumpsumma i planen. Här visas hur
  // den delas upp, med ändamålens faktiska utveckling som jämförelse.
  function kostnadsstrukturKort(ind, lastLage) {
    var and = (Modell.underlag.andamal || {}).fastighet || { poster: [] };
    var idx = {};
    and.poster.forEach(function (p) { if (p.nr) idx[p.nr] = p; });
    var r = resultat(S.aktivId);
    var summa = 0;
    Modell.FK_KOMPONENTER.forEach(function (k) { summa += ind.komponenter[k.nyckel] || 0; });

    var rader = Modell.FK_KOMPONENTER.map(function (k) {
      var hist = [], vikt = 0, viktad = 0;
      k.andamal.forEach(function (nr) {
        var p = idx[nr];
        if (!p) return;
        hist.push(nr);
        if (p.snitt_2024_2025 !== null && p.snitt_2024_2025 !== undefined) {
          var w = Math.abs(p.varden['2025'] || 0);
          vikt += w; viktad += p.snitt_2024_2025 * w;
        }
      });
      var utfall = vikt ? viktad / vikt : null;
      var drv = Modell.DRIVARE.filter(function (d) { return d.nyckel === k.drivare; })[0];
      var antagen = ind.drivare[k.drivare] ? ind.drivare[k.drivare][AR[1]] : null;
      var avvik = (utfall !== null && antagen !== null && utfall - antagen > 0.02);
      var kompAvvik = Math.abs((ind.komponenter[k.nyckel] || 0) -
        (BAS_INDATA.komponenter[k.nyckel] || 0)) > 1e-9;
      var drvAvvik = ALLA_AR.some(function (y) {
        return Math.abs(ind.drivare[k.drivare][y] - Modell.basDrivare()[k.drivare][y]) > 1e-9;
      });
      return '<tr' + (kompAvvik || drvAvvik ? ' class="andrad-rad"' : '') + '><td class="etikett">' +
        esc(k.etikett) + '<span class="andamalnr">' + hist.join(' · ') + '</span></td>' +
        '<td' + (kompAvvik ? ' class="andrad"' : '') + '><input type="number" data-komp="' + k.nyckel +
          '" step="0.5" value="' +
          inmat((ind.komponenter[k.nyckel] || 0) * 100, 1) + '"' + (lastLage ? ' disabled' : '') + '></td>' +
        '<td>' + tal(r.rad[k.nyckel] ? r.rad[k.nyckel][S.ar] : 0) + '</td>' +
        '<td>' + (utfall === null ? '–' : '<span class="' + (avvik ? 'ned' : '') + '">' +
          (utfall > 0 ? '+' : '') + fmt(utfall * 100, 1) + ' %</span>') + '</td>' +
        '<td>' + (antagen === null ? '–' : fmt(antagen * 100, 1) + ' %') + '</td>' +
        '<td class="vansterstall svag">' + esc(drv ? drv.etikett : k.drivare) + '</td></tr>';
    }).join('');

    var pk = r.nyckeltal[S.ar].personalkostnad;
    var body =
      '<div class="tabellsvep"><table class="data" id="komp-tabell"><thead><tr>' +
      '<th class="etikett">Komponent och ändamål</th><th>Andel %</th><th>' + S.ar + ', ' + enhetsnamn() +
      '</th><th>Utfall 2024–25</th><th>Antagen takt</th><th class="vansterstall">Drivare</th>' +
      '</tr></thead><tbody>' + rader +
      '<tr class="niva-resultat"><td class="etikett">Summa fastighetskostnader</td>' +
      '<td class="' + (Math.abs(summa - 1) > 0.001 ? 'diff-minus' : '') + '">' + fmt(summa * 100, 1) + '</td>' +
      '<td>' + tal(r.rad.fastighetskostnader[S.ar]) + '</td><td></td><td></td><td></td></tr>' +
      '</tbody></table></div>' +
      (Math.abs(summa - 1) > 0.001
        ? '<div class="notis varning" style="margin-top:10px"><div>Andelarna summerar till ' +
          fmt(summa * 100, 1) + ' %. De bör summera till 100 % för att blocket ska stämma.</div></div>' : '') +

      '<h4 class="underrubrik">Personal i central administration</h4>' +
      '<p class="hjalp">Ändamål 619 är en samlingspost på ' +
        tal(-resultat('bas').rad.ovrig_adm[S.ar]) + ' ' + enhetsnamn() +
        ' där arbetsboken inte bryter ut personalen. Andelen nedan är ett antagande — stäm av den mot lönesystemet.</p>' +
      '<div class="falt-rad">' +
      '<label class="falt"><span>Personalandel av ändamål 619, %</span>' +
        '<input type="number" id="adm-personal" step="5"' +
        (Math.abs((ind.personalandel_adm || 0) - BAS_INDATA.personalandel_adm) > 1e-9 ? ' class="andrad"' : '') +
        ' value="' + inmat((ind.personalandel_adm || 0) * 100, 0) + '"' + (lastLage ? ' disabled' : '') + '></label>' +
      '<div class="falt"><span style="display:block;font-size:11.5px;color:var(--ink-2);margin-bottom:3px">' +
        'Samlad personalkostnad ' + S.ar + '</span>' +
        '<div style="font-size:19px;font-weight:600;font-variant-numeric:tabular-nums">' +
        tal(pk) + ' <span style="font-size:12px;font-weight:400;color:var(--ink-3)">' + enhetsnamn() + '</span></div>' +
        '<div class="hjalp" style="margin:2px 0 0">' +
        pct(pk / Math.max(1, -(r.rad.fastighetskostnader[S.ar] + r.rad.administration[S.ar])), 0) +
        ' av fastighetskostnader och administration</div></div></div>';

    return kort('Kostnadsstruktur — fastighetskostnader',
      'Planen har fastighetskostnaderna som en enda klumpsumma med en enda sats. Här delas de upp efter ' +
      'ändamålens faktiska storlek så att varje del kan skrivas fram i sin egen takt. ' +
      'Kolumnen <b>Utfall 2024–25</b> visar hur ändamålen faktiskt utvecklades — rött när utfallet legat ' +
      'mer än 2 procentenheter över den takt planen antar.', body);
  }

  function kfRad(etikett, serie, falt, lastLage) {
    var bas = BAS_INDATA[falt] || {};
    var radAvvik = ALLA_AR.some(function (y) { return Math.abs((serie[y] || 0) - (bas[y] || 0)) > 0.5; });
    return '<tr' + (radAvvik ? ' class="andrad-rad"' : '') + '><td class="etikett">' + etikett + '</td>' +
      AR.map(function (y) {
        var avvik = Math.abs((serie[y] || 0) - (bas[y] || 0)) > 0.5;
        return '<td' + (avvik ? ' class="andrad"' : '') + '><input type="number" data-f="' + falt +
          '" data-y="' + y + '" step="' + (S.enhet === 'mnkr' ? 5 : 5000) + '" value="' +
          inmat(skala(serie[y] || 0), 0) + '"' + (lastLage ? ' disabled' : '') + '></td>';
      }).join('') + '</tr>';
  }

  // ============================================================ JÄMFÖR
  function flikJamfor(e) {
    if (!Object.keys(S.jamforValda).length) {
      lista().forEach(function (s) { S.jamforValda[s.id] = true; });
    }
    var valda = lista().filter(function (s) { return S.jamforValda[s.id]; });

    var html = kort('Välj scenarier', '',
      '<div class="radgrupp">' + lista().map(function (s) {
        return '<label class="knapp" style="cursor:pointer;gap:8px">' +
          '<input type="checkbox" data-j="' + s.id + '"' + (S.jamforValda[s.id] ? ' checked' : '') +
          ' style="width:auto;margin:0">' +
          '<span class="prick" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + farg(s.id) + '"></span>' +
          esc(s.namn) + '</label>';
      }).join('') + '</div>');

    if (!valda.length) {
      e.innerHTML = html + '<div class="tomtext">Välj minst ett scenario.</div>';
      kopplaJamfor(e); return;
    }

    html += kort('Resultat efter finansiella poster', '',
      '<div class="diagram" id="j-resultat"></div>' +
      teckenforklaring(valda.map(function (s) { return { namn: s.namn, farg: farg(s.id) }; })));

    html += '<div class="rutnat-2">' +
      kort('Låneskuld vid årets slut', '', '<div class="diagram" id="j-skuld"></div>' +
        teckenforklaring(valda.map(function (s) { return { namn: s.namn, farg: farg(s.id) }; }))) +
      kort('Räntekostnad', '', '<div class="diagram" id="j-ranta"></div>' +
        teckenforklaring(valda.map(function (s) { return { namn: s.namn, farg: farg(s.id) }; }))) +
      '</div>';

    var matt = [
      ['Resultat efter fin. poster', function (r, y) { return tal(r.rad.resultat_ef[y]); }],
      ['Räntekostnad', function (r, y) { return tal(r.rad.rantekostnader[y]); }],
      ['Avskrivningar', function (r, y) { return tal(r.rad.avskrivningar[y]); }],
      ['Låneskuld', function (r, y) { return tal(r.skuld[y].ut); }],
      ['Investeringsvolym', function (r, y) { return tal(r.invest[y].total); }],
      ['Räntetäckningsgrad', function (r, y) {
        var v = r.nyckeltal[y].rantetackning;
        return '<span class="' + (v < 1 ? 'ned' : '') + '">' + fmt(v, 2) + ' ggr</span>';
      }]
    ];
    html += kort('Jämförelse ' + S.ar, 'Byt år i listen högst upp för att jämföra ett annat år.',
      '<div class="tabellsvep"><table class="data" id="j-tabell"><thead><tr><th class="etikett">Scenario</th>' +
      matt.map(function (m) { return '<th>' + m[0] + '</th>'; }).join('') + '</tr></thead><tbody>' +
      valda.map(function (s) {
        var r = resultat(s.id);
        return '<tr><td class="etikett"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' +
          farg(s.id) + ';margin-right:7px"></span>' + esc(s.namn) + '</td>' +
          matt.map(function (m) { return '<td>' + m[1](r, S.ar) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="verktyg" style="margin-top:10px"><button class="knapp liten" id="j-kopiera">Kopiera tabell</button></div>');

    e.innerHTML = html;
    kopplaJamfor(e);

    function serierAv(f) {
      return mnkr(valda.map(function (s) {
        var r = resultat(s.id), v = {};
        AR.forEach(function (y) { v[y] = f(r, y); });
        return { namn: s.namn, varden: v, farg: farg(s.id) };
      }));
    }
    Diagram.linje(document.getElementById('j-resultat'), {
      ar: AR, serier: serierAv(function (r, y) { return r.rad.resultat_ef[y]; }),
      hojd: 320, enhet: enhetsnamn(), formatera: function (v) { return fmt(v, 0); }
    });
    Diagram.linje(document.getElementById('j-skuld'), {
      ar: AR, serier: serierAv(function (r, y) { return r.skuld[y].ut; }),
      hojd: 240, enhet: enhetsnamn(), nollbas: false, formatera: function (v) { return fmt(v, 0); }
    });
    Diagram.linje(document.getElementById('j-ranta'), {
      ar: AR, serier: serierAv(function (r, y) { return r.rad.rantekostnader[y]; }),
      hojd: 240, enhet: enhetsnamn(), formatera: function (v) { return fmt(v, 0); }
    });
    var kb = document.getElementById('j-kopiera');
    if (kb) kb.onclick = function () { kopieraTabell('j-tabell', '\t', this); };
  }

  function kopplaJamfor(e) {
    e.querySelectorAll('[data-j]').forEach(function (c) {
      c.onchange = function () { S.jamforValda[c.dataset.j] = c.checked; renderFlik(); };
    });
  }

  // ============================================================ underlagsdialog
  function underlagDialog() {
    var m = Modell.underlag.meta, bas = resultat('bas');
    var rader = [
      ['Nettoomsättning', 'nettoomsattning'], ['Avskrivningar fastigheter', 'avskrivningar'],
      ['Räntekostnader', 'rantekostnader'], ['Resultat efter finansiella poster', 'resultat_ef']
    ];
    function facit(nyckel, y) {
      var v = null;
      Modell.underlag.rr.forEach(function (r) { if (r.nyckel === nyckel) v = r.varden[String(y)]; });
      return v;
    }
    var basAr = AR.filter(function (y) { return y <= BAS_SISTA; });
    var html =
      '<p class="hjalp">Basplanen är läst direkt ur arbetsböckerna och räknas om i modellen. Tabellen visar modellens värde mot arbetsbokens för varje år som finns där.</p>' +
      '<div class="tabellsvep"><table class="data"><thead><tr><th class="etikett">Rad, tkr</th>' +
      basAr.map(function (y) { return '<th>' + y + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rader.map(function (r) {
        var d = basAr.map(function (y) { return Math.abs(bas.rad[r[1]][y] - (facit(r[1], y) || 0)); });
        var max = Math.max.apply(null, d);
        return '<tr><td class="etikett">' + r[0] + (max < 1 ? ' <span class="marke-liten">stämmer</span>' : '') + '</td>' +
          basAr.map(function (y) { return '<td>' + fmt(bas.rad[r[1]][y], 0) + '</td>'; }).join('') + '</tr>';
      }).join('') +
      '<tr class="niva-resultat"><td class="etikett">Låneskuld, utgående</td>' +
      basAr.map(function (y) { return '<td>' + fmt(bas.skuld[y].ut, 0) + '</td>'; }).join('') + '</tr>' +
      '</tbody></table></div>' +
      '<h4 style="margin:18px 0 6px;font-size:12px;color:var(--ink-2)">Källor</h4>' +
      '<p class="hjalp" style="word-break:break-all">' +
      'Resultaträkning, styrdel, ränte- och avskrivningsmodell:<br><b>' + esc(m.kalla_budget) + '</b><br><br>' +
      'Investeringsprojekt och finansieringsbehov:<br><b>' + esc(m.kalla_invest) + '</b><br><br>' +
      'Underlaget uttaget ' + esc(m.genererad) + '. Byt ut <b>data/underlag.js</b> för att läsa in ett nytt underlag, formatet beskrivs i README.</p>' +
      '<h4 style="margin:18px 0 6px;font-size:12px;color:var(--ink-2)">Så räknar modellen</h4>' +
      '<p class="hjalp">Ett projekt slår igenom på tre vägar. Utgiften ökar låneskulden, som ökar räntekostnaden. Aktiveringen startar avskrivningen med halvårskonvention. Färdiga bostäder ger hyresintäkter och driftkostnader. ' +
      'Skuld, ränta och resultat löses iterativt varje år eftersom de beror på varandra.</p>';
    dialog('Underlag och avstämning', html, [{ text: 'Stäng', primar: true }]);
  }

  // ============================================================ investeringsspec
  // Läser en "Investerings- och försäljningsspec" direkt ur arbetsboken:
  // projektlistan och bolagets finansieringskalkyl.
  function arInvesteringsspec(fil) {
    return fil.flikar.some(function (f) { return /invest\s*lista/i.test(f.namn); });
  }

  function arskolumner(rubrikrad, hoppaOver) {
    var ut = [];
    rubrikrad.forEach(function (v, c) {
      var s = String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim();
      if (!s || hoppaOver.test(s)) return;
      var m = /(20\d{2})/.exec(s);
      if (m) ut.push({ index: c, ar: +m[1], rubrik: s });
    });
    return ut;
  }

  function tolkaInvestLista(rader) {
    var hIdx = -1;
    rader.forEach(function (r, i) {
      if (hIdx < 0 && r.some(function (v) { return /IB\s*värde/i.test(String(v || '')); })) hIdx = i;
    });
    if (hIdx < 0) throw new Error('Hittar ingen rubrikrad med "IB värde projekt" i fliken Invest lista.');
    var h = rader[hIdx];
    var ar = arskolumner(h, /avslutad|totalt|belopp budget|kommentar|andel|varav|nyckeltal|antal/i);
    if (!ar.length) throw new Error('Hittar inga årskolumner i Invest lista.');
    var ibKol = -1, typKol = -1, namnKol = -1;
    h.forEach(function (v, c) { if (/IB\s*värde/i.test(String(v || ''))) ibKol = c; });
    h.forEach(function (v, c) { if (/investerings-?\s*typ/i.test(String(v || '').replace(/\s+/g, ' '))) typKol = c; });
    // namnkolumn: den med flest långa texter bland dataraderna
    var langd = [];
    for (var i = hIdx + 1; i < rader.length; i++) {
      rader[i].forEach(function (v, c) {
        if (typeof v === 'string' && v.trim().length > 8) langd[c] = (langd[c] || 0) + 1;
      });
    }
    var bast = -1;
    langd.forEach(function (n, c) { if (c !== typKol && n > bast) { bast = n; namnKol = c; } });

    var projekt = [];
    for (var r = hIdx + 1; r < rader.length; r++) {
      var namn = String(rader[r][namnKol] === undefined ? '' : rader[r][namnKol]).trim();
      if (!namn) continue;
      if (/^(summa|varav|andel|försäljning|nettoinvest)/i.test(namn)) break;
      var typ = typKol >= 0 ? String(rader[r][typKol] || '').trim() : '';
      var spend = {}, harBelopp = false;
      ar.forEach(function (k) {
        var v = LasFil.tolkaTal(rader[r][k.index]);
        if (v === null) return;
        spend[k.ar] = Math.round(((spend[k.ar] || 0) + -v * 1000) * 10) / 10;
        if (Math.abs(v) > 1e-9) harBelopp = true;
      });
      var ib = ibKol >= 0 ? LasFil.tolkaTal(rader[r][ibKol]) : null;
      if (!harBelopp && !ib) continue;
      projekt.push({
        namn: namn,
        projektnr: (/^\s*(\d{5,8})/.exec(namn) || [])[1] || null,
        typ: typ || 'Ej angiven',
        grupp: /om-?\s*o\s*tillbyggn/i.test(typ) ? 'underhall' : 'nyproduktion',
        ib_varde: ib === null ? 0 : Math.round(-ib * 1000 * 10) / 10,
        spend: spend
      });
    }
    return { projekt: projekt, ar: ar.map(function (k) { return k.ar; })
      .filter(function (v, i, a) { return a.indexOf(v) === i; }).sort() };
  }

  function tolkaFinBehov(rader) {
    var MONSTER = [
      [/^årets resultat/i, 'resultat'],
      [/^av-?,?\s*upp-?\s*och\s*nedskrivningar|^avskrivningar/i, 'avskrivningar'],
      [/^koncernbidrag/i, 'koncernbidrag'],
      [/^försäljningsbelopp/i, 'forsaljning'],
      [/^investeringsbelopp/i, 'investering'],
      [/^finansieringsbehov/i, 'behov']
    ];
    var hIdx = -1;
    rader.forEach(function (r, i) {
      if (hIdx < 0 && r.some(function (v) { return /^plan\s*\n?\s*20\d{2}/i.test(String(v || '').trim()); })) hIdx = i;
    });
    if (hIdx < 0) return null;
    var ar = arskolumner(rader[hIdx], /belopp i mnkr|kommentar/i);
    // "Utfall/prog <år>" kan stå i raden ovanför
    if (hIdx > 0) {
      arskolumner(rader[hIdx - 1], /belopp i mnkr|kommentar|finansieringsbudget/i).forEach(function (k) {
        if (!ar.some(function (x) { return x.index === k.index; })) ar.push(k);
      });
    }
    if (!ar.length) return null;
    var ut = {};
    for (var r2 = hIdx + 1; r2 < rader.length; r2++) {
      var lbl = String(rader[r2][1] === undefined ? (rader[r2][0] || '') : rader[r2][1]).trim();
      if (!lbl) continue;
      for (var m = 0; m < MONSTER.length; m++) {
        if (!MONSTER[m][0].test(lbl)) continue;
        var v = {};
        ar.forEach(function (k) {
          var x = LasFil.tolkaTal(rader[r2][k.index]);
          if (x !== null) v[k.ar] = Math.round(x * 1000 * 10) / 10;
        });
        if (Object.keys(v).length) ut[MONSTER[m][1]] = v;
        break;
      }
    }
    return Object.keys(ut).length ? ut : null;
  }

  function investSpecDialog(fil) {
    var invFlik = null, finFlik = null;
    fil.flikar.forEach(function (f) {
      if (!invFlik && /invest\s*lista/i.test(f.namn)) invFlik = f;
      if (!finFlik && /fin\s*behov/i.test(f.namn)) finFlik = f;
    });
    var spec, fin = null;
    try {
      spec = tolkaInvestLista(invFlik.rader);
      if (finFlik) fin = tolkaFinBehov(finFlik.rader);
    } catch (e) {
      dialog('Kunde inte tolka investeringsspecen',
        '<p class="hjalp">' + esc(e.message) + '</p>', [{ text: 'Stäng', primar: true }]);
      return;
    }

    var nuvarande = aktiv().indata, r = resultat(S.aktivId);
    var nyaVolym = {}, sistaSpecar = 0;
    ALLA_AR.forEach(function (y) { nyaVolym[y] = 0; });
    spec.projekt.forEach(function (p) {
      Object.keys(p.spend).forEach(function (y) {
        if (nyaVolym[y] === undefined) return;
        nyaVolym[y] += p.spend[y];
        if (+y > sistaSpecar) sistaSpecar = +y;
      });
    });

    var gamlaNr = {}, nyaNr = {};
    nuvarande.projekt.forEach(function (p) { if (p.projektnr) gamlaNr[p.projektnr] = p; });
    spec.projekt.forEach(function (p) { if (p.projektnr) nyaNr[p.projektnr] = p; });
    var nya = spec.projekt.filter(function (p) { return !p.projektnr || !gamlaNr[p.projektnr]; }).length;
    // Hur manga nyproduktionsprojekt som skulle fa en helt ny avskrivningsprofil.
    var utanProfil = spec.projekt.filter(function (p) {
      if (p.grupp === 'underhall') return false;
      var g = p.projektnr ? gamlaNr[p.projektnr] : null;
      return !(g && g.aktiveringsar);
    }).length;
    // Projekt som bara finns i budgetfilens avskrivningsmodell har ingen
    // utgift i specen men bär ett avskrivningslager — de ska följa med.
    function harUtgift(p) {
      var s = 0;
      ALLA_AR.forEach(function (y) { s += Math.abs(p.spend[y] || 0); });
      return s > 0.5;
    }
    // Bara projekt som VERKLIGEN saknar utgift far bevaras. Utan det villkoret
    // rackte det att ett projektnummer inte gick att lasa ur namnet i filen for
    // att samma projekt skulle komma med bade som nytt och som bevarat - utgift
    // och avskrivning dubbelraknade.
    var bevaras = nuvarande.projekt.filter(function (p) {
      return p.kalla !== 'eget' && (!p.projektnr || !nyaNr[p.projektnr]) &&
             p.aktiverbart > 0 && p.aktiveringsar && !harUtgift(p);
    });
    var bevarasId = {};
    bevaras.forEach(function (p) { bevarasId[p.id] = true; });
    var forsvinner = nuvarande.projekt.filter(function (p) {
      return p.kalla !== 'eget' && !bevarasId[p.id] && p.projektnr && !nyaNr[p.projektnr];
    });
    var egna = nuvarande.projekt.filter(function (p) { return p.kalla === 'eget'; });

    var html =
      '<div class="notis info"><div><b>' + esc(fil.namn) + '</b><br>' +
        spec.projekt.length + ' projekt, år ' + spec.ar[0] + '–' + spec.ar[spec.ar.length - 1] +
        (fin ? '. Finansieringskalkyl hittad.' : '. Ingen flik Fin behov hittades.') + '</div></div>' +
      '<div class="tabellsvep"><table class="data"><thead><tr><th class="etikett">Investeringsvolym, ' +
        enhetsnamn() + '</th>' + AR.map(function (y) {
          return '<th class="' + (y > BAS_SISTA ? 'prognoshuvud' : '') + '">' + y + '</th>'; }).join('') +
        '</tr></thead><tbody>' +
      '<tr class="niva-post"><td class="etikett">Nuvarande i modellen</td>' +
        AR.map(function (y) { return '<td>' + tal(r.invest[y].total) + '</td>'; }).join('') + '</tr>' +
      '<tr class="andrad-rad"><td class="etikett">Enligt den nya filen</td>' +
        AR.map(function (y) {
          return '<td>' + (y <= sistaSpecar ? tal(nyaVolym[y]) : '·') + '</td>'; }).join('') + '</tr>' +
      '<tr class="niva-resultat"><td class="etikett">Skillnad</td>' +
        AR.map(function (y) {
          var d = (y <= sistaSpecar ? nyaVolym[y] : 0) - (y <= sistaSpecar ? r.invest[y].total : 0);
          return '<td class="' + (Math.abs(d) < 500 ? '' : (d > 0 ? 'diff-minus' : 'diff-plus')) + '">' +
            (y <= sistaSpecar ? delta(d, 0) : '·') + '</td>';
        }).join('') + '</tr>' +
      (fin && fin.behov ? '<tr class="niva-post"><td class="etikett">Lånebehov enligt Fin behov</td>' +
        AR.map(function (y) {
          return '<td>' + (typeof fin.behov[y] === 'number' ? tal(-fin.behov[y]) : '·') + '</td>';
        }).join('') + '</tr>' : '') +
      '</tbody></table></div>' +
      '<p class="hjalp"><b>' + nya + '</b> projekt är nya, <b>' +
        (spec.projekt.length - nya) + '</b> känns igen på projektnummer' +
        (forsvinner.length ? ', och <b>' + forsvinner.length + '</b> finns inte längre i filen och tas bort' : '') +
        (egna.length ? '. Dina ' + egna.length + ' egna projekt behålls' : '') + '. ' +
        (bevaras.length ? '<b>' + bevaras.length + '</b> projekt saknar utgift i filen men bär ett ' +
          'avskrivningslager från budgetfilen och följer med.' : '') + '</p>' +
      (fin && !fin.avskrivningar
        ? '<div class="notis varning"><div><b>Rad 7 i Fin behov är tom.</b> Utan återlagda avskrivningar ' +
          'överskattar finansieringsbehovet lånebehovet med hela avskrivningsbeloppet. Modellen räknar ' +
          'ändå fram skulden ur sitt eget kassaflöde, men jämförelsetalet blir missvisande.</div></div>' : '') +
      '<label class="knapp" style="cursor:pointer;gap:9px;margin-top:10px;width:100%">' +
        '<input type="checkbox" id="is-avskr" checked style="width:auto;margin:0">' +
        '<span>Härled avskrivningsprofil ur filen</span></label>' +
      '<p class="hjalp"><b>' + utanProfil + ' projekt</b> i filen saknar avskrivningsprofil i ' +
        'budgetboken. Med rutan ikryssad aktiveras de det sista året de har utgift i filen, och ' +
        'skrivs av på sin totalsumma. Utan den får de en utgift som ökar skulden men aldrig någon ' +
        'avskrivning. Projekt som <i>redan</i> finns i budgetbokens avskrivningsmodell behåller sitt ' +
        'aktiveringsår oavsett — specen visar bara utgift inom prognosfönstret och får inte ' +
        'tidigarelägga aktiveringen. Om- och tillbyggnad ingår i underhållsvolymen och får inget ' +
        'eget lager.</p>' +
      '<label class="falt" style="margin-top:12px"><span>Scenariots namn</span>' +
        '<input type="text" id="is-namn" value="' + esc(fil.namn.replace(/\.[^.]+$/, '')) + '"></label>';

    var i = dialog('Läs in investeringsprognos', html, [
      { text: 'Avbryt' },
      { text: 'Skapa scenario', primar: true, gor: function () {
        var ind = Modell.kopia(BAS_INDATA);
        var gamla = {};
        BAS_INDATA.projekt.forEach(function (p) { if (p.projektnr) gamla[p.projektnr] = p; });
        var harled = i.querySelector('#is-avskr').checked;
        var satser = Modell.underlag.avskrivning.satser;
        ind.projekt = spec.projekt.map(function (p, k) {
          var g = p.projektnr ? gamla[p.projektnr] : null;
          var spend = {}, summa = 0, sista = null;
          ALLA_AR.forEach(function (y) {
            spend[y] = p.spend[y] || 0;
            summa += spend[y];
            if (Math.abs(spend[y]) > 0.5) sista = y;
          });
          var kategori = g ? g.kategori : (p.grupp === 'underhall' ? 'Ombyggnad' : 'Bostäder');
          var sats = g ? g.sats : (/^mark/i.test(kategori) ? satser.mark
            : (/^lokal/i.test(kategori) ? satser.nyprod_lokaler : satser.nyprod_bostader));
          // Underhållsprojekt bär inget eget lager — de ligger i volymen.
          var akt = null, aktiverbart = 0;
          if (p.grupp !== 'underhall') {
            if (g && g.aktiveringsar) {
              // Projektet finns redan i budgetbokens avskrivningsmodell. Den
              // vet nar projektet aktiveras; specen visar bara utgift inom
              // prognosfonstret och far inte tidigarelagga aktiveringen.
              // Underlaget justeras med skillnaden i utgift, inte raknas om.
              var gammalSumma = 0;
              ALLA_AR.forEach(function (y) { gammalSumma += g.spend[y] || 0; });
              akt = g.aktiveringsar;
              aktiverbart = Math.max(0, (g.aktiverbart || 0) + (summa - gammalSumma));
            } else if (harled && sista) {
              // Nytt projekt utan profil: harled en ur filen, annars far det
              // en utgift som okar skulden men aldrig nagon avskrivning.
              akt = sista;
              aktiverbart = Math.max(0, summa + (p.ib_varde || 0));
            }
          }
          return {
            id: g ? g.id : ('n' + k + Date.now().toString(36)),
            namn: p.namn, projektnr: p.projektnr, typ: p.typ, grupp: p.grupp,
            kategori: kategori,
            aktiv: true, kalla: 'excel', spend: spend, ib_varde: p.ib_varde,
            aktiverbart: aktiverbart, aktiveringsar: akt, sats: sats,
            iAvskrModell: !!akt,
            hyra: g ? g.hyra : null, kommentar: g ? g.kommentar : ''
          };
        }).concat(bevaras.map(function (p) { return Modell.kopia(p); }))
          .concat(egna.map(function (p) { return Modell.kopia(p); }));
        ALLA_AR.forEach(function (y) {
          ind.ovrig_volym[y] = y <= sistaSpecar ? 0 : (nyaVolym[sistaSpecar] || 0);
        });
        if (fin && fin.koncernbidrag) {
          var sen = 0;
          ALLA_AR.forEach(function (y) {
            if (typeof fin.koncernbidrag[y] === 'number') sen = fin.koncernbidrag[y];
            ind.koncernbidrag[y] = sen;
          });
        }
        ind.prognoskalla = { namn: fil.namn, ar: sistaSpecar, kalla: fil.namn,
                             uttagen: new Date().toLocaleString('sv-SE').slice(0, 16) };
        var s = { id: nyttId(), namn: i.querySelector('#is-namn').value.trim() || fil.namn,
          indata: ind, skapad: new Date().toISOString(),
          beskrivning: 'Inläst investeringsprognos med ' + spec.projekt.length + ' projekt för ' +
            spec.ar[0] + '–' + sistaSpecar + '.' };
        S.scenarier.push(s);
        S.aktivId = s.id; S.flik = 'investeringar';
        rensaCache(); render();
      } }
    ]);
  }

  // ============================================================ tolka rutnät
  // En fil från ekonomisystemet kan se ut hur som helst. Vi gissar flik,
  // kolumn, år och radernas block — och låter användaren rätta allt.
  var BLOCK_MONSTER = [
    [/^netto\s*oms[aä]ttning|^int[aä]kter|^hyresint[aä]kter|^oms[aä]ttning/i, 'b_intakter'],
    [/^drift(s)?kostnader|^fastighetskostnader|^drift\b/i, 'b_drift'],
    [/^underh[aå]ll/i, 'b_underhall'],
    [/^fastighetsskatt/i, 'b_skatt'],
    [/^av-?\s*och\s*nedskrivningar|^avskrivningar/i, 'b_avskrivningar'],
    [/^adm-?\s*och\s*f[oö]rs[aä]ljning|^administration/i, 'b_administration'],
    [/^r[aä]ntekostnader|^finansiella kostnader/i, 'b_ranta']
  ];
  var KOD_BLOCK = {};
  (function () {
    function s(koder, blk) { koder.split(' ').forEach(function (k) { KOD_BLOCK[k] = blk; }); }
    s('111 118 119 121 129 131 139 149 181 191 193 195 196', 'b_intakter');
    s('199 311 312 313 314 315 316 317 318 321 322 351 371 372 373 376 377 378 379 381 382 383 384 385', 'b_drift');
    s('211 221 222', 'b_underhall');
    s('411', 'b_avskrivningar');
    s('613 614 618 619 621 631 641 711 731', 'b_administration');
  })();

  function gissaBlock(etikett) {
    var s = String(etikett || '').trim();
    var kod = /^\s*(\d{3})\b/.exec(s);
    if (kod && KOD_BLOCK[kod[1]]) return KOD_BLOCK[kod[1]];
    for (var i = 0; i < BLOCK_MONSTER.length; i++) {
      if (BLOCK_MONSTER[i][0].test(s)) return BLOCK_MONSTER[i][1];
    }
    return '';
  }

  function analysera(rader) {
    var maxKol = 0;
    rader.forEach(function (r) { maxKol = Math.max(maxKol, r.length); });
    var text = [], tal = [];
    for (var c = 0; c < maxKol; c++) { text[c] = 0; tal[c] = 0; }
    rader.forEach(function (r) {
      for (var c = 0; c < maxKol; c++) {
        var v = r[c];
        if (v === undefined || v === null || String(v).trim() === '') continue;
        if (LasFil.tolkaTal(v) !== null) tal[c]++; else text[c]++;
      }
    });
    var etikettKol = 0, bast = -1;
    for (var c2 = 0; c2 < maxKol; c2++) {
      if (text[c2] > bast) { bast = text[c2]; etikettKol = c2; }
    }
    // En kolumn med enbart korta heltal till vänster om texten är ett
    // kontonummer, inte belopp. Den ska stanna i etiketten.
    function arKodkolumn(c) {
      if (c >= etikettKol) return false;
      var n = 0;
      for (var r = 0; r < rader.length; r++) {
        var v = LasFil.tolkaTal(rader[r][c]);
        if (v === null) continue;
        if (v !== Math.round(v) || Math.abs(v) >= 100000 || v <= 0) return false;
        n++;
      }
      return n >= 3;
    }
    var varden = [];
    for (var c3 = 0; c3 < maxKol; c3++) {
      if (c3 !== etikettKol && tal[c3] >= 3 && !arKodkolumn(c3)) varden.push(c3);
    }

    // rubrikrad: den rad där flest värdekolumner har text
    var rubrikRad = -1, flest = 0;
    for (var r2 = 0; r2 < Math.min(rader.length, 15); r2++) {
      var n = 0;
      varden.forEach(function (c) {
        var v = rader[r2][c];
        if (v && LasFil.tolkaTal(v) === null && String(v).trim()) n++;
      });
      if (n > flest) { flest = n; rubrikRad = r2; }
    }
    function rubrik(c) {
      var d = [];
      for (var r3 = 0; r3 <= Math.max(rubrikRad, 0); r3++) {
        var v = rader[r3] && rader[r3][c];
        if (v && LasFil.tolkaTal(v) === null && String(v).trim()) d.push(String(v).trim());
      }
      return d.join(' · ') || ('Kolumn ' + (c + 1));
    }
    var kolumner = varden.map(function (c) { return { index: c, rubrik: rubrik(c) }; });
    // förvalt: sista kolumnen vars rubrik nämner prognos, annars sista
    var vald = kolumner.length ? kolumner[kolumner.length - 1].index : null;
    kolumner.forEach(function (k) { if (/prognos/i.test(k.rubrik)) vald = k.index; });
    return { etikettKol: etikettKol, kolumner: kolumner, vald: vald, rubrikRad: rubrikRad };
  }

  function gissaAr(txt) {
    var m = /(20\d{2})/.exec(String(txt || ''));
    return m ? +m[1] : Modell.AR_FORSTA;
  }

  function rutnatDialog(fil) {
    var flikIdx = 0;
    // Fliken med resultaträkningen väljs i första hand; annars den första.
    fil.flikar.forEach(function (f, i) { if (/^rr\b|resultatr/i.test(f.namn)) flikIdx = i; });
    // enhet === null betyder "inte gissad an". Tidigare anvandes 1 som
    // sentinel, men 1 ar ocksa det giltiga vardet for tkr - valde man tkr i
    // rullgardinen gissade koden om och slog tillbaka till mnkr.
    var an = null, enhet = null, vald = null, ar = null;

    function berakna() {
      var rader = fil.flikar[flikIdx].rader;
      an = analysera(rader);
      if (vald === null || an.kolumner.every(function (k) { return k.index !== vald; })) vald = an.vald;
      var rub = '';
      an.kolumner.forEach(function (k) { if (k.index === vald) rub = k.rubrik; });
      if (ar === null) ar = gissaAr(rub + ' ' + fil.namn + ' ' + fil.flikar[flikIdx].namn);
      // enhetsgissning på den största posten
      if (enhet === null) {
        var storst = 0;
        rader.forEach(function (r) {
          var v = LasFil.tolkaTal(r[vald]);
          if (v !== null) storst = Math.max(storst, Math.abs(v));
        });
        enhet = storst > 5e7 ? 0.001 : (storst > 0 && storst < 20000 ? 1000 : 1);
      }
      // Etiketten byggs av allt som står före första värdekolumnen, så att en
      // systemexport med kontonummer i egen kolumn ger "311 Fastighetsservice".
      var forstaVarde = an.kolumner.length
        ? Math.min.apply(null, an.kolumner.map(function (k) { return k.index; })) : 1;
      var poster = [];
      rader.forEach(function (r, i) {
        if (i <= an.rubrikRad) return;
        var lbl;
        if (forstaVarde > 0) {
          lbl = [];
          for (var c = 0; c < forstaVarde; c++) {
            var x = r[c];
            if (x !== undefined && x !== null && String(x).trim()) lbl.push(String(x).trim());
          }
          lbl = lbl.join(' ');
        } else {
          lbl = String(r[an.etikettKol] === undefined ? '' : r[an.etikettKol]).trim();
        }
        var v = LasFil.tolkaTal(r[vald]);
        if (!lbl || v === null) return;
        poster.push({ rad: i, etikett: lbl, varde: v, block: gissaBlock(lbl) });
      });
      return poster;
    }

    var poster = berakna();

    function bygg() {
      var traffar = poster.filter(function (p) { return p.block; }).length;
      return (fil.flikar.length > 1
        ? '<label class="falt"><span>Flik</span><select id="rg-flik">' +
          fil.flikar.map(function (f, i) {
            return '<option value="' + i + '"' + (i === flikIdx ? ' selected' : '') + '>' + esc(f.namn) +
              ' (' + f.rader.length + ' rader)</option>';
          }).join('') + '</select></label>' : '') +
        '<div class="falt-rad-3">' +
          '<label class="falt"><span>Kolumn med prognosen</span><select id="rg-kol">' +
            an.kolumner.map(function (k) {
              return '<option value="' + k.index + '"' + (k.index === vald ? ' selected' : '') + '>' +
                esc(k.rubrik) + '</option>';
            }).join('') + '</select></label>' +
          '<label class="falt"><span>Prognosår</span><select id="rg-ar">' +
            ALLA_AR.map(function (y) {
              return '<option value="' + y + '"' + (y === ar ? ' selected' : '') + '>' + y + '</option>';
            }).join('') + '</select></label>' +
          '<label class="falt"><span>Belopp i filen</span><select id="rg-enhet">' +
            [[1, 'tkr'], [1000, 'mnkr'], [0.001, 'kronor']].map(function (e) {
              return '<option value="' + e[0] + '"' + (e[0] === enhet ? ' selected' : '') + '>' + e[1] + '</option>';
            }).join('') + '</select></label>' +
        '</div>' +
        '<p class="hjalp">' + poster.length + ' rader med belopp hittades, varav <b>' + traffar +
          '</b> kunde kopplas till ett block. Rätta vid behov — rader satta till <b>–</b> hoppas över. ' +
          'Flera rader mot samma block summeras.</p>' +
        '<div class="tabellsvep"><table class="data" id="rg-tabell"><thead><tr>' +
          '<th class="etikett">Rad i filen</th><th>Belopp, ' + enhetsnamn() + '</th>' +
          '<th class="vansterstall">Block i modellen</th></tr></thead><tbody>' +
        poster.map(function (p, i) {
          return '<tr' + (p.block ? ' class="andrad-rad"' : '') + '><td class="etikett">' + esc(p.etikett) + '</td>' +
            '<td>' + tal(p.varde * enhet) + '</td>' +
            '<td class="vansterstall"><select data-rg="' + i + '">' +
              '<option value="">–</option>' +
              Modell.BLOCK.map(function (b) {
                return '<option value="' + b.nyckel + '"' + (p.block === b.nyckel ? ' selected' : '') + '>' +
                  esc(b.etikett) + '</option>';
              }).join('') + '</select></td></tr>';
        }).join('') + '</tbody></table></div>';
    }

    var i = dialog('Läs in prognos — ' + fil.namn, bygg(), [
      { text: 'Avbryt' },
      { text: 'Fortsätt', primar: true, gor: function () { return vidare(); } }
    ]);

    function koppla() {
      var f = i.querySelector('#rg-flik');
      if (f) f.onchange = function () { flikIdx = +this.value; vald = null; ar = null; enhet = null; rita(); };
      i.querySelector('#rg-kol').onchange = function () { vald = +this.value; enhet = null; ar = null; rita(); };
      i.querySelector('#rg-ar').onchange = function () { ar = +this.value; };
      i.querySelector('#rg-enhet').onchange = function () { enhet = parseFloat(this.value); rita(); };
      i.querySelectorAll('[data-rg]').forEach(function (s) {
        s.onchange = function () {
          poster[+s.dataset.rg].block = s.value;
          s.closest('tr').className = s.value ? 'andrad-rad' : '';
        };
      });
    }
    function rita() { poster = berakna(); i.innerHTML = bygg(); koppla(); }
    koppla();

    function vidare() {
      var d = { typ: 'ekplan-prognos', version: 1, ar: ar,
        namn: (fil.flikar[flikIdx].namn || fil.namn) + ' · ' +
              (an.kolumner.filter(function (k) { return k.index === vald; })[0] || {}).rubrik,
        kalla: fil.namn, uttagen: new Date().toLocaleString('sv-SE').slice(0, 16),
        enhet: 'tkr', poster: {}, detalj: {}, info: {}, saknas: [] };
      poster.forEach(function (p) {
        if (!p.block) return;
        var v = Math.round(p.varde * enhet * 10) / 10;
        d.poster[p.block] = Math.round(((d.poster[p.block] || 0) + v) * 10) / 10;
        (d.detalj[p.block] = d.detalj[p.block] || []).push({ rad: p.etikett, varde: v });
      });
      if (!Object.keys(d.poster).length) {
        alert('Ingen rad är kopplad till ett block. Välj block för minst en rad.');
        return false;
      }
      Modell.BLOCK.forEach(function (b) { if (!(b.nyckel in d.poster)) d.saknas.push(b.etikett); });
      setTimeout(function () { prognosDialog(d); }, 60);
    }
  }

  // ============================================================ prognosinläsning
  // En prognos rapporteras på blocknivå. Vi jämför mot basplanen, visar
  // avvikelsen och låter användaren välja om den ska bäras fram eller inte.
  function prognosDialog(d) {
    var basR = resultat('bas'), ar = d.ar;
    if (ALLA_AR.indexOf(ar) < 0) {
      dialog('Prognosen ligger utanför horisonten',
        '<p class="hjalp">Prognosen avser <b>' + ar + '</b>, men modellen räknar ' +
        ALLA_AR[0] + '–' + ALLA_AR[ALLA_AR.length - 1] + '. Läs om underlaget från en nyare arbetsbok ' +
        'eller välj en prognos inom horisonten.</p>', [{ text: 'Stäng', primar: true }]);
      return;
    }

    function modellvarde(blk) {
      var b = null;
      Modell.BLOCK.forEach(function (x) { if (x.nyckel === blk) b = x; });
      if (!b) return null;
      if (blk === 'b_avskrivningar') return basR.rad.avskrivningar[ar];
      if (blk === 'b_ranta') return basR.rad.rantekostnader[ar];
      var s = 0;
      b.rader.forEach(function (r) { s += basR.rad[r] ? basR.rad[r][ar] : 0; });
      return s;
    }

    var poster = [];
    Modell.BLOCK.forEach(function (b) {
      var p = d.poster ? d.poster[b.nyckel] : undefined;
      var m = modellvarde(b.nyckel);
      poster.push({ nyckel: b.nyckel, etikett: b.etikett, modell: m,
                    prognos: (typeof p === 'number' ? p : null),
                    detalj: (d.detalj || {})[b.nyckel] || [] });
    });

    var tackta = poster.filter(function (p) { return p.prognos !== null && p.modell; });
    var otackta = poster.filter(function (p) { return p.prognos === null || !p.modell; });

    var html =
      '<div class="notis info"><div><b>' + esc(d.namn) + '</b> för ' + ar +
        ', uttagen ' + esc(d.uttagen || '') + '.<br><span class="hjalp" style="word-break:break-all">' +
        esc(d.kalla || '') + '</span></div></div>' +
      '<div class="tabellsvep"><table class="data" id="pr-tabell"><thead><tr>' +
        '<th class="etikett">Block</th><th>Basplan ' + ar + '</th><th>Prognos</th>' +
        '<th>Avvikelse</th><th>Bär fram</th></tr></thead><tbody>' +
      tackta.map(function (p, i) {
        var dif = p.prognos - p.modell, kv = p.prognos / p.modell;
        var hjalp = p.detalj.length > 1
          ? p.detalj.map(function (x) { return x.rad + ': ' + tal(x.varde); }).join(' · ') : '';
        return '<tr><td class="etikett"' + (hjalp ? ' title="' + esc(hjalp) + '"' : '') + '>' +
          esc(p.etikett) + (hjalp ? ' <span class="info-prick">i</span>' : '') + '</td>' +
          '<td>' + tal(p.modell) + '</td><td>' + tal(p.prognos) + '</td>' +
          // Alla block går in i resultatet additivt, så en positiv avvikelse
          // lyfter resultatet oavsett om raden är intäkt eller kostnad.
          '<td class="' + (Math.abs(dif) < 500 ? '' : (dif > 0 ? 'diff-plus' : 'diff-minus')) + '">' +
            delta(dif, 0) + '  <span class="svag">' + (kv >= 1 ? '+' : '') + fmt((kv - 1) * 100, 1) + ' %</span></td>' +
          '<td><label class="vaxel"><input type="checkbox" data-bf="' + p.nyckel + '" checked' +
            ' aria-label="Bär fram ' + esc(p.etikett) + '"><span class="reglage"></span></label></td></tr>';
      }).join('') +
      '</tbody></table></div>' +
      (otackta.length
        ? '<div class="notis varning" style="margin-top:10px"><div><b>Utan prognos:</b> ' +
          otackta.map(function (p) { return esc(p.etikett); }).join(', ') +
          '. De blocken lämnas som i basplanen.</div></div>' : '') +
      (function () {
        // En ofullständig export ger orimligt stora avvikelser. Bättre att
        // fråga än att tyst skala ett helt block.
        var vilda = tackta.filter(function (p) {
          return Math.abs(p.prognos / p.modell - 1) > 0.25;
        });
        if (!vilda.length) return '';
        return '<div class="notis varning" style="margin-top:10px"><div><b>Kontrollera att filen är komplett.</b> ' +
          vilda.map(function (p) {
            return esc(p.etikett) + ' avviker ' + fmt((p.prognos / p.modell - 1) * 100, 0) + ' %';
          }).join(', ') + '. Så stora avvikelser beror oftare på att rader saknas i exporten, ' +
          'eller på fel enhet, än på en verklig prognos. Gå tillbaka och kontrollera ' +
          'kopplingen innan du skapar scenariot.</div></div>';
      })() +
      (d.info && Object.keys(d.info).length
        ? '<h4 class="underrubrik">Övrigt i mallen</h4><p class="hjalp">' +
          Object.keys(d.info).map(function (k) { return esc(k) + ' ' + tal(d.info[k]); }).join(' · ') +
          '. Tillämpas inte automatiskt — lägg in dem för hand om de är relevanta.</p>' : '') +
      '<h4 class="underrubrik">Så tillämpas prognosen</h4>' +
      '<p class="hjalp"><b>Bär fram</b> betyder att avvikelsen gäller ' + ar +
        ' <i>och alla år därefter</i> — prognosen blir en ny nivå. Stäng av den för poster som är ' +
        'engångseffekter: då ändras bara ' + ar + ' och åren efter ligger kvar på basplanen. ' +
        'Detaljraderna inom varje block behåller sina inbördes proportioner.</p>' +
      '<label class="falt" style="margin-top:12px"><span>Scenariots namn</span>' +
        '<input type="text" id="pr-namn" value="' + esc(d.namn) + '"></label>';

    var i = dialog('Läs in prognos', html, [
      { text: 'Avbryt' },
      { text: 'Skapa scenario', primar: true, gor: function () {
        var just = {};
        tackta.forEach(function (p) {
          var kryss = i.querySelector('[data-bf="' + p.nyckel + '"]');
          var barFram = kryss ? kryss.checked : true;
          var kvot = p.prognos / p.modell;
          if (!isFinite(kvot) || kvot <= 0) return;
          just[p.nyckel] = {};
          ALLA_AR.forEach(function (y) {
            if (y === ar || (barFram && y > ar)) just[p.nyckel][y] = kvot;
          });
        });
        var ind = Modell.kopia(BAS_INDATA);
        ind.blockjustering = just;
        ind.prognoskalla = { namn: d.namn, ar: ar, kalla: d.kalla, uttagen: d.uttagen };
        var namn = i.querySelector('#pr-namn').value.trim() || d.namn;
        var s = { id: nyttId(), namn: namn, indata: ind, skapad: new Date().toISOString(),
          beskrivning: 'Inläst prognos för ' + ar + '. ' +
            tackta.length + ' av ' + poster.length + ' block justerade' +
            (otackta.length ? '; ' + otackta.length + ' saknar prognos och ligger kvar på basplanen' : '') + '.' };
        S.scenarier.push(s);
        S.aktivId = s.id;
        S.flik = 'oversikt';
        rensaCache();
        render();
      } }
    ]);
  }

  // ============================================================ sidopanelens bredd
  var PANEL_STANDARD = 272, PANEL_MIN = 190, PANEL_MAX = 560;

  function sattPanelbredd(px, spara_) {
    S.panelBredd = Math.round(Math.max(PANEL_MIN, Math.min(PANEL_MAX, px)));
    document.documentElement.style.setProperty('--panel-bredd', S.panelBredd + 'px');
    var g = document.getElementById('panelgrepp');
    if (g) {
      g.setAttribute('aria-valuenow', S.panelBredd);
      g.setAttribute('aria-valuemin', PANEL_MIN);
      g.setAttribute('aria-valuemax', PANEL_MAX);
    }
    if (spara_ !== false) spara();
  }

  function sattPanelDold(dold) {
    S.panelDold = !!dold;
    document.querySelector('.app').classList.toggle('panel-dold', S.panelDold);
    var b = document.getElementById('knapp-panel');
    b.setAttribute('aria-expanded', String(!S.panelDold));
    b.title = (S.panelDold ? 'Visa' : 'Dölj') + ' scenariopanelen (Ctrl+B)';
    spara();
  }

  function kopplaPanel() {
    var grepp = document.getElementById('panelgrepp'), app = document.querySelector('.app');
    sattPanelbredd(S.panelBredd || PANEL_STANDARD, false);
    sattPanelDold(S.panelDold);

    document.getElementById('knapp-panel').onclick = function () { sattPanelDold(!S.panelDold); };

    grepp.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      grepp.setPointerCapture(e.pointerId);
      app.classList.add('panel-dras');
      var start = e.clientX, bredd = S.panelBredd;
      function flytta(ev) { sattPanelbredd(bredd + (ev.clientX - start), false); }
      function slapp() {
        grepp.removeEventListener('pointermove', flytta);
        grepp.removeEventListener('pointerup', slapp);
        grepp.removeEventListener('pointercancel', slapp);
        app.classList.remove('panel-dras');
        spara();
      }
      grepp.addEventListener('pointermove', flytta);
      grepp.addEventListener('pointerup', slapp);
      grepp.addEventListener('pointercancel', slapp);
    });

    grepp.ondblclick = function () { sattPanelbredd(PANEL_STANDARD); };

    grepp.onkeydown = function (e) {
      var steg = e.shiftKey ? 40 : 10;
      if (e.key === 'ArrowLeft') { sattPanelbredd(S.panelBredd - steg); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { sattPanelbredd(S.panelBredd + steg); e.preventDefault(); }
      else if (e.key === 'Home') { sattPanelbredd(PANEL_MIN); e.preventDefault(); }
      else if (e.key === 'End') { sattPanelbredd(PANEL_MAX); e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === ' ') { sattPanelDold(true); e.preventDefault(); }
    };

    window.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        sattPanelDold(!S.panelDold);
      }
    });
  }

  // ============================================================ toppknappar
  function kopplaTopp() {
    document.querySelectorAll('#enhetsval button').forEach(function (b) {
      b.onclick = function () {
        S.enhet = b.dataset.enhet;
        document.querySelectorAll('#enhetsval button').forEach(function (x) {
          x.setAttribute('aria-pressed', x === b);
        });
        render();
      };
    });
    document.getElementById('knapp-tema').onclick = function () {
      var nu = document.documentElement.getAttribute('data-tema');
      var mork = window.matchMedia('(prefers-color-scheme: dark)').matches;
      var ny = nu ? (nu === 'morkt' ? 'ljust' : 'morkt') : (mork ? 'ljust' : 'morkt');
      document.documentElement.setAttribute('data-tema', ny);
      try { localStorage.setItem('ekplan_tema', ny); } catch (e) {}
      renderFlik(); renderKpi();
    };
    var knappUnderlag = document.getElementById('knapp-underlag');
    if (knappUnderlag) knappUnderlag.onclick = underlagDialog;

    document.getElementById('knapp-nytt').onclick = function () {
      var i = dialog('Nytt scenario',
        '<label class="falt"><span>Namn</span><input type="text" id="n-namn" placeholder="Till exempel Nyproduktion Kv Ekoxen"></label>' +
        '<label class="falt"><span>Beskrivning</span><input type="text" id="n-besk" placeholder="Vad prövar scenariot?"></label>' +
        '<label class="falt"><span>Utgå från</span><select id="n-fran">' +
          lista().map(function (s) { return '<option value="' + s.id + '">' + esc(s.namn) + '</option>'; }).join('') +
          '</select></label>',
        [{ text: 'Avbryt' }, { text: 'Skapa', primar: true, gor: function () {
          var namn = i.querySelector('#n-namn').value.trim() || 'Nytt scenario';
          var fran = hamta(i.querySelector('#n-fran').value) || hamta('bas');
          S.scenarier.push({ id: nyttId(), namn: namn,
            beskrivning: i.querySelector('#n-besk').value.trim(),
            indata: Modell.kopia(fran.indata), skapad: new Date().toISOString() });
          S.aktivId = S.scenarier[S.scenarier.length - 1].id;
          render();
        } }]);
    };

    document.getElementById('knapp-redigera').onclick = function () { scenarioDialog(aktiv()); };
    document.getElementById('knapp-duplicera').onclick = function () { duplicera(aktiv(), false); };
    document.getElementById('knapp-byt-namn').onclick = function () {
      if (!aktiv().las) namnDialog(aktiv());
    };
    document.getElementById('knapp-ta-bort').onclick = function () { taBort(aktiv()); };
    document.getElementById('knapp-exportera').onclick = exporteraExcel;

    document.getElementById('knapp-prognos').onclick = function () {
      document.getElementById('prognosval').click();
    };
    document.getElementById('prognosval').onchange = function () {
      var f = this.files[0];
      this.value = '';
      if (!f) return;
      LasFil.las(f).then(function (r) {
        if (r.typ === 'json') {
          if (r.data && r.data.typ === 'ekplan-prognos' && r.data.poster) prognosDialog(r.data);
          else if (r.data && r.data.scenarier) lasScenariofil(r.data);
          else alert('JSON-filen är varken en prognos från extrahera_prognos.py\n' +
                     'eller ett sparat scenario. Läs hellre in xlsx- eller CSV-filen direkt.');
          return;
        }
        var harData = r.flikar.some(function (x) { return x.rader.length > 2; });
        if (!harData) { alert('Filen innehåller inga rader att tolka.'); return; }
        // Investeringsspec eller resultatprognos — filen får avgöra.
        if (arInvesteringsspec(r)) investSpecDialog(r);
        else rutnatDialog(r);
      }).catch(function (e) {
        alert('Kunde inte läsa filen.\n\n' + (e && e.message ? e.message : e));
      });
    };

  }

  // ============================================================ förklaringar
  // Hovertext på valfritt element med data-fork. En ruta återanvänds; texten
  // ligger i markupen så att den följer med det den förklarar.
  var _fork = null;
  function forkRuta() {
    if (!_fork) {
      _fork = document.createElement('div');
      _fork.className = 'fork-tip';
      _fork.setAttribute('role', 'tooltip');
      document.body.appendChild(_fork);
    }
    return _fork;
  }
  function visaFork(el) {
    var txt = el.getAttribute('data-fork');
    if (!txt) return;
    var d = forkRuta(), formel = el.getAttribute('data-formel');
    d.innerHTML = '<b>' + esc(el.getAttribute('data-rubrik') || el.textContent.trim()) + '</b>' +
      esc(txt) + (formel ? '<span class="formel">' + esc(formel) + '</span>' : '');
    d.style.left = '0px'; d.style.top = '0px';
    d.classList.add('syns');
    var r = el.getBoundingClientRect(), b = d.getBoundingClientRect();
    var x = r.left, y = r.bottom + 8;
    if (x + b.width > window.innerWidth - 12) x = window.innerWidth - b.width - 12;
    if (x < 12) x = 12;
    if (y + b.height > window.innerHeight - 12) y = r.top - b.height - 8;
    if (y < 12) y = 12;
    d.style.left = Math.round(x) + 'px';
    d.style.top = Math.round(y) + 'px';
  }
  function doljFork() { if (_fork) _fork.classList.remove('syns'); }
  function narmasteFork(e) {
    var t = e.target;
    return t && t.closest ? t.closest('[data-fork]') : null;
  }
  function kopplaForklaringar() {
    document.addEventListener('mouseover', function (e) {
      var el = narmasteFork(e);
      if (el) visaFork(el);
    });
    document.addEventListener('mouseout', function (e) { if (narmasteFork(e)) doljFork(); });
    document.addEventListener('focusin', function (e) {
      var el = narmasteFork(e);
      if (el) visaFork(el); else doljFork();
    });
    document.addEventListener('focusout', doljFork);
    // rutan är fast positionerad — den måste bort när underlaget rör sig
    window.addEventListener('scroll', doljFork, true);
  }

  // Toppskenan: årsraden klistrar överst, flikraden direkt under den.
  // Årsraden radbryter på smala skärmar, så höjden mäts i stället för att
  // gissas. Nyckeltalsremsan däremellan är inte klistrad — den glider in under
  // årsraden och tonas bort i takt med hur mycket av den som är kvar, så att
  // det läser som att korten fälls ihop i stället för att klippas av.
  function kopplaToppskena() {
    var ar = document.getElementById('arval'), kpi = document.getElementById('kpi'),
        huvud = document.querySelector('main');
    if (!ar || !huvud) return;

    function matt() {
      document.documentElement.style.setProperty('--arval-h', ar.offsetHeight + 'px');
    }
    if (window.ResizeObserver) new ResizeObserver(matt).observe(ar);
    else window.addEventListener('resize', matt);
    matt();

    var vantar = false;
    function skena() {
      vantar = false;
      ar.classList.toggle('fast', huvud.scrollTop > 2);
      if (!kpi) return;
      var kant = ar.getBoundingClientRect().bottom, r = kpi.getBoundingClientRect();
      var kvar = r.height ? (r.bottom - kant) / r.height : 1;
      document.documentElement.style.setProperty(
        '--kpi-syns', String(Math.max(0, Math.min(1, kvar))));
    }
    huvud.addEventListener('scroll', function () {
      if (vantar) return;
      vantar = true;
      requestAnimationFrame(skena);
    }, { passive: true });
    skena();
  }

  // ============================================================ start
  function start() {
    try {
      var t = localStorage.getItem('ekplan_tema');
      if (t) document.documentElement.setAttribute('data-tema', t);
    } catch (e) {}
    las();
    document.querySelectorAll('#enhetsval button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.enhet === S.enhet);
    });
    kopplaPanel();
    kopplaTopp();
    kopplaToppskena();
    kopplaForklaringar();
    render();
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { Diagram.doljTip(); doljFork(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
