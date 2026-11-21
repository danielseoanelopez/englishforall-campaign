/* English for ALL · Rank Up — keep the app at 100% on iPad / iPhone / Android.
   Safari ignores "user-scalable=no" in the browser, so this also blocks the pinch gesture itself.
   Double-tap zoom is blocked with touch-action (taps on buttons stay instant). Scrolling is untouched. */
(function () {
  "use strict";
  var css = document.createElement("style");
  css.textContent = "html,body{touch-action:pan-x pan-y;-webkit-text-size-adjust:100%;text-size-adjust:100%}";
  (document.head || document.documentElement).appendChild(css);

  function block(e) { e.preventDefault(); }
  ["gesturestart", "gesturechange", "gestureend"].forEach(function (t) {
    document.addEventListener(t, block, { passive: false });
  });
  /* two fingers on the screen = a pinch: stop it (one finger still scrolls) */
  document.addEventListener("touchmove", function (e) {
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }, { passive: false });
  /* trackpad / ctrl + wheel zoom on desktop */
  document.addEventListener("wheel", function (e) { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

  /* if the page was already zoomed when this loaded (old tab), the viewport tag below resets it */
  var vp = document.querySelector('meta[name="viewport"]');
  var want = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";
  if (!vp) { vp = document.createElement("meta"); vp.name = "viewport"; (document.head || document.documentElement).appendChild(vp); }
  if (vp.getAttribute("content") !== want) vp.setAttribute("content", want);
})();
