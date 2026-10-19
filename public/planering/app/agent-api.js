/* Ekonomisk planering — anropbart API för en språkmodell.
 *
 * Syftet är en enda regel: en agent som svarar på frågor om budgeten får
 * ALDRIG räkna själv. Den översätter frågan till ett scenario, anropar det här
 * API:et, och återger vad det svarar. Alla tal i ett svar ska kunna spåras till
 * ett anrop här — annars är de påhittade, och påhittade tal som ser rimliga ut
 * är det farligaste den här sortens verktyg kan producera.
 *
 * Varje svar bär med sig `antaganden`: den exakta scenariodefinition som gav
 * talen. Det gör svaret reproducerbart, vilket är ett krav om en styrelse ska
 * kunna fatta beslut på det.
 *
 * Fungerar både i webbläsaren (efter modell.js) och i Node:
 *     const API = require('./app/agent-api.js');
 */
(function (global) {
  'use strict';

  var M = global.Modell;
  if (!M && typeof require === 'function') {
    var fs = require('fs'), path = require('path');
    global.window = global;
    // Indirekt eval kör i global scope, så modulernas top-level var hamnar på
    // globalThis. Vanlig eval här inne skulle bli lokal och osynlig utåt.
    var geval = eval;
    geval(fs.readFileSync(path.join(__dirname, '..', 'data', 'underlag.js'), 'utf8') + '\n' +
          fs.readFileSync(path.join(__dirname, 'modell.js'), 'utf8'));
    M = global.Modell;
  }
  if (!M) throw new Error('agent-api.js kräver att modell.js är laddad först.');

  var AR = M.ALLA_AR;
  var TKR_PER_MNKR = 1000;

  function mnkr(v) { return v === null || v === undefined || !isFinite(v) ? null : Math.round(v / TKR_PER_MNKR * 10) / 10; }
  function pct(v, dec) { return v === null || v === undefined || !isFinite(v) ? null : Math.round(v * 100 * Math.pow(10, dec || 1)) / Math.pow(10, dec || 1); }
  function serie(f) { var u = {}; AR.forEach(function (y) { u[y] = f(y); }); return u; }

  // ---------------------------------------------------------------- scenario
  // Scenariot anges som ren JSON, i den form en språkmodell kan producera:
  //
  //   { namn: 'Ränta +1 pp',
  //     ranta:   { uppgang: 0.01, fran: 2027, genomslag: 'bindning' },
  //     drivare: { varme: { fran: 2027, varde: 0.09 } },
  //     projekt: { '1919005': { aktiv: false } },
  //     volym:   { fran: 2031, varde: 900 } }        // mnkr/år
  //
  // Okända nycklar avvisas hellre än ignoreras: en agent som stavar fel ska få
  // veta det, inte tyst få basplanen tillbaka och tro att den räknat något.
  function byggIndata(scenario) {
    var s = scenario || {};
    var fel = [];
    var kanda = { namn: 1, ranta: 1, drivare: 1, projekt: 1, volym: 1, skuldkalla: 1 };
    Object.keys(s).forEach(function (k) { if (!kanda[k]) fel.push('okänd nyckel "' + k + '"'); });

    var ind = M.kopia(M.basIndata());

    if (s.ranta) {
      Object.keys(s.ranta).forEach(function (k) {
        if (['uppgang', 'fran', 'genomslag'].indexOf(k) < 0) fel.push('okänd räntenyckel "' + k + '"');
      });
      if (s.ranta.uppgang !== undefined) {
        if (typeof s.ranta.uppgang !== 'number') fel.push('ranta.uppgang måste vara ett tal i decimalform (0,01 = 1 procentenhet)');
        else ind.ranta.uppgang = s.ranta.uppgang;
      }
      if (s.ranta.fran !== undefined) ind.ranta.uppgang_fran = s.ranta.fran;
      if (s.ranta.genomslag !== undefined) {
        if (['rorlig', 'bindning', 'direkt'].indexOf(s.ranta.genomslag) < 0) {
          fel.push('ranta.genomslag måste vara rorlig, bindning eller direkt');
        } else ind.ranta.genomslag = s.ranta.genomslag;
      }
    }

    if (s.drivare) {
      Object.keys(s.drivare).forEach(function (n) {
        if (!ind.drivare[n]) { fel.push('okänd drivare "' + n + '" — se kapabiliteter().drivare'); return; }
        var d = s.drivare[n], fran = d.fran || M.BAS_AR + 1;
        if (typeof d.varde !== 'number') { fel.push('drivare.' + n + '.varde måste vara ett tal i decimalform (0,03 = 3 %)'); return; }
        AR.forEach(function (y) { if (y >= fran) ind.drivare[n][y] = d.varde; });
      });
    }

    if (s.projekt) {
      var nr = {};
      ind.projekt.forEach(function (p) { if (p.projektnr) nr[p.projektnr] = p; });
      Object.keys(s.projekt).forEach(function (n) {
        var p = nr[n];
        if (!p) { fel.push('okänt projektnummer "' + n + '"'); return; }
        var v = s.projekt[n];
        if (v.aktiv !== undefined) p.aktiv = !!v.aktiv;
        if (v.utgift) {
          var fore = 0; AR.forEach(function (y) { fore += p.spend[y] || 0; });
          Object.keys(v.utgift).forEach(function (y) { p.spend[+y] = v.utgift[y] * TKR_PER_MNKR; });
          var efter = 0; AR.forEach(function (y) { efter += p.spend[y] || 0; });
          if (p.aktiveringsar) p.aktiverbart = Math.max(0, (p.aktiverbart || 0) + (efter - fore));
        }
      });
    }

    if (s.volym) {
      var vf = s.volym.fran || M.BAS_SISTA + 1;
      if (typeof s.volym.varde !== 'number') fel.push('volym.varde måste vara ett tal i mnkr per år');
      else AR.forEach(function (y) { if (y >= vf) ind.ovrig_volym[y] = s.volym.varde * TKR_PER_MNKR; });
    }

    if (s.skuldkalla) {
      if (['kassaflode', 'finansrapport'].indexOf(s.skuldkalla) < 0) fel.push('skuldkalla måste vara kassaflode eller finansrapport');
      else {
        ind.skuldkalla = s.skuldkalla;
        if (s.skuldkalla === 'finansrapport') M.kalibreraMotFinansrapport(ind);
      }
    }

    if (fel.length) {
      var e = new Error('Scenariot gick inte att tolka: ' + fel.join('; '));
      e.fel = fel;
      throw e;
    }
    return ind;
  }

  // Scenariot i klartext, så att svaret går att reproducera och granska.
  function antaganden(scenario) {
    var s = scenario || {}, ut = [];
    if (s.ranta && s.ranta.uppgang) {
      ut.push('Marknadsräntan ' + (s.ranta.uppgang > 0 ? '+' : '') + pct(s.ranta.uppgang, 2) +
        ' procentenheter från ' + (s.ranta.fran || M.BAS_AR + 1) +
        ' (genomslag: ' + (s.ranta.genomslag || 'bindning') + ')');
    }
    if (s.drivare) {
      Object.keys(s.drivare).forEach(function (n) {
        var etikett = n;
        M.DRIVARE.forEach(function (d) { if (d.nyckel === n) etikett = d.etikett; });
        ut.push(etikett + ' ' + pct(s.drivare[n].varde, 1) + ' % per år från ' +
          (s.drivare[n].fran || M.BAS_AR + 1));
      });
    }
    if (s.projekt) {
      Object.keys(s.projekt).forEach(function (n) {
        var v = s.projekt[n];
        ut.push('Projekt ' + n + (v.aktiv === false ? ' lyft ur planen' : v.aktiv === true ? ' med i planen' : ' med ändrad utgift'));
      });
    }
    if (s.volym) ut.push('Investeringsvolym ' + s.volym.varde + ' mnkr/år från ' + (s.volym.fran || M.BAS_SISTA + 1));
    if (s.skuldkalla) ut.push('Skuldbana: ' + s.skuldkalla);
    return ut.length ? ut : ['Basplanen oförändrad — styrelsebudgeten 2026–' + M.BAS_SISTA + ', framskriven därefter'];
  }

  function nyckeltal(r) {
    return {
      enhet: 'mnkr',
      resultat_efter_finansnetto: serie(function (y) { return mnkr(r.rad.resultat_ef[y]); }),
      driftnetto: serie(function (y) { return mnkr(r.nyckeltal[y].driftnetto); }),
      driftnettomarginal_pct: serie(function (y) { return pct(r.nyckeltal[y].driftnetto_marginal); }),
      rantetackningsgrad: serie(function (y) { return Math.round(r.nyckeltal[y].rantetackning * 100) / 100; }),
      laneskuld_ub: serie(function (y) { return mnkr(r.skuld[y].ut); }),
      rantekostnad: serie(function (y) { return mnkr(r.rad.rantekostnader[y]); }),
      effektiv_ranta_pct: serie(function (y) { return pct(r.skuld[y].effektiv_ranta, 2); }),
      investeringsvolym: serie(function (y) { return mnkr(r.invest[y].total); }),
      avskrivningar: serie(function (y) { return mnkr(r.rad.avskrivningar[y]); }),
      kassaflode_efter_investeringar: serie(function (y) { return mnkr(r.nyckeltal[y].kassaflode_efter_invest); })
    };
  }

  // ---------------------------------------------------------------- publikt
  var API = {

    /* Vad går att fråga om. En agent bör anropa detta först. */
    kapabiliteter: function () {
      return {
        beskrivning: 'Ekonomisk planeringsmodell för ett allmännyttigt bostadsbolag. Basplanen är ' +
          'styrelsebudgeten ' + M.BAS_AR + '–' + M.BAS_SISTA + ', avstämd mot arbetsboken, ' +
          'framskriven till ' + M.AR_SISTA + '. Alla belopp i svaren är mnkr.',
        ar: AR,
        planerade_ar: [M.BAS_AR, M.BAS_SISTA],
        drivare: M.DRIVARE.map(function (d) {
          return { nyckel: d.nyckel, etikett: d.etikett, grupp: d.grupp };
        }),
        projekt: M.basIndata().projekt.filter(function (p) { return p.projektnr; })
          .map(function (p) { return { projektnr: p.projektnr, namn: p.namn, grupp: p.grupp }; }),
        matt: Object.keys(nyckeltal(M.berakna(M.basIndata()))).filter(function (k) { return k !== 'enhet'; }),
        kand_avvikelse: 'Avskrivningarna ligger upp till 350 tkr från arbetsboken 2030 (0,07 % av posten). ' +
          'I standardläget räknas låneskulden ur kassaflödet, inte ur arbetsbokens angivna nivåer, ' +
          'så räntekostnad och resultat avviker det sista planåret.'
      };
    },

    /* Kör ett scenario och returnera nyckeltalen per år. */
    utfall: function (scenario) {
      var r = M.berakna(byggIndata(scenario));
      return { scenario: (scenario && scenario.namn) || 'Basplan',
               antaganden: antaganden(scenario), nyckeltal: nyckeltal(r) };
    },

    /* Skillnaden mellan två scenarier, mått för mått och år för år. */
    jamfor: function (a, b) {
      var ra = M.berakna(byggIndata(a)), rb = M.berakna(byggIndata(b));
      var na = nyckeltal(ra), nb = nyckeltal(rb), diff = {};
      Object.keys(na).forEach(function (k) {
        if (k === 'enhet') return;
        diff[k] = serie(function (y) {
          var x = na[k][y], z = nb[k][y];
          return (x === null || z === null) ? null : Math.round((z - x) * 100) / 100;
        });
      });
      return {
        fran: { scenario: (a && a.namn) || 'Basplan', antaganden: antaganden(a) },
        till: { scenario: (b && b.namn) || 'Basplan', antaganden: antaganden(b) },
        skillnad: diff,
        lasanvisning: 'Positiva tal betyder högre värde i "till" än i "fran". ' +
          'Kostnader är negativa tal, så en positiv skillnad på rantekostnad betyder lägre kostnad.'
      };
    },

    /* Vad förklarar skillnaden mellan två scenarier ett givet år. */
    forklara: function (a, b, ar) {
      var ra = M.berakna(byggIndata(a)), rb = M.berakna(byggIndata(b));
      var y = ar || M.BAS_AR + 2;
      var delar = M.brygga(ra, rb, y).map(function (p) {
        return { post: p.etikett, effekt_mnkr: mnkr(p.varde) };
      });
      return {
        ar: y,
        fran_mnkr: mnkr(ra.rad.resultat_ef[y]),
        till_mnkr: mnkr(rb.rad.resultat_ef[y]),
        skillnad_mnkr: mnkr(rb.rad.resultat_ef[y] - ra.rad.resultat_ef[y]),
        delar: delar,
        antaganden: { fran: antaganden(a), till: antaganden(b) }
      };
    },

    /* Hur känsligt är resultatet för ett antagande. Kör en serie scenarier. */
    kanslighet: function (basScenario, parameter, varden, ar) {
      var y = ar || M.BAS_AR + 2;
      var ut = varden.map(function (v) {
        var s = JSON.parse(JSON.stringify(basScenario || {}));
        if (parameter === 'ranta') { s.ranta = s.ranta || {}; s.ranta.uppgang = v; }
        else if (parameter === 'volym') { s.volym = s.volym || {}; s.volym.varde = v; }
        else { s.drivare = s.drivare || {}; s.drivare[parameter] = { varde: v, fran: (s.drivare[parameter] || {}).fran }; }
        var r = M.berakna(byggIndata(s));
        return { varde: v, resultat_mnkr: mnkr(r.rad.resultat_ef[y]),
                 laneskuld_mnkr: mnkr(r.skuld[y].ut),
                 rantetackning: Math.round(r.nyckeltal[y].rantetackning * 100) / 100 };
      });
      return { parameter: parameter, ar: y, punkter: ut };
    },

    /* Vilket värde på en parameter krävs för att nå ett mål? Söker med halvering. */
    grans: function (basScenario, parameter, matt, mal, ar, intervall) {
      var y = ar || M.BAS_AR + 2;
      // Standardintervallet söker UPPÅT från oförändrat läge. Räntetäckningen
      // är inte monoton över negativa räntor — när räntekostnaden närmar sig
      // noll slår kvoten runt — så ett intervall som spänner över nollan kan
      // ge två rötter eller ingen alls, och svaret blir meningslöst.
      var standard = { ranta: [0, 0.05], volym: [0, 2000] };
      var d = standard[parameter] || [0, 0.10];
      var lo = (intervall && intervall[0] !== undefined) ? intervall[0] : d[0];
      var hi = (intervall && intervall[1] !== undefined) ? intervall[1] : d[1];
      function vardeVid(v) {
        var s = JSON.parse(JSON.stringify(basScenario || {}));
        if (parameter === 'ranta') { s.ranta = s.ranta || {}; s.ranta.uppgang = v; }
        else if (parameter === 'volym') { s.volym = s.volym || {}; s.volym.varde = v; }
        else { s.drivare = s.drivare || {}; s.drivare[parameter] = { varde: v }; }
        var r = M.berakna(byggIndata(s));
        if (matt === 'rantetackningsgrad') return r.nyckeltal[y].rantetackning;
        if (matt === 'laneskuld_ub') return r.skuld[y].ut / TKR_PER_MNKR;
        return r.rad.resultat_ef[y] / TKR_PER_MNKR;
      }
      var vLo = vardeVid(lo), vHi = vardeVid(hi);
      if ((vLo - mal) * (vHi - mal) > 0) {
        var redan = (vLo > mal) === (vHi > mal) && vLo > mal;
        return { funnet: false, parameter: parameter, matt: matt, mal: mal, ar: y,
                 intervall: [lo, hi],
                 vid_lagsta: Math.round(vLo * 1000) / 1000,
                 vid_hogsta: Math.round(vHi * 1000) / 1000,
                 forklaring: redan
                   ? 'Målet är uppfyllt i hela det sökta intervallet — gränsen ligger utanför.'
                   : 'Målet nås inte någonstans i det sökta intervallet.' };
      }
      for (var i = 0; i < 40; i++) {
        var mid = (lo + hi) / 2, vm = vardeVid(mid);
        if ((vLo - mal) * (vm - mal) <= 0) { hi = mid; vHi = vm; } else { lo = mid; vLo = vm; }
      }
      var svar = (lo + hi) / 2;
      return { funnet: true, parameter: parameter, matt: matt, mal: mal, ar: y,
               varde: Math.round(svar * 1e6) / 1e6,
               varde_i_procentenheter: parameter === 'ranta' ? pct(svar, 2) : null,
               kontroll: Math.round(vardeVid(svar) * 1000) / 1000 };
    }
  };

  /* Indata för ett scenario, i den form planeringsvyn lagrar scenarier.
     Tillagd så att agenten kan föreslå nya scenarier utan att räknesättet
     dupliceras någon annanstans. */
  API.indata = function (scenario) { return byggIndata(scenario); };
  /* Nyckeltal för färdig indata, t.ex. ett sparat eller publicerat scenario. */
  API.utfallIndata = function (indata) { return nyckeltal(M.berakna(indata)); };

  // Verktygsschema för function calling. Matar en språkmodell direkt.
  API.verktygsschema = function () {
    return [
      { name: 'kapabiliteter', description: 'Lista drivare, projekt, år och mått som går att fråga om. Anropa först.', parameters: { type: 'object', properties: {} } },
      { name: 'utfall', description: 'Kör ett scenario och returnera nyckeltal per år i mnkr.', parameters: { type: 'object', properties: { scenario: { type: 'object' } } } },
      { name: 'jamfor', description: 'Skillnaden mellan två scenarier, mått för mått och år för år.', parameters: { type: 'object', properties: { a: { type: 'object' }, b: { type: 'object' } }, required: ['b'] } },
      { name: 'forklara', description: 'Vad förklarar resultatskillnaden mellan två scenarier ett givet år.', parameters: { type: 'object', properties: { a: { type: 'object' }, b: { type: 'object' }, ar: { type: 'integer' } }, required: ['b'] } },
      { name: 'kanslighet', description: 'Hur resultat, skuld och räntetäckning rör sig när ett antagande varieras.', parameters: { type: 'object', properties: { basScenario: { type: 'object' }, parameter: { type: 'string' }, varden: { type: 'array', items: { type: 'number' } }, ar: { type: 'integer' } }, required: ['parameter', 'varden'] } },
      { name: 'grans', description: 'Vilket värde på en parameter krävs för att ett mått ska nå ett mål. Söker numeriskt.', parameters: { type: 'object', properties: { basScenario: { type: 'object' }, parameter: { type: 'string' }, matt: { type: 'string' }, mal: { type: 'number' }, ar: { type: 'integer' } }, required: ['parameter', 'matt', 'mal'] } }
    ];
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.AgentAPI = API;
})(typeof window !== 'undefined' ? window : globalThis);
