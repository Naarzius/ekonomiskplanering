/* Ekonomisk planering — skriver en xlsx-fil direkt i webbläsaren.
   Inget bibliotek: zip-arkivet och SpreadsheetML byggs för hand, på samma sätt
   som las-fil.js packar upp ett åt andra hållet. Deflate används när
   CompressionStream finns, annars lagras filerna okomprimerat — båda är
   giltiga zip och Excel öppnar dem lika gärna. */
var SkrivXlsx = (function () {
  'use strict';

  var NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  var NSR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var NSPKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
  var HUVUD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  // ---------------------------------------------------------------- crc32
  var CRCTAB = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(b) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < b.length; i++) c = CRCTAB[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function byte(s) { return new TextEncoder().encode(s); }

  function packaIhop(data) {
    if (typeof CompressionStream !== 'function') return Promise.resolve(null);
    try {
      var s = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return new Response(s).arrayBuffer().then(function (b) { return new Uint8Array(b); })
        .catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  // ---------------------------------------------------------------- zip
  function zip(poster) {
    var d = new Date();
    var tid = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
    var datum = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
    var kropp = [], katalog = [], forskjutning = 0;

    function nasta(i) {
      if (i >= poster.length) return Promise.resolve();
      var p = poster[i], namn = byte(p.namn), rått = p.data;
      var crc = crc32(rått);
      return packaIhop(rått).then(function (packat) {
        var metod = 0, ut = rått;
        if (packat && packat.length < rått.length) { metod = 8; ut = packat; }

        var lok = new Uint8Array(30 + namn.length), lv = new DataView(lok.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);
        lv.setUint16(6, 0x0800, true);      // filnamn i UTF-8
        lv.setUint16(8, metod, true);
        lv.setUint16(10, tid, true);
        lv.setUint16(12, datum, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, ut.length, true);
        lv.setUint32(22, rått.length, true);
        lv.setUint16(26, namn.length, true);
        lok.set(namn, 30);
        kropp.push(lok, ut);

        var k = new Uint8Array(46 + namn.length), kv = new DataView(k.buffer);
        kv.setUint32(0, 0x02014b50, true);
        kv.setUint16(4, 20, true);
        kv.setUint16(6, 20, true);
        kv.setUint16(8, 0x0800, true);
        kv.setUint16(10, metod, true);
        kv.setUint16(12, tid, true);
        kv.setUint16(14, datum, true);
        kv.setUint32(16, crc, true);
        kv.setUint32(20, ut.length, true);
        kv.setUint32(24, rått.length, true);
        kv.setUint16(28, namn.length, true);
        kv.setUint32(42, forskjutning, true);
        k.set(namn, 46);
        katalog.push(k);

        forskjutning += lok.length + ut.length;
        return nasta(i + 1);
      });
    }

    return nasta(0).then(function () {
      var storlek = katalog.reduce(function (s, x) { return s + x.length; }, 0);
      var slut = new Uint8Array(22), sv = new DataView(slut.buffer);
      sv.setUint32(0, 0x06054b50, true);
      sv.setUint16(8, poster.length, true);
      sv.setUint16(10, poster.length, true);
      sv.setUint32(12, storlek, true);
      sv.setUint32(16, forskjutning, true);
      return new Blob(kropp.concat(katalog, [slut]),
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    });
  }

  // ---------------------------------------------------------------- xml
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }
  function kolNamn(n) {
    var s = '';
    while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; }
    return s;
  }

  // Formatnycklar -> index i cellXfs nedan.
  var STIL = { txt: 0, rub: 1, tal: 2, tal1: 3, pct: 4, fettal: 5, fet: 6, titel: 7, dec2: 8, pct2: 9 };

  var STILAR = HUVUD +
    '<styleSheet xmlns="' + NS + '">' +
    '<numFmts count="5">' +
      '<numFmt numFmtId="164" formatCode="#,##0"/>' +
      '<numFmt numFmtId="165" formatCode="#,##0.0"/>' +
      '<numFmt numFmtId="166" formatCode="0.0%"/>' +
      '<numFmt numFmtId="167" formatCode="0.00"/>' +
      '<numFmt numFmtId="168" formatCode="0.00%"/>' +
    '</numFmts>' +
    '<fonts count="3">' +
      '<font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="14"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid">' +
        '<fgColor rgb="FFF2E5D8"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="2">' +
      '<border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left/><right/><top/>' +
        '<bottom style="thin"><color rgb="FFCFCDC6"/></bottom><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="10">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="168" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '<dxfs count="0"/>' +
    '<tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleLight16"/>' +
    '</styleSheet>';

  function cell(ref, v, stil) {
    if (v === null || v === undefined || v === '') return '';
    var s = STIL[stil] === undefined ? 0 : STIL[stil];
    var sa = s ? ' s="' + s + '"' : '';
    if (typeof v === 'number') {
      if (!isFinite(v)) return '';
      return '<c r="' + ref + '"' + sa + '><v>' + (Math.round(v * 1e6) / 1e6) + '</v></c>';
    }
    return '<c r="' + ref + '"' + sa + ' t="inlineStr"><is><t xml:space="preserve">' +
      esc(v) + '</t></is></c>';
  }

  function bladXml(b) {
    var ut = [HUVUD, '<worksheet xmlns="' + NS + '">'];
    var fx = b.frysKol || 0, fy = b.frysRad || 0;
    if (fx || fy) {
      // Excel vill ha en aktiv ruta som stämmer med vilka splittar som finns.
      var aktiv = (fx && fy) ? 'bottomRight' : (fy ? 'bottomLeft' : 'topRight');
      ut.push('<sheetViews><sheetView workbookViewId="0"><pane' +
        (fx ? ' xSplit="' + fx + '"' : '') + (fy ? ' ySplit="' + fy + '"' : '') +
        ' topLeftCell="' + kolNamn(fx + 1) + (fy + 1) +
        '" activePane="' + aktiv + '" state="frozen"/>' +
        '<selection pane="' + aktiv + '"/></sheetView></sheetViews>');
    }
    if (b.bredd && b.bredd.length) {
      ut.push('<cols>' + b.bredd.map(function (w, i) {
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
      }).join('') + '</cols>');
    }
    ut.push('<sheetData>');
    (b.rader || []).forEach(function (rad, ri) {
      if (!rad) return;
      var celler = rad.map(function (c, ci) {
        if (c === null || c === undefined) return '';
        var v = c, f = null;
        if (typeof c === 'object') { v = c.v; f = c.f; }
        return cell(kolNamn(ci + 1) + (ri + 1), v, f);
      }).join('');
      if (celler) ut.push('<row r="' + (ri + 1) + '">' + celler + '</row>');
    });
    ut.push('</sheetData></worksheet>');
    return ut.join('');
  }

  // Excel tillåter inte : \ / ? * [ ] i bladnamn, och max 31 tecken.
  function bladnamn(n, i) {
    var s = String(n || ('Blad' + (i + 1))).replace(/[:\\\/?*\[\]]/g, ' ').slice(0, 31).trim();
    return s || ('Blad' + (i + 1));
  }

  // blad: [{namn, rader, bredd, frysRad, frysKol}]
  // rader: [[cell, ...]] där cell är sträng, tal, null eller {v, f}
  //        och f är txt|rub|tal|tal1|pct|pct2|dec2|fettal|fet|titel
  function bok(blad) {
    var namn = {};
    var rena = blad.map(function (b, i) {
      var n = bladnamn(b.namn, i), grund = n, k = 2;
      while (namn[n.toLowerCase()]) { n = grund.slice(0, 28) + ' ' + (k++); }
      namn[n.toLowerCase()] = true;
      return { namn: n, blad: b };
    });

    var typer = HUVUD +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      rena.map(function (x, i) {
        return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ' +
          'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      }).join('') + '</Types>';

    var rotRels = HUVUD + '<Relationships xmlns="' + NSPKG + '">' +
      '<Relationship Id="rId1" Type="' + NSR + '/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';

    var arbetsbok = HUVUD + '<workbook xmlns="' + NS + '" xmlns:r="' + NSR + '"><sheets>' +
      rena.map(function (x, i) {
        return '<sheet name="' + esc(x.namn) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
      }).join('') + '</sheets></workbook>';

    var bokRels = HUVUD + '<Relationships xmlns="' + NSPKG + '">' +
      rena.map(function (x, i) {
        return '<Relationship Id="rId' + (i + 1) + '" Type="' + NSR + '/worksheet" ' +
          'Target="worksheets/sheet' + (i + 1) + '.xml"/>';
      }).join('') +
      '<Relationship Id="rId' + (rena.length + 1) + '" Type="' + NSR + '/styles" Target="styles.xml"/>' +
      '</Relationships>';

    var poster = [
      { namn: '[Content_Types].xml', data: byte(typer) },
      { namn: '_rels/.rels', data: byte(rotRels) },
      { namn: 'xl/workbook.xml', data: byte(arbetsbok) },
      { namn: 'xl/_rels/workbook.xml.rels', data: byte(bokRels) },
      { namn: 'xl/styles.xml', data: byte(STILAR) }
    ];
    rena.forEach(function (x, i) {
      poster.push({ namn: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: byte(bladXml(x.blad)) });
    });
    return zip(poster);
  }

  function ladda(blob, filnamn) {
    var u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u;
    a.download = String(filnamn).replace(/[\\\/:*?"<>|]/g, '-');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
  }

  return { bok: bok, ladda: ladda };
})();
