/*! northwind-fixture v1.0.0 | Apache-2.0 | synthetic WebDNA test file */
(function () {
  "use strict";
  var toggle = document.querySelector(".menu-toggle");
  if (!toggle) return;
  toggle.addEventListener("click", function () {
    var open = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!open));
  });
})();
