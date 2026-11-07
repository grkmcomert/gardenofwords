/* Garden of Words — "Sweet Garden" visuals.
   Purely decorative: falling petals behind the app and a confetti/star burst
   when a bed is completed or the player levels up. It only watches existing
   elements' classes; it never reads or writes game state or storage. */
(function () {
  "use strict";
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) {}

  function petals() {
    if (document.querySelector(".sweet-sky")) return;
    var sky = document.createElement("div");
    sky.className = "sweet-sky";
    sky.setAttribute("aria-hidden", "true");
    sky.innerHTML = '<span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span>';
    if (!reduceMotion) {
      var kinds = ["", "leafy", "sunny"];
      for (var i = 0; i < 14; i++) {
        var p = document.createElement("i");
        p.className = "sweet-petal " + kinds[i % 3];
        p.style.left = (Math.random() * 100) + "%";
        p.style.animationDuration = (10 + Math.random() * 12) + "s";
        p.style.animationDelay = (-Math.random() * 20) + "s";
        p.style.scale = (.6 + Math.random() * .8).toFixed(2);
        sky.appendChild(p);
      }
    }
    document.body.insertBefore(sky, document.body.firstChild);
  }

  var FX = {
    cv: null, ctx: null, parts: [], run: false, dpr: 1,
    ensure: function () {
      if (!this.cv) {
        this.cv = document.createElement("canvas");
        this.cv.className = "sweet-fx";
        this.cv.setAttribute("aria-hidden", "true");
        document.body.appendChild(this.cv);
      }
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.cv.width = window.innerWidth * this.dpr;
      this.cv.height = window.innerHeight * this.dpr;
      this.ctx = this.cv.getContext("2d");
    },
    burst: function (x, y, n, o) {
      o = o || {};
      var cols = ["#ff7c9c", "#ffc23d", "#3fae72", "#63c3f2", "#9b7be0", "#ffffff"];
      var shapes = ["rect", "petal", "dot", "star"];
      for (var i = 0; i < n; i++) {
        var a = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 2;
        var sp = (o.speed || 9) * (.4 + Math.random() * .8);
        this.parts.push({
          x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: .18,
          r: Math.random() * 6.28, vr: (Math.random() - .5) * .3,
          s: 9 * (.6 + Math.random() * .8), c: cols[(Math.random() * cols.length) | 0],
          shape: shapes[(Math.random() * shapes.length) | 0], life: 1, decay: .006 + Math.random() * .004, drag: .985
        });
      }
      var self = this;
      if (!this.run) { this.run = true; requestAnimationFrame(function () { self.tick(); }); }
    },
    confetti: function () {
      if (reduceMotion) return;
      this.ensure();
      var self = this, w = window.innerWidth, h = window.innerHeight;
      for (var k = 0; k < 3; k++) {
        (function (k) {
          setTimeout(function () { self.burst(w * (.15 + Math.random() * .7), h * .25, 45); }, k * 220);
        })(k);
      }
    },
    tick: function () {
      var c = this.ctx, self = this;
      if (!c) { this.run = false; return; }
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, this.cv.width, this.cv.height);
      this.parts = this.parts.filter(function (p) { return p.life > 0; });
      for (var i = 0; i < this.parts.length; i++) {
        var p = this.parts[i];
        p.vx *= p.drag; p.vy = p.vy * p.drag + p.g; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= p.decay;
        c.save();
        c.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5));
        c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = p.c;
        if (p.shape === "petal") { c.beginPath(); c.ellipse(0, 0, p.s, p.s * .55, 0, 0, 6.28); c.fill(); }
        else if (p.shape === "rect") { c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); }
        else if (p.shape === "star") { star(c, p.s * .9); }
        else { c.beginPath(); c.arc(0, 0, p.s * .45, 0, 6.28); c.fill(); }
        c.restore();
      }
      if (this.parts.length) requestAnimationFrame(function () { self.tick(); });
      else { this.run = false; c.clearRect(0, 0, this.cv.width, this.cv.height); }
    }
  };
  function star(c, r) {
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * .45 : r;
      c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath(); c.fill();
  }

  // Fire confetti whenever one of these overlays gains its "open" class.
  function watchOpen(el) {
    if (!el || typeof MutationObserver !== "function") return;
    var wasOpen = el.classList.contains("open");
    new MutationObserver(function () {
      var isOpen = el.classList.contains("open");
      if (isOpen && !wasOpen) setTimeout(function () { FX.confetti(); }, 180);
      wasOpen = isOpen;
    }).observe(el, { attributes: true, attributeFilter: ["class"] });
  }

  function init() {
    try {
      petals();
      watchOpen(document.getElementById("modalBackdrop"));
      document.querySelectorAll(".levelup").forEach(watchOpen);
      // The level-up overlay may be created later by meta.js.
      if (typeof MutationObserver === "function") {
        new MutationObserver(function (records) {
          records.forEach(function (r) {
            r.addedNodes.forEach(function (n) {
              if (n.nodeType === 1 && n.classList && n.classList.contains("levelup")) {
                watchOpen(n);
                if (n.classList.contains("open")) setTimeout(function () { FX.confetti(); }, 180);
              }
            });
          });
        }).observe(document.body, { childList: true });
      }
      window.SweetFX = FX;
      // Free players see small "PRO" / crown badges on the Market and Themes cards.
      var syncPremium = function () {
        var pro = false;
        try { pro = typeof isPremiumUser === "function" && isPremiumUser(); } catch (_) {}
        document.body.classList.toggle("sweet-free", !pro);
      };
      syncPremium();
      window.addEventListener("revenueCatCustomerInfoChanged", function () { setTimeout(syncPremium, 0); });
      setInterval(syncPremium, 4000);
    } catch (_) {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
