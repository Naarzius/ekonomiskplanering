/* Ekonomisk planering — filinläsning (xlsx, csv, json)
 * ------------------------------------------------------------------
 * En xlsx är en zip med xml. Webbläsaren kan packa upp deflate själv via
 * DecompressionStream, så filen läses utan externa bibliotek och utan att
 * något lämnar datorn.
 */
var LasFil = (function () {
  'use strict';

  // ---------------------------------------------------------------- text
  function avkoda(buf) {
    // Svenska systemexporter är ofta Windows-1252. Prova UTF-8 först och
    // fall tillbaka om resultatet innehåller ersättningstecken.
    var t = new TextDecoder('utf-8').decode(buf);
    if (t.indexOf('�') >= 0) {
      try { return new TextDecoder('windows-1252').decode(buf); } catch (e) { /* behåll */ }
    }
    return t.charCodeAt(0) === 0xFEFF ? t.slice(1) : t;
  }

  // ---------------------------------------------------------------- csv
  function csvAvgransare(text) {
    var rad = text.split(/\r?\n/).filter(function (r) { return r.trim(); })[0] || '';
    var kand = [';', '\t', ','], bast = ';', flest = -1;
    kand.forEach(function (d) {
      var n = rad.split(d).length - 1;
      if (n > flest) { flest = n; bast = d; }
    });
    return bast;
  }

  function lasCsv(text) {
    var avg = csvAvgransare(text), rader = [], cell = '', rad = [], iCitat = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (iCitat) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else iCitat = false; }
        else cell += c;
      } else if (c === '"') iCitat = true;
      else if (c === avg) { rad.push(cell); cell = ''; }
      else if (c === '\n') { rad.push(cell); rader.push(rad); rad = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell || rad.length) { rad.push(cell); rader.push(rad); }
    return rader.filter(function (r) { return r.some(function (x) { return String(x).trim(); }); });
  }

  // ---------------------------------------------------------------- zip
  function dv(buf) { return new DataView(buf); }

  async function packaUpp(buf, komprimering, start, komprimeradLangd) {
    var del = buf.slice(start, start + komprimeradLangd);
    if (komprimering === 0) return del;
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Webbläsaren kan inte packa upp xlsx. Spara filen som CSV och läs in den i stället.');
    }
    var ds = new DecompressionStream('deflate-raw');
    var ut = new Blob([del]).stream().pipeThrough(ds);
    return await new Response(ut).arrayBuffer();
  }

  async function zipPoster(buf) {
    var v = dv(buf), n = buf.byteLength, eocd = -1;
    for (var i = n - 22; i >= Math.max(0, n - 66000); i--) {
      if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Filen ser inte ut som en xlsx (ingen zip-struktur hittades).');
    var antal = v.getUint16(eocd + 10, true), cdStart = v.getUint32(eocd + 16, true);
    var poster = {}, p = cdStart;
    for (var k = 0; k < antal; k++) {
      if (v.getUint32(p, true) !== 0x02014b50) break;
      var metod = v.getUint16(p + 10, true);
      var komp = v.getUint32(p + 20, true);
      var namnLen = v.getUint16(p + 28, true);
      var extraLen = v.getUint16(p + 30, true);
      var kommLen = v.getUint16(p + 32, true);
      var lokal = v.getUint32(p + 42, true);
      var namn = new TextDecoder('utf-8').decode(new Uint8Array(buf, p + 46, namnLen));
      poster[namn] = { metod: metod, komp: komp, lokal: lokal };
      p += 46 + namnLen + extraLen + kommLen;
    }
    return poster;
  }

  async function lasZipFil(buf, poster, namn) {
    var e = poster[namn];
    if (!e) return null;
    var v = dv(buf);
    if (v.getUint32(e.lokal, true) !== 0x04034b50) return null;
    var nl = v.getUint16(e.lokal + 26, true), xl = v.getUint16(e.lokal + 28, true);
    var data = await packaUpp(buf, e.metod, e.lokal + 30 + nl + xl, e.komp);
    return avkoda(data);
  }

  // ---------------------------------------------------------------- xlsx
  function kolTillIndex(ref) {
    var m = /^([A-Z]+)/.exec(ref);
    if (!m) return 0;
    var n = 0;
    for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64);
    return n - 1;
  }

  function xml(text) { return new DOMParser().parseFromString(text, 'application/xml'); }

  async function lasXlsx(buf) {
    var poster = await zipPoster(buf);

    var delade = [];
    var ssText = await lasZipFil(buf, poster, 'xl/sharedStrings.xml');
    if (ssText) {
      var sd = xml(ssText);
      Array.prototype.forEach.call(sd.getElementsByTagName('si'), function (si) {
        var t = '';
        Array.prototype.forEach.call(si.getElementsByTagName('t'), function (x) { t += x.textContent; });
        delade.push(t);
      });
    }

    var relText = await lasZipFil(buf, poster, 'xl/_rels/workbook.xml.rels');
    var rel = {};
    if (relText) {
      Array.prototype.forEach.call(xml(relText).getElementsByTagName('Relationship'), function (r) {
        rel[r.getAttribute('Id')] = r.getAttribute('Target').replace(/^\/?xl\//, '').replace(/^\.\//, '');
      });
    }

    var wbText = await lasZipFil(buf, poster, 'xl/workbook.xml');
    if (!wbText) throw new Error('Hittar ingen arbetsbok i filen.');
    var flikar = [];
    Array.prototype.forEach.call(xml(wbText).getElementsByTagName('sheet'), function (s) {
      var rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      flikar.push({ namn: s.getAttribute('name'), mal: rel[rid], dold: s.getAttribute('state') === 'hidden' });
    });

    var ut = [];
    for (var i = 0; i < flikar.length; i++) {
      var f = flikar[i];
      if (f.dold) continue;
      var t = f.mal ? await lasZipFil(buf, poster, 'xl/' + f.mal) : null;
      if (!t) continue;
      ut.push({ namn: f.namn, rader: sheetTillRader(xml(t), delade) });
    }
    if (!ut.length) throw new Error('Kunde inte läsa någon flik ur filen.');
    return ut;
  }

  function sheetTillRader(doc, delade) {
    var rader = [];
    Array.prototype.forEach.call(doc.getElementsByTagName('row'), function (r) {
      var rad = [];
      Array.prototype.forEach.call(r.getElementsByTagName('c'), function (c) {
        var idx = kolTillIndex(c.getAttribute('r') || '');
        var typ = c.getAttribute('t'), varde = null;
        if (typ === 'inlineStr') {
          var is = c.getElementsByTagName('t');
          varde = is.length ? is[0].textContent : '';
        } else {
          var vn = c.getElementsByTagName('v');
          if (vn.length) {
            var raw = vn[0].textContent;
            if (typ === 's') varde = delade[parseInt(raw, 10)] || '';
            else if (typ === 'e') varde = '';
            else if (typ === 'str') varde = raw;
            else { var n = parseFloat(raw); varde = isFinite(n) ? n : raw; }
          }
        }
        while (rad.length < idx) rad.push('');
        rad[idx] = (varde === null ? '' : varde);
      });
      rader.push(rad);
    });
    // klipp bort tomma rader i slutet
    while (rader.length && !rader[rader.length - 1].some(function (x) { return String(x).trim(); })) rader.pop();
    return rader;
  }

  // ---------------------------------------------------------------- tal
  // "1 234,5", "−1 234.5", "(1 234)", "1 234-", "1,234.50", "3,5 %" -> tal
  //
  // Ett fel har ger ett tal som ser rimligt ut, sa reglerna ar uttalade:
  //  . minus kan sta fore, efter eller som parentes, och skrivas med
  //    bindestreck, minustecken (U+2212) eller tankstreck (U+2013)
  //  . komma ar DECIMALTECKEN som standard - det har ar svenska filer.
  //    Det tolkas som tusentalsavgransare bara nar det inte kan vara nagot
  //    annat: flera kommagrupper (1,234,567) eller en punkt langre bak
  //    (1,234.50). Annars blir "0,100" hundra i stallet for en tiondel.
  //  . procent delas med 100, sa att en CSV med "3,5 %" ger samma tal som
  //    en xlsx-procentcell
  //  . datum ar inte tal och avvisas i stallet for att bli sitt artal
  function tolkaTal(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v === null || v === undefined) return null;
    var s = String(v).trim();
    if (!s) return null;
    if (/^\d{4}-\d{1,2}-\d{1,2}([T ]|$)/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) return null;

    s = s.replace(/[−–—]/g, '-').replace(/[\s ']/g, '');
    var procent = /%/.test(s);
    var neg = false, parentes = false;
    if (/^\(.*\)$/.test(s)) { parentes = true; s = s.slice(1, -1); }
    s = s.replace(/(kr|tkr|mnkr|mkr|sek|%)$/i, '');
    if (/^\(.*\)$/.test(s)) { parentes = true; s = s.slice(1, -1); }
    if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
    if (/^-/.test(s)) { neg = true; s = s.slice(1); }
    // Parentes betyder negativt i bokforing. Ett minus inuti ar nagon som varit
    // extra tydlig, inte en dubbelnegation - (-1 234) ar minus, inte plus.
    if (parentes) neg = true;
    if (!/\d/.test(s)) return null;

    var komma = s.lastIndexOf(','), punkt = s.lastIndexOf('.');
    if (komma >= 0 && punkt >= 0) {
      if (komma > punkt) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (komma >= 0) {
      s = /^\d{1,3}(,\d{3}){2,}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
    } else if (punkt >= 0 && /^\d{1,3}(\.\d{3}){2,}$/.test(s)) {
      s = s.replace(/\./g, '');
    }
    var n = parseFloat(s);
    if (!isFinite(n)) return null;
    if (procent) n = n / 100;
    return neg ? -n : n;
  }

  // ---------------------------------------------------------------- publikt
  async function las(file) {
    var namn = (file.name || '').toLowerCase();
    if (/\.json$/.test(namn)) {
      return { typ: 'json', namn: file.name, data: JSON.parse(avkoda(await file.arrayBuffer())) };
    }
    if (/\.(csv|txt|tsv)$/.test(namn)) {
      return { typ: 'rutnat', namn: file.name,
               flikar: [{ namn: file.name, rader: lasCsv(avkoda(await file.arrayBuffer())) }] };
    }
    if (/\.(xlsx|xlsm)$/.test(namn)) {
      return { typ: 'rutnat', namn: file.name, flikar: await lasXlsx(await file.arrayBuffer()) };
    }
    if (/\.xls$/.test(namn)) {
      throw new Error('Gammalt xls-format stöds inte. Spara om filen som xlsx eller CSV.');
    }
    throw new Error('Filtypen stöds inte. Använd xlsx, csv eller json.');
  }

  return { las: las, tolkaTal: tolkaTal, lasCsv: lasCsv };
})();
