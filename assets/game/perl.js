/* Perl, the garden bunny, drawn as a layered SVG so every part can move on its own.
 * window.PerlArt.svg(pose) returns the markup; the pose class picks the animation in garden.css.
 * Poses: idle, wave, think, stretch, hearts, lantern, sleepy, cheer, idea, clap, talk,
 *        boing, earflop, giggle, munch (the last four are tap reactions on the home card).
 * Each instance gets its own gradient ids so several Perls can share a page.
 */
(function () {
  "use strict";

  const FUR = "#F7E3C1";
  const FUR_SHADE = "#E8C796";
  const FUR_LIGHT = "#FFF4E0";
  const LINE = "#B98B5C";
  const EAR_IN = "#F6AFA6";
  const HAT = "#7DB54B";
  const HAT_DARK = "#5A8E33";
  const HAT_LIGHT = "#9BCB65";
  const EYE = "#3B2318";
  const MOUTH = "#7C2E2B";
  const TONGUE = "#F48F98";
  const CHEEK = "#F7A1A1";
  const PETAL = "#F37FA4";
  const PETAL_DARK = "#D9628A";
  const GOLD = "#FAC94C";

  let counter = 0;

  function flower(cx, cy, r) {
    const petals = [0, 72, 144, 216, 288].map(a =>
      `<ellipse cx="${cx}" cy="${cy - r}" rx="${r * 0.62}" ry="${r * 0.9}" fill="${PETAL}" stroke="${PETAL_DARK}" stroke-width="1" transform="rotate(${a} ${cx} ${cy})"/>`
    ).join("");
    return `${petals}<circle cx="${cx}" cy="${cy}" r="${r * 0.52}" fill="${GOLD}" stroke="#E0A92E" stroke-width="1"/>` +
      `<circle cx="${cx - r * 0.15}" cy="${cy - r * 0.15}" r="${r * 0.16}" fill="#FFF0B0"/>`;
  }

  function star(cx, cy, r, cls) {
    const pts = [];
    for (let i = 0; i < 10; i += 1) {
      const a = Math.PI / 5 * i - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
    }
    return `<polygon class="${cls}" points="${pts.join(" ")}" fill="${GOLD}" stroke="#E0A92E" stroke-width="1" stroke-linejoin="round"/>`;
  }

  function heart(x, y, s, cls) {
    return `<g class="${cls}"><path transform="translate(${x} ${y}) scale(${s})" d="M0 4 C-2 -2 -10 -2 -10 4 C-10 9 -4 12 0 16 C4 12 10 9 10 4 C10 -2 2 -2 0 4Z" fill="#FF7FA3" stroke="#D9557E" stroke-width="1.2"/></g>`;
  }

  function paw(cx, cy, flip) {
    const d = flip ? -1 : 1;
    return `<ellipse cx="${cx}" cy="${cy}" rx="11" ry="10" fill="${FUR_LIGHT}" stroke="${LINE}" stroke-width="1.6"/>` +
      `<path d="M${cx - 4 * d} ${cy + 3} v3 M${cx} ${cy + 4} v3 M${cx + 4 * d} ${cy + 3} v3" stroke="${LINE}" stroke-width="1.4" stroke-linecap="round"/>`;
  }

  function svg(pose, extraClass) {
    counter += 1;
    const id = `perl${counter}`;
    return `<svg class="perl-svg pose-${pose || "idle"} ${extraClass || ""}" viewBox="0 0 200 210" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="${id}-fur" cx="42%" cy="34%" r="70%"><stop offset="0" stop-color="${FUR_LIGHT}"/><stop offset=".62" stop-color="${FUR}"/><stop offset="1" stop-color="${FUR_SHADE}"/></radialGradient>
    <radialGradient id="${id}-hat" cx="40%" cy="25%" r="80%"><stop offset="0" stop-color="${HAT_LIGHT}"/><stop offset=".6" stop-color="${HAT}"/><stop offset="1" stop-color="${HAT_DARK}"/></radialGradient>
    <radialGradient id="${id}-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFE7A0" stop-opacity=".95"/><stop offset="1" stop-color="#FFC24A" stop-opacity="0"/></radialGradient>
  </defs>

  <g class="pp pp-sun">
    <g class="pp-sun-rays" stroke="#FFC94A" stroke-width="5" stroke-linecap="round">
      ${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<line x1="34" y1="6" x2="34" y2="-2" transform="rotate(${a} 34 30)"/>`).join("")}
    </g>
    <circle cx="34" cy="30" r="15" fill="#FFD866" stroke="#F2B53A" stroke-width="2"/>
  </g>
  <g class="pp pp-moon"><path d="M40 14 A18 18 0 1 0 58 40 A14 14 0 1 1 40 14Z" fill="#FFF1B8" stroke="#E6CB73" stroke-width="1.5"/></g>

  <ellipse class="p-shadow" cx="100" cy="205" rx="50" ry="5.5" fill="#000" opacity=".18"/>

  <g class="p-all">
    <g class="p-body">
      <ellipse cx="78" cy="202" rx="17" ry="7.5" fill="${FUR_LIGHT}" stroke="${LINE}" stroke-width="1.6"/>
      <ellipse cx="122" cy="202" rx="17" ry="7.5" fill="${FUR_LIGHT}" stroke="${LINE}" stroke-width="1.6"/>
      <ellipse cx="100" cy="180" rx="44" ry="27" fill="url(#${id}-fur)" stroke="${LINE}" stroke-width="1.8"/>
      <ellipse cx="100" cy="186" rx="25" ry="15" fill="${FUR_LIGHT}"/>
    </g>

    <g class="p-headwrap">
      <g class="p-ear p-ear-l">
        <ellipse cx="68" cy="40" rx="16" ry="38" fill="url(#${id}-fur)" stroke="${LINE}" stroke-width="1.8" transform="rotate(-17 68 40)"/>
        <ellipse cx="69" cy="44" rx="8" ry="27" fill="${EAR_IN}" transform="rotate(-17 69 44)"/>
      </g>
      <g class="p-ear p-ear-r">
        <ellipse cx="132" cy="40" rx="16" ry="38" fill="url(#${id}-fur)" stroke="${LINE}" stroke-width="1.8" transform="rotate(17 132 40)"/>
        <ellipse cx="131" cy="44" rx="8" ry="27" fill="${EAR_IN}" transform="rotate(17 131 44)"/>
      </g>

      <g class="p-head">
        <path d="M46 132 L38 138 L48 141 Z M154 132 L162 138 L152 141 Z" fill="${FUR}" stroke="${LINE}" stroke-width="1.6" stroke-linejoin="round"/>
        <ellipse cx="100" cy="122" rx="57" ry="47" fill="url(#${id}-fur)" stroke="${LINE}" stroke-width="1.8"/>
        <ellipse cx="100" cy="146" rx="22" ry="15" fill="${FUR_LIGHT}" opacity=".9"/>
      </g>

      <g class="p-face">
        <ellipse class="p-cheek" cx="64" cy="143" rx="11" ry="7" fill="${CHEEK}" opacity=".6"/>
        <ellipse class="p-cheek" cx="136" cy="143" rx="11" ry="7" fill="${CHEEK}" opacity=".6"/>
        <g class="p-eyes">
          <g class="p-eye p-eye-l">
            <ellipse cx="77" cy="125" rx="11" ry="13" fill="${EYE}"/>
            <ellipse cx="77" cy="129" rx="7" ry="7" fill="#6A3E25" opacity=".55"/>
            <circle class="p-glint" cx="81" cy="120" r="4.2" fill="#fff"/>
            <circle class="p-glint" cx="73.5" cy="131" r="1.8" fill="#fff"/>
          </g>
          <g class="p-eye p-eye-r">
            <ellipse cx="123" cy="125" rx="11" ry="13" fill="${EYE}"/>
            <ellipse cx="123" cy="129" rx="7" ry="7" fill="#6A3E25" opacity=".55"/>
            <circle class="p-glint" cx="127" cy="120" r="4.2" fill="#fff"/>
            <circle class="p-glint" cx="119.5" cy="131" r="1.8" fill="#fff"/>
          </g>
        </g>
        <g class="p-eyes-happy" fill="none" stroke="${EYE}" stroke-width="4" stroke-linecap="round">
          <path d="M67 128 Q77 115 87 128"/><path d="M113 128 Q123 115 133 128"/>
        </g>
        <g class="p-eyes-closed" fill="none" stroke="${EYE}" stroke-width="3.6" stroke-linecap="round">
          <path d="M67 124 Q77 133 87 124"/><path d="M113 124 Q123 133 133 124"/>
        </g>
        <path d="M95 137 Q100 134 105 137 Q103 142 100 142 Q97 142 95 137Z" fill="#A0604A"/>
        <g class="p-mouth p-mouth-open">
          <path d="M89 145 Q100 149 111 145 Q109 161 100 162 Q91 161 89 145Z" fill="${MOUTH}"/>
          <ellipse cx="100" cy="156" rx="6.5" ry="4.2" fill="${TONGUE}"/>
        </g>
        <path class="p-mouth p-mouth-smile" d="M89 146 Q94 153 100 147 Q106 153 111 146" fill="none" stroke="${MOUTH}" stroke-width="3" stroke-linecap="round"/>
        <ellipse class="p-mouth p-mouth-o" cx="100" cy="152" rx="6" ry="7.5" fill="${MOUTH}"/>
        <path class="p-mouth p-mouth-line" d="M94 150 Q100 153 106 150" fill="none" stroke="${MOUTH}" stroke-width="2.6" stroke-linecap="round"/>
      </g>

      <g class="p-hat">
        <path d="M51 98 C52 62 76 49 100 49 C124 49 148 62 149 98 Z" fill="url(#${id}-hat)" stroke="${HAT_DARK}" stroke-width="1.8"/>
        <path d="M60 92 C62 70 80 59 100 59 M140 92 C138 70 120 59 100 59 M100 50 V96" fill="none" stroke="${HAT_DARK}" stroke-width="1.4" stroke-dasharray="3 3" opacity=".7"/>
        <path d="M24 100 C38 82 162 82 176 100 C170 116 30 116 24 100Z" fill="url(#${id}-hat)" stroke="${HAT_DARK}" stroke-width="1.8"/>
        <path d="M34 102 C50 110 150 110 166 102" fill="none" stroke="${HAT_DARK}" stroke-width="1.3" stroke-dasharray="3 3" opacity=".7"/>
        <path d="M128 86 C132 74 146 70 154 76 C146 78 138 82 128 86Z" fill="#5FA039" stroke="${HAT_DARK}" stroke-width="1"/>
        <g class="p-flower">${flower(140, 84, 7)}</g>
      </g>
    </g>

    <g class="p-arm p-arm-l">
      <ellipse cx="63" cy="184" rx="11" ry="20" fill="url(#${id}-fur)" stroke="${LINE}" stroke-width="1.7" transform="rotate(14 63 184)"/>
      ${paw(59, 199, false)}
    </g>
    <g class="p-arm p-arm-r">
      <ellipse cx="137" cy="184" rx="11" ry="20" fill="url(#${id}-fur)" stroke="${LINE}" stroke-width="1.7" transform="rotate(-14 137 184)"/>
      ${paw(141, 199, true)}
      <g class="pp pp-lantern">
        <line x1="141" y1="203" x2="141" y2="214" stroke="#3B2410" stroke-width="2"/>
        <circle class="pp-glow" cx="140" cy="226" r="26" fill="url(#${id}-glow)"/>
        <path d="M133 213 h14 l2 4 h-18z" fill="#3A332C"/>
        <rect x="132" y="217" width="16" height="20" rx="3" fill="#FFC867" stroke="#3A332C" stroke-width="2.4"/>
        <path d="M140 217 v20 M132 227 h16" stroke="#3A332C" stroke-width="1.6"/>
        <path d="M130 237 h20 l-3 4 h-14z" fill="#3A332C"/>
      </g>
    </g>

    <g class="pp pp-carrot">
      <path d="M88 168 L112 160 L104 178 Z" fill="#FF9A3C" stroke="#D96F1E" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M95 168 l6 -2 M99 172 l5 -2" stroke="#D96F1E" stroke-width="1.2"/>
      <path d="M110 160 q8 -10 14 -8 M111 161 q10 -3 13 2 M110 160 q2 -10 8 -12" fill="none" stroke="#5FA039" stroke-width="2.6" stroke-linecap="round"/>
    </g>
  </g>

  <g class="pp pp-zzz" fill="#EAF2FF" stroke="#5B6F9A" stroke-width="1.4" font-family="Fredoka, system-ui, sans-serif" font-weight="700">
    <text class="pp-z1" x="150" y="70" font-size="20">z</text>
    <text class="pp-z2" x="162" y="50" font-size="26">z</text>
    <text class="pp-z3" x="176" y="26" font-size="32">Z</text>
  </g>
  <g class="pp pp-bulb">
    <g class="pp-bulb-rays" stroke="#FFC94A" stroke-width="3.5" stroke-linecap="round">
      <line x1="168" y1="2" x2="168" y2="-6"/><line x1="186" y1="10" x2="192" y2="5"/><line x1="150" y1="10" x2="144" y2="5"/><line x1="192" y1="26" x2="199" y2="26"/><line x1="144" y1="26" x2="137" y2="26"/>
    </g>
    <path class="pp-bulb-glass" d="M168 10 a15 15 0 0 1 9 27 v5 h-18 v-5 a15 15 0 0 1 9 -27z" fill="#FFE27A" stroke="#E0A92E" stroke-width="2"/>
    <rect x="160" y="42" width="16" height="8" rx="2" fill="#B8C2C9" stroke="#7F8A92" stroke-width="1.5"/>
  </g>
  <g class="pp pp-question"><text x="160" y="46" font-size="40" font-family="Fredoka, system-ui, sans-serif" font-weight="700" fill="#FFFDF4" stroke="#3B6B22" stroke-width="2">?</text></g>
  <g class="pp pp-hearts">${heart(160, 70, 1.1, "pp-heart pp-h1")}${heart(36, 80, .9, "pp-heart pp-h2")}${heart(172, 40, .75, "pp-heart pp-h3")}</g>
  <g class="pp pp-stars">${star(28, 60, 11, "pp-star pp-s1")}${star(176, 54, 13, "pp-star pp-s2")}${star(170, 128, 8, "pp-star pp-s3")}${star(30, 132, 8, "pp-star pp-s4")}</g>
  <g class="pp pp-flies">
    <circle class="pp-fly pp-f1" cx="30" cy="70" r="3" fill="#FFF3A0"/><circle class="pp-fly pp-f2" cx="172" cy="96" r="2.6" fill="#FFF3A0"/><circle class="pp-fly pp-f3" cx="50" cy="40" r="2.2" fill="#FFF3A0"/>
  </g>
  <g class="pp pp-sparkle" fill="#FFF6C8">
    <path class="pp-sp pp-sp1" d="M32 98 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3z"/>
    <path class="pp-sp pp-sp2" d="M170 82 l2.4 6 l6 2.4 l-6 2.4 l-2.4 6 l-2.4 -6 l-6 -2.4 l6 -2.4z"/>
    <path class="pp-sp pp-sp3" d="M162 150 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2z"/>
  </g>
</svg>`;
  }

  window.PerlArt = { svg };
})();
