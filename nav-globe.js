/* Self-hosted rotating "data globe" for the sidebar.
   Pure canvas, no external dependencies for the globe itself. Adapts to dark
   mode and respects prefers-reduced-motion. Renders into any
   <canvas class="nav-globe">.

   Optional: set ENDPOINT to your visitor-globe Worker URL (see
   visitor-globe-worker/README.md) and accumulated visitor locations will be
   lit up on the globe in amber. Leave it empty for a purely decorative globe. */
(function () {
  "use strict";

  var ENDPOINT = ""; // <- paste your Worker URL here, e.g. "https://visitor-globe.you.workers.dev"

  var POINTS = [];   // [{lat, lng, c}] accumulated visitor locations
  var YOU = null;    // {lat, lng, city, country} current visitor

  function loadPoints() {
    if (!ENDPOINT) return;
    fetch(ENDPOINT, { method: "GET", mode: "cors", credentials: "omit" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && Array.isArray(d.points)) POINTS = d.points;
        if (d && d.you) YOU = d.you;
      })
      .catch(function () { /* ignore: the globe still renders without points */ });
  }

  // Map lat/lng (degrees) to a point on the unit sphere.
  function toSphere(lat, lng) {
    var phi = lat * Math.PI / 180, lam = lng * Math.PI / 180;
    var cphi = Math.cos(phi);
    return [cphi * Math.sin(lam), Math.sin(phi), cphi * Math.cos(lam)];
  }

  function initGlobe(canvas) {
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var W = canvas.width, H = canvas.height;
    var cx = W / 2, cy = H / 2;
    var R = Math.min(W, H) * 0.40;
    var unit = W / 300;

    // Evenly distributed points on a sphere (Fibonacci lattice) — the surface.
    var N = 440;
    var pts = new Array(N);
    var golden = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < N; i++) {
      var y = 1 - (i / (N - 1)) * 2;          // 1 .. -1
      var r = Math.sqrt(Math.max(0, 1 - y * y));
      var t = golden * i;
      pts[i] = [Math.cos(t) * r, y, Math.sin(t) * r];
    }

    var tilt = -0.41;                          // ~23.5deg axial tilt
    var ct = Math.cos(tilt), st = Math.sin(tilt);
    var reduce = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var ang = 0;
    var buf = new Array(N);

    // Apply the globe's current rotation + tilt to a unit-sphere point.
    function project(p, ca, sa) {
      var x1 = p[0] * ca + p[2] * sa;          // rotate about vertical axis
      var z1 = -p[0] * sa + p[2] * ca;
      var y2 = p[1] * ct - z1 * st;            // apply axial tilt
      var z2 = p[1] * st + z1 * ct;
      return [cx + R * x1, cy - R * y2, (z2 + 1) / 2]; // [sx, sy, depth 0..1]
    }

    function frame() {
      // Skip work when hidden (e.g. collapsed sidebar on mobile).
      if (canvas.offsetParent === null) { requestAnimationFrame(frame); return; }

      var dark = document.documentElement.classList.contains("dark-mode");
      var col = dark ? "109,172,240" : "37,99,235";

      ctx.clearRect(0, 0, W, H);

      // Soft glow behind the sphere.
      var g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.3);
      g.addColorStop(0, "rgba(" + col + "," + (dark ? 0.16 : 0.10) + ")");
      g.addColorStop(1, "rgba(" + col + ",0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.3, 0, Math.PI * 2);
      ctx.fill();

      var ca = Math.cos(ang), sa = Math.sin(ang);

      // Surface dots (drawn back-to-front).
      for (var i = 0; i < N; i++) buf[i] = project(pts[i], ca, sa);
      buf.sort(function (a, b) { return a[2] - b[2]; });
      for (var j = 0; j < N; j++) {
        var d = buf[j][2];
        ctx.beginPath();
        ctx.arc(buf[j][0], buf[j][1], (0.7 + d * 2.3) * unit, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + col + "," + (0.14 + d * 0.86).toFixed(3) + ")";
        ctx.fill();
      }

      // Visitor location pins (amber), on the near hemisphere, on top.
      for (var k = 0; k < POINTS.length; k++) {
        var pp = POINTS[k];
        var s = project(toSphere(pp.lat, pp.lng), ca, sa);
        var dep = s[2];
        if (dep < 0.5) continue;               // hide pins on the far side
        var cnt = pp.c || 1;
        var rad = (1.5 + Math.min(2.6, Math.sqrt(cnt) - 1)) * unit;
        var pg = ctx.createRadialGradient(s[0], s[1], 0, s[0], s[1], rad * 3.2);
        pg.addColorStop(0, "rgba(245,158,11," + (0.45 * dep).toFixed(3) + ")");
        pg.addColorStop(1, "rgba(245,158,11,0)");
        ctx.fillStyle = pg;
        ctx.beginPath(); ctx.arc(s[0], s[1], rad * 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s[0], s[1], rad, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(245,158,11," + (0.55 + 0.45 * dep).toFixed(3) + ")";
        ctx.fill();
      }

      // Highlight the current visitor with a white core.
      if (YOU) {
        var sy = project(toSphere(YOU.lat, YOU.lng), ca, sa);
        if (sy[2] >= 0.5) {
          ctx.beginPath(); ctx.arc(sy[0], sy[1], 1.6 * unit, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255," + (0.6 + 0.4 * sy[2]).toFixed(3) + ")";
          ctx.fill();
        }
      }

      if (!reduce) ang += 0.004;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function init() {
    loadPoints();
    var nodes = document.querySelectorAll("canvas.nav-globe");
    for (var i = 0; i < nodes.length; i++) initGlobe(nodes[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
