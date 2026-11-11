/* ==========================================================================
   HOC TEA — hoc-about.js
   The About page's one orchestrated moment. Loads after hoc-core.js and
   hoc-motion.js; the page reads the same without it.

   THE BALANCE (data-hoc="about-scale")
   The opening sentence sits on a beam over a fulcrum: "a base," then "a
   flower or fruit to carry it," then "and one small touch that sets the
   balance." Each part is set down in that order and the beam answers its
   weight — it dips under the base, eases as the flower or fruit goes on, and
   only comes level when the small touch lands. The proportion is in the type
   sizes; this is the weighing. It runs once, when the opening is in view.

   Cast (choreograph):
     beam   — support, reacts on each landing (synced to the landing, not to
              the drop), the last move is the longest and quietest
     parts  — lead, one after another: reading order is the recipe order
     pivot  — static. The thing everything turns about does not move.
   Reduced motion: no tilt, no drop; the sentence is simply there, level.
   ========================================================================== */

(function (root, doc) {
  "use strict";

  var HOC = root.HOC;
  if (!HOC || !HOC.controller) return;

  var mqReduce = root.matchMedia("(prefers-reduced-motion: reduce)");

  HOC.controller("about-scale", function (el) {
    var gsap = root.gsap;
    var ScrollTrigger = root.ScrollTrigger;
    var beam = HOC.$("[data-scale-beam]", el);
    var parts = HOC.$$("[data-scale-part]", el);
    var tl = null;
    var st = null;
    var waitTimer = 0;
    var started = false;
    var dead = false;

    function settle() {
      el.classList.add("is-set");
      if (gsap) gsap.set([beam].concat(parts), { clearProps: "transform,opacity" });
    }

    function build() {
      var ease = gsap.parseEase("hoc") ? "hoc" : "power3.out";
      var easeLong = gsap.parseEase("hoc.scene") ? "hoc.scene" : "power2.out";
      var narrow = root.matchMedia("(max-width: 767px)").matches;
      // The tilt reads the same at every width: a few degrees on a phone,
      // a little less on a beam that spans a desktop.
      var dip = narrow ? -3.2 : -2.1;
      var ease2 = narrow ? -1.4 : -0.9;

      gsap.set(parts, { opacity: 0 });
      gsap.set(parts[0], { yPercent: -34 });
      gsap.set(parts[1], { yPercent: -42 });
      gsap.set(parts[2], { yPercent: -30 });

      var t = gsap.timeline({ paused: true, onComplete: settle });
      // 1 — the base is set down; the beam dips under it as it lands.
      t.to(parts[0], { opacity: 1, yPercent: 0, duration: 0.8, ease: ease }, 0)
        .to(beam, { rotation: dip, duration: 0.95, ease: ease }, 0.42)
        // 2 — the flower or fruit; the beam starts to come back.
        .to(parts[1], { opacity: 1, yPercent: 0, duration: 0.72, ease: ease }, 0.7)
        .to(beam, { rotation: ease2, duration: 0.85, ease: ease }, 1.06)
        // 3 — the small touch; only now does the beam come level.
        .to(parts[2], { opacity: 1, yPercent: 0, duration: 0.6, ease: ease }, 1.32)
        .to(beam, { rotation: 0, duration: 1.35, ease: easeLong }, 1.6);
      return t;
    }

    function start() {
      if (dead || !tl || started) return;
      started = true;
      if (ScrollTrigger) {
        st = ScrollTrigger.create({
          trigger: el,
          start: "top 88%",
          once: true,
          onEnter: function () {
            tl.play(0);
          }
        });
      } else {
        tl.play(0);
      }
    }

    return {
      init: function () {
        // From here the script owns the parts; the CSS failsafe stands down.
        el.classList.add("is-armed");
        if (!gsap || !beam || parts.length !== 3 || mqReduce.matches) {
          settle();
          return;
        }
        tl = build();
        // Wait (briefly) for Instrument Serif, so the base is not set down in
        // the fallback face and swapped mid-flight.
        var go = function () {
          if (waitTimer) root.clearTimeout(waitTimer);
          waitTimer = 0;
          start();
        };
        waitTimer = root.setTimeout(go, 700);
        if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(go, go);
      },
      destroy: function () {
        dead = true;
        if (waitTimer) root.clearTimeout(waitTimer);
        if (st) st.kill();
        if (tl) tl.kill();
        st = tl = null;
        if (gsap) gsap.set([beam].concat(parts), { clearProps: "transform,opacity" });
        el.classList.remove("is-armed", "is-set");
      }
    };
  });
})(window, document);
