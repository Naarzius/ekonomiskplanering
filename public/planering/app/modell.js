/* Ekonomisk planering — beräkningsmotor
 * ------------------------------------------------------------------
 * Allt räknas i tkr. Intäkter positiva, kostnader negativa (som i arbetsboken).
 * Investeringsutgifter hanteras som positiva volymer.
 *
 * Modellen är kalibrerad så att BASPLANEN återger styrelsebudgeten exakt
 * för 2026-2030. Åren 2031-2033 skrivs fram med samma drivare som 2030.
 * Scenarier verkar som relativa avvikelser ovanpå basplanen.
 */
var Modell = (function () {
  'use strict';

  var U = window.PLAN_UNDERLAG;

  // Rullande horisont. Modellen räknar alltid från arbetsbokens basår, men det
  // aktiva fönstret är tio år framåt från innevarande år. När ett år passerar
  // flyttas fönstret fram av sig självt och det gångna året hamnar i arkivet.
  var BAS_AR = 2026;        // arbetsbokens första planår — modellens startpunkt
  var BAS_SISTA = 2030;     // sista året som finns i arbetsboken
  var HORISONT = 10;
  var ARSTART = Math.max(BAS_AR, new Date().getFullYear());
  var AR_SISTA = ARSTART + HORISONT - 1;

  var AR = [];              // alla år modellen räknar (basår till sista)
  for (var y = BAS_AR; y <= AR_SISTA; y++) AR.push(y);
  var FONSTER = AR.filter(function (y) { return y >= ARSTART; });
  var ARKIV = AR.filter(function (y) { return y < ARSTART; });

  // ---------------------------------------------------------------- drivare
  var DRIVARE = [
    { nyckel: 'hyra_bostader',  etikett: 'Hyreshöjning bostäder',            grupp: 'Intäkter' },
    { nyckel: 'hyra_lokaler',   etikett: 'Hyreshöjning lokaler',             grupp: 'Intäkter' },
    { nyckel: 'hyra_garage',    etikett: 'Hyreshöjning garage / P-plats',    grupp: 'Intäkter' },
    { nyckel: 'hyra_ovrigt',    etikett: 'Övriga hyresintäkter',             grupp: 'Intäkter' },
    { nyckel: 'loneokning',     etikett: 'Löneökning',                       grupp: 'Personal',
      harled: { drivare: 'fastighetskostn' },
      hjalp: 'Driver personaldelen i både fastighetskostnader och central administration.' },
    { nyckel: 'entreprenad',    etikett: 'Entreprenader och material',       grupp: 'Fastighetskostnader',
      harled: { drivare: 'fastighetskostn' } },
    { nyckel: 'forsakring',     etikett: 'Försäkringar',                     grupp: 'Fastighetskostnader',
      harled: { drivare: 'fastighetskostn' } },
    { nyckel: 'vinter',         etikett: 'Vinterkostnader',                  grupp: 'Fastighetskostnader',
      harled: { drivare: 'fastighetskostn' } },
    { nyckel: 'internkredit',   etikett: 'Internkrediterade arbeten',        grupp: 'Fastighetskostnader',
      harled: { drivare: 'fastighetskostn' },
      hjalp: 'Kredit för eget arbete som aktiveras på investeringsprojekt. Följer investeringsvolymen, inte inflationen.' },
    { nyckel: 'fastighet_ovrigt', etikett: 'Övriga fastighetskostnader',     grupp: 'Fastighetskostnader',
      harled: { drivare: 'fastighetskostn' } },
    { nyckel: 'fastighetskostn', etikett: 'Grundtakt fastighetskostnader',   grupp: 'Fastighetskostnader',
      hjalp: 'Arbetsbokens egen sats. Sätter blockets underliggande takt innan komponenterna avviker.' },
    { nyckel: 'el',             etikett: 'El',                               grupp: 'Taxor och media' },
    { nyckel: 'varme',          etikett: 'Värme',                            grupp: 'Taxor och media' },
    { nyckel: 'vatten',         etikett: 'Vatten',                           grupp: 'Taxor och media' },
    { nyckel: 'sophamtning',    etikett: 'Sophämtning',                      grupp: 'Taxor och media' },
    { nyckel: 'fastighetsskatt', etikett: 'Fastighetsskatt',                 grupp: 'Taxor och media',
      harled: { rad: 'fastighetsskatt' },
      hjalp: 'Indexeras normalt med inkomstbasbeloppet och hoppar vid omtaxering.' },
    { nyckel: 'underhall',      etikett: 'Underhållskostnader (resultatförda)', grupp: 'Kostnader',
      harled: { rad: 'underhallskostnader' } },
    { nyckel: 'it',             etikett: 'IT och databehandling',            grupp: 'Kostnader',
      harled: { rad: 'databehandling' } },
    { nyckel: 'administration', etikett: 'Administration, övrigt',           grupp: 'Kostnader' },
    { nyckel: 'ovrig_adm',      etikett: 'Central administration, icke-personal', grupp: 'Kostnader' },
    { nyckel: 'allman',         etikett: 'Allmän framskrivning (övriga poster)', grupp: 'Övrigt' }
  ];

  // Fastighetskostnaderna (rad 18) finns bara som en totalsumma i planen.
  // Här delas de upp i komponenter med var sin drivare. Andelarna kommer från
  // ändamålens utfall och kan justeras i appen.
  var FK_KOMPONENTER = [
    { nyckel: 'fk_personal',     etikett: 'Personalkostnader',          drivare: 'loneokning',
      andamal: ['311', '321'] },
    { nyckel: 'fk_entreprenad',  etikett: 'Entreprenader och material', drivare: 'entreprenad',
      andamal: ['312', '313', '315', '316', '317', '318'] },
    { nyckel: 'fk_forsakring',   etikett: 'Försäkringar',               drivare: 'forsakring',
      andamal: ['314'] },
    { nyckel: 'fk_vinter',       etikett: 'Vinterkostnader',            drivare: 'vinter',
      andamal: ['351'] },
    { nyckel: 'fk_internkredit', etikett: 'Internkrediterade arbeten',  drivare: 'internkredit',
      andamal: ['199'] },
    { nyckel: 'fk_ovrigt',       etikett: 'Övriga fastighetskostnader', drivare: 'fastighet_ovrigt',
      andamal: ['322', '371', '372', '373', '376', '377', '378', '379'] }
  ];

  // Ändamål 619 är en samlingspost där personalen inte är utbruten i
  // arbetsboken. Andelen är ett antagande som sätts i appen.
  var ADM_KOMPONENTER = [
    { nyckel: 'adm_personal', etikett: 'Personal, central administration', drivare: 'loneokning' },
    { nyckel: 'adm_ovrigt',   etikett: 'Övrig central administration',     drivare: 'ovrig_adm' }
  ];

  // Resultatrad -> drivare.  'noll' = hålls oförändrad vid framskrivning.
  var RAD_DRIVARE = {
    bostader_brutto: 'hyra_bostader',
    bostader_bortfall_pr: 'noll',
    bostader_bortfall: 'hyra_bostader',
    lokaler_brutto: 'hyra_lokaler',
    lokaler_bortfall: 'hyra_lokaler',
    garage_brutto: 'hyra_garage',
    garage_bortfall: 'hyra_garage',
    rabatter: 'hyra_bostader',
    debiterad_energi: 'allman',
    ersattningar_hg: 'hyra_ovrigt',
    ovriga_intakter: 'allman',
    fastighetskostnader: 'fastighetskostn',
    el: 'el',
    varme: 'varme',
    vatten: 'vatten',
    sophamtning: 'sophamtning',
    kabeltv: 'allman',
    hlu: 'underhall',
    periodiskt_uh: 'underhall',
    periodiskt_uh_ospec: 'underhall',
    fastighetsskatt: 'fastighetsskatt',
    marknadsforing: 'administration',
    databehandling: 'it',
    avskr_maskiner: 'administration',
    ovrig_adm: 'ovrig_adm',
    hyresforluster: 'hyra_bostader',
    kundforluster: 'hyra_bostader',
    atervunna: 'allman',
    realisationsresultat: 'noll',
    ovriga_rorelsekostn: 'noll',
    intressefortag: 'noll',
    omsattningstillg: 'noll'
  };

  // Resultaträkningens uppbyggnad. barn = poster som summerar till raden.
  var RR_STRUKTUR = [
    { nyckel: 'nettoomsattning', barn: ['bostader_brutto', 'bostader_bortfall_pr', 'bostader_bortfall',
        'lokaler_brutto', 'lokaler_bortfall', 'garage_brutto', 'garage_bortfall', 'rabatter',
        'debiterad_energi', 'ersattningar_hg', 'ovriga_intakter'] },
    { nyckel: 'fastighetskostnader', barn: [] },
    { nyckel: 'driftkostnader', barn: ['el', 'varme', 'vatten', 'sophamtning', 'kabeltv'] },
    { nyckel: 'underhallskostnader', barn: ['hlu', 'periodiskt_uh', 'periodiskt_uh_ospec'] },
    { nyckel: 'fastighetsskatt', barn: [] },
    { nyckel: 'avskrivningar', barn: [], berakn: true },
    { nyckel: 'administration', barn: ['marknadsforing', 'databehandling', 'avskr_maskiner',
        'ovrig_adm', 'hyresforluster', 'kundforluster', 'atervunna', 'realisationsresultat',
        'ovriga_rorelsekostn'] },
    { nyckel: 'rantekostnader', barn: [], berakn: true }
  ];

  // Block som en prognos rapporteras på. En inläst prognos sätter en faktor per
  // block och år; faktorn multiplicerar blockets alla rader så att detaljernas
  // inbördes proportioner behålls.
  var BLOCK = [
    { nyckel: 'b_intakter', etikett: 'Nettoomsättning',
      rader: ['bostader_brutto', 'bostader_bortfall_pr', 'bostader_bortfall', 'lokaler_brutto',
              'lokaler_bortfall', 'garage_brutto', 'garage_bortfall', 'rabatter',
              'debiterad_energi', 'ersattningar_hg', 'ovriga_intakter'] },
    { nyckel: 'b_drift', etikett: 'Fastighets- och driftkostnader',
      rader: ['fastighetskostnader', 'el', 'varme', 'vatten', 'sophamtning', 'kabeltv'] },
    { nyckel: 'b_underhall', etikett: 'Underhållskostnader',
      rader: ['hlu', 'periodiskt_uh', 'periodiskt_uh_ospec'] },
    { nyckel: 'b_skatt', etikett: 'Fastighetsskatt', rader: ['fastighetsskatt'] },
    { nyckel: 'b_avskrivningar', etikett: 'Avskrivningar på fastigheter', berakn: true },
    { nyckel: 'b_administration', etikett: 'Administration och försäljning',
      rader: ['marknadsforing', 'databehandling', 'avskr_maskiner', 'ovrig_adm', 'hyresforluster',
              'kundforluster', 'atervunna', 'realisationsresultat', 'ovriga_rorelsekostn'] },
    { nyckel: 'b_ranta', etikett: 'Räntekostnader', berakn: true }
  ];
  var RAD_BLOCK = {};
  BLOCK.forEach(function (b) {
    (b.rader || []).forEach(function (r) { RAD_BLOCK[r] = b.nyckel; });
  });

  var ETIKETT = {};
  (U.rr || []).forEach(function (r) { ETIKETT[r.nyckel] = r.etikett; });
  ETIKETT.nyprod_hyra = 'Hyresintäkter, ny nyproduktion';
  ETIKETT.nyprod_drift = 'Driftkostnader, ny nyproduktion';
  FK_KOMPONENTER.forEach(function (k) { ETIKETT[k.nyckel] = k.etikett; });
  ADM_KOMPONENTER.forEach(function (k) { ETIKETT[k.nyckel] = k.etikett; });

  // ---------------------------------------------------------------- hjälpare
  function kopia(o) { return JSON.parse(JSON.stringify(o)); }

  // Gör om {"2026":x,...} till ett komplett objekt över alla år.
  // Utan sistaKant hålls sista kända värdet; med sistaKant används det för alla
  // luckor. Projektens spend ska bli noll efter specens sista år, inte upprepas.
  function serie(varden, sistaKant) {
    var ut = {}, senast = 0;
    AR.forEach(function (y) {
      var v = varden ? varden[String(y)] : undefined;
      if (v === undefined || v === null) v = (sistaKant === undefined ? senast : sistaKant);
      ut[y] = v;
      senast = v;
    });
    return ut;
  }

  function radBas(nyckel) {
    var r = null;
    (U.rr || []).forEach(function (x) { if (x.nyckel === nyckel) r = x; });
    return r ? r.varden : {};
  }

  // ---------------------------------------------------------------- basdrivare
  // Arbetsbokens angivna satser. Luckor i början fylls bakåt från första kända
  // värdet; år efter 2030 håller 2030 års sats.
  var _basDrivare = null;
  function basDrivare() {
    if (_basDrivare) return _basDrivare;
    var ut = {};
    DRIVARE.forEach(function (d) {
      var kalla = (U.drivare[d.nyckel] || {}).varden || {};
      var harledd = {};
      // Drivare som arbetsboken inte har en egen sats för: härled takten ur
      // den resultatrad den styr, så att basplanen blir oförändrad.
      if (d.harled && d.harled.rad) {
        var rv = radBas(d.harled.rad);
        for (var y = BAS_AR + 1; y <= BAS_SISTA; y++) {
          if (rv[String(y)] && rv[String(y - 1)]) harledd[y] = rv[String(y)] / rv[String(y - 1)] - 1;
        }
      }
      var v = {};
      AR.forEach(function (y) {
        var x = kalla[String(y)];
        if (x === undefined || x === null) x = harledd[y];
        v[y] = (typeof x === 'number' && isFinite(x)) ? x : null;
      });
      // fyll framåt (håll senast kända — gäller 2031-2033)
      var senast = null;
      AR.forEach(function (y) { if (v[y] === null) v[y] = senast; else senast = v[y]; });
      // fyll bakåt (första åren där arbetsboken saknar sats)
      var forsta = null;
      for (var i = AR.length - 1; i >= 0; i--) {
        if (v[AR[i]] === null) v[AR[i]] = forsta; else forsta = v[AR[i]];
      }
      AR.forEach(function (y) {
        if (typeof v[y] !== 'number' || !isFinite(v[y])) v[y] = (d.nyckel === 'allman' ? 0.02 : 0);
      });
      ut[d.nyckel] = v;
    });
    // Komponentdrivare utan egen sats ärver blockets grundtakt, så att
    // uppdelningen i sig inte ändrar basplanen.
    DRIVARE.forEach(function (d) {
      if (!d.harled || !d.harled.drivare) return;
      var kalla = (U.drivare[d.nyckel] || {}).varden || {};
      if (Object.keys(kalla).length) return;
      ut[d.nyckel] = kopia(ut[d.harled.drivare]);
    });
    ut.noll = {};
    AR.forEach(function (y) { ut.noll[y] = 0; });
    _basDrivare = ut;
    return ut;
  }

  // Andelarna per komponent, härledda ur ändamålens utfall.
  function komponentandelar() {
    var ut = {};
    var f = (U.andamal && U.andamal.fastighet) ? U.andamal.fastighet.poster : [];
    var idx = {};
    f.forEach(function (p) { if (p.nr) idx[p.nr] = p.andel_2025 || 0; });
    var summa = 0;
    FK_KOMPONENTER.forEach(function (k) {
      var a = 0;
      k.andamal.forEach(function (nr) { a += idx[nr] || 0; });
      ut[k.nyckel] = a;
      summa += a;
    });
    // normera så att komponenterna alltid summerar till hela blocket
    if (summa) FK_KOMPONENTER.forEach(function (k) { ut[k.nyckel] = ut[k.nyckel] / summa; });
    return ut;
  }

  // ---------------------------------------------------------------- projektregister
  function byggProjekt() {
    var delc = (U.avskrivning.projekt || []);
    var spec = (U.investeringar.projekt || []);
    var satsFor = function (kat) {
      var s = U.avskrivning.satser;
      if (!kat) return s.nyprod_bostader;
      var k = String(kat).toLowerCase();
      if (k.indexOf('mark') === 0) return s.mark;
      if (k.indexOf('lokal') === 0) return s.nyprod_lokaler;
      return s.nyprod_bostader;
    };

    var projekt = [], anvand = {};

    // Alla projekt i investeringsspecen tas med — både nyproduktion och
    // om-/tillbyggnad. Om-/tillbyggnadsprojekten står för merparten av
    // spendet 2028-2030 och måste synas rad för rad.
    spec.forEach(function (p, i) {
      var d = null;
      delc.forEach(function (x) { if (x.projektnr && p.projektnr && x.projektnr === p.projektnr) d = x; });
      if (d) anvand[d.projektnr] = true;
      projekt.push({
        id: 'p' + i,
        namn: p.namn,
        projektnr: p.projektnr || null,
        typ: p.typ,
        grupp: p.grupp,
        kategori: d ? (d.kategori || 'Bostäder') : (p.typ === 'Om- o tillbyggn' ? 'Ombyggnad' : 'Bostäder'),
        aktiv: true,
        kalla: 'excel',
        spend: serie(p.spend, 0),
        ib_varde: p.ib_varde || 0,
        aktiverbart: d ? (d.total_kalkyl || 0) : 0,
        aktiveringsar: d ? (d.aktiveringsar || null) : null,
        sats: d ? (d.sats || satsFor(d.kategori)) : satsFor(null),
        iAvskrModell: !!d,
        hyra: null,
        kommentar: p.kommentar || ''
      });
    });

    // Del C-projekt utan motsvarighet i investeringsspecen — tas med så att
    // avskrivningstrappan blir identisk med arbetsboken.
    delc.forEach(function (d, i) {
      if (!d.total_kalkyl || anvand[d.projektnr]) return;
      projekt.push({
        id: 'd' + i,
        namn: d.namn,
        projektnr: d.projektnr || null,
        typ: 'Nyinvest',
        grupp: 'nyproduktion',
        kategori: d.kategori || 'Bostäder',
        aktiv: true,
        kalla: 'excel',
        spend: serie({}, 0),
        ib_varde: d.upparbetat || 0,
        aktiverbart: d.total_kalkyl,
        aktiveringsar: d.aktiveringsar,
        sats: d.sats || satsFor(d.kategori),
        iAvskrModell: true,
        hyra: null,
        kommentar: 'Finns i avskrivningsmodellen men inte i investeringsspecen.'
      });
    });

    return projekt;
  }

  // ---------------------------------------------------------------- basindata
  function basIndata() {
    var f = U.finans, a = U.avskrivning;
    var ind = {
      drivare: basDrivare(),
      blockjustering: {},          // block -> år -> faktor, från inläst prognos
      prognoskalla: null,          // {namn, ar, kalla, uttagen} när en prognos lästs in
      komponenter: komponentandelar(),
      // Andel av ändamål 619 som är personalkostnad. Arbetsboken bryter inte ut
      // den, så detta är ett antagande som ska stämmas av mot lönesystemet.
      personalandel_adm: 0.55,
      satser: {
        underhall: a.satser.underhall,
        utfasning: a.satser.utfasning,
        nyprod_bostader: a.satser.nyprod_bostader,
        nyprod_lokaler: a.satser.nyprod_lokaler,
        mark: a.satser.mark
      },
      // Behålls som referens: budgetarbetsbokens egen underhållsinvestering.
      // Volymen som styr modellen kommer numera ur investeringsspecen.
      underhall_invest_referens: serie(a.underhallsinvestering),
      ranta: {
        bana: serie(f.ranta.varden),
        uppgang: 0,
        uppgang_fran: 2027,
        genomslag: 'bindning',
        bindningstid: serie(f.bindningstid.varden),
        rorlig: serie(f.rorlig_exponering.varden),
        // ränteuppgång som redan ligger i basplanen (arbetsboken antar +0,25 pp 2026)
        bas_uppgang: serie(f.antagen_ranteuppgang.varden, 0),
        borgensavgift: null   // sätts nedan
      },
      projekt: byggProjekt(),
      // Investeringsvolym för år som investeringsspecen inte täcker.
      ovrig_volym: (function () {
        var v = {}, sista = 0;
        AR.forEach(function (y) {
          var s = U.investeringar.summa[String(y)];
          if (typeof s === 'number') { v[y] = 0; sista = s; }
          else v[y] = Math.round(sista / 5000) * 5000 || 750000;
        });
        return v;
      })(),
      koncernbidrag: serie(U.investeringar.koncernbidrag),
      forsaljning: serie({}, 0),
      // Vad skuldbanan ska följa:
      //   'kassaflode'    — räknas ur kassaflödet, som bolagets flik Fin behov
      //   'finansrapport' — tvingas till budgetarbetsbokens angivna skuldnivåer
      skuldkalla: 'kassaflode',
      skuld_ib: 2 * f.skuld_snitt.varden['2026'] - f.skuld_ub.varden['2026'],
      skuld_justering: {},
      ovrigt_kassaflode: {}
    };
    AR.forEach(function (y) { ind.ovrigt_kassaflode[y] = 0; ind.skuld_justering[y] = 0; });

    // Borgensavgift som andel av snittskuld (konstant i arbetsboken).
    var bs = f.borgensavgift.varden, ss = f.skuld_snitt.varden, sum = 0, n = 0;
    Object.keys(bs).forEach(function (k) {
      if (ss[k]) { sum += bs[k] / ss[k]; n++; }
    });
    ind.ranta.borgensavgift = n ? sum / n : 0.003;

    return ind;
  }

  // Tvingar skuldbanan till budgetarbetsbokens angivna nivåer. Används bara när
  // skuldkalla === 'finansrapport'. Ingående låneskuld sätts så att
  // avstämningsposten för basåret hamnar i nivå med övriga år.
  function kalibreraMotFinansrapport(ind) {
    for (var pass = 0; pass < 8; pass++) {
      sattSkuldJustering(ind);
      AR.forEach(function (y) { ind.ovrigt_kassaflode[y] = 0; });
      kalibrera(ind);
      var m = medelResidual(ind), diff = ind.ovrigt_kassaflode[BAS_AR] - m;
      if (Math.abs(diff) < 1) break;
      ind.skuld_ib += diff;
    }
    AR.forEach(function (y) { if (y > BAS_SISTA) ind.ovrigt_kassaflode[y] = medelResidual(ind); });
    return ind;
  }

  function medelResidual(ind) {
    var sum = 0, n = 0;
    AR.forEach(function (y) {
      if (y > BAS_AR && y <= BAS_SISTA) { sum += ind.ovrigt_kassaflode[y]; n++; }
    });
    return n ? sum / n : 0;
  }

  // Arbetsbokens snittskuld är inte exakt (IB+UB)/2 — differensen läggs som
  // justering så att räntekostnaden i basplanen blir identisk.
  function sattSkuldJustering(ind) {
    var ub = U.finans.skuld_ub.varden, ss = U.finans.skuld_snitt.varden;
    AR.forEach(function (y) {
      var ing = (y === BAS_AR) ? ind.skuld_ib : ub[String(y - 1)];
      ind.skuld_justering[y] = (y <= BAS_SISTA && ss[String(y)] && ub[String(y)])
        ? ss[String(y)] - (ing + ub[String(y)]) / 2 : 0;
    });
  }

  // Kalibrerar avstämningsposten så att basplanens skuldbana möter
  // finansrapportens angivna nivåer 2026-2030. Iterativt, eftersom skulden
  // påverkar räntan som påverkar resultatet som påverkar skulden.
  function kalibrera(ind) {
    var ub = U.finans.skuld_ub.varden;
    for (var i = 0; i < 15; i++) {
      var r = berakna(ind), storst = 0;
      AR.forEach(function (y) {
        if (y > BAS_SISTA || !ub[String(y)]) return;
        var d = ub[String(y)] - r.skuld[y].ut;
        ind.ovrigt_kassaflode[y] += d;
        storst = Math.max(storst, Math.abs(d));
      });
      if (storst < 0.005) break;
    }
    return ind;
  }

  // ---------------------------------------------------------------- framskriven bas
  var _basRader = null;
  function basRader() {
    if (_basRader) return _basRader;
    var bd = basDrivare(), ut = {};
    Object.keys(RAD_DRIVARE).forEach(function (nyckel) {
      var kalla = radBas(nyckel), drv = RAD_DRIVARE[nyckel], v = {};
      AR.forEach(function (y) {
        if (y <= BAS_SISTA) {
          v[y] = kalla[String(y)] || 0;
        } else {
          var r = (drv === 'noll') ? 0 : bd[drv][y];
          v[y] = v[y - 1] * (1 + r);
        }
      });
      ut[nyckel] = v;
    });
    _basRader = ut;
    return ut;
  }

  // ---------------------------------------------------------------- avskrivningar
  function avskrivningstrappa(ind, inv) {
    var a = U.avskrivning;
    var ing = a.ing_planenlig, basar = a.basar;
    var ut = {};
    // Underhållsinvesteringen som ger nya avskrivningslager är samma volym som
    // går in i investeringsbeloppet — annars spretar de två isär.
    var uhVolym = {};
    AR.forEach(function (y) { uhVolym[y] = inv ? inv[y].underhall : 0; });

    AR.forEach(function (y) {
      if (y <= 2026) {
        // 2026 är låst i arbetsboken (manuell post).
        ut[y] = { bas: radBas('avskrivningar')['2026'] || 0, utfasning: 0,
                  underhall: 0, nyproduktion: 0, total: radBas('avskrivningar')['2026'] || 0 };
        return;
      }
      var bas = -ing;
      var utfasning = Math.min(ing, ing * ind.satser.utfasning * (y - basar + 0.5));

      // ej aktiverat underhåll per rapportdatum — full avskrivning från 2027
      var underhall = -(a.ej_aktiverat_2026 || 0) * ind.satser.underhall;

      // ett lager per investeringsår, halvårskonvention
      for (var Y = 2027; Y <= y; Y++) {
        var belopp = uhVolym[Y] || 0;
        underhall += -belopp * ind.satser.underhall * (Y === y ? 0.5 : 1);
      }

      var nyprod = 0;
      ind.projekt.forEach(function (p) {
        // Om-/tillbyggnadsprojekten ingår redan i underhållsvolymen ovan och
        // får inte dessutom bära ett eget lager.
        if (p.grupp === 'underhall') return;
        if (!p.aktiv || !p.aktiveringsar || !p.aktiverbart) return;
        if (y < p.aktiveringsar) return;
        nyprod += -p.aktiverbart * (p.sats || 0) * (y === p.aktiveringsar ? 0.5 : 1);
      });

      ut[y] = { bas: bas, utfasning: utfasning, underhall: underhall,
                nyproduktion: nyprod, total: bas + utfasning + underhall + nyprod };
    });
    return ut;
  }

  // ---------------------------------------------------------------- investeringar
  // Projektlistan ur investeringsspecen styr de år den täcker. Därutöver
  // läggs en antagen volym för åren bortom specen.
  function investeringar(ind) {
    var ut = {};
    AR.forEach(function (y) {
      var ny = 0, uh = 0;
      ind.projekt.forEach(function (p) {
        if (!p.aktiv) return;
        var v = p.spend[y] || 0;
        if (p.grupp === 'underhall') uh += v; else ny += v;
      });
      uh += (ind.ovrig_volym && ind.ovrig_volym[y]) || 0;
      ut[y] = { underhall: uh, nyproduktion: ny, total: uh + ny };
    });
    return ut;
  }

  // ---------------------------------------------------------------- nyproduktionens driftnetto
  function nyproduktionHyra(ind) {
    var ut = {};
    AR.forEach(function (y) { ut[y] = { hyra: 0, drift: 0 }; });
    ind.projekt.forEach(function (p) {
      if (!p.aktiv || !p.hyra || !p.aktiveringsar) return;
      AR.forEach(function (y) {
        if (y < p.aktiveringsar) return;
        var andel = (y === p.aktiveringsar) ? 0.5 : 1;
        var vakans = (y === p.aktiveringsar || y === p.aktiveringsar + 1) ? (p.hyra.vakans || 0) : 0;
        ut[y].hyra += (p.hyra.arshyra || 0) * andel * (1 - vakans);
        ut[y].drift += -(p.hyra.driftkostnad || 0) * andel;
      });
    });
    return ut;
  }

  // ---------------------------------------------------------------- räntegenomslag
  function genomslag(ind, y) {
    if (!ind.ranta.uppgang) return 0;
    var fran = ind.ranta.uppgang_fran || BAS_AR;
    if (y < fran) return 0;
    var f = ind.ranta.rorlig[y] || 0;
    if (ind.ranta.genomslag === 'direkt') return 1;
    if (ind.ranta.genomslag === 'rorlig') return f;
    var d = ind.ranta.bindningstid[y] || 3;
    var k = y - fran + 1;
    return Math.min(1, f + (1 - f) * Math.min(1, k / d));
  }

  // ---------------------------------------------------------------- huvudberäkning
  function berakna(ind) {
    var bas = basRader();
    var bd = basDrivare();

    // 1) kvotfaktor per drivare
    var faktor = {};
    Object.keys(bd).forEach(function (d) {
      var f = {}, lop = 1;
      AR.forEach(function (y) {
        var rb = bd[d][y] || 0;
        var rs = (d === 'noll') ? 0 : (ind.drivare[d] ? ind.drivare[d][y] : rb);
        if (rs === undefined || rs === null || !isFinite(rs)) rs = rb;
        lop *= (1 + rs) / (1 + rb);
        f[y] = lop;
      });
      faktor[d] = f;
    });

    // Faktor från en inläst prognos: 1 om blocket inte är justerat.
    var bj = ind.blockjustering || {};
    function blockFaktor(blocknyckel, y) {
      var b = bj[blocknyckel];
      var v = b ? b[y] : undefined;
      return (typeof v === 'number' && isFinite(v) && v > 0) ? v : 1;
    }

    // 2) poster
    var rad = {};
    Object.keys(RAD_DRIVARE).forEach(function (nyckel) {
      var d = RAD_DRIVARE[nyckel], bl = RAD_BLOCK[nyckel], v = {};
      AR.forEach(function (y) {
        v[y] = bas[nyckel][y] * (faktor[d] ? faktor[d][y] : 1) * (bl ? blockFaktor(bl, y) : 1);
      });
      rad[nyckel] = v;
    });

    // 2b) Fastighetskostnaderna delas i komponenter med var sin drivare.
    //     Varje komponent är sin andel av arbetsbokens totalbelopp, justerad med
    //     sin egen drivare. Med basplanens satser är faktorerna 1 och summan
    //     blir därför exakt arbetsbokens total.
    var fkBas = bas.fastighetskostnader;
    AR.forEach(function (y) { rad.fastighetskostnader[y] = 0; });
    FK_KOMPONENTER.forEach(function (k) {
      var andel = ind.komponenter ? (ind.komponenter[k.nyckel] || 0) : 0;
      var f = faktor[k.drivare] || faktor.fastighetskostn;
      var v = {};
      AR.forEach(function (y) {
        v[y] = fkBas[y] * andel * f[y] * blockFaktor('b_drift', y);
        rad.fastighetskostnader[y] += v[y];
      });
      rad[k.nyckel] = v;
    });

    // 2c) Central administration: personaldelen av ändamål 619 bryts ut.
    var admBas = bas.ovrig_adm, andelP = ind.personalandel_adm || 0;
    rad.adm_personal = {}; rad.adm_ovrigt = {}; rad.ovrig_adm = {};
    AR.forEach(function (y) {
      var ba = blockFaktor('b_administration', y);
      rad.adm_personal[y] = admBas[y] * andelP * faktor.loneokning[y] * ba;
      rad.adm_ovrigt[y] = admBas[y] * (1 - andelP) * faktor.ovrig_adm[y] * ba;
      rad.ovrig_adm[y] = rad.adm_personal[y] + rad.adm_ovrigt[y];
    });

    // 3) avskrivningar, investeringar, nyproduktionens driftnetto
    var inv = investeringar(ind);
    var avskr = avskrivningstrappa(ind, inv);
    var nyprod = nyproduktionHyra(ind);
    rad.avskrivningar = {}; rad.nyprod_hyra = {}; rad.nyprod_drift = {};
    AR.forEach(function (y) {
      rad.avskrivningar[y] = avskr[y].total * blockFaktor('b_avskrivningar', y);
      rad.nyprod_hyra[y] = nyprod[y].hyra;
      rad.nyprod_drift[y] = nyprod[y].drift;
    });

    // 4) delsummor fram till rörelseresultat
    function summa(barn, y) {
      var s = 0;
      barn.forEach(function (b) { s += rad[b][y] || 0; });
      return s;
    }
    rad.nettoomsattning = {}; rad.driftkostnader = {}; rad.underhallskostnader = {};
    rad.administration = {}; rad.bruttoresultat = {}; rad.rorelseresultat = {};
    AR.forEach(function (y) {
      rad.nettoomsattning[y] = summa(RR_STRUKTUR[0].barn, y) + rad.nyprod_hyra[y];
      rad.driftkostnader[y] = summa(RR_STRUKTUR[2].barn, y) + rad.nyprod_drift[y];
      rad.underhallskostnader[y] = summa(RR_STRUKTUR[3].barn, y);
      rad.administration[y] = summa(RR_STRUKTUR[6].barn, y);
      rad.bruttoresultat[y] = rad.nettoomsattning[y] + rad.fastighetskostnader[y]
        + rad.driftkostnader[y] + rad.underhallskostnader[y]
        + rad.fastighetsskatt[y] + rad.avskrivningar[y];
      rad.rorelseresultat[y] = rad.bruttoresultat[y] + rad.administration[y];
    });

    // 5) skuld och ränta — löses iterativt per år (räntan beror på skulden
    //    som beror på resultatet som beror på räntan)
    var skuld = {}, ing = ind.skuld_ib;
    rad.rantekostnader = {}; rad.resultat_ef = {};
    AR.forEach(function (y) {
      var g = genomslag(ind, y);
      var basUpp = (ind.ranta.bas_uppgang[y] || 0) * (ind.ranta.rorlig[y] || 0);
      var scnUpp = (ind.ranta.uppgang || 0) * g;
      var just = ind.skuld_justering ? (ind.skuld_justering[y] || 0) : 0;
      var ut = ing, snitt = ing, grund = 0, risk = 0, borgen = 0, rk = 0, resultat = 0, kf = 0;
      var rf = blockFaktor('b_ranta', y);
      for (var i = 0; i < 25; i++) {
        snitt = (ing + ut) / 2 + just;
        grund = -snitt * (ind.ranta.bana[y] || 0) * rf;
        risk = -snitt * (basUpp + scnUpp) * rf;
        borgen = -snitt * ind.ranta.borgensavgift * rf;
        rk = grund + risk + borgen;
        resultat = rad.rorelseresultat[y] + rad.intressefortag[y] + rad.omsattningstillg[y] + rk;
        kf = resultat + (-rad.avskrivningar[y]) + (-rad.avskr_maskiner[y]);
        // Samma tecken som i fliken Fin behov: koncernbidrag och försäljningar
        // är inbetalningar och minskar lånebehovet.
        var nytt = ing + inv[y].total - kf - (ind.koncernbidrag[y] || 0)
                 - (ind.forsaljning[y] || 0) + (ind.ovrigt_kassaflode[y] || 0);
        if (Math.abs(nytt - ut) < 0.0005) { ut = nytt; break; }
        ut = nytt;
      }
      skuld[y] = { ing: ing, ut: ut, snitt: snitt, genomslag: g,
                   effektiv_ranta: (ind.ranta.bana[y] || 0) + basUpp + scnUpp,
                   grundranta: grund, ranterisk: risk, borgensavgift: borgen,
                   kassaflode_drift: kf, forandring: ut - ing };
      rad.rantekostnader[y] = rk;
      rad.resultat_ef[y] = resultat;
      ing = ut;
    });

    // 6) nyckeltal
    var nyckeltal = {};
    AR.forEach(function (y) {
      // Driftnetto = nettoomsättning minus fastighetsrelaterade kostnader,
      // före central administration och avskrivningar.
      var drniva = rad.nettoomsattning[y] + rad.fastighetskostnader[y] + rad.driftkostnader[y]
                 + rad.underhallskostnader[y] + rad.fastighetsskatt[y];
      // Räntetäckningsgrad enligt gängse definition: resultatet före
      // räntekostnader i förhållande till räntekostnaderna. Central
      // administration är alltså med, till skillnad från driftnettot.
      var rk = -rad.rantekostnader[y];
      var avskr = -(rad.avskrivningar[y] + rad.avskr_maskiner[y]);
      var res = rad.resultat_ef[y];
      nyckeltal[y] = {
        personalkostnad: -((rad.fk_personal[y] || 0) + (rad.adm_personal[y] || 0)),
        driftnetto: drniva,
        driftnetto_marginal: rad.nettoomsattning[y] ? drniva / rad.nettoomsattning[y] : 0,
        rantetackning: rk ? (res + rk) / rk : 0,
        rantetackning_exkl_avskr: rk ? (res + rk + avskr) / rk : 0,
        driftnetto_ranta: rk ? drniva / rk : 0,
        skuld_per_intakt: rad.nettoomsattning[y] ? skuld[y].ut / rad.nettoomsattning[y] : 0,
        kassaflode_efter_invest: skuld[y].kassaflode_drift - inv[y].total
      };
    });

    return { ar: AR, rad: rad, avskr: avskr, invest: inv, skuld: skuld,
             nyckeltal: nyckeltal, nyprod: nyprod };
  }

  // ---------------------------------------------------------------- bryggan
  // Delar upp skillnaden mellan två utfall i förklarande komponenter.
  function brygga(basUt, scnUt, y) {
    var poster = [
      { etikett: 'Hyres- och övriga intäkter', varde: scnUt.rad.nettoomsattning[y] - basUt.rad.nettoomsattning[y] },
      { etikett: 'Fastighets- och driftkostnader',
        varde: (scnUt.rad.fastighetskostnader[y] + scnUt.rad.driftkostnader[y])
             - (basUt.rad.fastighetskostnader[y] + basUt.rad.driftkostnader[y]) },
      { etikett: 'Underhåll och fastighetsskatt',
        varde: (scnUt.rad.underhallskostnader[y] + scnUt.rad.fastighetsskatt[y])
             - (basUt.rad.underhallskostnader[y] + basUt.rad.fastighetsskatt[y]) },
      { etikett: 'Avskrivningar', varde: scnUt.rad.avskrivningar[y] - basUt.rad.avskrivningar[y] },
      { etikett: 'Administration', varde: scnUt.rad.administration[y] - basUt.rad.administration[y] },
      { etikett: 'Räntekostnad, grundränta', varde: scnUt.skuld[y].grundranta - basUt.skuld[y].grundranta },
      { etikett: 'Räntekostnad, ränteuppgång', varde: scnUt.skuld[y].ranterisk - basUt.skuld[y].ranterisk },
      { etikett: 'Borgensavgift', varde: scnUt.skuld[y].borgensavgift - basUt.skuld[y].borgensavgift }
    ];
    // Bryggan ska stämma exakt: det som filtreras bort och eventuell rest
    // samlas i en Övrigt-post i stället för att försvinna.
    var facit = scnUt.rad.resultat_ef[y] - basUt.rad.resultat_ef[y];
    var grans = Math.max(60, Math.abs(facit) * 0.008);
    var ut = [], rest = facit;
    poster.forEach(function (p) {
      if (Math.abs(p.varde) >= grans) { ut.push(p); rest -= p.varde; }
    });
    if (Math.abs(rest) >= grans) ut.push({ etikett: 'Övrigt', varde: rest });
    return ut;
  }

  // ---------------------------------------------------------------- kombination
  // Scenarier lagras som fullständiga indatakopior. För att kunna lägga ihop
  // flera tas skillnaden mot basplanen fram och läggs på en i taget.
  function lika(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
    if (a === null || a === undefined) return b === null || b === undefined;
    return a === b;
  }

  function djupDiff(a, b, stig, ut, hoppaOver) {
    Object.keys(b || {}).forEach(function (k) {
      if (hoppaOver && hoppaOver[k] && !stig.length) return;
      var va = a ? a[k] : undefined, vb = b[k];
      if (vb && typeof vb === 'object' && !Array.isArray(vb)) {
        djupDiff(va || {}, vb, stig.concat(k), ut, hoppaOver);
      } else if (!lika(va, vb)) {
        ut.push({ stig: stig.concat(k), varde: vb });
      }
    });
    return ut;
  }

  function satt(obj, stig, varde) {
    var o = obj;
    for (var i = 0; i < stig.length - 1; i++) {
      if (o[stig[i]] === null || typeof o[stig[i]] !== 'object') o[stig[i]] = {};
      o = o[stig[i]];
    }
    o[stig[stig.length - 1]] = varde;
  }

  // Skillnaden mellan ett scenario och basplanen.
  function diffIndata(bas, scn) {
    var falt = djupDiff(bas, scn, [], [], { projekt: true });
    var basIdx = {};
    (bas.projekt || []).forEach(function (p) { basIdx[p.id] = p; });
    var scnIdx = {};
    var projekt = { lagg: [], andra: [], taBort: [] };
    (scn.projekt || []).forEach(function (p) {
      scnIdx[p.id] = true;
      var b = basIdx[p.id];
      if (!b) { projekt.lagg.push(kopia(p)); return; }
      var d = djupDiff(b, p, [], []);
      if (d.length) projekt.andra.push({ id: p.id, namn: p.namn, andringar: d });
    });
    (bas.projekt || []).forEach(function (p) {
      if (!scnIdx[p.id]) projekt.taBort.push({ id: p.id, namn: p.namn });
    });
    return { falt: falt, projekt: projekt };
  }

  function antalAndringar(d) {
    return d.falt.length + d.projekt.lagg.length + d.projekt.andra.length + d.projekt.taBort.length;
  }

  // Lägger ihop flera scenarier ovanpå basplanen. Rör två delar samma fält
  // vinner den sista, och krocken rapporteras tillbaka.
  function kombineraIndata(bas, delar) {
    var ind = kopia(bas), rort = {}, konflikter = [];

    function markera(nyckel, namn) {
      if (rort[nyckel] && rort[nyckel] !== namn) {
        konflikter.push({ falt: nyckel, forra: rort[nyckel], nya: namn });
      }
      rort[nyckel] = namn;
    }

    delar.forEach(function (s) {
      var d = diffIndata(bas, s.indata);
      d.falt.forEach(function (f) {
        markera(f.stig.join('.'), s.namn);
        satt(ind, f.stig, kopia(f.varde));
      });
      d.projekt.taBort.forEach(function (p) {
        markera('projekt.' + p.id, s.namn);
        ind.projekt = ind.projekt.filter(function (x) { return x.id !== p.id; });
      });
      d.projekt.lagg.forEach(function (p) {
        var finns = false;
        ind.projekt.forEach(function (x) { if (x.id === p.id) finns = true; });
        markera('projekt.' + p.id, s.namn);
        if (!finns) ind.projekt.push(kopia(p));
      });
      d.projekt.andra.forEach(function (a) {
        var mal = null;
        ind.projekt.forEach(function (x) { if (x.id === a.id) mal = x; });
        if (!mal) return;
        a.andringar.forEach(function (f) {
          markera('projekt.' + a.id + '.' + f.stig.join('.'), s.namn);
          satt(mal, f.stig, kopia(f.varde));
        });
      });
    });
    return { indata: ind, konflikter: konflikter };
  }

  // ---------------------------------------------------------------- publikt
  return {
    diffIndata: diffIndata, kombineraIndata: kombineraIndata, antalAndringar: antalAndringar,
    AR: FONSTER, ALLA_AR: AR, ARKIV: ARKIV, HORISONT: HORISONT,
    AR_FORSTA: ARSTART, AR_SISTA: AR_SISTA, BAS_AR: BAS_AR, BAS_SISTA: BAS_SISTA,
    DRIVARE: DRIVARE, RR_STRUKTUR: RR_STRUKTUR, RAD_DRIVARE: RAD_DRIVARE,
    FK_KOMPONENTER: FK_KOMPONENTER, ADM_KOMPONENTER: ADM_KOMPONENTER,
    BLOCK: BLOCK, RAD_BLOCK: RAD_BLOCK,
    komponentandelar: komponentandelar,
    ETIKETT: ETIKETT, underlag: U,
    basIndata: basIndata, basDrivare: basDrivare, basRader: basRader,
    kalibreraMotFinansrapport: kalibreraMotFinansrapport,
    berakna: berakna, brygga: brygga, genomslag: genomslag, kopia: kopia, serie: serie
  };
})();
