/* ==========================================================================
   HOC TEA — hoc-product.js  (product pages only)

   Loads after hoc-core.js and hoc-motion.js. Four controllers:

     product-detail  pack tiles, quantity, the live price, the add bar on
                     phones, the gallery strip. The cart's own "add"
                     controller (hoc-core.js) reads the checked
                     [data-pdp-variant] and [name="quantity"] inside this
                     element, so adding to the bag needs nothing from here.
     pdp-inside      attaches the specimen plates once the section is near.
     pdp-brew        scales the recipe to the cups and the serve.
     brew-glass      the brew glass. Clear water; once the glass has settled
                     in view a handful of the blend's botanicals drops in, the
                     colour rises from the base to the brim, and the bar and
                     the steep counter run with it. It plays once. A change of
                     serve animates only what changes: ice in or out, and a
                     switch to or from cold brew pours fresh water and runs
                     the colour again on the hours counter.

   Everything works without this file: native radios, a real form, the
   one-cup recipe, and a glass that is already brewed.
   ========================================================================== */

(function (root, doc) {
  "use strict";

  var HOC = root.HOC;
  if (!HOC || !HOC.controller) return;

  var $ = HOC.$;
  var $$ = HOC.$$;
  var on = HOC.onEl;

  function shopify() {
    return !!(root.HOC.routes && root.HOC.routes.cartAdd);
  }

  /** No motion: the visitor asks for reduced motion, QA pins
      ?hoctier=reduced, or GSAP is missing. (HOC.env.tier "reduced" also
      means "no WebGL", which an SVG glass does not need, so the tier alone
      is not the test.) */
  function still() {
    return (
      !root.gsap ||
      !!(HOC.env && HOC.env.reduced) ||
      /[?&]hoctier=reduced/.test(root.location.search)
    );
  }

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }
  function smooth(a, b, x) {
    var t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  }

  /** Seeded random — the generator hoc-botanicals.js and product.mjs use. */
  function seeded(seed) {
    var n = 2166136261;
    for (var i = 0; i < seed.length; i++) n = Math.imul(n ^ seed.charCodeAt(i), 16777619);
    return function () {
      n += 0x6d2b79f5;
      var t = Math.imul(n ^ (n >>> 15), 1 | n);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ======================================================================
     PRODUCT DETAIL
     ====================================================================== */
  HOC.controller("product-detail", function (el) {
    var offs = [];
    var form = $("[data-pdp-form]", el);
    var quantity = form && $('[name="quantity"]', form);
    var status = $("[data-pdp-status]", el);
    var mainAdd = $("[data-pdp-add]", el);
    var bar = $("[data-pdp-bar]", el);
    var barPack = $("[data-pdp-bar-pack]", el);
    var gallery = $("[data-pdp-gallery]", el);
    var slides = gallery && $(".hoc-pdp__slides", gallery);
    var thumbs = gallery ? $$("[data-pdp-thumb]", gallery) : [];
    var packImg = $('[data-pdp-pack="doypack"]', el);
    var packPics = $$("[data-pdp-pack]", el);
    var originalSrc = packImg && packImg.getAttribute("src");
    var originalSrcset = packImg && packImg.getAttribute("srcset");
    var io = null,
      edges = null,
      addVisible = true, // the main add button is in view or still below it
      footVisible = false,
      brewVisible = false,
      raf = 0,
      current = 0,
      announced = false,
      hideTimer = 0;

    function variant() {
      var input = $("[data-pdp-variant]:checked", el);
      if (!input) return;
      $$("[data-pdp-price]", el).forEach(function (n) {
        if (input.dataset.price) n.textContent = input.dataset.price;
      });
      var available = input.dataset.available !== "false";
      $$('[data-hoc="add"]', el).forEach(function (b) {
        b.disabled = !available;
      });
      if (barPack && input.dataset.label) barPack.textContent = input.dataset.label;
      // Announce only what the visitor changed, never the initial state.
      if (status && announced) {
        status.textContent = (input.dataset.label || input.value) + ", " + (input.dataset.price || "");
      }
      announced = true;
      // The picture follows the pack: white doypack, colour label or tin.
      packPics.forEach(function (pic) {
        pic.hidden = pic.getAttribute("data-pdp-pack") !== input.value;
      });
      // On Shopify a variant may bring its own image.
      if (packImg && input.dataset.imageUrl) {
        if (input.dataset.imageUrl) {
          packImg.removeAttribute("srcset");
          packImg.src = input.dataset.imageUrl;
        } else {
          if (originalSrcset) packImg.setAttribute("srcset", originalSrcset);
          if (originalSrc) packImg.src = originalSrc;
        }
      }
      if (root.HOC.routes && input.value) {
        var url = new URL(root.location.href);
        url.searchParams.set("variant", input.value);
        root.history.replaceState(null, "", url);
      }
    }

    function clampQty(step) {
      if (!quantity) return;
      var n = parseInt(quantity.value, 10);
      if (isNaN(n)) n = 1;
      quantity.value = Math.max(1, Math.min(99, n + step));
    }

    /* The add bar: in once the main button has scrolled away above, out of
       the way where the page has controls of its own near the bottom edge
       (the brew console) and once the footer arrives. Enter and leave the
       same way, from below. */
    function showBar(show) {
      if (!bar) return;
      if (show) {
        root.clearTimeout(hideTimer);
        if (bar.hidden) {
          bar.hidden = false;
          void bar.offsetHeight; // start from below, so the slide runs
        }
        bar.classList.add("is-shown");
      } else if (!bar.hidden && bar.classList.contains("is-shown")) {
        bar.classList.remove("is-shown");
        root.clearTimeout(hideTimer);
        hideTimer = root.setTimeout(function () {
          if (!bar.classList.contains("is-shown")) bar.hidden = true;
        }, still() ? 0 : 440);
      }
    }
    function syncBar() {
      if (!bar || !mainAdd) return;
      showBar(!addVisible && !footVisible && !brewVisible && mainAdd.getBoundingClientRect().top < 0);
    }

    /* Gallery: a scroll-snap strip, so a swipe, a trackpad, the thumbnails
       and the arrow keys all move the same thing. Inert with one picture. */
    function mark(index) {
      current = index;
      thumbs.forEach(function (t, i) {
        if (i === index) t.setAttribute("aria-current", "true");
        else t.removeAttribute("aria-current");
      });
    }
    function show(index) {
      var target = slides && slides.children[index];
      if (!target) return;
      slides.scrollTo({ left: target.offsetLeft - slides.firstElementChild.offsetLeft, behavior: still() ? "auto" : "smooth" });
      mark(index);
    }
    function settle() {
      raf = 0;
      var n = slides.children.length;
      var index = Math.max(0, Math.min(n - 1, Math.round(slides.scrollLeft / (slides.clientWidth || 1))));
      if (index !== current) mark(index);
    }

    return {
      init: function () {
        offs.push(
          on(el, "click", function (e) {
            var step = e.target.closest("[data-pdp-qty]");
            if (step) clampQty(parseInt(step.getAttribute("data-pdp-qty"), 10));
          })
        );
        offs.push(
          on(el, "change", function (e) {
            if (e.target.matches("[data-pdp-variant]")) variant();
            if (e.target === quantity) clampQty(0);
          })
        );
        if (form) {
          // Enter in the quantity field adds to the bag rather than leaving
          // the page. On Shopify the cart script owns the submit.
          offs.push(
            on(form, "submit", function (e) {
              if (shopify()) return;
              e.preventDefault();
              if (mainAdd) mainAdd.click();
            })
          );
        }
        variant();

        if (slides && thumbs.length) {
          thumbs.forEach(function (t, i) {
            offs.push(
              on(t, "click", function () {
                show(i);
              })
            );
          });
          offs.push(
            on(slides, "scroll", function () {
              if (!raf) raf = root.requestAnimationFrame(settle);
            }, { passive: true })
          );
          offs.push(
            on(slides, "keydown", function (e) {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              var n = slides.children.length;
              show((current + (e.key === "ArrowRight" ? 1 : -1) + n) % n);
            })
          );
        }

        if (bar && mainAdd && "IntersectionObserver" in root) {
          // "Still to come or in view" vs "scrolled past": the root reaches
          // far below the screen, so a jump from below the button to above
          // it (an anchor, a fling) still crosses an edge and reports.
          io = new IntersectionObserver(
            function (entries) {
              addVisible = entries[entries.length - 1].isIntersecting;
              syncBar();
            },
            { rootMargin: "0px 0px 100000px 0px" }
          );
          io.observe(mainAdd);
          var foot = doc.querySelector(".hoc-footer");
          var brew = doc.querySelector('[data-hoc="pdp-brew"]');
          edges = new IntersectionObserver(
            function (entries) {
              entries.forEach(function (en) {
                if (en.target === foot) footVisible = en.isIntersecting;
                if (en.target === brew) brewVisible = en.isIntersecting;
              });
              syncBar();
            },
            { rootMargin: "0px 0px -15% 0px" }
          );
          if (foot) edges.observe(foot);
          if (brew) edges.observe(brew);
        }
      },
      destroy: function () {
        offs.forEach(function (off) {
          off();
        });
        if (io) io.disconnect();
        if (edges) edges.disconnect();
        if (raf) root.cancelAnimationFrame(raf);
        root.clearTimeout(hideTimer);
      }
    };
  });

  /* ======================================================================
     IN THE BLEND — the plates load once the section is a screen away.
     ====================================================================== */
  HOC.controller("pdp-inside", function (el) {
    var list = $("[data-plates]", el);
    var io = null;
    function attach() {
      var url = list.getAttribute("data-plates");
      $$(".hoc-pdp-plate__img", list).forEach(function (n) {
        if (n.style.getPropertyValue("--plate")) n.style.backgroundImage = "url('" + url + "')";
      });
    }
    return {
      init: function () {
        if (!list) return;
        if (!("IntersectionObserver" in root)) return attach();
        io = new IntersectionObserver(
          function (entries) {
            if (!entries[entries.length - 1].isIntersecting) return;
            io.disconnect();
            io = null;
            attach();
          },
          { rootMargin: "0px 0px 100% 0px" }
        );
        io.observe(el);
      },
      destroy: function () {
        if (io) io.disconnect();
      }
    };
  });

  /* ======================================================================
     BREW CONSOLE — the recipe, scaled to the cups and the serve.
     ====================================================================== */
  HOC.controller("pdp-brew", function (el) {
    var offs = [];
    var d = el.dataset;
    var R = {
      gLo: +d.gLo, gHi: +d.gHi, ml: +d.ml, c: +d.c, mLo: +d.minLo, mHi: +d.minHi,
      coldG: +d.coldG || 0, coldMl: +d.coldMl || 0, coldH: +d.coldH || 0
    };
    var cupsInput = $("[data-brew-cups-input]", el);
    var status = $("[data-brew-status]", el);
    var out = {};
    ["g", "ml", "c", "cu", "t", "tu", "method"].forEach(function (k) {
      out[k] = $('[data-brew="' + k + '"]', el);
    });
    var touched = false;

    function mode() {
      var m = $(".hoc-pdp-brew__modes input:checked", el);
      return m ? m.value : "hot";
    }
    function cups() {
      var n = parseInt(cupsInput && cupsInput.value, 10);
      n = Math.max(1, Math.min(8, isNaN(n) ? 1 : n));
      if (cupsInput) cupsInput.value = n;
      return n;
    }
    function fmt(n) {
      return String(Math.round(n * 10) / 10);
    }
    function range(lo, hi) {
      return lo === hi ? fmt(lo) : fmt(lo) + "–" + fmt(hi);
    }
    function set(k, v) {
      if (out[k] && out[k].textContent !== String(v)) out[k].textContent = v;
    }

    function render() {
      var m = mode();
      var n = cups();
      var ml = R.ml * n;
      var TR = root.HOC && HOC.lang === "tr";
      var lead = TR ? n + " fincan" : n + (n === 1 ? " cup" : " cups");
      var said;
      if (m === "cold" && R.coldG) {
        var g = fmt((R.coldG * ml) / R.coldMl);
        set("g", g);
        set("ml", ml);
        set("c", TR ? "Soğuk" : "Cold");
        set("cu", "");
        set("t", R.coldH);
        set("tu", TR ? "sa" : "h");
        set("method", TR
          ? "Yaprakları soğuk suya ekleyin (litreye " + R.coldG + " g), üzerini kapatıp buzdolabında " + R.coldH +
            " saat bekletin. Süzüp servis edin."
          : "Add the leaf to cold water (" + R.coldG + " g to a litre), cover, and leave it in the fridge for " +
            R.coldH + " hours. Strain and serve.");
        said = TR
          ? "Soğuk demleme, " + lead + ": " + ml + " ml soğuk suya " + g + " g yaprak, buzdolabında " + R.coldH + " saat."
          : "Cold brew, " + lead + ": " + g + " g of leaf in " + ml + " ml of cold water, " + R.coldH + " hours in the fridge.";
      } else {
        var gr = range(R.gLo * n, R.gHi * n);
        var t = range(R.mLo, R.mHi);
        set("g", gr);
        set("ml", ml);
        set("c", R.c);
        set("cu", "°C");
        set("t", t);
        set("tu", TR ? "dk" : "min");
        set("method", TR
          ? m === "iced"
            ? "Önce sıcak demleyin: " + R.c + " °C su, " + t + " dakika. Süzün, soğumaya bırakın, ardından buz dolu bir bardağa dökün."
            : "Yaprağın üzerine " + R.c + " °C su dökün, " + t + " dakika demleyip süzün."
          : m === "iced"
            ? "Brew it hot: water at " + R.c + " °C, " + t + " minutes. Strain, let it cool, then pour it over a glass of ice."
            : "Pour water at " + R.c + " °C over the leaf, steep " + t + " minutes, then strain.");
        said = TR
          ? (m === "iced" ? "Buzlu, " : "Sıcak, ") + lead + ": " + gr + " g yaprak, " + R.c + " °C'de " + ml + " ml su, " + t + " dakika."
          : (m === "iced" ? "Iced, " : "Hot, ") + lead + ": " + gr + " g of leaf, " + ml + " ml of water at " + R.c +
            " °C, " + t + " minutes.";
      }
      if (status && touched) status.textContent = said;
    }

    return {
      init: function () {
        offs.push(
          on(el, "change", function (e) {
            if (e.target.closest(".hoc-pdp-brew__modes") || e.target === cupsInput) {
              touched = true;
              render();
            }
          })
        );
        offs.push(
          on(el, "click", function (e) {
            var b = e.target.closest("[data-brew-cups]");
            if (!b || !cupsInput) return;
            cupsInput.value = cups() + parseInt(b.getAttribute("data-brew-cups"), 10);
            touched = true;
            render();
          })
        );
        render(); // a restored form state (back/forward) shows its own recipe
      },
      destroy: function () {
        offs.forEach(function (off) {
          off();
        });
      }
    };
  });

  /* ======================================================================
     THE BREW GLASS

     The markup (tools/pages/product.mjs) is the brewed end state. With
     motion, init winds it back to clear water and the glass waits to be
     seen: at least 60% of it in view, the scroll at rest, the tab visible,
     the botanical plates decoded (or 2.5 s gone). Then, once:

       0.0 s  the handful drops from above the rim, all at once
       0.4 s  it meets the water: rings on the surface, petals and leaves
              float, fruit and bark sink, a few pieces hang between
       0.5 s  colour comes out of the botanicals and pools at the base;
              the front rises, the bar fills and the counter counts up to
              the top of the steep range, all on one eased curve
       6.5 s  the glass is coloured to the brim; ice drops in if "Iced"

     Two GSAP clocks, each feeding a pure paint(t): one for the pieces, one
     for the colour, so a cold-brew switch can re-run the colour while the
     pieces stay where they lie. Nothing is written per frame once both
     clocks have stopped.
     ====================================================================== */
  HOC.controller("brew-glass", function (el) {
    var gsap = root.gsap;
    var section = el.closest('[data-hoc="pdp-brew"]') || el.parentNode;
    var vessel = $(".hoc-brewglass__vessel", el);
    var air = $(".hoc-brewglass__air", el);
    var dye = $(".hoc-brewglass__dye", el);
    var veil = $(".hoc-brewglass__veil", el);
    var foot = $(".hoc-brewglass__foot", el);
    var front = $("[data-front]", el);
    var feather = $("[data-feather]", el);
    var bar = $(".hoc-brewglass__fill", el);
    var clock = $("[data-clock]", el);
    var streaks = $$(".hoc-brewglass__streak", el);
    var ripples = $$(".hoc-brewglass__ripple", el);
    var seed = el.getAttribute("data-seed") || "hoc";
    var STEEP_HOT = +el.getAttribute("data-steep") || 300;
    var STEEP_COLD = +el.getAttribute("data-steep-cold") || 0;

    // Glass units, as product.mjs builds them: y points down.
    var Y_SURF = -0.71175;
    var FEATHER = 0.2; // the soft edge of the rising colour, share of the column
    var C0 = 0.5; // the colour starts as the first pieces land...
    var CDUR = 6; // ...and reaches the brim six seconds later
    var P_END = 4.6; // every piece has come to rest by then
    var VEIL = 0.42;
    var easeColour = gsap ? gsap.parseEase("sine.inOut") : function (x) { return x; };
    var easeOut = gsap ? gsap.parseEase("power2.out") : function (x) { return x; };

    /* ---- the handful ---------------------------------------------------- */
    var pieces = $$(".hoc-brewglass__piece", el).map(function (node, i) {
      var v = node.getAttribute("data-rest").split(" ").map(Number);
      var r = seeded(seed + "/" + i);
      var kind = node.getAttribute("data-kind");
      var p = {
        node: node,
        home: node.parentNode,
        kind: kind,
        x: v[0], y: v[1], r: v[2], s: v[3],
        d: r() * 0.26, // the whole handful lands within a quarter second
        x0: (r() - 0.5) * 0.18, // poured from near the middle
        y0: -1.2 - r() * 0.2, // above the rim
        tf: 0.4 + r() * 0.12, // time to the surface
        spin: (r() - 0.5) * 380, // degrees per second in the air
        ph: r() * 6.2832,
        tau: kind === "float" ? 0.42 : kind === "mid" ? 1.25 : 0.6 + r() * 0.3,
        wet: true,
        o: 1
      };
      p.xe = p.x0 + (p.x - p.x0) * 0.4; // where it meets the water
      p.r0 = p.r - p.spin * p.tf + (r() - 0.5) * 40; // lands close to its resting turn
      p.land = p.d + p.tf;
      return p;
    });
    var firstIn = pieces.slice().sort(function (a, b) {
      return a.land - b.land;
    });
    var tune = seeded(seed + "/streaks");
    streaks.forEach(function (g, k) {
      g.__p = firstIn[k] || null;
      g.__t0 = k * 0.32;
      g.__len = 0.85 + tune() * 0.45;
      g.__w = 0.75 + tune() * 0.5;
      g.__o = 0;
    });

    function home(p) {
      // Back into its own layer, in its own place in the stacking order.
      var next = null;
      for (var i = pieces.indexOf(p) + 1; i < pieces.length; i++) {
        if (pieces[i].home === p.home && pieces[i].node.parentNode === p.home) {
          next = pieces[i].node;
          break;
        }
      }
      p.home.insertBefore(p.node, next);
    }

    /** Where piece p is t seconds after the drop. */
    function pose(p, t) {
      var a = t - p.d;
      if (a < p.tf) {
        var at = Math.max(0, a);
        var u = at / p.tf;
        return {
          wet: false,
          x: p.x0 + (p.xe - p.x0) * u,
          y: p.y0 + (Y_SURF - p.y0) * u * u, // falling: gravity
          r: p.r0 + p.spin * at,
          o: Math.min(1, at / 0.12)
        };
      }
      var s = a - p.tf;
      var k = Math.exp(-s / p.tau);
      var fade = Math.exp(-s / 0.9);
      var y = p.y + (Y_SURF - p.y) * k;
      // A floating piece goes under with its momentum and bobs back up.
      if (p.kind === "float") y += 0.05 * Math.sin(Math.min(s, 0.9) * 3.49) * Math.exp(-s / 0.4);
      return {
        wet: true,
        x: p.x + (p.xe - p.x) * k + 0.022 * Math.sin(s * 3.1 + p.ph) * fade,
        y: y,
        r: p.r + (p.r0 + p.spin * p.tf - p.r) * k + 9 * Math.sin(s * 2.4 + p.ph) * fade,
        o: 1
      };
    }

    function paintPieces(t) {
      for (var i = 0; i < pieces.length; i++) {
        var p = pieces[i];
        var q = pose(p, t);
        if (q.wet !== p.wet) {
          if (q.wet) home(p);
          else air.appendChild(p.node);
          p.wet = q.wet;
        }
        p.node.setAttribute(
          "transform",
          "translate(" + q.x.toFixed(4) + " " + q.y.toFixed(4) + ") rotate(" + q.r.toFixed(2) + ") scale(" + p.s + ")"
        );
        if (q.o !== p.o) {
          p.node.style.opacity = q.o >= 1 ? "" : q.o.toFixed(3);
          p.o = q.o;
        }
      }
      // rings where the first pieces meet the water
      for (var k = 0; k < ripples.length; k++) {
        var e = ripples[k];
        var f = firstIn[k];
        if (!f) continue;
        var a = (t - f.land) / 1.05;
        var o = a <= 0 || a >= 1 ? 0 : 0.55 * Math.pow(1 - a, 1.6);
        if (!o && !e.__o) continue;
        e.__o = o;
        var rx = 0.03 + 0.26 * easeOut(clamp01(a));
        e.setAttribute("cx", f.xe.toFixed(4));
        e.setAttribute("rx", rx.toFixed(4));
        e.setAttribute("ry", (rx * 0.15).toFixed(4));
        e.style.opacity = o.toFixed(3);
      }
    }

    /* ---- the colour, the bar and the counter ----------------------------- */
    var target = STEEP_HOT;
    var hours = false;
    var cells = $$("span", clock);
    var shown = cells
      .map(function (c) {
        return c.textContent;
      })
      .join("");

    function pad(n) {
      return (n < 10 ? "0" : "") + n;
    }
    function timeText(sec) {
      sec = Math.max(0, Math.round(sec));
      if (hours) return Math.floor(sec / 3600) + ":" + pad(Math.floor((sec % 3600) / 60)) + ":" + pad(sec % 60);
      return pad(Math.floor(sec / 60)) + ":" + pad(sec % 60);
    }
    function setClock(sec) {
      var txt = timeText(sec);
      if (txt === shown) return;
      if (txt.length !== shown.length) {
        clock.textContent = "";
        cells = [];
        for (var i = 0; i < txt.length; i++) {
          var c = doc.createElement("span");
          c.className = txt[i] === ":" ? "hoc-brewglass__c" : "hoc-brewglass__d";
          c.textContent = txt[i];
          clock.appendChild(c);
          cells.push(c);
        }
      } else {
        for (var j = 0; j < txt.length; j++) if (txt[j] !== shown[j]) cells[j].textContent = txt[j];
      }
      shown = txt;
      S.clock = txt;
    }

    function family(m) {
      return m === "cold" && STEEP_COLD ? "cold" : "warm";
    }
    function useMode(m) {
      target = family(m) === "cold" ? STEEP_COLD : STEEP_HOT;
      hours = target >= 3600;
    }

    function paintStreaks(ct, f) {
      for (var k = 0; k < streaks.length; k++) {
        var g = streaks[k];
        var p = g.__p;
        if (!p) continue;
        var q = easeOut(clamp01((ct - g.__t0) / 2.4));
        var o = Math.min(1, q * 3) * (1 - smooth(0.42, 0.86, f));
        if (o < 0.002) {
          if (g.__o) {
            g.style.opacity = "0";
            g.__o = 0;
          }
          continue;
        }
        g.__o = o;
        g.style.opacity = o.toFixed(3);
        g.setAttribute(
          "transform",
          "translate(" + (p.xe + 0.012 * Math.sin(ct * 1.3 + p.ph)).toFixed(4) + " " + (Y_SURF + 0.02) + ") scale(" +
            g.__w.toFixed(3) + " " + Math.max(0.001, q * g.__len).toFixed(4) + ")"
        );
      }
    }

    /** The colour at ct seconds into its rise. One eased curve drives it
        all: the front climbs the glass (soft-edged), the bar stands at the
        height the colour has visibly reached, the counter runs on the same
        curve to the top of the steep range, and the colour deepens a little
        as it goes, ending exactly at the blend's brewed colour. */
    function paintColour(ct) {
      var f = easeColour(clamp01(ct / CDUR));
      var fr = f * (1 + FEATHER) - FEATHER;
      front.setAttribute("offset", clamp01(fr).toFixed(4));
      feather.setAttribute("offset", clamp01(fr + FEATHER).toFixed(4));
      // The liquid spans gradient offsets 0.052 (base) to 0.954 (surface);
      // the bar shows the middle of the soft front within that column.
      bar.style.transform = "scaleY(" + clamp01((fr + FEATHER / 2 - 0.052) / 0.902).toFixed(4) + ")";
      var depth = f >= 1 ? "" : (0.72 + 0.28 * f).toFixed(3);
      dye.style.opacity = depth;
      veil.style.opacity = depth && (VEIL * depth).toFixed(3);
      foot.style.opacity = (0.28 * f).toFixed(3);
      setClock(f * target);
      paintStreaks(ct, f);
      S.f = f;
    }

    /* ---- ice ------------------------------------------------------------- */
    var cubes = $$(".hoc-brewglass__cube", el).map(function (node, i) {
      var v = node.getAttribute("data-rest").split(" ").map(Number);
      return {
        node: node,
        home: node.parentNode,
        x: v[0], y: v[1], r: v[2], s: v[3],
        d: i * 0.12,
        x0: v[0] * 0.5 + (i - 1) * 0.03,
        y0: -1.22 - i * 0.06,
        r0: v[2] - 35 + i * 30,
        wet: true,
        cur: null
      };
    });
    var iceShown = false;

    function cubePose(c, a) {
      var TF = 0.4;
      if (a < TF) {
        var at = Math.max(0, a);
        var u = at / TF;
        return { wet: false, x: c.x0 + (c.x - c.x0) * u, y: c.y0 + (c.y - c.y0) * u * u, r: c.r0 + (c.r - c.r0) * u, sc: c.s, o: Math.min(1, at / 0.1) };
      }
      var s = a - TF;
      return {
        wet: true,
        x: c.x,
        y: c.y + 0.05 * Math.sin(s * 7) * Math.exp(-s / 0.45), // plunges, bobs, floats
        r: c.r + 7 * Math.sin(s * 5.5) * Math.exp(-s / 0.5),
        sc: c.s,
        o: 1
      };
    }
    function drawCube(c, q) {
      if (q.wet !== c.wet) {
        (q.wet ? c.home : air).appendChild(c.node);
        c.wet = q.wet;
      }
      c.node.setAttribute(
        "transform",
        "translate(" + q.x.toFixed(4) + " " + q.y.toFixed(4) + ") rotate(" + q.r.toFixed(2) + ") scale(" + q.sc.toFixed(4) + ")"
      );
      c.node.style.opacity = q.o.toFixed(3);
      c.cur = q;
    }
    function iceIn() {
      kill("ice");
      iceShown = S.ice = true;
      if (still()) {
        cubes.forEach(function (c) {
          drawCube(c, cubePose(c, 99));
        });
        return;
      }
      var st = { t: 0 };
      tw.ice = gsap.to(st, {
        t: 2.4,
        duration: 2.4,
        ease: "none",
        onUpdate: function () {
          cubes.forEach(function (c) {
            drawCube(c, cubePose(c, st.t - c.d));
          });
        },
        onComplete: function () {
          tw.ice = null;
        }
      });
    }
    function iceOut() {
      kill("ice");
      iceShown = S.ice = false;
      if (still()) {
        cubes.forEach(function (c) {
          c.node.style.opacity = "0";
          c.cur = null;
        });
        return;
      }
      // Lifted out gently: up a little, a touch smaller, gone.
      var from = cubes.map(function (c) {
        return c.cur;
      });
      var st = { k: 0 };
      tw.ice = gsap.to(st, {
        k: 1,
        duration: 0.5,
        ease: "power2.out",
        onUpdate: function () {
          cubes.forEach(function (c, i) {
            var q = from[i];
            if (!q) return;
            drawCube(c, { wet: c.wet, x: q.x, y: q.y - 0.12 * st.k, r: q.r, sc: q.sc * (1 - 0.15 * st.k), o: q.o * (1 - st.k) });
          });
        },
        onComplete: function () {
          tw.ice = null;
          cubes.forEach(function (c) {
            c.node.style.opacity = "0";
            c.cur = null;
          });
        }
      });
    }

    /* ---- the clocks ------------------------------------------------------ */
    var S = (el.__brew = { phase: "idle", mode: "hot", f: 1, clock: shown, ice: false });
    var tw = { pieces: null, colour: null, clear: null, ice: null };
    var held = [];
    var pieceClock = { t: 0 };
    var colourClock = { t: 0 };
    var colourDone = false;

    function kill(name) {
      if (tw[name]) tw[name].kill();
      tw[name] = null;
    }
    function settled() {
      if (S.phase === "playing" && !tw.pieces && !tw.colour && !tw.clear) S.phase = "done";
    }

    function modeNow() {
      var m = section && section.querySelector(".hoc-pdp-brew__modes input:checked");
      return m ? m.value : "hot";
    }

    function startColour(delay) {
      kill("colour");
      colourDone = false;
      colourClock.t = 0;
      paintColour(0);
      tw.colour = gsap.to(colourClock, {
        t: CDUR,
        duration: CDUR,
        delay: delay || 0,
        ease: "none",
        onUpdate: function () {
          paintColour(colourClock.t);
        },
        onComplete: function () {
          tw.colour = null;
          colourDone = true;
          paintColour(CDUR);
          if (S.mode === "iced" && !iceShown) iceIn();
          settled();
        }
      });
    }

    /** Fresh water for a different brew: the colour fades out of the glass,
        the bar empties, the counter starts over in its new unit, and the
        colour rises again from the botanicals already in the glass. */
    function replay() {
      kill("colour");
      kill("clear");
      colourDone = false;
      var dye0 = parseFloat(dye.style.opacity || "1");
      var bar0 = parseFloat((/scaleY\(([\d.]+)\)/.exec(bar.style.transform) || [0, 1])[1]);
      var foot0 = parseFloat(foot.style.opacity || "0.28");
      var streak0 = streaks.map(function (g) {
        return g.__o || 0;
      });
      setClock(0);
      var st = { k: 0 };
      tw.clear = gsap.to(st, {
        k: 1,
        duration: 0.5,
        ease: "power2.out",
        onUpdate: function () {
          var o = 1 - st.k;
          dye.style.opacity = (dye0 * o).toFixed(3);
          veil.style.opacity = (VEIL * dye0 * o).toFixed(3);
          bar.style.transform = "scaleY(" + (bar0 * o).toFixed(4) + ")";
          foot.style.opacity = (foot0 * o).toFixed(3);
          streaks.forEach(function (g, k) {
            if (!streak0[k]) return;
            g.__o = streak0[k] * o;
            g.style.opacity = g.__o.toFixed(3);
          });
        },
        onComplete: function () {
          tw.clear = null;
          startColour(0.15); // paints the clear glass first, then rises
        }
      });
    }

    function play() {
      if (S.phase !== "idle") return;
      S.phase = "playing";
      pieceClock.t = 0;
      tw.pieces = gsap.to(pieceClock, {
        t: P_END,
        duration: P_END,
        ease: "none",
        onUpdate: function () {
          paintPieces(pieceClock.t);
        },
        onComplete: function () {
          tw.pieces = null;
          paintPieces(99);
          settled();
        }
      });
      startColour(C0);
    }

    /** Clear water, the handful above the glass, an empty bar, 00:00. */
    function toStart() {
      pieces.forEach(function (p) {
        air.appendChild(p.node);
        p.wet = false;
        p.node.style.opacity = "0";
        p.o = 0;
      });
      useMode(S.mode);
      paintColour(0);
    }

    /** The brewed glass, for the current serve, with no motion. */
    function toEnd() {
      ["pieces", "colour", "clear"].forEach(kill);
      paintPieces(99);
      dye.style.opacity = "";
      veil.style.opacity = "";
      useMode(S.mode);
      paintColour(CDUR);
      colourDone = true;
      if (S.mode === "iced") iceIn();
      else if (iceShown || cubes.some(function (c) { return c.cur; })) iceOut();
      S.phase = "done";
    }

    function setMode(m) {
      if (m === S.mode) return;
      var refamily = family(S.mode) !== family(m);
      S.mode = m;
      if (S.phase === "idle") {
        useMode(m);
        setClock(0);
        return;
      }
      if (still()) return toEnd();
      if (refamily) {
        useMode(m);
        if (iceShown && m !== "iced") iceOut();
        replay();
        return;
      }
      // hot and iced share a recipe: only the ice changes
      if (m === "iced") {
        if (colourDone && !iceShown) iceIn(); // otherwise it follows the colour
      } else if (iceShown) {
        iceOut();
      }
    }

    /* ---- when to play ---------------------------------------------------- */
    var offs = [];
    var ioView = null,
      ioNear = null,
      ratio = 0,
      armTimer = 0,
      readyTimer = 0,
      ready = false;

    function markReady() {
      ready = true;
      root.clearTimeout(readyTimer);
    }
    function attach() {
      $$("image[data-href]", el).forEach(function (im) {
        im.setAttribute("href", im.getAttribute("data-href"));
        im.removeAttribute("data-href");
      });
      readyTimer = root.setTimeout(markReady, 2500);
      var probe = new Image();
      probe.onload = function () {
        if (probe.decode) probe.decode().then(markReady, markReady);
        else markReady();
      };
      probe.onerror = markReady;
      probe.src = el.getAttribute("data-plates");
    }
    function arm() {
      if (S.phase !== "idle" || armTimer) return;
      armTimer = root.setTimeout(check, 380);
    }
    function disarm() {
      root.clearTimeout(armTimer);
      armTimer = 0;
    }
    function check() {
      armTimer = 0;
      if (S.phase !== "idle" || ratio < 0.6) return;
      // Settled: in view, the tab showing, the scroll at rest, art ready.
      if (doc.hidden || (HOC.lenis && HOC.lenis.isScrolling) || !ready) {
        armTimer = root.setTimeout(check, 160);
        return;
      }
      play();
    }
    function onVisibility() {
      if (doc.hidden) {
        Object.keys(tw).forEach(function (k) {
          var t = tw[k];
          if (t && !t.paused()) {
            t.pause();
            held.push(t);
          }
        });
      } else {
        held.forEach(function (t) {
          // only what is still current: a killed tween stays dead
          if (t === tw.pieces || t === tw.colour || t === tw.clear || t === tw.ice) t.resume();
        });
        held = [];
      }
    }

    return {
      init: function () {
        if (!vessel || !front || !feather || !clock) return;
        S.mode = modeNow();
        useMode(S.mode);
        if (still()) toEnd();
        else toStart();

        offs.push(
          on(section, "change", function (e) {
            if (e.target.closest && e.target.closest(".hoc-pdp-brew__modes")) setMode(e.target.value);
          })
        );
        offs.push(
          HOC.bind("tierchange", function () {
            if (still() && S.phase !== "done") toEnd();
          })
        );
        offs.push(on(doc, "visibilitychange", onVisibility));

        if (!("IntersectionObserver" in root)) {
          attach();
          if (S.phase === "idle") toEnd();
          return;
        }
        ioNear = new IntersectionObserver(
          function (entries) {
            if (!entries[entries.length - 1].isIntersecting) return;
            ioNear.disconnect();
            ioNear = null;
            attach();
          },
          { rootMargin: "0px 0px 100% 0px" }
        );
        ioNear.observe(el);
        ioView = new IntersectionObserver(
          function (entries) {
            ratio = entries[entries.length - 1].intersectionRatio;
            if (ratio >= 0.6) arm();
            else disarm();
          },
          { threshold: [0, 0.3, 0.6, 0.8, 1] }
        );
        ioView.observe(vessel);
      },
      destroy: function () {
        offs.forEach(function (off) {
          off();
        });
        if (ioNear) ioNear.disconnect();
        if (ioView) ioView.disconnect();
        disarm();
        root.clearTimeout(readyTimer);
        Object.keys(tw).forEach(kill);
        held = [];
      }
    };
  });
})(window, document);
