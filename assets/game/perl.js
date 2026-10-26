/* Perl, the garden bunny, animated from the real artwork (cut-out puppet style).
 * window.PerlArt.svg(pose) returns the markup (the name is kept for older callers).
 *
 * Two rigs, both from the official art (sprites live in perl-sprites.js):
 *  - "icon": the app-icon Perl with headphones; ears and the waving paw are separate layers.
 *  - "peek": the logo Perl with open eyes, peeking over an edge with both paws.
 * Each pose picks a rig and an animation set in perl.css, plus small props (sun, Zzz, notes...).
 * Layout box is 200x210 units; prop SVGs use that viewBox.
 */
(function () {
  "use strict";

  const RIG = {
    idle: "peek", think: "peek", idea: "peek", talk: "peek", boing: "peek", water: "peek",
    wave: "icon", stretch: "icon", hearts: "icon", lantern: "icon", sleepy: "icon", cheer: "icon",
    clap: "icon", earflop: "icon", giggle: "icon", dance: "icon"
  };
  const GOLD = "#FAC94C", GOLD_DARK = "#DE9E26";

  function star(cx, cy, r, cls) {
    const pts = [];
    for (let i = 0; i < 10; i += 1) {
      const a = Math.PI / 5 * i - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
    }
    return `<polygon class="${cls}" points="${pts.join(" ")}" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width="1" stroke-linejoin="round"/>`;
  }
  function heart(x, y, s, cls) {
    return `<g class="${cls}"><path transform="translate(${x} ${y}) scale(${s})" d="M0 4 C-2 -2 -10 -2 -10 4 C-10 9 -4 12 0 16 C4 12 10 9 10 4 C10 -2 2 -2 0 4Z" fill="#FF7FA3" stroke="#D9557E" stroke-width="1.2"/></g>`;
  }
  function note(x, y, s, cls, double) {
    const d = double
      ? "M0 0 L14 -4 V14 a4 3.2 0 1 1 -2 -2.6 V2 L2 5 V18 a4 3.2 0 1 1 -2 -2.6Z"
      : "M2 -2 V15 a4.2 3.4 0 1 1 -2 -2.8 V-4 Q6 -1 9 4 Q5 0 2 -2Z";
    return `<g class="${cls}"><path transform="translate(${x} ${y}) scale(${s})" d="${d}" fill="#8E6BD8" stroke="#5E43A6" stroke-width=".9"/></g>`;
  }

  const BACK = `<svg class="pr-back" viewBox="0 0 200 210" aria-hidden="true">
    <defs><radialGradient id="prGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFE7A0" stop-opacity=".95"/><stop offset="1" stop-color="#FFC24A" stop-opacity="0"/></radialGradient></defs>
    <g class="pp pp-sun">
      <g class="pp-sun-rays" stroke="#FFC94A" stroke-width="5" stroke-linecap="round">
        ${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<line x1="30" y1="2" x2="30" y2="-6" transform="rotate(${a} 30 26)"/>`).join("")}
      </g>
      <circle cx="30" cy="26" r="15" fill="#FFD866" stroke="#F2B53A" stroke-width="2"/>
    </g>
    <g class="pp pp-moon"><path d="M36 10 A18 18 0 1 0 54 36 A14 14 0 1 1 36 10Z" fill="#FFF1B8" stroke="#E6CB73" stroke-width="1.5"/></g>
  </svg>`;

  const FRONT = `<svg class="pr-front" viewBox="0 0 200 210" aria-hidden="true">
    <defs>
      <radialGradient id="prGlow2" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFE7A0" stop-opacity=".9"/><stop offset="1" stop-color="#FFC24A" stop-opacity="0"/></radialGradient>
      <linearGradient id="prPot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E58A57"/><stop offset="1" stop-color="#B85A33"/></linearGradient>
      <linearGradient id="prLeaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8FCB5C"/><stop offset="1" stop-color="#4C8A2A"/></linearGradient>
      <linearGradient id="prCan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8FD0F2"/><stop offset="1" stop-color="#3E8FC4"/></linearGradient>
    </defs>
    <g class="pp pp-lantern">
      <circle class="pp-glow" cx="24" cy="186" r="32" fill="url(#prGlow2)"/>
      <path d="M17 167 h14 l2 4 h-18z" fill="#3A332C"/>
      <rect x="15" y="171" width="18" height="24" rx="3.5" fill="#FFC867" stroke="#3A332C" stroke-width="2.4"/>
      <path d="M24 171 v24 M15 183 h18" stroke="#3A332C" stroke-width="1.6"/>
      <path d="M13 195 h22 l-3 5 h-16z" fill="#3A332C"/>
      <path d="M19 167 q5 -9 10 0" stroke="#3A332C" stroke-width="1.8" fill="none"/>
    </g>
    <g class="pp pp-planter">
      <g class="pp-sprout pp-sp-a"><path d="M30 178 q-2 -16 3 -26" stroke="#4C8A2A" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M32 158 q-12 -8 -17 -2 q7 8 17 2z M33 154 q10 -11 17 -7 q-6 10 -17 7z" fill="url(#prLeaf)" stroke="#3A6B20" stroke-width=".8"/></g>
      <g class="pp-sprout pp-sp-b"><path d="M174 178 q2 -12 -2 -20" stroke="#4C8A2A" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M173 163 q10 -7 15 -2 q-6 7 -15 2z M172 160 q-9 -9 -15 -5 q5 8 15 5z" fill="url(#prLeaf)" stroke="#3A6B20" stroke-width=".8"/><circle cx="172" cy="156" r="4.5" fill="#F57FA6" stroke="#D25A85" stroke-width=".8"/><circle cx="172" cy="156" r="1.8" fill="${GOLD}"/></g>
      <path d="M8 182 h184 l-10 28 h-164z" fill="url(#prPot)" stroke="#8E4424" stroke-width="1.6"/>
      <rect x="4" y="176" width="192" height="12" rx="4" fill="#E99A68" stroke="#8E4424" stroke-width="1.6"/>
      <path d="M14 178 h170" stroke="#FFD2B0" stroke-width="2" stroke-linecap="round" opacity=".6"/>
    </g>
    <g class="pp pp-can">
      <path d="M166 40 q-8 4 -14 14" stroke="#3E8FC4" stroke-width="4" stroke-linecap="round" fill="none"/>
      <path d="M154 52 l-8 6 l-4 -5 l8 -5z" fill="#3E8FC4" stroke="#2D6E99" stroke-width=".8"/>
      <rect x="164" y="26" width="26" height="22" rx="6" fill="url(#prCan)" stroke="#2D6E99" stroke-width="1.4"/>
      <path d="M167 27 q10 -13 20 0" stroke="#2D6E99" stroke-width="2.6" fill="none"/>
      <ellipse cx="171" cy="33" rx="2.6" ry="5" fill="#fff" opacity=".4"/>
    </g>
    <g class="pp pp-drops" fill="#7CC8F2" stroke="#3E8FC4" stroke-width=".8">
      <path class="pp-drop pp-d1" d="M144 60 q3 5 0 7 q-3 -2 0 -7z"/>
      <path class="pp-drop pp-d2" d="M138 62 q3 5 0 7 q-3 -2 0 -7z"/>
      <path class="pp-drop pp-d3" d="M142 66 q3 5 0 7 q-3 -2 0 -7z"/>
    </g>
    <g class="pp pp-zzz" fill="#EAF2FF" stroke="#5B6F9A" stroke-width="1.4" font-family="Fredoka, system-ui, sans-serif" font-weight="700">
      <text class="pp-z1" x="150" y="62" font-size="20">z</text>
      <text class="pp-z2" x="162" y="42" font-size="26">z</text>
      <text class="pp-z3" x="176" y="20" font-size="32">Z</text>
    </g>
    <g class="pp pp-bulb">
      <g class="pp-bulb-rays" stroke="#FFC94A" stroke-width="3.5" stroke-linecap="round">
        <line x1="170" y1="2" x2="170" y2="-6"/><line x1="188" y1="10" x2="194" y2="5"/><line x1="152" y1="10" x2="146" y2="5"/><line x1="194" y1="26" x2="201" y2="26"/><line x1="146" y1="26" x2="139" y2="26"/>
      </g>
      <path d="M170 10 a15 15 0 0 1 9 27 v5 h-18 v-5 a15 15 0 0 1 9 -27z" fill="#FFE27A" stroke="#E0A92E" stroke-width="2"/>
      <rect x="162" y="42" width="16" height="8" rx="2" fill="#B8C2C9" stroke="#7F8A92" stroke-width="1.5"/>
    </g>
    <g class="pp pp-question"><text x="164" y="44" font-size="40" font-family="Fredoka, system-ui, sans-serif" font-weight="700" fill="#FFFDF4" stroke="#3B6B22" stroke-width="2">?</text></g>
    <g class="pp pp-hearts">${heart(172, 74, 1.1, "pp-heart pp-h1")}${heart(26, 84, 0.9, "pp-heart pp-h2")}${heart(182, 40, 0.75, "pp-heart pp-h3")}</g>
    <g class="pp pp-stars">${star(20, 58, 11, "pp-star pp-s1")}${star(182, 50, 13, "pp-star pp-s2")}${star(186, 128, 8, "pp-star pp-s3")}${star(14, 132, 8, "pp-star pp-s4")}</g>
    <g class="pp pp-notes">${note(14, 70, 1.2, "pp-note pp-n1", false)}${note(172, 50, 1.1, "pp-note pp-n2", true)}${note(182, 118, 0.9, "pp-note pp-n3", false)}</g>
    <g class="pp pp-flies"><circle class="pp-fly pp-f1" cx="44" cy="120" r="3" fill="#FFF3A0"/><circle class="pp-fly pp-f2" cx="180" cy="96" r="2.6" fill="#FFF3A0"/><circle class="pp-fly pp-f3" cx="60" cy="40" r="2.2" fill="#FFF3A0"/></g>
    <g class="pp pp-sparkle" fill="#FFF6C8" stroke="#E8C65A" stroke-width=".6">
      <path class="pp-sp pp-sp1" d="M24 98 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3z"/>
      <path class="pp-sp pp-sp2" d="M178 82 l2.4 6 l6 2.4 l-6 2.4 l-2.4 6 l-2.4 -6 l-6 -2.4 l6 -2.4z"/>
      <path class="pp-sp pp-sp3" d="M170 150 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2z"/>
    </g>
  </svg>`;

  function rigMarkup(rig) {
    const S = window.PerlSprites || {};
    if (rig === "peek") {
      return `<div class="pr-peek"><img class="pr-img" src="${S.peek || ""}" alt="" draggable="false"/></div>`;
    }
    return `<div class="pr-icon">
      <img class="pr-img pr-ear pr-ear-l" src="${S["icon-ear-l"] || ""}" alt="" draggable="false"/>
      <img class="pr-img pr-ear pr-ear-r" src="${S["icon-ear-r"] || ""}" alt="" draggable="false"/>
      <img class="pr-img pr-body" src="${S["icon-body"] || ""}" alt="" draggable="false"/>
      <i class="pr-blush pr-blush-l"></i><i class="pr-blush pr-blush-r"></i>
      <img class="pr-img pr-paw" src="${S["icon-paw"] || ""}" alt="" draggable="false"/>
    </div>`;
  }

  function svg(pose, extraClass) {
    const p = RIG[pose] ? pose : "idle";
    const rig = RIG[p];
    return `<div class="perl-svg perl-rig rig-${rig} pose-${p}${extraClass ? ` ${extraClass}` : ""}" aria-hidden="true">${BACK}<i class="pr-shadow"></i><div class="pr-all">${rigMarkup(rig)}</div>${FRONT}</div>`;
  }

  window.PerlArt = { svg, rig: (pose) => RIG[pose] || "peek" };
})();
