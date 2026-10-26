/* Perl, the garden bunny, animated from the logo artwork (cut-out rig).
 * window.PerlArt.svg(pose) returns the markup (the name is kept for older callers).
 *
 * One bunny only: the logo Perl peeking over an edge. perl-sprites.js holds his parts:
 * chest, head (with ears inside it), two paws and expression overlays painted on the
 * same face (closed eyes, ^^ eyes, closed mouth). His paws stay on the edge like in the logo
 * (they only pat and fidget), so nothing invented is ever shown. He always peeks over something: a wooden
 * ledge by default, a planter in the greenhouse, or the grass in store art (class "no-ledge").
 * Layout box is 200x210 units; prop SVGs use that viewBox; the canvas runs below the box
 * for the forearms and is clipped at the bottom edge.
 */
(function () {
  "use strict";

  const POSES = ["idle", "wave", "think", "stretch", "hearts", "lantern", "sleepy", "cheer", "idea", "clap", "talk",
    "water", "boing", "earflop", "giggle", "peekaboo"];
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

  const BACK = `<svg class="pr-back" viewBox="0 0 200 210" aria-hidden="true">
    <g class="pp pp-sun">
      <g class="pp-sun-rays" stroke="#FFC94A" stroke-width="5" stroke-linecap="round">
        ${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<line x1="30" y1="12" x2="30" y2="4" transform="rotate(${a} 30 36)"/>`).join("")}
      </g>
      <circle cx="30" cy="36" r="15" fill="#FFD866" stroke="#F2B53A" stroke-width="2"/>
    </g>
    <g class="pp pp-moon"><path d="M34 18 A18 18 0 1 0 52 44 A14 14 0 1 1 34 18Z" fill="#FFF1B8" stroke="#E6CB73" stroke-width="1.5"/></g>
  </svg>`;

  const LEDGE = `<svg class="pr-ledge" viewBox="0 0 200 210" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="prWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F0CF98"/><stop offset=".45" stop-color="#DDAE6E"/><stop offset="1" stop-color="#B97F45"/></linearGradient></defs>
    <path d="M-6 199 Q100 194 206 199 V214 H-6Z" fill="url(#prWood)" stroke="#8C5A2B" stroke-width="1.6"/>
    <path d="M2 200 Q100 196 198 200" stroke="#FFE6BC" stroke-width="1.4" fill="none" opacity=".7"/>
    <path d="M20 205 q30 -2 60 1 M110 206 q34 -2 70 0" stroke="#A9733F" stroke-width=".8" fill="none" opacity=".6"/>
  </svg>`;

  const FRONT = `<svg class="pr-front" viewBox="0 0 200 210" aria-hidden="true">
    <defs>
      <linearGradient id="prPot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E58A57"/><stop offset="1" stop-color="#B85A33"/></linearGradient>
      <linearGradient id="prLeaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8FCB5C"/><stop offset="1" stop-color="#4C8A2A"/></linearGradient>
    </defs>
    <defs><radialGradient id="prGlowF" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFE7A0" stop-opacity=".9"/><stop offset="1" stop-color="#FFC24A" stop-opacity="0"/></radialGradient>
      <linearGradient id="prCanF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8FD0F2"/><stop offset="1" stop-color="#3E8FC4"/></linearGradient></defs>
    <g class="pp pp-lantern">
      <circle class="pp-glow" cx="178" cy="178" r="36" fill="url(#prGlowF)"/>
      <path d="M170 156 h16 l2.4 4.4 h-20.8z" fill="#3A332C"/>
      <rect x="167" y="160.4" width="22" height="30" rx="4" fill="#FFC867" stroke="#3A332C" stroke-width="2.6"/>
      <path d="M178 160.4 v30 M167 175.4 h22" stroke="#3A332C" stroke-width="1.8"/>
      <path d="M164 190.4 h28 l-3 6 h-22z" fill="#3A332C"/>
      <path d="M171.5 156 q6.5 -10 13 0" stroke="#3A332C" stroke-width="2" fill="none"/>
    </g>
    <g class="pp pp-planter">
      <g class="pp-sprout pp-sp-a"><path d="M40 190 q-2 -16 3 -26" stroke="#4C8A2A" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M42 170 q-12 -8 -17 -2 q7 8 17 2z M43 166 q10 -11 17 -7 q-6 10 -17 7z" fill="url(#prLeaf)" stroke="#3A6B20" stroke-width=".8"/></g>
      <g class="pp-sprout pp-sp-b"><path d="M146 190 q2 -12 -2 -20" stroke="#4C8A2A" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M145 175 q10 -7 15 -2 q-6 7 -15 2z M144 172 q-9 -9 -15 -5 q5 8 15 5z" fill="url(#prLeaf)" stroke="#3A6B20" stroke-width=".8"/><circle cx="144" cy="168" r="4.5" fill="#F57FA6" stroke="#D25A85" stroke-width=".8"/><circle cx="144" cy="168" r="1.8" fill="${GOLD}"/></g>
      <path d="M8 196 h184 l-10 20 h-164z" fill="url(#prPot)" stroke="#8E4424" stroke-width="1.6"/>
      <rect x="4" y="190" width="192" height="11" rx="4" fill="#E99A68" stroke="#8E4424" stroke-width="1.6"/>
      <path d="M14 192 h170" stroke="#FFD2B0" stroke-width="2" stroke-linecap="round" opacity=".6"/>
    </g>
    <g class="pp pp-can">
      <path d="M176 172 q-12 -4 -20 -16" stroke="#3E8FC4" stroke-width="3.4" stroke-linecap="round" fill="none"/>
      <path d="M158 158 l-8 -6 l3.6 -4 l7.4 6z" fill="#3E8FC4" stroke="#2D6E99" stroke-width=".8"/>
      <rect x="172" y="164" width="24" height="22" rx="5" fill="url(#prCanF)" stroke="#2D6E99" stroke-width="1.3"/>
      <path d="M175 165 q9 -11 18 0" stroke="#2D6E99" stroke-width="2.4" fill="none"/>
      <ellipse cx="178" cy="171" rx="2.4" ry="4.6" fill="#fff" opacity=".4"/>
      <g fill="#7CC8F2" stroke="#3E8FC4" stroke-width=".7"><path class="pp-drop pp-d1" d="M150 156 q2.6 4.4 0 6 q-2.6 -1.6 0 -6z"/><path class="pp-drop pp-d2" d="M146 158 q2.6 4.4 0 6 q-2.6 -1.6 0 -6z"/><path class="pp-drop pp-d3" d="M150 161 q2.6 4.4 0 6 q-2.6 -1.6 0 -6z"/></g>
    </g>
    <g class="pp pp-zzz" fill="#EAF2FF" stroke="#5B6F9A" stroke-width="1.4" font-family="Fredoka, system-ui, sans-serif" font-weight="700">
      <text class="pp-z1" x="18" y="92" font-size="20">z</text>
      <text class="pp-z2" x="8" y="70" font-size="26">z</text>
      <text class="pp-z3" x="18" y="44" font-size="32">Z</text>
    </g>
    <g class="pp pp-bulb">
      <g class="pp-bulb-rays" stroke="#FFC94A" stroke-width="3.5" stroke-linecap="round">
        <line x1="34" y1="6" x2="34" y2="-2"/><line x1="52" y1="14" x2="58" y2="9"/><line x1="16" y1="14" x2="10" y2="9"/><line x1="58" y1="30" x2="65" y2="30"/><line x1="10" y1="30" x2="3" y2="30"/>
      </g>
      <path d="M34 14 a15 15 0 0 1 9 27 v5 h-18 v-5 a15 15 0 0 1 9 -27z" fill="#FFE27A" stroke="#E0A92E" stroke-width="2"/>
      <rect x="26" y="46" width="16" height="8" rx="2" fill="#B8C2C9" stroke="#7F8A92" stroke-width="1.5"/>
    </g>
    <g class="pp pp-question"><text x="20" y="60" font-size="40" font-family="Fredoka, system-ui, sans-serif" font-weight="700" fill="#FFFDF4" stroke="#3B6B22" stroke-width="2">?</text></g>
    <g class="pp pp-hearts">${heart(26, 96, 1.1, "pp-heart pp-h1")}${heart(182, 128, 0.9, "pp-heart pp-h2")}${heart(36, 54, 0.75, "pp-heart pp-h3")}</g>
    <g class="pp pp-stars">${star(24, 62, 11, "pp-star pp-s1")}${star(186, 150, 10, "pp-star pp-s2")}${star(18, 140, 8, "pp-star pp-s3")}${star(110, 26, 8, "pp-star pp-s4")}</g>
    <g class="pp pp-flies"><circle class="pp-fly pp-f1" cx="20" cy="120" r="3" fill="#FFF3A0"/><circle class="pp-fly pp-f2" cx="186" cy="150" r="2.6" fill="#FFF3A0"/><circle class="pp-fly pp-f3" cx="50" cy="60" r="2.2" fill="#FFF3A0"/></g>
    <g class="pp pp-sparkle" fill="#FFF6C8" stroke="#E8C65A" stroke-width=".6">
      <path class="pp-sp pp-sp1" d="M20 110 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3z"/>
      <path class="pp-sp pp-sp2" d="M184 150 l2.4 6 l6 2.4 l-6 2.4 l-2.4 6 l-2.4 -6 l-6 -2.4 l6 -2.4z"/>
      <path class="pp-sp pp-sp3" d="M30 56 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2z"/>
    </g>
  </svg>`;

  function img(key, cls) {
    const S = window.PerlSprites || {};
    return `<img class="pr-img ${cls}" src="${S[key] || ""}" alt="" draggable="false"/>`;
  }

  function svg(pose, extraClass) {
    const p = POSES.includes(pose) ? pose : "idle";
    return `<div class="perl-svg perl-rig pose-${p}${extraClass ? ` ${extraClass}` : ""}" aria-hidden="true">${BACK}
      <div class="pr-all"><div class="pr-canvas">
        <div class="pr-part pr-body">${img("body", "")}</div>
        <div class="pr-part pr-head">
          <div class="pr-part pr-ear-l">${img("ear-l", "")}</div>
          <div class="pr-part pr-ear-r">${img("ear-r", "")}</div>
          ${img("head", "pr-face")}${img("eyes-closed", "pr-x pr-ec")}${img("eyes-happy", "pr-x pr-eh")}${img("mouth-closed", "pr-x pr-mc")}
          <i class="pr-blush pr-blush-l"></i><i class="pr-blush pr-blush-r"></i>
        </div>
        <div class="pr-part pr-paw-l">${img("paw-l", "")}</div>
        <div class="pr-part pr-paw-r">${img("paw-r", "")}</div>
      </div></div>${LEDGE}${FRONT}</div>`;
  }

  window.PerlArt = { svg, poses: POSES.slice() };
})();
