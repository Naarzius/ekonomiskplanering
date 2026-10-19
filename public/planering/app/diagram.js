/* Ekonomisk planering — diagram (ren SVG, inga beroenden) */
var Diagram = (function () {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  var tipEl = null;

  function el(namn, attr, text) {
    var n = document.createElementNS(SVGNS, namn);
    for (var k in attr) if (attr[k] !== null && attr[k] !== undefined) n.setAttribute(k, attr[k]);
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function tip() {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'dg-tip';
      tipEl.setAttribute('role', 'status');
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }

  function visaTip(html, x, y) {
    var t = tip();
    t.innerHTML = html;
    t.classList.add('syns');
    var b = t.getBoundingClientRect();
    var vx = Math.min(Math.max(8, x + 14), window.innerWidth - b.width - 8);
    var vy = Math.max(8, y - b.height - 12);
    t.style.transform = 'translate(' + Math.round(vx) + 'px,' + Math.round(vy) + 'px)';
  }
  function doljTip() { if (tipEl) tipEl.classList.remove('syns'); }

  // ---------------------------------------------------------------- skalor
  function nyckelSteg(rymd, antal) {
    var grovt = rymd / Math.max(1, antal);
    var mag = Math.pow(10, Math.floor(Math.log(grovt) / Math.LN10));
    var norm = grovt / mag;
    var steg = norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1;
    return steg * mag;
  }

  function skala(min, max, antal) {
    if (min === max) { min -= 1; max += 1; }
    var steg = nyckelSteg(max - min, antal || 5);
    var lo = Math.floor(min / steg) * steg;
    var hi = Math.ceil(max / steg) * steg;
    var ticks = [];
    for (var v = lo; v <= hi + steg * 1e-9; v += steg) ticks.push(Math.abs(v) < steg * 1e-9 ? 0 : v);
    return { min: lo, max: hi, ticks: ticks };
  }

  function fmt(v, dec) {
    if (v === null || v === undefined || !isFinite(v)) return '–';
    return v.toLocaleString('sv-SE', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
  }

  // Ritar i containerns faktiska bredd och ritar om vid storleksändring.
  function montera(container, rita) {
    function kor() {
      var b = container.clientWidth;
      if (!b) return;
      container.innerHTML = '';
      container.appendChild(rita(b));
    }
    kor();
    if (container._dgObs) container._dgObs.disconnect();
    // Rita om högst en gång per bildruta — annars hackar det när sidopanelen dras.
    var vantar = null, forraBredd = container.clientWidth;
    container._dgObs = new ResizeObserver(function () {
      if (container.clientWidth === forraBredd) return;
      if (vantar) cancelAnimationFrame(vantar);
      vantar = requestAnimationFrame(function () {
        vantar = null; forraBredd = container.clientWidth; kor();
      });
    });
    container._dgObs.observe(container);
  }

  function rutnat(g, x0, x1, sk, yAv, formatera) {
    sk.ticks.forEach(function (t) {
      var y = yAv(t);
      g.appendChild(el('line', { x1: x0, x2: x1, y1: y, y2: y,
        class: t === 0 ? 'dg-nollinje' : 'dg-rutnat' }));
      g.appendChild(el('text', { x: x0 - 10, y: y + 4, class: 'dg-tick', 'text-anchor': 'end' },
        (formatera || fmt)(t)));
    });
  }

  // ---------------------------------------------------------------- linjediagram
  function linje(container, o) {
    montera(container, function (bredd) {
      var h = o.hojd || 300, mv = o.marginal || 64, mh = 26, mt = 16, mb = 34;
      var x0 = mv, x1 = bredd - mh, y0 = mt, y1 = h - mb;
      var ar = o.ar, serier = o.serier.filter(function (s) { return s.varden; });
      var formatera = o.formatera || fmt;

      var min = Infinity, max = -Infinity;
      serier.forEach(function (s) {
        ar.forEach(function (y) {
          var v = s.varden[y];
          if (typeof v === 'number' && isFinite(v)) { min = Math.min(min, v); max = Math.max(max, v); }
        });
      });
      if (!isFinite(min)) { min = 0; max = 1; }
      if (o.nollbas !== false) { min = Math.min(min, 0); max = Math.max(max, 0); }
      var sk = skala(min, max, 5);
      var yAv = function (v) { return y1 - (v - sk.min) / (sk.max - sk.min) * (y1 - y0); };
      var xAv = function (i) { return ar.length < 2 ? (x0 + x1) / 2 : x0 + i / (ar.length - 1) * (x1 - x0); };

      var svg = el('svg', { width: bredd, height: h, viewBox: '0 0 ' + bredd + ' ' + h, class: 'dg' });
      var g = el('g', {});
      svg.appendChild(g);
      rutnat(g, x0, x1, sk, yAv, formatera);

      ar.forEach(function (y, i) {
        g.appendChild(el('text', { x: xAv(i), y: h - 12, class: 'dg-tick', 'text-anchor': 'middle' }, String(y)));
      });

      serier.forEach(function (s) {
        var d = '', forra = false;
        ar.forEach(function (y, i) {
          var v = s.varden[y];
          if (typeof v !== 'number' || !isFinite(v)) { forra = false; return; }
          d += (forra ? 'L' : 'M') + xAv(i).toFixed(1) + ' ' + yAv(v).toFixed(1) + ' ';
          forra = true;
        });
        g.appendChild(el('path', { d: d, fill: 'none', stroke: s.farg, 'stroke-width': 2,
          'stroke-linecap': 'round', 'stroke-linejoin': 'round',
          'stroke-dasharray': s.streckad ? '5 4' : null, class: 'dg-linje' }));
      });

      // slutetiketter (max 4 serier)
      if (o.etikettSlut !== false && serier.length <= 4) {
        var tagna = [];
        serier.forEach(function (s) {
          var sistaI = -1;
          ar.forEach(function (y, i) { if (typeof s.varden[y] === 'number') sistaI = i; });
          if (sistaI < 0) return;
          var yy = yAv(s.varden[ar[sistaI]]);
          while (tagna.some(function (t) { return Math.abs(t - yy) < 13; })) yy -= 13;
          tagna.push(yy);
          g.appendChild(el('circle', { cx: xAv(sistaI), cy: yAv(s.varden[ar[sistaI]]), r: 4,
            fill: s.farg, stroke: 'var(--yta)', 'stroke-width': 2 }));
        });
      }

      // hårkors + verktygstips
      var kors = el('line', { x1: 0, x2: 0, y1: y0, y2: y1, class: 'dg-kors', opacity: 0 });
      g.appendChild(kors);
      var punkter = serier.map(function (s) {
        var c = el('circle', { r: 4.5, fill: s.farg, stroke: 'var(--yta)', 'stroke-width': 2, opacity: 0 });
        g.appendChild(c); return c;
      });
      var traff = el('rect', { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0),
        fill: 'transparent', style: 'cursor:crosshair' });
      g.appendChild(traff);

      traff.addEventListener('mousemove', function (e) {
        var r = svg.getBoundingClientRect();
        var px = e.clientX - r.left;
        var i = Math.round((px - x0) / Math.max(1, (x1 - x0)) * (ar.length - 1));
        i = Math.max(0, Math.min(ar.length - 1, i));
        kors.setAttribute('x1', xAv(i)); kors.setAttribute('x2', xAv(i)); kors.setAttribute('opacity', 1);
        var rader = '';
        serier.forEach(function (s, k) {
          var v = s.varden[ar[i]];
          if (typeof v === 'number' && isFinite(v)) {
            punkter[k].setAttribute('cx', xAv(i));
            punkter[k].setAttribute('cy', yAv(v));
            punkter[k].setAttribute('opacity', 1);
            rader += '<div class="dg-tip-rad"><span class="dg-prick" style="background:' + s.farg + '"></span>' +
              '<span class="dg-tip-namn">' + s.namn + '</span><span class="dg-tip-v">' +
              (o.formateraTip || formatera)(v) + '</span></div>';
          } else { punkter[k].setAttribute('opacity', 0); }
        });
        visaTip('<div class="dg-tip-rub">' + ar[i] + (o.enhet ? ' · ' + o.enhet : '') + '</div>' + rader, e.clientX, e.clientY);
      });
      traff.addEventListener('mouseleave', function () {
        kors.setAttribute('opacity', 0);
        punkter.forEach(function (p) { p.setAttribute('opacity', 0); });
        doljTip();
      });
      return svg;
    });
  }

  // ---------------------------------------------------------------- staplar
  function staplar(container, o) {
    montera(container, function (bredd) {
      var h = o.hojd || 300, mv = o.marginal || 64, mh = 16, mt = 16, mb = 34;
      var x0 = mv, x1 = bredd - mh, y0 = mt, y1 = h - mb;
      var ar = o.ar, serier = o.serier, staplad = o.lage !== 'grupperad';
      var formatera = o.formatera || fmt;

      var min = 0, max = 0;
      ar.forEach(function (y) {
        if (staplad) {
          var pos = 0, neg = 0;
          serier.forEach(function (s) { var v = s.varden[y] || 0; if (v >= 0) pos += v; else neg += v; });
          max = Math.max(max, pos); min = Math.min(min, neg);
        } else {
          serier.forEach(function (s) {
            var v = s.varden[y] || 0; max = Math.max(max, v); min = Math.min(min, v);
          });
        }
      });
      var sk = skala(min, max, 5);
      var yAv = function (v) { return y1 - (v - sk.min) / (sk.max - sk.min) * (y1 - y0); };

      var svg = el('svg', { width: bredd, height: h, viewBox: '0 0 ' + bredd + ' ' + h, class: 'dg' });
      var g = el('g', {}); svg.appendChild(g);
      rutnat(g, x0, x1, sk, yAv, formatera);

      var steg = (x1 - x0) / ar.length;
      var bB = Math.min(o.maxBredd || 52, steg * 0.62);

      ar.forEach(function (y, i) {
        var mitt = x0 + steg * (i + 0.5);
        g.appendChild(el('text', { x: mitt, y: h - 12, class: 'dg-tick', 'text-anchor': 'middle' }, String(y)));

        function ritaBit(s, vx, vb, varde, topp) {
          if (!varde) return;
          var a = yAv(0), b = yAv(varde);
          var hh = Math.abs(b - a);
          if (hh < 0.6) return;
          var yTop = Math.min(a, b);
          // 2px yt-glipa mellan staplade segment
          var glipa = staplad && !topp ? 2 : 0;
          var r = el('path', { d: rundad(vx, yTop + (varde >= 0 ? 0 : glipa), vb,
            Math.max(1, hh - glipa), varde >= 0, topp || !staplad), fill: s.farg, class: 'dg-stapel' });
          r.addEventListener('mousemove', function (e) {
            visaTip('<div class="dg-tip-rub">' + y + (o.enhet ? ' · ' + o.enhet : '') + '</div>' +
              '<div class="dg-tip-rad"><span class="dg-prick" style="background:' + s.farg + '"></span>' +
              '<span class="dg-tip-namn">' + s.namn + '</span><span class="dg-tip-v">' +
              (o.formateraTip || formatera)(varde) + '</span></div>', e.clientX, e.clientY);
          });
          r.addEventListener('mouseleave', doljTip);
          g.appendChild(r);
        }

        if (staplad) {
          var accP = 0, accN = 0;
          var sista = -1;
          serier.forEach(function (s, k) { if (s.varden[y]) sista = k; });
          serier.forEach(function (s, k) {
            var v = s.varden[y] || 0;
            if (!v) return;
            var bas = v >= 0 ? accP : accN;
            var a = yAv(bas), b = yAv(bas + v);
            var yTop = Math.min(a, b), hh = Math.abs(b - a);
            var topp = (k === sista);
            var glipa = topp ? 0 : 2;
            var p = el('path', { d: rundad(mitt - bB / 2, v >= 0 ? yTop : yTop + glipa, bB,
              Math.max(1, hh - glipa), v >= 0, topp), fill: s.farg, class: 'dg-stapel' });
            (function (ss, vv) {
              p.addEventListener('mousemove', function (e) {
                visaTip('<div class="dg-tip-rub">' + y + (o.enhet ? ' · ' + o.enhet : '') + '</div>' +
                  '<div class="dg-tip-rad"><span class="dg-prick" style="background:' + ss.farg + '"></span>' +
                  '<span class="dg-tip-namn">' + ss.namn + '</span><span class="dg-tip-v">' +
                  (o.formateraTip || formatera)(vv) + '</span></div>', e.clientX, e.clientY);
              });
            })(s, v);
            p.addEventListener('mouseleave', doljTip);
            g.appendChild(p);
            if (v >= 0) accP += v; else accN += v;
          });
        } else {
          var n = serier.length;
          var gb = Math.min(bB / n, 26);
          serier.forEach(function (s, k) {
            var vx = mitt - (gb * n + 2 * (n - 1)) / 2 + k * (gb + 2);
            ritaBit(s, vx, gb, s.varden[y] || 0, true);
          });
        }
      });
      return svg;
    });
  }

  // Stapel med 4px rundade dataändar; basen mot nollinjen är rak.
  function rundad(x, y, b, h, uppat, rundaAnde) {
    var r = rundaAnde ? Math.min(4, b / 2, h) : 0;
    if (uppat) {
      return 'M' + x + ' ' + (y + h) + ' L' + x + ' ' + (y + r) + ' Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y +
             ' L' + (x + b - r) + ' ' + y + ' Q' + (x + b) + ' ' + y + ' ' + (x + b) + ' ' + (y + r) +
             ' L' + (x + b) + ' ' + (y + h) + ' Z';
    }
    return 'M' + x + ' ' + y + ' L' + x + ' ' + (y + h - r) + ' Q' + x + ' ' + (y + h) + ' ' + (x + r) + ' ' + (y + h) +
           ' L' + (x + b - r) + ' ' + (y + h) + ' Q' + (x + b) + ' ' + (y + h) + ' ' + (x + b) + ' ' + (y + h - r) +
           ' L' + (x + b) + ' ' + y + ' Z';
  }

  // ---------------------------------------------------------------- brygga (liggande)
  // visaStart: false ger en ren differensbrygga som utgår från noll, så att
  // små poster syns i full upplösning i stället för att tryckas ihop mot totalerna.
  function brygga(container, o) {
    montera(container, function (bredd) {
      var start = o.start || { namn: '', varde: 0 }, visaStart = o.visaStart !== false;
      var poster = o.poster, n = poster.length + (visaStart ? 2 : 1);
      var radH = o.radH || 30, mt = 14, mb = 26, mv = o.marginal || 210, mh = 80;
      var h = mt + mb + n * radH;
      var x0 = mv, x1 = bredd - mh;
      var formatera = o.formatera || fmt;
      var formateraVarde = o.formateraVarde || formatera;

      var rader = (visaStart ? [{ etikett: start.namn, varde: start.varde, typ: 'total' }] : [])
        .concat(poster.map(function (p) { return { etikett: p.etikett, varde: p.varde, typ: 'delta' }; }))
        .concat([{ etikett: o.slut.namn, varde: o.slut.varde, typ: 'total' }]);

      var lop = visaStart ? start.varde : 0;
      var min = Math.min(0, lop, o.slut.varde), max = Math.max(0, lop, o.slut.varde);
      poster.forEach(function (p) { lop += p.varde; min = Math.min(min, lop); max = Math.max(max, lop); });
      var sk = skala(min, max, 4);
      var xAv = function (v) { return x0 + (v - sk.min) / (sk.max - sk.min) * (x1 - x0); };

      var svg = el('svg', { width: bredd, height: h, viewBox: '0 0 ' + bredd + ' ' + h, class: 'dg' });
      var g = el('g', {}); svg.appendChild(g);

      sk.ticks.forEach(function (t) {
        var x = xAv(t);
        g.appendChild(el('line', { x1: x, x2: x, y1: mt, y2: h - mb,
          class: t === 0 ? 'dg-nollinje' : 'dg-rutnat' }));
        g.appendChild(el('text', { x: x, y: h - 9, class: 'dg-tick', 'text-anchor': 'middle' }, formatera(t)));
      });

      lop = visaStart ? start.varde : 0;
      rader.forEach(function (r, i) {
        var y = mt + i * radH + 5, bh = radH - 12;
        var fran, till;
        if (r.typ === 'total') { fran = 0; till = r.varde; }
        else { fran = lop; till = lop + r.varde; lop = till; }
        var xa = xAv(Math.min(fran, till)), xb = xAv(Math.max(fran, till));
        var farg = r.typ === 'total' ? 'var(--neutral-stapel)' : (r.varde >= 0 ? 'var(--pos)' : 'var(--neg)');

        g.appendChild(el('text', { x: x0 - 12, y: y + bh / 2 + 4, class: 'dg-etikett', 'text-anchor': 'end' }, r.etikett));
        var p = el('rect', { x: xa, y: y, width: Math.max(2, xb - xa), height: bh, rx: 3, fill: farg, class: 'dg-stapel' });
        p.addEventListener('mousemove', function (e) {
          visaTip('<div class="dg-tip-rub">' + r.etikett + '</div><div class="dg-tip-rad">' +
            '<span class="dg-prick" style="background:' + farg + '"></span><span class="dg-tip-namn">' +
            (r.typ === 'total' ? 'Nivå' : 'Effekt') + '</span><span class="dg-tip-v">' +
            (o.formateraTip || formatera)(r.varde) + '</span></div>', e.clientX, e.clientY);
        });
        p.addEventListener('mouseleave', doljTip);
        g.appendChild(p);

        g.appendChild(el('text', { x: xb + 8, y: y + bh / 2 + 4, class: 'dg-varde' },
          (r.varde > 0 && r.typ === 'delta' ? '+' : '') + formateraVarde(r.varde)));

        if (i < rader.length - 1) {
          var xk = xAv(r.typ === 'total' ? r.varde : till);
          g.appendChild(el('line', { x1: xk, x2: xk, y1: y + bh, y2: y + radH, class: 'dg-kopplare' }));
        }
      });
      return svg;
    });
  }

  // ---------------------------------------------------------------- liten kurva
  function minidiagram(container, varden, ar, farg) {
    montera(container, function (bredd) {
      var h = 42, p = 4;
      var v = ar.map(function (y) { return varden[y]; }).filter(function (x) { return isFinite(x); });
      if (!v.length) return el('svg', { width: bredd, height: h });
      var min = Math.min.apply(null, v.concat([0])), max = Math.max.apply(null, v.concat([0]));
      if (min === max) { min -= 1; max += 1; }
      var svg = el('svg', { width: bredd, height: h, viewBox: '0 0 ' + bredd + ' ' + h, class: 'dg' });
      var xAv = function (i) { return p + i / Math.max(1, ar.length - 1) * (bredd - 2 * p); };
      var yAv = function (val) { return h - p - (val - min) / (max - min) * (h - 2 * p); };
      if (min < 0 && max > 0) {
        svg.appendChild(el('line', { x1: p, x2: bredd - p, y1: yAv(0), y2: yAv(0), class: 'dg-nollinje' }));
      }
      var d = '';
      ar.forEach(function (y, i) {
        var val = varden[y];
        if (!isFinite(val)) return;
        d += (d ? 'L' : 'M') + xAv(i).toFixed(1) + ' ' + yAv(val).toFixed(1) + ' ';
      });
      svg.appendChild(el('path', { d: d, fill: 'none', stroke: farg || 'var(--serie-1)', 'stroke-width': 2,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      var sista = ar[ar.length - 1];
      if (isFinite(varden[sista])) {
        svg.appendChild(el('circle', { cx: xAv(ar.length - 1), cy: yAv(varden[sista]), r: 3.5,
          fill: farg || 'var(--serie-1)' }));
      }
      return svg;
    });
  }

  // ---------------------------------------------------------------- genomslagskurva
  function genomslagskurva(container, ind, modell) {
    montera(container, function (bredd) {
      var h = 130, mv = 44, mh = 16, mt = 14, mb = 28;
      var ar = modell.AR, x0 = mv, x1 = bredd - mh, y0 = mt, y1 = h - mb;
      var svg = el('svg', { width: bredd, height: h, viewBox: '0 0 ' + bredd + ' ' + h, class: 'dg' });
      var g = el('g', {}); svg.appendChild(g);
      var yAv = function (v) { return y1 - v * (y1 - y0); };
      [0, 0.5, 1].forEach(function (t) {
        g.appendChild(el('line', { x1: x0, x2: x1, y1: yAv(t), y2: yAv(t), class: t === 0 ? 'dg-nollinje' : 'dg-rutnat' }));
        g.appendChild(el('text', { x: x0 - 8, y: yAv(t) + 4, class: 'dg-tick', 'text-anchor': 'end' },
          Math.round(t * 100) + '%'));
      });
      var steg = (x1 - x0) / ar.length;
      var test = modell.kopia(ind); test.ranta.uppgang = test.ranta.uppgang || 0.01;
      ar.forEach(function (y, i) {
        var v = modell.genomslag(test, y);
        var mitt = x0 + steg * (i + 0.5), b = Math.min(34, steg * 0.6);
        g.appendChild(el('text', { x: mitt, y: h - 9, class: 'dg-tick', 'text-anchor': 'middle' }, String(y).slice(2)));
        if (v <= 0) return;
        var hh = yAv(0) - yAv(v);
        g.appendChild(el('path', { d: rundad(mitt - b / 2, yAv(v), b, Math.max(1, hh), true, true),
          fill: 'var(--serie-4)', class: 'dg-stapel' }));
        if (v > 0.12) {
          g.appendChild(el('text', { x: mitt, y: yAv(v) - 5, class: 'dg-minietikett', 'text-anchor': 'middle' },
            Math.round(v * 100) + '%'));
        }
      });
      return svg;
    });
  }

  return { linje: linje, staplar: staplar, brygga: brygga, minidiagram: minidiagram,
           genomslagskurva: genomslagskurva, fmt: fmt, skala: skala, doljTip: doljTip };
})();
