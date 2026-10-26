/* Perl, the garden bunny, drawn as a layered SVG so every part can move on its own.
 * window.PerlArt.svg(pose) returns the markup; the pose class picks the animation in perl.css.
 * Poses: idle, wave, think, stretch, hearts, lantern, sleepy, cheer, idea, clap, talk, water,
 *        boing, earflop, giggle, munch (the last four are tap reactions on the home card).
 *
 * The look is soft and furry without SVG filters (they are slow in WebViews): fur edges are
 * procedural tufted outlines, shading is layered gradients, and a few fine strands add texture.
 * The art is built once and reused; each instance only swaps in its own gradient ids.
 */
(function () {
  "use strict";

  const C = {
    furLight: "#FFF9EF", fur: "#F6E3C6", furMid: "#EBCBA2", furDeep: "#CF9F70", line: "#A87A4F", edge: "rgba(160, 112, 66, .45)",
    earIn: "#F7B4AD", earDeep: "#E8857F",
    hat: "#86BC52", hatLight: "#B4DB80", hatDark: "#4F8A2C", hatDeep: "#3A6B20",
    eye: "#21130C", iris: "#6B3D22", mouth: "#6E2424", tongue: "#F28A93",
    petal: "#F57FA6", petalLight: "#FFC2D6", petalDark: "#D25A85", gold: "#FAC94C", goldDark: "#DE9E26"
  };

  // Deterministic noise so every Perl looks the same.
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  const f = (n) => n.toFixed(1);

  // A soft tufted outline around a (rotated) ellipse: fur instead of a hard edge.
  function furPath(cx, cy, rx, ry, rotDeg, n, depth, seed, depthFn) {
    const rnd = rng(seed);
    const rot = rotDeg * Math.PI / 180;
    const pt = (a, r) => {
      const x = rx * r * Math.cos(a), y = ry * r * Math.sin(a);
      return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)];
    };
    const step = Math.PI * 2 / n;
    const bases = [];
    for (let i = 0; i < n; i += 1) bases.push(i * step + (rnd() - 0.5) * step * 0.3);
    let d = "";
    for (let i = 0; i < n; i += 1) {
      const a0 = bases[i], a1 = i + 1 < n ? bases[i + 1] : bases[0] + Math.PI * 2;
      const mid = (a0 + a1) / 2 + step * 0.18; // tufts lean one way, like brushed fur
      const k = depth * (0.55 + rnd() * 0.9) * (depthFn ? depthFn(((mid % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) : 1);
      const p0 = pt(a0, 1 - depth * 0.35), tip = pt(mid, 1 + k * 1.9), p1 = pt(a1, 1 - depth * 0.35);
      if (i === 0) d += `M${f(p0[0])} ${f(p0[1])}`;
      d += ` Q${f(tip[0])} ${f(tip[1])} ${f(p1[0])} ${f(p1[1])}`;
    }
    return d + "Z";
  }

  // Fine strands along an outline: just enough texture to read as fur up close.
  function strands(cx, cy, rx, ry, rotDeg, count, seed, from, to, color, opacity, width) {
    const rnd = rng(seed);
    const rot = rotDeg * Math.PI / 180;
    const pt = (a, r) => {
      const x = rx * r * Math.cos(a), y = ry * r * Math.sin(a);
      return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)];
    };
    let d = "";
    for (let i = 0; i < count; i += 1) {
      const a = from + (to - from) * rnd();
      const r0 = 0.78 + rnd() * 0.14;
      const p0 = pt(a, r0), p1 = pt(a + 0.05 + rnd() * 0.05, r0 + 0.1 + rnd() * 0.08);
      d += `M${f(p0[0])} ${f(p0[1])}L${f(p1[0])} ${f(p1[1])}`;
    }
    return `<path d="${d}" stroke="${color}" stroke-width="${width || 1}" stroke-linecap="round" opacity="${opacity}" fill="none"/>`;
  }

  const cheekBoost = (a) => {
    const g = (c) => Math.exp(-((a - c) ** 2) / 0.12);
    return 0.45 + 2.6 * (g(0.42) + g(Math.PI - 0.42)) + 0.9 * g(Math.PI / 2);
  };

  function flower(cx, cy, r) {
    const petals = [0, 72, 144, 216, 288].map(a =>
      `<g transform="rotate(${a} ${cx} ${cy})"><ellipse cx="${cx}" cy="${f(cy - r * 0.95)}" rx="${f(r * 0.62)}" ry="${f(r * 0.95)}" fill="url(#ID-petal)" stroke="${C.petalDark}" stroke-width=".8"/>` +
      `<path d="M${cx} ${f(cy - r * 0.35)} L${cx} ${f(cy - r * 1.55)}" stroke="${C.petalDark}" stroke-width=".6" opacity=".45"/></g>`
    ).join("");
    const dots = [[-0.18, -0.12], [0.16, -0.16], [0.02, 0.18], [-0.2, 0.14], [0.2, 0.1]].map(([x, y]) =>
      `<circle cx="${f(cx + x * r)}" cy="${f(cy + y * r)}" r="${f(r * 0.07)}" fill="${C.goldDark}"/>`).join("");
    return `${petals}<circle cx="${cx}" cy="${cy}" r="${f(r * 0.5)}" fill="url(#ID-gold)" stroke="${C.goldDark}" stroke-width=".8"/>${dots}`;
  }

  function star(cx, cy, r, cls) {
    const pts = [];
    for (let i = 0; i < 10; i += 1) {
      const a = Math.PI / 5 * i - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      pts.push(`${f(cx + Math.cos(a) * rr)},${f(cy + Math.sin(a) * rr)}`);
    }
    return `<polygon class="${cls}" points="${pts.join(" ")}" fill="${C.gold}" stroke="${C.goldDark}" stroke-width="1" stroke-linejoin="round"/>`;
  }

  function heart(x, y, s, cls) {
    return `<g class="${cls}"><path transform="translate(${x} ${y}) scale(${s})" d="M0 4 C-2 -2 -10 -2 -10 4 C-10 9 -4 12 0 16 C4 12 10 9 10 4 C10 -2 2 -2 0 4Z" fill="#FF7FA3" stroke="#D9557E" stroke-width="1.2"/></g>`;
  }

  // An arm hanging from the shoulder, ending in a paw with toe creases and pink pads.
  function arm(side) {
    const s = side === "l" ? 1 : -1;
    const cx = 100 - 37 * s, cy = 184, rot = 14 * s;
    const pawX = 100 - 41 * s, pawY = 199;
    return `<path d="${furPath(cx, cy, 11.5, 20.5, rot, 26, 0.022, side === "l" ? 31 : 37)}" fill="url(#ID-limb)" stroke="${C.edge}" stroke-width=".8"/>` +
      `<path d="${furPath(pawX, pawY, 11.5, 10, 0, 18, 0.025, side === "l" ? 41 : 43)}" fill="url(#ID-paw)" stroke="${C.edge}" stroke-width=".8"/>` +
      `<path d="M${f(pawX - 4)} ${pawY + 3} q.5 3 0 5 M${pawX} ${pawY + 4} v4.5 M${f(pawX + 4)} ${pawY + 3} q-.5 3 0 5" stroke="${C.line}" stroke-width="1.1" stroke-linecap="round" fill="none" opacity=".75"/>` +
      `<ellipse cx="${pawX}" cy="${pawY - 1}" rx="4" ry="2.6" fill="${C.earIn}" opacity=".55"/>`;
  }

  function eye(cx, cy, cls, o) { // o: 1 = outer corner on the right, -1 = on the left
    return `<g class="p-eye ${cls}">
      <ellipse cx="${cx}" cy="${cy + 1.2}" rx="13.4" ry="15.2" fill="${C.furDeep}" opacity=".28"/>
      <ellipse cx="${cx}" cy="${cy}" rx="12.4" ry="14.4" fill="url(#ID-eye)"/>
      <path d="M${cx - 9} ${cy + 7} Q${cx} ${cy + 14} ${cx + 9} ${cy + 7} Q${cx} ${cy + 11} ${cx - 9} ${cy + 7}Z" fill="#B07A4E" opacity=".55"/>
      <path d="M${cx - 11.6} ${cy - 5} Q${cx - 0.5 * o} ${cy - 16.8} ${cx + 11.6} ${cy - 5}" stroke="${C.eye}" stroke-width="1.7" stroke-linecap="round" fill="none" opacity=".9"/>
      <path d="M${cx + 11 * o} ${cy - 6.5} q${2.6 * o} -1 ${3.8 * o} -3.2" stroke="${C.eye}" stroke-width="1.3" stroke-linecap="round" fill="none"/>
      <ellipse class="p-glint" cx="${cx + 4.4}" cy="${cy - 5.6}" rx="4.8" ry="5.4" fill="#fff"/>
      <circle class="p-glint" cx="${cx - 4.6}" cy="${cy + 5.6}" r="2" fill="#fff" opacity=".9"/>
      <circle class="p-glint" cx="${cx + 6.5}" cy="${cy + 2.5}" r="1.1" fill="#fff" opacity=".7"/>
    </g>`;
  }

  function buildArt() {
    const headD = furPath(100, 124, 58, 47.5, 0, 64, 0.022, 7, cheekBoost);
    const bodyD = furPath(100, 180, 44, 28.5, 0, 46, 0.026, 11);
    const chestD = furPath(100, 170, 27, 16, 0, 22, 0.07, 13, (a) => (Math.sin(a) > 0 ? 1.7 : 0.3));
    const earL = furPath(68, 41, 16.5, 39, -17, 40, 0.012, 17);
    const earR = furPath(132, 41, 16.5, 39, 17, 40, 0.012, 19);
    const tailD = furPath(147, 186, 13, 12, 0, 20, 0.07, 23);
    const footL = furPath(78, 202, 17.5, 8, 0, 22, 0.03, 27);
    const footR = furPath(122, 202, 17.5, 8, 0, 22, 0.03, 29);

    return `<svg class="perl-svg pose-POSE EXTRA" viewBox="0 0 200 210" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="ID-fur" cx="40%" cy="30%" r="78%"><stop offset="0" stop-color="${C.furLight}"/><stop offset=".55" stop-color="${C.fur}"/><stop offset=".86" stop-color="${C.furMid}"/><stop offset="1" stop-color="${C.furDeep}"/></radialGradient>
    <radialGradient id="ID-limb" cx="38%" cy="28%" r="85%"><stop offset="0" stop-color="${C.furLight}"/><stop offset=".6" stop-color="${C.fur}"/><stop offset="1" stop-color="${C.furMid}"/></radialGradient>
    <radialGradient id="ID-paw" cx="45%" cy="30%" r="80%"><stop offset="0" stop-color="#FFFDF7"/><stop offset=".7" stop-color="${C.furLight}"/><stop offset="1" stop-color="${C.fur}"/></radialGradient>
    <radialGradient id="ID-muzzle" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#FFFDF8"/><stop offset=".65" stop-color="#FFF8EC" stop-opacity=".9"/><stop offset="1" stop-color="#FFF8EC" stop-opacity="0"/></radialGradient>
    <radialGradient id="ID-ear" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="${C.earDeep}"/><stop offset=".55" stop-color="${C.earIn}"/><stop offset="1" stop-color="#FBD3CA"/></radialGradient>
    <radialGradient id="ID-eye" cx="50%" cy="68%" r="62%"><stop offset="0" stop-color="${C.iris}"/><stop offset=".45" stop-color="#3A2014"/><stop offset="1" stop-color="${C.eye}"/></radialGradient>
    <radialGradient id="ID-cheek" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FF9A9A" stop-opacity=".75"/><stop offset=".6" stop-color="#FFA6A6" stop-opacity=".35"/><stop offset="1" stop-color="#FFB0B0" stop-opacity="0"/></radialGradient>
    <radialGradient id="ID-brimShadow" cx="50%" cy="20%" r="60%"><stop offset="0" stop-color="#7A5230" stop-opacity=".42"/><stop offset="1" stop-color="#7A5230" stop-opacity="0"/></radialGradient>
    <radialGradient id="ID-pad" cx="45%" cy="35%" r="65%"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".7" stop-color="#FFF7EA"/><stop offset="1" stop-color="#F3DFC2"/></radialGradient>
    <linearGradient id="ID-nose" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F2A2A0"/><stop offset="1" stop-color="#C46767"/></linearGradient>
    <linearGradient id="ID-mouth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4E1616"/><stop offset="1" stop-color="${C.mouth}"/></linearGradient>
    <radialGradient id="ID-tongue" cx="50%" cy="35%" r="65%"><stop offset="0" stop-color="#FFB3B8"/><stop offset="1" stop-color="${C.tongue}"/></radialGradient>
    <radialGradient id="ID-hat" cx="38%" cy="22%" r="85%"><stop offset="0" stop-color="${C.hatLight}"/><stop offset=".5" stop-color="${C.hat}"/><stop offset="1" stop-color="${C.hatDark}"/></radialGradient>
    <linearGradient id="ID-brim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.hatLight}"/><stop offset=".45" stop-color="${C.hat}"/><stop offset="1" stop-color="${C.hatDark}"/></linearGradient>
    <linearGradient id="ID-under" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.hatDeep}"/><stop offset="1" stop-color="${C.hatDark}"/></linearGradient>
    <pattern id="ID-weave" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 1.5h3" stroke="${C.hatDeep}" stroke-width=".45" opacity=".16"/></pattern>
    <radialGradient id="ID-petal" cx="50%" cy="80%" r="80%"><stop offset="0" stop-color="${C.petalLight}"/><stop offset=".6" stop-color="${C.petal}"/><stop offset="1" stop-color="${C.petalDark}"/></radialGradient>
    <radialGradient id="ID-gold" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#FFE9A0"/><stop offset="1" stop-color="${C.gold}"/></radialGradient>
    <linearGradient id="ID-leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8FCB5C"/><stop offset="1" stop-color="#4C8A2A"/></linearGradient>
    <radialGradient id="ID-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFE7A0" stop-opacity=".95"/><stop offset="1" stop-color="#FFC24A" stop-opacity="0"/></radialGradient>
    <radialGradient id="ID-shadow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#2A3A1E" stop-opacity=".38"/><stop offset="1" stop-color="#2A3A1E" stop-opacity="0"/></radialGradient>
    <linearGradient id="ID-can" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8FD0F2"/><stop offset="1" stop-color="#3E8FC4"/></linearGradient>
    <clipPath id="ID-headClip"><path d="${headD}"/></clipPath>
  </defs>

  <g class="pp pp-sun">
    <g class="pp-sun-rays" stroke="#FFC94A" stroke-width="5" stroke-linecap="round">
      ${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<line x1="34" y1="6" x2="34" y2="-2" transform="rotate(${a} 34 30)"/>`).join("")}
    </g>
    <circle cx="34" cy="30" r="15" fill="#FFD866" stroke="#F2B53A" stroke-width="2"/>
  </g>
  <g class="pp pp-moon"><path d="M40 14 A18 18 0 1 0 58 40 A14 14 0 1 1 40 14Z" fill="#FFF1B8" stroke="#E6CB73" stroke-width="1.5"/></g>

  <ellipse class="p-shadow" cx="100" cy="205" rx="56" ry="7" fill="url(#ID-shadow)"/>

  <g class="p-all">
    <g class="p-body">
      <path d="${tailD}" fill="url(#ID-paw)" stroke="${C.edge}" stroke-width=".8"/>
      <path d="${footL}" fill="url(#ID-paw)" stroke="${C.edge}" stroke-width=".8"/>
      <path d="${footR}" fill="url(#ID-paw)" stroke="${C.edge}" stroke-width=".8"/>
      <path d="M70 205 q.5 -3 0 -5 M76 206 v-5 M82 206 q-.5 -3 0 -5 M118 205 q.5 -3 0 -5 M124 206 v-5 M130 206 q-.5 -3 0 -5" stroke="${C.line}" stroke-width="1" stroke-linecap="round" opacity=".6" fill="none"/>
      <path d="${bodyD}" fill="url(#ID-fur)" stroke="${C.edge}" stroke-width=".8"/>
      ${strands(100, 180, 43, 28, 0, 26, 3, 0.2, Math.PI - 0.2, C.furDeep, 0.22)}
      <path d="${chestD}" fill="url(#ID-muzzle)"/>
      <ellipse cx="100" cy="163" rx="40" ry="9" fill="url(#ID-shadow)" opacity=".7"/>
    </g>

    <g class="p-headwrap">
      <g class="p-ear p-ear-l">
        <path d="${earL}" fill="url(#ID-fur)" stroke="${C.edge}" stroke-width=".8"/>
        <ellipse cx="69.5" cy="45" rx="8.6" ry="28.5" fill="url(#ID-ear)" transform="rotate(-17 69.5 45)"/>
        <path d="M70 26 q-1 12 1 26 M66 34 q1 6 3 12" stroke="${C.earDeep}" stroke-width=".8" opacity=".45" fill="none" transform="rotate(-17 69.5 45)"/>
        ${strands(68, 41, 16.5, 39, -17, 14, 5, Math.PI * 0.7, Math.PI * 1.35, C.furDeep, 0.22)}
      </g>
      <g class="p-ear p-ear-r">
        <path d="${earR}" fill="url(#ID-fur)" stroke="${C.edge}" stroke-width=".8"/>
        <ellipse cx="130.5" cy="45" rx="8.6" ry="28.5" fill="url(#ID-ear)" transform="rotate(17 130.5 45)"/>
        <path d="M130 26 q1 12 -1 26 M134 34 q-1 6 -3 12" stroke="${C.earDeep}" stroke-width=".8" opacity=".45" fill="none" transform="rotate(17 130.5 45)"/>
        ${strands(132, 41, 16.5, 39, 17, 14, 9, -Math.PI * 0.35, Math.PI * 0.3, C.furDeep, 0.22)}
      </g>

      <g class="p-head">
        <path d="${headD}" fill="url(#ID-fur)" stroke="${C.edge}" stroke-width=".8"/>
        <g clip-path="url(#ID-headClip)">
          <ellipse cx="100" cy="108" rx="58" ry="16" fill="url(#ID-brimShadow)"/>
          <ellipse cx="100" cy="174" rx="66" ry="22" fill="url(#ID-shadow)" opacity=".55"/>
          <ellipse cx="74" cy="118" rx="26" ry="12" fill="#FFFFFF" opacity=".22"/>
          <ellipse cx="100" cy="150" rx="31" ry="21" fill="url(#ID-muzzle)"/>
          <ellipse cx="58" cy="150" rx="18" ry="16" fill="url(#ID-muzzle)" opacity=".5"/>
          <ellipse cx="142" cy="150" rx="18" ry="16" fill="url(#ID-muzzle)" opacity=".5"/>
        </g>
        ${strands(100, 124, 58, 47.5, 0, 34, 21, 0.05, Math.PI - 0.05, C.furDeep, 0.2)}
      </g>

      <g class="p-face">
        <ellipse class="p-cheek" cx="62" cy="147" rx="14" ry="9" fill="url(#ID-cheek)"/>
        <ellipse class="p-cheek" cx="138" cy="147" rx="14" ry="9" fill="url(#ID-cheek)"/>
        <g class="p-eyes">${eye(78, 128, "p-eye-l", -1)}${eye(122, 128, "p-eye-r", 1)}</g>
        <g class="p-eyes-happy" fill="none" stroke="${C.eye}" stroke-width="3.6" stroke-linecap="round">
          <path d="M67 131 Q78 118 89 131"/><path d="M111 131 Q122 118 133 131"/>
          <path d="M65 128 l-3.5 -2 M135 128 l3.5 -2" stroke-width="1.6"/>
        </g>
        <g class="p-eyes-closed" fill="none" stroke="${C.eye}" stroke-width="3.2" stroke-linecap="round">
          <path d="M67 127 Q78 137 89 127"/><path d="M111 127 Q122 137 133 127"/>
          <path d="M70 132 l-2 3 M78 134 v3.4 M130 132 l2 3 M122 134 v3.4" stroke-width="1.4"/>
        </g>
        <g class="p-whiskers" stroke="#C9A27A" stroke-width=".9" stroke-linecap="round" fill="none" opacity=".8">
          <path d="M88 146 Q70 141 52 143 M88 149 Q70 150 53 155 M89 151.5 Q73 157 60 165"/>
          <path d="M112 146 Q130 141 148 143 M112 149 Q130 150 147 155 M111 151.5 Q127 157 140 165"/>
        </g>
        <g class="p-mouth p-mouth-open">
          <path d="M92 150 Q100 153 108 150 Q106.5 162.5 100 163.5 Q93.5 162.5 92 150Z" fill="url(#ID-mouth)"/>
          <path d="M96.6 151.2 h6.8 v3.4 q-1.7 1 -3.4 0 q-1.7 1 -3.4 0z" fill="#FFFDF6" stroke="#E6D9C6" stroke-width=".45"/>
          <path d="M100 151.2 v3.8" stroke="#E6D9C6" stroke-width=".5"/>
          <ellipse cx="100" cy="159" rx="5.6" ry="3.4" fill="url(#ID-tongue)"/>
        </g>
        <ellipse class="p-mouth p-mouth-o" cx="100" cy="155" rx="5.2" ry="6.5" fill="url(#ID-mouth)"/>
        <ellipse cx="100" cy="153" rx="17" ry="5" fill="url(#ID-shadow)" opacity=".45"/>
        <ellipse cx="93.6" cy="147.5" rx="8.4" ry="6.6" fill="url(#ID-pad)"/>
        <ellipse cx="106.4" cy="147.5" rx="8.4" ry="6.6" fill="url(#ID-pad)"/>
        <g fill="#B08560" opacity=".55"><circle cx="90" cy="146.5" r=".7"/><circle cx="92.5" cy="149" r=".7"/><circle cx="89.6" cy="150" r=".6"/><circle cx="110" cy="146.5" r=".7"/><circle cx="107.5" cy="149" r=".7"/><circle cx="110.4" cy="150" r=".6"/></g>
        <path d="M100 143.5 V148.6" stroke="#B9875D" stroke-width="1" stroke-linecap="round" opacity=".7"/>
        <path class="p-mouth p-mouth-smile" d="M93 154 Q96.5 156.6 100 153.6 Q103.5 156.6 107 154" fill="none" stroke="${C.mouth}" stroke-width="1.9" stroke-linecap="round"/>
        <path class="p-mouth p-mouth-line" d="M96 155 Q100 156.6 104 155" fill="none" stroke="${C.mouth}" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M94.2 138.6 Q100 135.6 105.8 138.6 Q104.8 143.8 100 144.6 Q95.2 143.8 94.2 138.6Z" fill="url(#ID-nose)" stroke="#A85656" stroke-width=".55"/>
        <ellipse cx="98" cy="138.8" rx="1.9" ry="1" fill="#fff" opacity=".75"/>
      </g>

      <g class="p-hat">
        <path d="M51 99 C52 62 76 49 100 49 C124 49 148 62 149 99 Z" fill="url(#ID-hat)" stroke="${C.hatDeep}" stroke-width="1.3"/>
        <path d="M51 99 C52 62 76 49 100 49 C124 49 148 62 149 99 Z" fill="url(#ID-weave)"/>
        <path d="M64 63 C74 54 86 51 96 51" stroke="#E4F5C8" stroke-width="3" stroke-linecap="round" opacity=".5" fill="none"/>
        <path d="M60 93 C62 70 80 59 100 59 M140 93 C138 70 120 59 100 59 M100 50 V97" fill="none" stroke="${C.hatDeep}" stroke-width="1.1" stroke-dasharray="2.6 2.4" opacity=".6"/>
        <path d="M52 92 C70 86 130 86 148 92 L149 99 C130 93 70 93 51 99Z" fill="${C.hatDark}" opacity=".85"/>
        <path d="M23 101 C30 84 170 84 177 101 C176 108 172 113 165 115 C130 106 70 106 35 115 C28 113 24 108 23 101Z" fill="url(#ID-under)" stroke="${C.hatDeep}" stroke-width="1.3"/>
        <path d="M23 101 C36 86 164 86 177 101 C168 108 32 108 23 101Z" fill="url(#ID-brim)" stroke="${C.hatDeep}" stroke-width="1.3"/>
        <path d="M23 101 C36 86 164 86 177 101 C168 108 32 108 23 101Z" fill="url(#ID-weave)"/>
        <path d="M34 102 C52 108 148 108 166 102" fill="none" stroke="${C.hatDeep}" stroke-width="1.1" stroke-dasharray="2.6 2.4" opacity=".6"/>
        <path d="M40 93 C60 88 90 87 112 88" stroke="#E4F5C8" stroke-width="2.2" stroke-linecap="round" opacity=".45" fill="none"/>
        <path d="M126 88 C129 76 143 70 153 75 C146 78 138 83 126 88Z" fill="url(#ID-leaf)" stroke="${C.hatDeep}" stroke-width=".8"/>
        <path d="M128 87 C136 81 144 77 151 76" stroke="#DDF0C2" stroke-width=".7" opacity=".7" fill="none"/>
        <path d="M150 92 C156 86 166 86 170 91 C163 92 157 93 150 92Z" fill="url(#ID-leaf)" stroke="${C.hatDeep}" stroke-width=".8"/>
        <g class="p-flower">${flower(140, 85, 7.4)}</g>
      </g>
    </g>

    <g class="p-arm p-arm-l">${arm("l")}</g>
    <g class="p-arm p-arm-r">
      ${arm("r")}
      <g class="pp pp-lantern">
        <line x1="141" y1="203" x2="141" y2="214" stroke="#3B2410" stroke-width="2"/>
        <circle class="pp-glow" cx="141" cy="226" r="26" fill="url(#ID-glow)"/>
        <path d="M134 213 h14 l2 4 h-18z" fill="#3A332C"/>
        <rect x="133" y="217" width="16" height="20" rx="3" fill="#FFC867" stroke="#3A332C" stroke-width="2.4"/>
        <path d="M141 217 v20 M133 227 h16" stroke="#3A332C" stroke-width="1.6"/>
        <path d="M131 237 h20 l-3 4 h-14z" fill="#3A332C"/>
      </g>
    </g>

    <g class="pp pp-can"><g transform="translate(4 -6) translate(168 186) scale(1.18) translate(-168 -186)">
      <path d="M180 178 q8 -6 12 -18" stroke="#3E8FC4" stroke-width="4.2" stroke-linecap="round" fill="none"/>
      <path d="M188 159 l9 -5 l3 6 l-9 4z" fill="#3E8FC4" stroke="#2D6E99" stroke-width=".8"/>
      <rect x="156" y="172" width="27" height="23" rx="6" fill="url(#ID-can)" stroke="#2D6E99" stroke-width="1.4"/>
      <path d="M159 173 q10 -13 21 0" stroke="#2D6E99" stroke-width="2.8" fill="none"/>
      <ellipse cx="163" cy="179" rx="3" ry="5.5" fill="#fff" opacity=".4"/>
      <path d="M160 188 h19" stroke="#2D6E99" stroke-width="1" opacity=".5"/>
    </g></g>
    <g class="pp pp-carrot">
      <path d="M88 168 L112 160 L104 178 Z" fill="#FF9A3C" stroke="#D96F1E" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M95 168 l6 -2 M99 172 l5 -2" stroke="#D96F1E" stroke-width="1.1"/>
      <path d="M110 160 q8 -10 14 -8 M111 161 q10 -3 13 2 M110 160 q2 -10 8 -12" fill="none" stroke="#5FA039" stroke-width="2.6" stroke-linecap="round"/>
    </g>
  </g>

  <g class="pp pp-drops" fill="#7CC8F2" stroke="#3E8FC4" stroke-width=".8">
    <path class="pp-drop pp-d1" d="M196 152 q3 5 0 7 q-3 -2 0 -7z"/>
    <path class="pp-drop pp-d2" d="M201 150 q3 5 0 7 q-3 -2 0 -7z"/>
    <path class="pp-drop pp-d3" d="M198 157 q3 5 0 7 q-3 -2 0 -7z"/>
  </g>
  <g class="pp pp-sprout">
    <ellipse cx="201" cy="207" rx="12" ry="3.5" fill="#7A5230" opacity=".55"/>
    <path d="M201 206 q-1 -12 2 -20" stroke="#4C8A2A" stroke-width="2.4" stroke-linecap="round" fill="none"/>
    <path d="M202 192 q-10 -6 -14 -2 q6 6 14 2z M203 188 q8 -9 14 -6 q-5 8 -14 6z" fill="url(#ID-leaf)" stroke="#3A6B20" stroke-width=".7"/>
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
  <g class="pp pp-hearts">${heart(160, 70, 1.1, "pp-heart pp-h1")}${heart(36, 80, 0.9, "pp-heart pp-h2")}${heart(172, 40, 0.75, "pp-heart pp-h3")}</g>
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

  let art = null;
  let counter = 0;
  function svg(pose, extraClass) {
    if (!art) art = buildArt();
    counter += 1;
    return art.replace("pose-POSE", `pose-${pose || "idle"}`).replace(" EXTRA", extraClass ? ` ${extraClass}` : "")
      .replace(/ID-/g, `perl${counter}-`);
  }

  window.PerlArt = { svg };
})();
