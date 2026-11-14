/* Photographic ingredient sprites, composed from each blend's own recipe.
   Shared by the static-image build and the viewport-led infusion. No WebGL. */
(function (root) {
  "use strict";
  var names = ["Hibiscus", "Mint Leaf", "Lemongrass", "Butterfly Pea Flower",
    "Cinnamon Stick", "Mango", "Pineapple", "Rooibos", "Strawberry", "Apple",
    "Bourbon Vanilla", "Dried Ginger", "Lemon Peel", "Oolong", "Dried Rose",
    "Chamomile", "Green Tea", "Blackberry", "Jasmine", "White Tea", "Lavender",
    "Lemon Balm", "Passionflower", "Mate", "Fresh Ginger", "Orange Peel", "Rosehip", "Fennel"];
  var scales = [1, .82, .7, 1, .8, .85, .8, .9, 1, .85, .55, .85, .75, .7,
    .85, .85, .6, .75, .72, .65, .65, .8, .9, .85, .8, .8, .8, .65];
  // Low values are light petals/leaves; high values are dense fruit, seed and
  // bark. This makes each blend open in a believable physical order.
  var liftOrder = [.12, .18, .35, .08, .75, .72, .68, .28, .62, .68, .78, .73,
    .55, .38, .10, .06, .32, .70, .05, .22, .04, .16, .08, .30, .74, .58, .65, .62];

  // Each pile reads one sheet. "botanical" is the 6 x 5 atlas above, used by
  // the fourteen blends. "powder" (botanical-atlas-powders, 6 x 3) holds six
  // real crumbs of each powder (matcha, hojicha, ube; one product to a row),
  // cut from a photographed pinch by tools/build-powder-atlas.py. A powder's
  // pile is not a few big pieces but a cone of thousands of those grains,
  // seen from a little above, lit from the upper left; when it opens, fine
  // powder blows off its face toward the colour. A page names its sheet with
  // data-sheet; the static build sets atlas.hocSheet itself.
  var sheets = {
    botanical: { cols: 6, rows: 5, tile: 256, names: names, scales: scales, lift: liftOrder, shadow: .19 },
    powder: {
      cols: 6, rows: 3, tile: 64, shadow: .16,
      names: ["Matcha 1", "Matcha 2", "Matcha 3", "Matcha 4", "Matcha 5", "Matcha 6",
        "Hojicha 1", "Hojicha 2", "Hojicha 3", "Hojicha 4", "Hojicha 5", "Hojicha 6",
        "Ube 1", "Ube 2", "Ube 3", "Ube 4", "Ube 5", "Ube 6"],
      // Sizes are shares of the canvas. radius/height: the cone (taller than
      // wide, a poured heap with a rounded tip); base: where its foot sits
      // below the canvas centre; elevation: the camera, degrees above level.
      heap: { grains: 14000, dust: 1100, size: [.0055, .012], radius: .235,
        height: .35, base: .16, elevation: 17 }
    }
  };
  function sheetOf(name) { return sheets[name] || sheets.botanical; }
  var TAU = Math.PI * 2;

  function random(seed) {
    var n = 2166136261;
    for (var i = 0; i < seed.length; i++) n = Math.imul(n ^ seed.charCodeAt(i), 16777619);
    return function () {
      n += 0x6D2B79F5;
      var t = Math.imul(n ^ n >>> 15, 1 | n);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function pieces(recipe, seed, sheet) {
    var rand = random(seed), s = sheetOf(sheet), scales = s.scales, liftOrder = s.lift;
    if (s.heap) return heap(recipe, rand, s);
    var types = recipe.map(function (name) { return s.names.indexOf(name.trim()); }).filter(function (i) { return i >= 0; });
    if (!types.length) return [];
    var result = [];
    for (var i = 0; i < 205; i++) {
      var type = types[Math.floor(rand() * types.length)];
      var a = rand() * Math.PI * 2;
      var radius = Math.pow(rand(), .7) * .25;
      var size = (.060 + rand() * .068) * scales[type];
      // A low, irregular heap. A few larger, identifiable pieces sit on top.
      if (i > 187) size *= 1.28;
      var x = Math.cos(a) * radius * (1 + .08 * Math.sin(a * 3));
      var y = Math.sin(a) * radius * .85;
      result.push({ type: type, x: x, y: y, size: size, angle: rand() * Math.PI * 2,
        dx: Math.cos(a) * (.10 + rand() * .12), dy: Math.sin(a) * (.10 + rand() * .12),
        turn: (rand() - .5) * 1.2, depth: .7 + rand() * .3,
        phase: clamp(liftOrder[type] + (rand() - .5) * .22, 0, 1),
        spiral: .42 + rand() * .72,
        float: .45 + rand() * .55, pulse: rand() * Math.PI * 2,
        orbit: .7 + rand() * .65 });
    }
    return result;
  }

  // A powder heap: a recipe names the powder ("Matcha") and every grain of
  // it ("Matcha 1" ... "Matcha 6") is used.
  //
  // Grains sit on the surface of a cone (area-uniform, so as dense at the
  // foot as at the tip), jittered so the face is lumpy, and a ring of dust
  // lies on the ground around the foot. Each is shaded from the cone's normal
  // against a light from the upper left, darker where the heap meets the
  // ground, and drawn far to near. Grains on the hidden back are not made.
  // About one in eight on the lit face is loose: those are what blow away.
  var LIGHT = unit(-.55, .42, .72);
  var SHADES = [.48, .6, .72, .84, .96, 1.08, 1.2];
  function unit(x, y, z) { var m = Math.sqrt(x * x + y * y + z * z) || 1; return [x / m, y / m, z / m]; }
  function heap(recipe, rand, s) {
    var g = s.heap, types = [];
    recipe.forEach(function (name) {
      name = name.trim();
      s.names.forEach(function (n, i) { if (n.indexOf(name + " ") === 0) types.push(i); });
    });
    if (!types.length) return [];
    var R = g.radius, H = g.height, el = g.elevation * Math.PI / 180;
    var ce = Math.cos(el), se = Math.sin(el), k = .09, top = Math.sqrt(1 + k * k) - k;
    var result = [], ph1 = rand() * TAU, ph2 = rand() * TAU, ph3 = rand() * TAU;
    // A poured heap is never a true cone: a slow bulge round it, a few
    // slumps down its face.
    function swell(th, t) {
      return 1 + t * (.035 * Math.sin(2 * th + ph1) + .022 * Math.sin(5 * th + ph2)) +
        .018 * Math.sin(9 * t + 3 * th + ph3) * t;
    }
    // Height at t (0 = axis, 1 = foot): a rounded tip, a slight flare at the foot.
    function profile(t) { return H * Math.pow(Math.max(0, 1 - (Math.sqrt(t * t + k * k) - k) / top), 1.15); }
    function grain(x, y, z, b, size, loose) {
      var shade = Math.round(clamp((b - SHADES[0]) / (SHADES[SHADES.length - 1] - SHADES[0]), 0, 1) * (SHADES.length - 1));
      var p = { type: types[Math.floor(rand() * types.length)], x: x, y: g.base - z * ce + y * se,
        depth: y * ce + z * se, size: size, angle: rand() * TAU, shade: shade, loose: loose };
      if (loose) {
        // Downwind is to the right, where the colour runs; it rises a little.
        p.dx = .08 + rand() * .24; p.dy = -(.02 + rand() * .1);
        p.speed = 1 / (6500 + rand() * 8000); p.offset = rand(); p.sway = rand() * TAU;
      }
      result.push(p);
    }
    for (var made = 0, tries = 0; made < g.grains && tries < g.grains * 3; tries++) {
      var th = rand() * TAU, t = Math.sqrt(rand());
      var slope = (profile(Math.max(0, t - .02)) - profile(Math.min(1, t + .02))) / (R * (Math.min(1, t + .02) - Math.max(0, t - .02)));
      var n = unit(slope * Math.cos(th), slope * Math.sin(th), 1);
      var facing = n[1] * ce + n[2] * se;
      if (facing < -.04) continue;
      var r = R * t * swell(th, t) * (1 + (rand() - .5) * .03), z = profile(t) + (rand() - .5) * .006;
      var b = .44 + .8 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
      b *= .74 + .26 * smoothstep(z / (H * .22));          // where it meets the ground
      b *= .9 + .1 * smoothstep(facing / .3);              // the turning edge
      b *= 1 + (rand() - .5) * .16;
      var size = g.size[0] + rand() * (g.size[1] - g.size[0]);
      grain(r * Math.cos(th), r * Math.sin(th), Math.max(0, z), b, size,
        facing > .3 && rand() < .05 + .16 * z / H);
      made++;
    }
    for (var i = 0; i < g.dust; i++) {
      var a = rand() * TAU, d = R * swell(a, 1) * (.93 + Math.pow(rand(), 3.2) * .5);
      // The ground is lit too, except in the heap's shadow to the lower right.
      var lit = .62 + rand() * .26 - (Math.cos(a) > 0 && Math.sin(a) > -.3 ? .1 : 0);
      grain(d * Math.cos(a), d * Math.sin(a), 0, lit, (g.size[0] + rand() * (g.size[1] - g.size[0])) * .7, false);
    }
    result.sort(function (p, q) { return p.depth - q.depth; });
    // The silhouette, for the solid body under the grains: apex, then the
    // front of the foot from left to right.
    var outline = [[0, g.base - H * ce]];
    for (var j = 0; j <= 24; j++) {
      var ta = Math.PI - j / 24 * Math.PI, rr = R * swell(ta, 1) * .96;
      outline.push([rr * Math.cos(ta), g.base + rr * Math.sin(ta) * se]);
    }
    result.heap = { radius: R, height: H, base: g.base, se: se, ce: ce, outline: outline };
    return result;
  }

  // The body never moves, so it is drawn once per canvas size and reused;
  // each frame adds only the loose grains. Spread 0 is the still heap (and
  // the static WebP); as it opens, loose grains stream off downwind, fading
  // as they go, and settle back onto the face to go again.
  function stamp(ctx, tile, x, y, size, angle, w, h) {
    var c = Math.cos(angle), s = Math.sin(angle);
    ctx.setTransform(c, s, -s, c, (.5 + x) * w, (.5 + y) * h);
    ctx.drawImage(tile, -size * w / 2, -size * w / 2, size * w, size * w);
  }
  function shades(atlas) {
    if (atlas.hocShades) return atlas.hocShades;
    return (atlas.hocShades = atlas.hocSprites.map(function (sprite) {
      return SHADES.map(function (f) {
        var tile = document.createElement("canvas"), tc = tile.getContext("2d");
        tile.width = sprite.width; tile.height = sprite.height;
        tc.drawImage(sprite, 0, 0);
        tc.globalCompositeOperation = "source-atop";
        tc.fillStyle = f < 1 ? "rgba(26,18,10," + (1 - f).toFixed(3) + ")" : "rgba(255,250,240," + ((f - 1) * .85).toFixed(3) + ")";
        tc.fillRect(0, 0, tile.width, tile.height);
        return tile;
      });
    }));
  }
  // Mean colour of the grains this heap uses, from their mid-tone tiles.
  function toneOf(tiles, items) {
    var seen = {}, sum = [0, 0, 0], n = 0;
    items.forEach(function (p) { seen[p.type] = 1; });
    Object.keys(seen).forEach(function (type) {
      var tile = tiles[type][3], d = tile.getContext("2d").getImageData(0, 0, tile.width, tile.height).data;
      for (var i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; n++; }
    });
    return n ? sum.map(function (v) { return v / n; }) : [128, 128, 128];
  }
  function rgbs(c, f) { return "rgb(" + c.map(function (v) { return Math.round(clamp(v * f, 0, 255)); }).join(",") + ")"; }
  function drawHeap(ctx, w, h, atlas, items, spread, time, hover, handX, handY) {
    var tiles = shades(atlas), body = items.body;
    if (!body || body.width !== w || body.height !== h) {
      body = items.body = document.createElement("canvas");
      body.width = w; body.height = h;
      var bc = body.getContext("2d"), hp = items.heap, rx = hp.radius * 1.45 * w;
      // Contact shadow, thrown to the lower right.
      bc.setTransform(1, 0, 0, .24, (.5 + hp.radius * .3) * w, (.5 + hp.base + hp.radius * hp.se * .3) * h);
      var shadow = bc.createRadialGradient(0, 0, 0, 0, 0, rx);
      shadow.addColorStop(0, "rgba(40,30,18,.36)");
      shadow.addColorStop(.5, "rgba(40,30,18,.17)");
      shadow.addColorStop(1, "rgba(40,30,18,0)");
      bc.fillStyle = shadow;
      bc.beginPath(); bc.arc(0, 0, rx, 0, TAU); bc.fill();
      // A solid body in the powder's own colour, lit like the grains, so the
      // gaps between them read as depth rather than as the page.
      var tone = toneOf(tiles, items), lx = (.5 - hp.radius) * w, rx2 = (.5 + hp.radius) * w;
      bc.setTransform(1, 0, 0, 1, 0, 0);
      var body2 = bc.createLinearGradient(lx, 0, rx2, 0);
      body2.addColorStop(0, rgbs(tone, .98)); body2.addColorStop(.4, rgbs(tone, .86));
      body2.addColorStop(1, rgbs(tone, .5));
      bc.fillStyle = body2;
      bc.beginPath();
      hp.outline.forEach(function (pt, i) { bc[i ? "lineTo" : "moveTo"]((.5 + pt[0]) * w, (.5 + pt[1]) * h); });
      bc.closePath(); bc.fill();
      items.forEach(function (p) { if (!p.loose) stamp(bc, tiles[p.type][p.shade], p.x, p.y, p.size, p.angle, w, h); });
      bc.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.drawImage(body, 0, 0);
    items.forEach(function (p) {
      if (!p.loose) return;
      var x = p.x, y = p.y, open = smoothstep((spread - p.offset * .3) / .7);
      if (open > 0) {
        var t = (time * p.speed + p.offset) % 1;
        var go = open * t;
        x += p.dx * go + (Math.sin(time * .0007 + p.sway) * .006 + handX * hover * .02) * go;
        y += p.dy * go - .05 * go * t + (Math.cos(time * .0006 + p.sway) * .005 + handY * hover * .015) * go;
        ctx.globalAlpha = 1 - open * (1 - smoothstep(t / .08) * (1 - smoothstep((t - .3) / .7)));
      }
      stamp(ctx, tiles[p.type][p.shade], x, y, p.size, p.angle, w, h);
      ctx.globalAlpha = 1;
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function smoothstep(value) {
    value = clamp(value, 0, 1);
    return value * value * (3 - 2 * value);
  }

  // Cached photograph sprites are shared by every blend. The idle render is
  // also used to build the WebP fallback.
  function draw(canvas, atlas, items, spread, unusedPointer, flow) {
    var ctx = canvas.getContext("2d"), w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!atlas.hocSprites) {
      var s = sheetOf(atlas.hocSheet), sw = atlas.width / s.cols, sh = atlas.height / s.rows, t = s.tile;
      atlas.hocSprites = s.names.map(function (_, i) {
        var tile = document.createElement("canvas");
        tile.width = tile.height = t;
        var tc = tile.getContext("2d");
        tc.shadowColor = "rgba(39,30,18," + s.shadow + ")";
        tc.shadowBlur = 7 * t / 256; tc.shadowOffsetY = 3 * t / 256;
        tc.drawImage(atlas, i % s.cols * sw, Math.floor(i / s.cols) * sh, sw, sh, 0, 0, t, t);
        return tile;
      });
    }
    var time = flow ? flow.time : 0;
    var hover = flow ? flow.hover || 0 : 0;
    var handX = flow ? flow.x || 0 : 0, handY = flow ? flow.y || 0 : 0;
    if (items.heap) return drawHeap(ctx, w, h, atlas, items, spread, time, hover, handX, handY);
    items.forEach(function (p) {
      var local = smoothstep((spread - p.phase * .18) / .82);
      var radius = Math.hypot(p.x, p.y);
      var edge = smoothstep(radius / .28);
      // Expansion is proportional to distance: the core never becomes a ring.
      var turn = local * (.10 + edge * .18);
      turn += Math.sin(time * .00072 + p.pulse * .3) * (.022 + hover * .052) * local * edge;
      var rx = p.x * Math.cos(turn) - p.y * Math.sin(turn);
      var ry = p.x * Math.sin(turn) + p.y * Math.cos(turn);
      var x = .5 + rx * (1 + local * .28 * edge);
      var y = .5 + ry * (1 + local * .17 * edge);
      // A shared current carries the core too. Fine leaves have a little
      // independent drift; pointer speed never enters the motion equation.
      var buoyancy = local * (.35 + edge * .65);
      x += (Math.sin(time * .0008 + p.pulse * .25) * (.005 + hover * .008) + handX * hover * .018) * buoyancy;
      y += (Math.cos(time * .0007 + p.pulse * .3) * (.006 + hover * .008) + handY * hover * .013) * buoyancy;
      y += Math.sin(time * .001 + p.pulse) * .003 * p.float * local;
      var size = p.size * w;
      var angle = p.angle + p.turn * local * .12 + Math.sin(time * .0008 + p.pulse) * (.018 + hover * .05) * local;
      // translate + rotate in one call
      var c = Math.cos(angle), sn = Math.sin(angle);
      ctx.setTransform(c, sn, -sn, c, x * w, y * h);
      ctx.drawImage(atlas.hocSprites[p.type], -size / 2, -size / 2, size, size);
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // A domain-warped noise field, computed once. Sampling this field makes the
  // pigment front irregular without a fluid simulation or WebGL dependency.
  var field = null, FW = 256, FH = 96;
  function noise(x, y) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    function hash(a, b) {
      var n = Math.imul(a, 374761393) + Math.imul(b, 668265263);
      n = Math.imul(n ^ n >>> 13, 1274126177);
      return ((n ^ n >>> 16) >>> 0) / 4294967295;
    }
    var a = hash(ix, iy), b = hash(ix + 1, iy);
    var c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }
  function fbm(x, y) {
    return noise(x, y) * .54 + noise(x * 2.1 + 7, y * 2.1) * .28 +
      noise(x * 4.3, y * 4.3 + 12) * .13 + noise(x * 8.6, y * 8.6) * .05;
  }
  function inkField() {
    if (field) return field;
    field = new Float32Array(FW * FH);
    for (var y = 0; y < FH; y++) {
      for (var x = 0; x < FW; x++) {
        var u = x / FW * 6, v = y / FH * 4;
        var warp = fbm(u + 21, v + 5);
        field[y * FW + x] = fbm(u + warp * 2.7, v + warp * 2.1);
      }
    }
    return field;
  }
  function rgb(value) {
    var match = /^#([\da-f]{6})$/i.exec(value.trim());
    var n = match ? parseInt(match[1], 16) : 0xAD3450;
    return [n >> 16, n >> 8 & 255, n & 255];
  }
  function drawInfusion(canvas, pixels, color, origin, progress, time, hover) {
    var ctx = canvas.getContext("2d"), data = pixels.data, values = inkField();
    var shift = time * .003, ix = Math.floor(shift), mix = shift - ix;
    var front = origin.x + .06 + (1.12 - origin.x) * progress;
    var strength = smoothstep(progress * 3.3);
    var radiusX = origin.radiusX || .36, radiusY = origin.radiusY || .93;
    for (var y = 0; y < FH; y++) {
      var py = y / (FH - 1);
      for (var x = 0; x < FW; x++) {
        var px = x / (FW - 1), k = (y * FW + x) * 4;
        // Advect the pigment to the right, matching the direction of travel.
        var sx = ((x - ix) % FW + FW) % FW;
        var a = values[y * FW + sx], b = values[y * FW + (sx + FW - 1) % FW];
        var n = a + (b - a) * mix;
        var right = smoothstep((front + (n - .5) * .32 - px) / .15);
        var edges = smoothstep(px / .07) * smoothstep((1 - px) / .08);
        edges *= smoothstep(py / .09) * smoothstep((1 - py) / .09);
        // An upstream source feeds a widening downstream plume. There is no
        // radial distance, annulus or closed contour around the ingredients.
        var dx = (px - origin.x) / radiusX, dy = (py - origin.y) / radiusY;
        var downstream = Math.max(0, dx);
        var left = smoothstep((dx + .42) / .22);
        var bend = Math.sin(dx * 2.6 - time * .0006) * (.022 + downstream * .025);
        var axis = bend + (n - .5) * (.12 + downstream * .055);
        var width = .20 + progress * .04 + smoothstep(downstream / 1.8) * .09 + (n - .5) * .06;
        var body = Math.exp(-Math.pow((dy - axis) / width, 2) * 1.5);
        var upper = axis - .14 - Math.sin(dx * 3.2 - time * .00075) * .06;
        var lower = axis + .12 + Math.sin(dx * 2.7 - time * .0006) * .065;
        var wisps = Math.exp(-Math.pow((dy - upper) / .065, 2)) * .14;
        wisps += Math.exp(-Math.pow((dy - lower) / .07, 2)) * .11;
        var density = .60 + smoothstep((n - .24) * 1.8) * .40;
        var concentration = .34 + .38 * Math.exp(-downstream * .95);
        var plume = body * concentration + wisps * smoothstep((dx + .15) / .5);
        var alpha = Math.min(.78, plume * density * (1 + (hover || 0) * .10)) * left * right * strength * edges;
        data[k] = color[0]; data[k + 1] = color[1]; data[k + 2] = color[2];
        data[k + 3] = Math.round(alpha * 255);
      }
    }
    ctx.putImageData(pixels, 0, 0);
  }

  root.HOCBotanicals = { names: names, pieces: pieces, draw: draw, drawInfusion: drawInfusion };
  if (!root.HOC || !root.HOC.controller) return;
  var HOC = root.HOC, atlases = {};
  function load(url) {
    if (!atlases[url]) atlases[url] = new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); }; img.onerror = reject; img.src = url;
    });
    return atlases[url];
  }

  HOC.controller("botanical-pile", function (el) {
    var row = el.closest(".hoc-range__cell"), stage = el.closest(".hoc-range__stage");
    var canvas, ink, pixels, atlas, items, marker, visibleObserver, centerObserver, resizeObserver;
    var disposed = false, loading = false, visible = false, centered = false, armed = false;
    var running = false, last = 0, age = 0, lastPaint = 0, progress = 0, motionTime = 0;
    var hover = 0, hoverTarget = 0;
    var pointer = { x: 0, y: 0 }, target = { x: 0, y: 0 };
    var origin = { x: .17, y: .5 }, color = [173, 52, 80];
    var mq = root.matchMedia("(prefers-reduced-motion: reduce)");
    function reduced() { return mq.matches || HOC.env.tier === "reduced"; }
    function stop() { HOC.ticker.remove(tick); running = false; last = 0; }
    function reset() {
      stop(); age = progress = lastPaint = motionTime = hover = hoverTarget = 0; armed = false;
      pointer.x = pointer.y = target.x = target.y = 0;
      el.classList.remove("is-infusing");
      el.dataset.infusionProgress = "0";
      el.dataset.hoverStrength = "0";
      if (canvas && atlas) draw(canvas, atlas, items, 0, null, { time: 0 });
      if (ink) ink.getContext("2d").clearRect(0, 0, FW, FH);
    }
    function wake() {
      if (running || !visible || (!armed && !hoverTarget && hover < .003) || !atlas || reduced() || document.hidden) return;
      running = true; last = 0; HOC.ticker.add(tick);
    }
    function start() {
      if (!visible || !centered || reduced()) return;
      armed = true;
      if (atlas) el.classList.add("is-infusing");
      wake();
    }
    function tick(t) {
      if (reduced()) { reset(); return; }
      if (!visible || document.hidden) { stop(); return; }
      var dt = last ? Math.min(t - last, 64) : 16;
      last = t; motionTime += dt;
      if (armed) age += dt;
      hover += (hoverTarget - hover) * (1 - Math.exp(-dt / (hoverTarget ? 380 : 720)));
      var follow = 1 - Math.exp(-dt / 420);
      pointer.x += (target.x - pointer.x) * follow;
      pointer.y += (target.y - pointer.y) * follow;
      // Independent of pointer position and frame rate. Colour continues to
      // travel right while this product remains on screen.
      progress = 1 - Math.exp(-age / 3550);
      if (!armed && !hoverTarget && hover < .003) { reset(); return; }
      if (t - lastPaint < 33) return;
      lastPaint = t;
      paint();
      el.dataset.infusionProgress = progress.toFixed(3);
      el.dataset.hoverStrength = hover.toFixed(3);
    }
    function paint() {
      var spread = Math.max(smoothstep(Math.min(1, age / 1750)), hover * .45);
      draw(canvas, atlas, items, spread, null, { time: motionTime, hover: hover, x: pointer.x, y: pointer.y });
      if (progress > 0) drawInfusion(ink, pixels, color, origin, progress, motionTime, hover);
    }
    function move(e) {
      if (e.pointerType === "touch" || reduced()) return;
      var box = el.getBoundingClientRect();
      target.x = clamp((e.clientX - box.left) / box.width * 2 - 1, -1, 1);
      target.y = clamp((e.clientY - box.top) / box.height * 2 - 1, -1, 1);
    }
    function enter(e) {
      if (e.pointerType === "touch" || reduced()) return;
      hoverTarget = 1; move(e); wake();
    }
    function leave() {
      hoverTarget = 0; target.x = target.y = 0;
    }
    function measure() {
      if (!canvas || !stage || !row) return;
      var stageBox = stage.getBoundingClientRect(), rowBox = row.getBoundingClientRect();
      var pileBox = el.getBoundingClientRect();
      var width = Math.max(1, Math.round(el.clientWidth * Math.min(root.devicePixelRatio || 1, 1.5)));
      if (canvas.width !== width) canvas.width = canvas.height = width;
      ink.style.left = (stageBox.left - rowBox.left) + "px";
      ink.style.width = stageBox.width + "px";
      origin.x = clamp((pileBox.left + pileBox.width / 2 - stageBox.left) / stageBox.width, .1, .4);
      origin.y = clamp((pileBox.top + pileBox.height / 2 - rowBox.top) / rowBox.height, .2, .7);
      origin.radiusX = pileBox.width / stageBox.width;
      origin.radiusY = pileBox.width / rowBox.height;
      paint();
    }
    function prepare() {
      if (loading || reduced()) return;
      items = pieces((el.dataset.ingredients || "").split("|"), el.dataset.seed || "hoc", el.dataset.sheet);
      if (!items.length) return;
      loading = true;
      load(el.dataset.atlas).then(function (image) {
        if (disposed) return;
        loading = false;
        atlas = image;
        // One image per URL, so one sheet per image: set before the first draw.
        if (!atlas.hocSheet) atlas.hocSheet = el.dataset.sheet || "botanical";
        canvas = document.createElement("canvas"); canvas.setAttribute("aria-hidden", "true");
        ink = document.createElement("canvas"); ink.className = "hoc-range__infusion";
        ink.setAttribute("aria-hidden", "true"); ink.width = FW; ink.height = FH;
        pixels = ink.getContext("2d").createImageData(FW, FH);
        color = rgb(getComputedStyle(el).getPropertyValue("--liquid"));
        row.prepend(ink); el.appendChild(canvas);
        measure(); el.classList.add("is-ready");
        if (armed) { el.classList.add("is-infusing"); wake(); }
        else { start(); wake(); }
      }).catch(function () { loading = false; /* Static photo remains if the atlas fails. */ });
    }
    function visibility() { if (document.hidden) stop(); else wake(); }
    function preference() {
      if (reduced()) reset();
      else { if (visible && !atlas) prepare(); start(); }
    }
    function watchCenter() {
      if (!marker || disposed) return;
      if (centerObserver) centerObserver.disconnect();
      centered = false;
      // Begin on the approach to center, while the pile is still in the
      // lower third. Pixels keep this band independent of viewport width.
      centerObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) { centered = entry.isIntersecting; if (centered) start(); });
      }, { rootMargin: "-" + Math.round(root.innerHeight * .44) + "px 0px -" +
        Math.round(root.innerHeight * .18) + "px 0px" });
      centerObserver.observe(marker);
    }
    return {
      init: function () {
        if (!row || !stage) return;
        marker = document.createElement("span");
        marker.className = "hoc-range__center-marker"; marker.setAttribute("aria-hidden", "true");
        el.appendChild(marker);
        el.dataset.infusionProgress = "0";
        el.dataset.hoverStrength = "0";
        visibleObserver = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            visible = entry.isIntersecting;
            if (visible) { if (!atlas) prepare(); start(); }
            else reset();
          });
        });
        visibleObserver.observe(row);
        watchCenter();
        resizeObserver = new ResizeObserver(measure); resizeObserver.observe(row);
        document.addEventListener("visibilitychange", visibility);
        mq.addEventListener("change", preference);
        HOC.on("tierchange", preference);
        el.addEventListener("pointerenter", enter);
        el.addEventListener("pointermove", move, { passive: true });
        el.addEventListener("pointerleave", leave);
        el.addEventListener("pointercancel", leave);
      },
      resize: function () { measure(); watchCenter(); },
      destroy: function () {
        disposed = true; reset();
        if (visibleObserver) visibleObserver.disconnect();
        if (centerObserver) centerObserver.disconnect();
        if (resizeObserver) resizeObserver.disconnect();
        if (canvas) canvas.remove(); if (ink) ink.remove(); if (marker) marker.remove();
        el.classList.remove("is-ready"); delete el.dataset.infusionProgress; delete el.dataset.hoverStrength;
        document.removeEventListener("visibilitychange", visibility);
        mq.removeEventListener("change", preference);
        HOC.off("tierchange", preference);
        el.removeEventListener("pointerenter", enter);
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerleave", leave);
        el.removeEventListener("pointercancel", leave);
      }
    };
  });

  // Every blend carries one fixed specimen field. Only the complete blend
  // moves, so resizing never changes a recipe's particle count or pattern.
  HOC.controller("footer-current", function (el) {
    var viewport = el.querySelector(".hoc-current__viewport");
    var entries = Array.prototype.slice.call(el.querySelectorAll(".hoc-current__item"));
    var button = el.querySelector("[data-current-pause]");
    var observer, near, visible = false, playing = false, paused = false, focused = false, hovering = false;
    // The petals are cut from the 600 KB atlas sheet. Nothing references it
    // until the footer is within a screen of view, so it is not first-paint
    // weight for a page most visitors never scroll to the bottom of.
    var approached = !("IntersectionObserver" in root);
    var decorated = false, enabled = false, width = 600, offset = 620, total = 0, viewportWidth = 0;
    var last = 0, speed = 0, lastPaint = 0, petals = [];
    var columns = 14, rows = 6, cellWidth = 23, cellHeight = 25, particleSize = 22;
    var recipes = entries.map(function (entry) {
      return (entry.dataset.ingredients || "").split("|").map(function (name) {
        return names.indexOf(name.trim());
      }).filter(function (i) { return i >= 0; });
    });
    var mq = root.matchMedia("(prefers-reduced-motion: reduce)");
    function reduced() { return mq.matches || HOC.env.reduced || HOC.env.tier === "reduced"; }
    function stop() { HOC.ticker.remove(tick); playing = false; last = 0; }
    function wake() {
      if (playing || !enabled || !visible || paused || focused || document.hidden) return;
      playing = true; last = 0; HOC.ticker.add(tick);
    }
    function decorate() {
      if (decorated || !approached) return;
      decorated = true;
      entries.forEach(function (entry, index) {
        var media = entry.querySelector(".hoc-current__media");
        var recipe = recipes[index];
        var rand = random(entry.dataset.seed || String(index));
        var group = [];
        var slots = [];
        if (!media || !recipe.length) { petals.push(group); return; }
        // Even representation, seeded once. Position and size never depend on
        // the viewport or the animation clock.
        for (var slot = 0; slot < columns * rows; slot++) slots.push(recipe[slot % recipe.length]);
        for (var shuffle = slots.length - 1; shuffle > 0; shuffle--) {
          var swap = Math.floor(rand() * (shuffle + 1)), held = slots[shuffle];
          slots[shuffle] = slots[swap]; slots[swap] = held;
        }
        var fragment = document.createDocumentFragment();
        for (var i = 0; i < slots.length; i++) {
          var col = i % columns, row = Math.floor(i / columns);
          var type = slots[i], node = document.createElement("span");
          node.className = "hoc-current__petal"; node.setAttribute("aria-hidden", "true");
          node.dataset.botanical = names[type];
          node.style.backgroundImage = 'url("' + el.dataset.atlas + '")';
          node.style.backgroundPosition = (type % 6 / 5 * 100) + "% " + (Math.floor(type / 6) / 4 * 100) + "%";
          var x = col * cellWidth + (cellWidth - particleSize) / 2 + (rand() - .5) * 1.5;
          var y = row * cellHeight + (cellHeight - particleSize) / 2 + (rand() - .5) * 2;
          node.style.transform = "translate3d(" + x.toFixed(2) + "px," + y.toFixed(2) + "px,0) rotate(" + ((rand() - .5) * 16).toFixed(2) + "deg)";
          fragment.appendChild(node);
          group.push(node);
        }
        media.appendChild(fragment);
        petals.push(group);
      });
      el.classList.add("is-matrix-ready");
    }
    function paint() {
      entries.forEach(function (entry, i) {
        // Negative index makes the catalogue follow Gift -> Mystic -> ... as
        // it enters from the left, travelling toward the right.
        var x = ((offset - i * width) % total + total) % total - width;
        var on = x > -width && x < viewportWidth;
        entry.style.transform = "translate3d(" + x.toFixed(2) + "px,0,0)";
        entry.style.visibility = on ? "visible" : "hidden";
        entry.inert = !on;
        if (on) entry.removeAttribute("aria-hidden"); else entry.setAttribute("aria-hidden", "true");
      });
      el.dataset.flowOffset = offset.toFixed(2);
    }
    function tick(t) {
      if (reduced()) { mode(); return; }
      if (!visible || paused || focused || document.hidden) { stop(); return; }
      var dt = last ? Math.min(t - last, 64) : 16;
      last = t;
      var target = hovering ? 13 : (viewportWidth < 700 ? 32 : 48);
      speed += (target - speed) * (1 - Math.exp(-dt / 550));
      offset = (offset + speed * dt / 1000) % total;
      if (t - lastPaint < 33) return;
      lastPaint = t; paint();
    }
    function measure() {
      if (!entries.length) return;
      width = entries[0].getBoundingClientRect().width || 600;
      total = width * entries.length; viewportWidth = viewport.clientWidth;
      if (enabled) paint();
    }
    function mode() {
      enabled = !reduced() && entries.length > 1;
      el.classList.toggle("is-flowing", enabled);
      button.hidden = !enabled;
      if (!enabled) {
        stop();
        entries.forEach(function (entry) { entry.style.transform = ""; entry.style.visibility = ""; entry.inert = false; entry.removeAttribute("aria-hidden"); });
        decorate();
      } else {
        decorate();
        measure(); wake();
      }
    }
    function pause() {
      paused = !paused;
      button.setAttribute("aria-pressed", String(paused));
      button.textContent = root.HOC && HOC.t ? HOC.t(paused ? "Resume flow" : "Pause flow") : paused ? "Resume flow" : "Pause flow";
      if (paused) stop(); else wake();
    }
    function enter(e) { if (e.pointerType !== "touch") hovering = true; }
    function leave() { hovering = false; }
    function focusIn() { focused = true; stop(); }
    function focusOut(e) { if (!viewport.contains(e.relatedTarget)) { focused = false; wake(); } }
    function visibility() { if (document.hidden) stop(); else wake(); }
    function navigate(e) {
      var link = e.target.closest("[data-range-index]");
      if (!link) return;
      var cells = document.querySelectorAll(".hoc-range__col--left .hoc-range__cell");
      var cell = cells[Number(link.dataset.rangeIndex)];
      if (!cell) return;
      e.preventDefault();
      var box = cell.getBoundingClientRect(), y = root.scrollY + box.top + box.height / 2 - (root.innerHeight / 2 + 31);
      if (HOC.lenis) HOC.lenis.scrollTo(y); else root.scrollTo({ top: y, behavior: reduced() ? "instant" : "smooth" });
    }
    return {
      init: function () {
        if (!entries.length || !viewport || !button) return;
        button.textContent = root.HOC && HOC.t ? HOC.t("Pause flow") : "Pause flow"; button.setAttribute("aria-pressed", "false");
        if (!approached) {
          near = new IntersectionObserver(function (events) {
            if (!events[events.length - 1].isIntersecting) return;
            near.disconnect(); approached = true; mode();
          }, { rootMargin: "0px 0px 100% 0px" });
          near.observe(el);
        }
        mode();
        observer = new IntersectionObserver(function (events) {
          visible = events[0].isIntersecting;
          if (visible && enabled) { decorate(); paint(); wake(); } else stop();
        });
        observer.observe(viewport);
        button.addEventListener("click", pause);
        viewport.addEventListener("pointerenter", enter); viewport.addEventListener("pointerleave", leave);
        viewport.addEventListener("focusin", focusIn); viewport.addEventListener("focusout", focusOut);
        viewport.addEventListener("click", navigate);
        mq.addEventListener("change", mode); HOC.on("tierchange", mode);
        document.addEventListener("visibilitychange", visibility);
      },
      resize: measure,
      destroy: function () {
        stop(); if (observer) observer.disconnect(); if (near) near.disconnect();
        button.removeEventListener("click", pause);
        viewport.removeEventListener("pointerenter", enter); viewport.removeEventListener("pointerleave", leave);
        viewport.removeEventListener("focusin", focusIn); viewport.removeEventListener("focusout", focusOut);
        viewport.removeEventListener("click", navigate);
        mq.removeEventListener("change", mode); HOC.off("tierchange", mode);
        document.removeEventListener("visibilitychange", visibility);
        el.classList.remove("is-flowing", "is-matrix-ready"); delete el.dataset.flowOffset; button.hidden = true;
        entries.forEach(function (entry) { entry.style.transform = ""; entry.style.visibility = ""; entry.inert = false; entry.removeAttribute("aria-hidden"); });
        petals.forEach(function (group) { group.forEach(function (node) { node.remove(); }); });
      }
    };
  });
})(window);
