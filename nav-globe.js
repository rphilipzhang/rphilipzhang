/* Self-hosted rotating "data globe" for the sidebar.
   Pure canvas, no external dependencies. Adapts to dark mode and
   respects prefers-reduced-motion. Renders into any <canvas class="nav-globe">. */
(function () {
  "use strict";

  function initGlobe(canvas) {
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var W = canvas.width, H = canvas.height;
    var cx = W / 2, cy = H / 2;
    var R = Math.min(W, H) * 0.40;
    var unit = W / 300;

    // Evenly distributed points on a sphere (Fibonacci lattice).
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
      for (var i = 0; i < N; i++) {
        var px = pts[i][0], py = pts[i][1], pz = pts[i][2];
        var x1 = px * ca + pz * sa;            // rotate about vertical axis
        var z1 = -px * sa + pz * ca;
        var y2 = py * ct - z1 * st;            // apply axial tilt
        var z2 = py * st + z1 * ct;
        var depth = (z2 + 1) / 2;              // 0 (back) .. 1 (front)
        buf[i] = [cx + R * x1, cy - R * y2, depth];
      }
      // Draw back-to-front so near points sit on top.
      buf.sort(function (a, b) { return a[2] - b[2]; });
      for (var j = 0; j < N; j++) {
        var d = buf[j][2];
        var alpha = 0.14 + d * 0.86;
        var size = (0.7 + d * 2.3) * unit;
        ctx.beginPath();
        ctx.arc(buf[j][0], buf[j][1], size, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + col + "," + alpha.toFixed(3) + ")";
        ctx.fill();
      }

      if (!reduce) ang += 0.004;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function init() {
    var nodes = document.querySelectorAll("canvas.nav-globe");
    for (var i = 0; i < nodes.length; i++) initGlobe(nodes[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
