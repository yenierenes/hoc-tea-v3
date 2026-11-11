/* ==========================================================================
   HOC TEA — hoc-matcha.js
   How a bowl of matcha is made, drawn as you scroll (/blends/#matcha).

   One timeline, scrubbed by scroll. The tea set inks itself in as the stage
   arrives; the stage then pins and the six steps play: warm, sift, pour,
   whisk, lift, serve. The drawing's markup is its final frame, so with no
   JS, no GSAP or reduced motion it simply stays a finished still life next
   to the full list of steps (tools/pages/matcha.mjs).
   ========================================================================== */

(function (root) {
  "use strict";

  var HOC = root.HOC;
  if (!HOC || !HOC.controller) return;

  var MOTION = "(prefers-reduced-motion: no-preference)";
  var WIDE = "(min-width: 900px) and (min-height: 600px) and " + MOTION;
  var NARROW = "(max-width: 899px) and (min-height: 540px) and " + MOTION;
  // Time given to each step on the timeline; the set's ink-in comes first.
  var DUR = [1.7, 2.5, 2.7, 3, 2.35, 2.1];
  // The whisk's W across the tea (drawing units), and its rest contact point.
  var W = [[238, 357], [262, 343], [286, 366], [310, 341], [334, 366], [358, 341], [382, 364], [402, 350]];
  var REST = [540, 506], LIFT = -240;

  HOC.controller("matcha", function (el) {
    var gsap = root.gsap, ST = root.ScrollTrigger;
    var make = HOC.$("[data-matcha-make]", el);
    var stage = HOC.$("[data-matcha-stage]", el);
    var svg = stage && HOC.$("svg", stage);
    var items = HOC.$$("[data-matcha-step]", el);
    var bar = HOC.$("[data-matcha-bar]", el);
    var mm = null, current = -1;

    function setStep(i) {
      if (i === current) return;
      current = i;
      items.forEach(function (li, n) {
        li.classList.toggle("is-on", n === i);
        li.classList.toggle("is-past", n < i);
        if (n === i) li.setAttribute("aria-current", "step");
        else li.removeAttribute("aria-current");
      });
    }

    function build(narrow) {
      var $ = function (s) { return svg.querySelector(s); };
      var $$ = function (s) { return HOC.$$(s, svg); };
      var pinVh = narrow ? 3.2 : 4.2; // pinned scroll, in screen heights
      var lead = 0.4; // scroll before the pin, while the set inks itself in
      var total = DUR.reduce(function (a, b) { return a + b; }, 0);
      var E = total * lead / pinVh; // so the ink-in fills exactly that lead
      var at = [E];
      for (var i = 1; i < DUR.length; i++) at.push(at[i - 1] + DUR[i - 1]);

      var tl = gsap.timeline({ paused: true, defaults: { ease: "sine.inOut", duration: 0.4 } });

      // Ink a line on. Hidden until its own stroke starts: an undrawn
      // round-capped path would otherwise leave a dot where it begins.
      function draw(t, time, dur, each) {
        tl.fromTo(t, { visibility: "hidden" }, { visibility: "visible", duration: 0.001, stagger: each || 0 }, time)
          .fromTo(t, { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: dur, stagger: each || 0 }, time);
      }
      // A line that runs through and dissolves: steam, the wipe.
      function pass(p, time, dur) {
        tl.fromTo(p, { opacity: 0, drawSVG: "0% 0%" }, { opacity: 1, drawSVG: "0% 55%", duration: dur * 0.45, ease: "sine.in" }, time)
          .to(p, { opacity: 0, drawSVG: "60% 100%", duration: dur * 0.55, ease: "sine.out" }, time + dur * 0.45);
      }

      /* -- 0. the set inks in: bowl, pitcher, whisk, the bowl's sprig ---- */
      draw($$(".m-bowl .m-l"), 0, E * 0.5, E * 0.06);
      draw($$(".m-ground .m-l"), E * 0.2, E * 0.3, E * 0.1);
      draw($$(".m-rim"), E * 0.3, E * 0.35, E * 0.05);
      draw($$(".m-pitcher .m-l"), E * 0.28, E * 0.45, E * 0.05);
      draw($$(".m-whisk .m-l"), E * 0.42, E * 0.42, E * 0.012);
      draw($$(".m-front .m-l"), E * 0.62, E * 0.3, E * 0.06);

      /* -- 1. warm the bowl, then wipe it dry ------------------------------ */
      var t = at[0];
      $$(".m-warm").forEach(function (p, n) { pass(p, t + 0.1 + n * 0.24, 1); });
      pass($(".m-wipe"), t + 0.75, 0.8);

      /* -- 2. sift two scoops ---------------------------------------------- */
      t = at[1];
      var sieve = $(".m-sieve"), scoop = $(".m-scoop"), mound = $(".m-mound");
      var heap = $$(".m-heap circle");
      tl.set(sieve, { opacity: 1 }, t)
        .fromTo(sieve, { y: -18 }, { y: 0, duration: 0.6, ease: "sine.out" }, t);
      draw($$(".m-sieve .m-l"), t, 0.5, 0.04);
      tl.set(scoop, { opacity: 1 }, t + 0.35)
        .fromTo(scoop, { x: 90, y: -36, svgOrigin: "531 93" }, { x: 0, y: 0, duration: 0.55, ease: "sine.out" }, t + 0.35);
      draw($$(".m-scoop .m-l"), t + 0.35, 0.4, 0.05);
      tl.fromTo(heap, { opacity: 0 }, { opacity: 1, duration: 0.15, stagger: 0.02 }, t + 0.6);
      // Two scoops: tip, the powder drops through the mesh, scoop again, tip.
      [".m-fall-a", ".m-fall-b"].forEach(function (sel, n) {
        var k = t + 0.95 + n * 0.6, fall = $$(sel + " circle");
        if (n) tl.fromTo(heap, { y: 0, opacity: 0 }, { opacity: 1, duration: 0.14, stagger: 0.015, immediateRender: false }, k - 0.24);
        tl.set($(sel), { opacity: 1 }, k)
          .to(scoop, { rotation: -9, duration: 0.18, ease: "sine.out" }, k)
          .to(scoop, { rotation: 0, duration: 0.22 }, k + 0.2)
          .to(heap, { y: 58, opacity: 0, duration: 0.3, ease: "sine.in", stagger: 0.02 }, k + 0.06)
          .fromTo(fall, { y: -18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.16, ease: "none", stagger: 0.025 }, k + 0.2)
          .to(fall, { y: 16, opacity: 0, duration: 0.18, ease: "none", stagger: 0.025 }, k + 0.36);
        if (n) tl.to(mound, { scale: 1, duration: 0.3, ease: "sine.out" }, k + 0.35);
        else tl.fromTo(mound, { scale: 0.2, opacity: 0, transformOrigin: "50% 100%" }, { scale: 0.6, opacity: 1, duration: 0.3, ease: "sine.out" }, k + 0.35);
      });
      tl.to(scoop, { x: 90, y: -36, opacity: 0, duration: 0.4, ease: "sine.in" }, t + 2.05)
        .to(sieve, { y: -18, opacity: 0, duration: 0.4, ease: "sine.in" }, t + 2.1);

      /* -- 3. pour 70 ml along the side ----------------------------------- */
      t = at[2];
      var pitcher = $(".m-pitcher"), stream = $(".m-stream");
      tl.fromTo(pitcher, { x: 0, y: 0, rotation: 0, svgOrigin: "118 486" }, { x: 32, y: -190, duration: 0.6 }, t)
        .to(pitcher, { rotation: 42, duration: 0.4 }, t + 0.5)
        .set(stream, { opacity: 1 }, t + 0.82)
        .fromTo(stream, { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 0.25, ease: "sine.in" }, t + 0.82)
        .fromTo($(".m-liquid"), { opacity: 0, y: 44, scale: 0.72, transformOrigin: "50% 50%" }, { opacity: 1, y: 0, scale: 1, duration: 0.9, ease: "sine.out" }, t + 1)
        .to(mound, { opacity: 0, duration: 0.5 }, t + 1.05)
        .to(stream, { drawSVG: "100% 100%", duration: 0.25, ease: "sine.in" }, t + 1.7)
        .set(stream, { opacity: 0 }, t + 1.95)
        .to(pitcher, { rotation: 0, duration: 0.35 }, t + 1.8)
        .to(pitcher, { x: 0, y: 0, duration: 0.6 }, t + 2.05)
        // its ground line goes with it and returns when it is set down
        .to($(".m-ground-p"), { opacity: 0, duration: 0.3 }, t + 0.05)
        .to($(".m-ground-p"), { opacity: 1, duration: 0.3 }, t + 2.4);
      $$(".m-pour").forEach(function (p, n) { pass(p, t + 1.2 + n * 0.25, 0.9); });

      /* -- 4. whisk in a W --------------------------------------------------- */
      t = at[3];
      var whisk = $(".m-whisk"), wpath = $(".m-wpath");
      var bx = 320 - REST[0], by = 360 - REST[1]; // the bowl's centre, tines just under
      tl.fromTo(whisk, { x: 0, y: 0, rotation: 0, svgOrigin: REST.join(" ") }, { y: LIFT, duration: 0.45 }, t)
        .to($(".m-ground-w"), { opacity: 0, duration: 0.3 }, t + 0.05)
        .to(whisk, { x: bx, duration: 0.5 }, t + 0.3)
        .to(whisk, { y: by, duration: 0.42, ease: "sine.out" }, t + 0.72);
      var seg = 0.17, t0 = t + 1.14, len = [0];
      for (i = 1; i < W.length; i++) len.push(len[i - 1] + Math.hypot(W[i][0] - W[i - 1][0], W[i][1] - W[i - 1][1]));
      tl.set(wpath, { opacity: 1 }, t0);
      W.forEach(function (p, n) {
        tl.to(whisk, { x: p[0] - REST[0], y: p[1] + 4 - REST[1], rotation: n % 2 ? 7 : -7, duration: seg }, t0 + n * seg);
        var to = { drawSVG: "0% " + (len[n] / len[len.length - 1] * 100).toFixed(2) + "%", duration: seg, ease: "none" };
        if (n === 0) tl.fromTo(wpath, { drawSVG: "0% 0%" }, to, t0);
        else tl.to(wpath, to, t0 + n * seg);
      });
      var wEnd = t0 + W.length * seg;
      tl.fromTo($(".m-froth-base"), { opacity: 0 }, { opacity: 1, duration: wEnd - t0, ease: "sine.in" }, t0)
        .fromTo($$(".m-froth circle"), { opacity: 0 }, { opacity: 1, duration: 0.12, stagger: (wEnd - t0) / 80 }, t0 + 0.08)
        .fromTo($(".m-bubbles"), { opacity: 0 }, { opacity: 1, duration: 0.01 }, t0)
        .fromTo($$(".m-bubbles circle"), { scale: 0, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.14, stagger: (wEnd - t0) / 11 }, t0 + 0.05)
        .to(whisk, { x: bx, y: by, rotation: 0, duration: 0.24 }, wEnd);

      /* -- 5. smooth the foam, lift from the centre ------------------------ */
      t = at[4];
      var swirl = $(".m-swirl");
      tl.to($$(".m-bubbles circle"), { scale: 0, duration: 0.35, stagger: 0.02 }, t)
        .to(wpath, { opacity: 0, duration: 0.5 }, t + 0.05)
        .set(swirl, { opacity: 1 }, t + 0.1)
        .fromTo(swirl, { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 0.6, ease: "none" }, t + 0.1)
        .to(swirl, { opacity: 0, duration: 0.3 }, t + 0.75);
      [[286, 352], [320, 341], [354, 352], [320, 363], [286, 352]].forEach(function (p, n) {
        tl.to(whisk, { x: p[0] - REST[0], y: p[1] + 4 - REST[1], duration: 0.12, ease: n ? "none" : "sine.inOut" }, t + n * 0.12);
      });
      tl.to(whisk, { x: bx, y: by, duration: 0.15 }, t + 0.72)
        .to(whisk, { y: LIFT, duration: 0.5 }, t + 0.9)
        .to(whisk, { x: 0, duration: 0.5 }, t + 1.35)
        .to(whisk, { y: 0, duration: 0.45, ease: "sine.out" }, t + 1.8)
        .to($(".m-ground-w"), { opacity: 1, duration: 0.3 }, t + 2);
      draw($(".m-peak"), t + 0.98, 0.25);

      /* -- 6. serve, the front of the bowl facing the guest --------------- */
      t = at[5];
      tl.fromTo($(".m-front"), { x: 96, scaleX: 0.3, transformOrigin: "50% 50%" }, { x: 0, scaleX: 1, duration: 1.1 }, t + 0.1)
        .set({}, {}, at[5] + DUR[5]);
      draw($(".m-last"), t + 0.5, 0.9);

      function sync() {
        var now = tl.time(), n = 0;
        for (var j = 1; j < at.length; j++) if (now >= at[j] - 0.001) n = j;
        setStep(n);
        var p = gsap.utils.clamp(0, 1, (now - at[n]) / DUR[n]);
        items.forEach(function (li, k) { li.style.setProperty("--p", k < n ? 1 : k === n ? p.toFixed(3) : 0); });
        if (bar) bar.style.transform = "scaleX(" + tl.progress().toFixed(4) + ")";
      }
      tl.eventCallback("onUpdate", sync);

      el.classList.add("is-live");
      var pin = ST.create({
        trigger: make,
        pin: true,
        start: "top top",
        end: function () { return "+=" + Math.round(pinVh * root.innerHeight); },
        anticipatePin: 1
      });
      ST.create({
        trigger: make,
        start: "top " + Math.round(lead * 100) + "%",
        end: function () { return pin.end; },
        scrub: narrow ? 0.4 : 0.7,
        animation: tl
      });
      sync();

      return function () {
        el.classList.remove("is-live");
        if (bar) bar.style.transform = "";
        items.forEach(function (li) { li.style.removeProperty("--p"); });
        current = -1;
        setStep(0);
      };
    }

    return {
      init: function () {
        var forced = /[?&]hoctier=reduced/.test(root.location.search);
        if (!gsap || !ST || !root.DrawSVGPlugin || !svg || !make || forced || HOC.designMode) return;
        gsap.registerPlugin(ST, root.DrawSVGPlugin);
        mm = gsap.matchMedia();
        mm.add({ wide: WIDE, narrow: NARROW }, function (c) {
          if (!c.conditions.wide && !c.conditions.narrow) return;
          return build(!!c.conditions.narrow);
        });
        // Webfonts change the height above the stage; re-measure once in.
        if (root.document.fonts) root.document.fonts.ready.then(function () { ST.refresh(); });
      },
      destroy: function () {
        if (mm) mm.revert();
        mm = null;
      }
    };
  });
})(window);
