import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import * as G from "../../kit/lathe.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";
import { TIMELINE, CULTURE, WELLS } from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--dark") ? "dark" : "light";

const WIDTH = 820;
const HEIGHT = 560;

// World: x runs left to right along the bench, y toward the viewer, z up. About 1 unit per 4 mm.
const BENCH = { x: -334, y: -72, w: 668, d: 142, r: 6 };
const BENCH_H = 12;
const PLINTH_H = 10;
const FOOT_H = 5;

const BSC = { x: -320, y: -58, w: 118, d: 86, r: 3 };
const BSC_TOP = 160;
const INC = { x: -190, y: -54, w: 76, d: 78, r: 3 };
const INC_TOP = 124;
const INV = { x: -106, y: -44, w: 96, d: 66, r: 4 };
const FLU = { x: -2, y: -46, w: 70, d: 64, r: 4 };
const PSU = { x: 74, y: -12, w: 26, d: 26, r: 2 };
const EM = { x: 118, y: -46, w: 100, d: 78, r: 4 };
const EM_COL = [168, -10];
const SIGN = { x: 238, y: -6, w: 82, d: 22, r: 3 };

const FLASK = { x: -102, y: -24, w: 58, d: 32, r: 2.5 };
const FLASK_Z = 44;
const FLASK_H = 8;
const SLIDE = { x: 4, y: -16, w: 56, d: 22, r: 0.8 };
const SLIDE_Z = 56;

const P = k.fitProjection(
  [...k.boxCorners(BENCH, -BENCH_H - PLINTH_H - FOOT_H, 0), ...k.boxCorners(BSC, 0, BSC_TOP), [EM_COL[0], EM_COL[1], 190]],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: 50 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const front = (y) => k.sideMatrix([0, y], 0, P, "left"); // local (x, -z) on the face at y
const side = (x) => k.sideMatrix([x, 0], 0, P, "right"); // local (-y, -z) on the face at x
const top = (z) => k.topMatrix([0, 0], z, P, "x"); // local (x, y) on the plane at z
const flat = (x0, z0, x1, z1, r, steps = 6) => k.pathOf(k.roundedPlan({ x: x0, y: z0, w: x1 - x0, d: z1 - z0, r }, steps).map(([u, z]) => [u, -z]), true);
const circle = (cx, cy, r) => `M${(cx - r).toFixed(2)} ${cy.toFixed(2)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const screws = (points, z) => D(points.map(([x, y]) => at([x, y, z])), { size: 0.45 });
const along = (o, a) => G.frameAlong(o, a);
const X = [1, 0, 0];
const Y = [0, 1, 0];
const Z = [0, 0, 1];

let clips = 0;
// A rounded opening in the front face at y, with its inner walls shaded by facing (desk-computer recipe).
function recess({ x0, x1, z0, z1, r, depth }, y, back = "", backClass = "nv-well", inside = "") {
  const id = `nv-clip-${clips++}`;
  const ring = k.roundedPlan({ x: x0, y: z0, w: x1 - x0, d: z1 - z0, r }, 6);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const { sinA } = k.cameraOf(P);
  const tops = [];
  const sides = [[], [], [], []];
  ring.forEach(([ax, az], index) => {
    const [bx, bz] = ring[(index + 1) % ring.length];
    const length = Math.hypot(bx - ax, bz - az) || 1;
    let [nx, nz] = [(bz - az) / length, -(bx - ax) / length];
    if (nx * (cx - (ax + bx) / 2) + nz * (cz - (az + bz) / 2) < 0) [nx, nz] = [-nx, -nz];
    if (nx <= 0 && nz <= 0) return;
    const quad = k.pathOf([at([ax, y, az]), at([bx, y, bz]), at([bx, y - depth, bz]), at([ax, y - depth, az])], true);
    if (nz >= nx) tops.push(quad);
    else sides[Math.min(3, Math.max(0, Math.floor(((nx * -sinA + 1) / 2) * 4)))].push(quad);
  });
  const shape = flat(x0, z0, x1, z1, r);
  return [
    `<clipPath id="${id}"><path transform="${front(y)}" d="${shape}"/></clipPath>`,
    `<g clip-path="url(#${id})">`,
    `<path class="iso-top" d="${tops.join("")}"/>`,
    ...sides.map((d, shade) => (d.length ? `<path class="iso-shade" data-shade="${shade}" d="${d.join("")}"/>` : "")),
    `<g transform="${front(y - depth)}"><path class="${backClass}" d="${shape}"/>${back}<path class="iso-line" data-tone="faint" d="${shape}"/></g>`,
    inside,
    `</g>`,
    `<g transform="${front(y)}"><path class="iso-line" data-tone="lo" d="${shape}"/></g>`,
  ].join("");
}

function feet(plan, inset, h = 4, r = 3) {
  return byDepth(k.corners(plan, inset)).map(([x, y]) => S(k.cylinder(x, y, r, 0, h, P, 16), { tone: "lo" })).join("");
}

function led(name, x, y, z) {
  return `<g class="nv-led" data-led="${name}">${D([at([x, y, z])], { size: 0.85, tone: "mid" })}</g>`;
}

function ribbed(F, s0, s1, r, count, tone = "lo") {
  const ribs = G.ribsOf(F, s0, s1, r, count, P, { fade: [0.1, 0.55], seams: true });
  return k.fadedSvg(ribs, { tone });
}

/* ---------- bench ---------- */
function bench() {
  const z0 = -BENCH_H - PLINTH_H - FOOT_H;
  const plinth = k.insetPlan(BENCH, 14);
  const out = [`<path class="iso-halo" d="${k.haloOf(BENCH, z0, BENCH_H + PLINTH_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(plinth, 16))) {
    out.push(S(k.cylinder(x, y, 7, z0, 1.6, P, 24), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.2, z0 + 1.6, FOOT_H - 1.6, P, 24), { tone: "mid" }));
  }
  out.push(S(k.slabOf(plinth, -BENCH_H - PLINTH_H, PLINTH_H, P, 6), { tone: "lo" }));
  const seam = k.sideSeam(BENCH, -4, P, 8);
  out.push(S(k.slabOf(BENCH, -BENCH_H, BENCH_H, P, 8, 1.4), { tone: "mid", inner: L(seam, { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(BENCH, 5), 0, P), { tone: "faint" }));
  const corners = k.corners(BENCH, 10);
  out.push(L(corners.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }), screws(corners, 0));
  // Asset tag on the bench front edge, near the cabinet.
  const tag = { x: -300, y: BENCH.y + BENCH.d - 13, w: 40, d: 8, r: 1.2 };
  out.push(S(k.slabOf(tag, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(tag, 1.4), 0.8, P, 3), { tone: "faint" }));
  out.push(L([26, 18].map((w, i) => k.lineOnTop([tag.x + 4, tag.y + 3 + i * 2.4], [tag.x + 4 + w, tag.y + 3 + i * 2.4], 0.8, P)).join(""), { tone: "lo", free: true }));
  out.push(screws([[tag.x + tag.w - 3, tag.y + tag.d / 2]], 0.8));
  // Ruler strip along the front: the bench's own scale, 10 units a tick.
  const strip = { x: -150, y: BENCH.y + BENCH.d - 12, w: 360, d: 6, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 8, 5, strip.y + 0.6, 0.6, [1.8, 3.4], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(screws([[strip.x + 2, strip.y + 3], [strip.x + strip.w - 2, strip.y + 3]], 0.6));
  return out.join("");
}

/* ---------- 1. biosafety cabinet ---------- */
const BSC_FRONT = BSC.y + BSC.d;
const BSC_SIDE = BSC.x + BSC.w;
function cabinet() {
  const out = [`<path class="iso-halo" d="${k.haloOf(BSC, 0, 10, P)}"/>`, feet(BSC, 6, 5, 3.4)];
  const seamTop = k.sideSeam(BSC, 120, P, 3);
  out.push(S(k.slabOf(BSC, 5, BSC_TOP - 5, P, 3, 1.2), { tone: "mid", inner: L(seamTop + k.sideSeam(BSC, 14, P, 3), { tone: "faint" }) }));
  // Top grille on the exhaust filter housing.
  out.push(L(Array.from({ length: 9 }, (_, i) => k.planOutline({ x: BSC.x + 14 + i * 10, y: BSC.y + 16, w: 4, d: 48, r: 2 }, BSC_TOP, P, 3)).join(""), { tone: "faint" }));
  out.push(screws(k.corners(BSC, 5), BSC_TOP));
  // Work opening and sash: one recess, the lower part open, the upper part behind glass.
  const OPEN = { x0: BSC.x + 10, x1: BSC_SIDE - 10, z0: 16, z1: 114, r: 3, depth: 58 };
  const backY = BSC_FRONT - OPEN.depth;
  const grille = [];
  for (let i = 0; i < 22; i++) grille.push(flat(OPEN.x0 + 4 + i * 4.2, 18, OPEN.x0 + 5.6 + i * 4.2, 30, 0.8, 3));
  const back = [
    `<path class="iso-line" data-tone="faint" d="${grille.join("")}"/>`,
    `<path class="iso-line" data-tone="faint" d="${flat(OPEN.x0 + 8, 104, OPEN.x1 - 8, 109, 2.5, 4)}"/>`,
  ].join("");
  const inside = [];
  // Rack of tubes and the CSF container on the tray.
  const rack = { x: BSC.x + 20, y: backY + 24, w: 42, d: 12, r: 1.4 };
  inside.push(S(k.slabOf(rack, 16, 8, P, 3, 0.4), { tone: "mid" }));
  const tubes = [0, 1, 2, 3].map((i) => [rack.x + 6 + i * 10, rack.y + 6]);
  for (const [x, y] of tubes) {
    inside.push(S(k.cylinder(x, y, 2.2, 24, 13, P, 16), { tone: "mid", crease: "none" }));
    inside.push(S(k.cylinder(x, y, 2.6, 37, 3, P, 16), { tone: "lo" }));
  }
  const csf = [BSC.x + 74, backY + 44];
  inside.push(`<path class="iso-halo" d="${k.haloOf({ x: csf[0] - 6, y: csf[1] - 6, w: 12, d: 12, r: 6 }, 16, 0.1, P)}" style="filter:blur(2px)"/>`);
  inside.push(S(k.cylinder(csf[0], csf[1], 5.2, 16, 2, P, 28), { tone: "lo" }));
  inside.push(S(k.cylinder(csf[0], csf[1], 4.4, 18, 18, P, 28), { tone: "hi", crease: "lo", inner: L(k.sideArc(csf[0], csf[1], 4.4, 24, P, 20) + k.sideArc(csf[0], csf[1], 4.4, 31, P, 20), { tone: "lo" }) }));
  inside.push(S(k.cylinder(csf[0], csf[1], 4.8, 36, 4.5, P, 28), { tone: "mid", inner: L(k.knurl(csf[0], csf[1], 4.8, 36, 40.5, 22, P), { tone: "lo" }) }));
  inside.push(`<text class="nv-label" transform="${front(csf[1] + 4.4)}" x="${csf[0]}" y="-26.2" font-size="4.6" text-anchor="middle">CSF</text>`);
  out.push(recess(OPEN, BSC_FRONT, back, "nv-cave", inside.join("")));
  // Sash glass over the upper opening, its frame rail and handle.
  out.push(`<g transform="${front(BSC_FRONT)}"><path class="nv-sash" d="${flat(OPEN.x0, 62, OPEN.x1, OPEN.z1, 2.5)}"/>`);
  out.push(`<path class="iso-line" data-tone="faint" d="M${OPEN.x0 + 14} ${-110}L${OPEN.x0 + 40} ${-68}M${OPEN.x0 + 22} ${-110}L${OPEN.x0 + 48} ${-68}" data-free=""/></g>`);
  out.push(S(k.slabOf({ x: OPEN.x0 - 1, y: BSC_FRONT, w: OPEN.x1 - OPEN.x0 + 2, d: 3, r: 1 }, 58, 5, P, 2, 0.4), { tone: "mid" }));
  out.push(S(k.slabOf({ x: BSC.x + 44, y: BSC_FRONT + 3, w: 30, d: 3, r: 1.4 }, 59, 3, P, 3), { tone: "mid" }));
  // Control panel on the filter housing: display, buttons, airflow gauge.
  out.push(recess({ x0: BSC.x + 14, x1: BSC.x + 46, z0: 128, z1: 140, r: 1.5, depth: 1.2 }, BSC_FRONT, `<text class="nv-lcd" x="${BSC.x + 30}" y="-131.4" font-size="5.4" text-anchor="middle">0.45</text>`, "nv-screen"));
  out.push(`<g transform="${front(BSC_FRONT)}"><path class="iso-line" data-tone="lo" d="${[0, 1, 2].map((i) => flat(BSC.x + 54 + i * 9, 129, BSC.x + 60 + i * 9, 137, 1.4, 3)).join("")}"/></g>`);
  const gauge = [BSC_SIDE - 22, 137];
  out.push(`<g transform="${front(BSC_FRONT)}"><path class="nv-dial" d="${circle(gauge[0], -gauge[1], 7)}"/>`);
  out.push(`<path class="iso-line" data-tone="lo" d="${Array.from({ length: 11 }, (_, i) => { const a = -2.2 + (i / 10) * 4.4; return `M${(gauge[0] + Math.sin(a) * 7).toFixed(2)} ${(-gauge[1] - Math.cos(a) * 7).toFixed(2)}L${(gauge[0] + Math.sin(a) * 5.6).toFixed(2)} ${(-gauge[1] - Math.cos(a) * 5.6).toFixed(2)}`; }).join("")}"/>`);
  out.push(`<path class="iso-line" data-tone="hi" data-free="end" d="M${gauge[0]} ${-gauge[1]}L${gauge[0] + 3.6} ${-gauge[1] - 4.2}"/><path class="iso-line" data-tone="mid" d="${circle(gauge[0], -gauge[1], 0.8)}"/></g>`);
  out.push(led("bsc", BSC.x + 16, BSC_FRONT, 122));
  // Wall calendar taped to the cabinet's side: February and March 1999.
  out.push(calendar());
  return out.join("");
}

function monthGrid(name, days, mark) {
  // Both months of 1999 start on a Monday, so the grids share a layout.
  const W = 56, x0 = 0, cols = 7, cell = W / cols;
  const out = [`<path class="nv-page" d="M0 0H${W}V-34H0Z"/>`];
  out.push(`<path class="nv-page-head" d="M0 -34H${W}V-28.6H0Z"/>`);
  out.push(`<text class="nv-cal-head" x="${W / 2}" y="-30" font-size="3.6" text-anchor="middle">${name} 1999</text>`);
  out.push(`<text class="nv-cal-day" y="-25.2" font-size="2.1">${"MTWTFSS".split("").map((d, i) => `<tspan x="${x0 + cell * i + cell / 2}" text-anchor="middle">${d}</tspan>`).join("")}</text>`);
  const rows = [];
  for (let d = 1; d <= days; d++) {
    const c = (d - 1) % 7, r = Math.floor((d - 1) / 7);
    rows.push(`<tspan x="${(cell * c + cell / 2).toFixed(2)}" y="${(-20.4 + r * 4.4).toFixed(2)}">${d}</tspan>`);
  }
  out.push(`<text class="nv-cal-num" font-size="2.3" text-anchor="middle">${rows.join("")}</text>`);
  out.push(`<path class="iso-line" data-tone="faint" d="M0 -24H${W}"/>`);
  if (mark) {
    const c = (mark - 1) % 7, r = Math.floor((mark - 1) / 7);
    out.push(`<path class="nv-cal-ring" d="${circle(cell * c + cell / 2, -21.2 + r * 4.4, 2.6)}"/>`);
  }
  out.push(`<path class="iso-line" data-tone="lo" d="M0 0H${W}V-34H0Z"/>`);
  return out.join("");
}

function calendar() {
  const u0 = -BSC_FRONT + 14; // local u = -y
  const z0 = 112;
  const T = `${side(BSC_SIDE)} translate(${u0} ${-z0})`;
  return [
    `<g class="nv-calendar" transform="${T}">`,
    `<g data-part="cal-mar">${monthGrid("MARCH", 31)}</g>`,
    `<g data-part="cal-feb">${monthGrid("FEBRUARY", 28, 27)}</g>`,
    `<path class="iso-line" data-tone="mid" d="M24 -34.6H32"/>`,
    `<path class="nv-tape" d="M22 -36H34V-32.4H22Z"/>`,
    `</g>`,
  ].join("");
}

/* ---------- 2. CO2 incubator ---------- */
const INC_FRONT = INC.y + INC.d;
const INC_SIDE = INC.x + INC.w;
function incubator() {
  const out = [`<path class="iso-halo" d="${k.haloOf(INC, 0, 10, P)}"/>`, feet(INC, 7, 4, 3)];
  out.push(S(k.slabOf(INC, 4, INC_TOP - 4, P, 3, 1.2), { tone: "mid", inner: L(k.sideSeam(INC, 104, P, 3), { tone: "faint" }) }));
  out.push(L(Array.from({ length: 6 }, (_, i) => k.planOutline({ x: INC.x + 14 + i * 8, y: INC.y + 12, w: 3, d: 30, r: 1.5 }, INC_TOP, P, 3)).join(""), { tone: "faint" }));
  out.push(screws(k.corners(INC, 5), INC_TOP));
  // Gas inlet on the side: a CO2 port with a hose barb.
  const port = along([INC_SIDE, INC.y + 18, 100], X);
  out.push(S(G.disc(0, 3, 4, port, P), { tone: "mid" }), S(G.disc(3, 9, 1.8, port, P), { tone: "mid" }), S(G.disc(6, 7.4, 2.4, port, P), { tone: "mid" }));
  // Door: a raised panel with hinges, handle and a glass window onto three shelves of flasks.
  const door = { x: INC.x + 2, y: INC_FRONT, w: INC.w - 4, d: 3, r: 1.5 };
  out.push(S(k.slabOf(door, 7, 96, P, 2, 0.5), { tone: "mid" }));
  const DF = INC_FRONT + 3;
  const shelves = [36, 58, 80];
  const back = [];
  for (const z of shelves) {
    back.push(`<path class="iso-line" data-tone="lo" d="M${INC.x + 8} ${-z}H${INC_SIDE - 20}"/>`);
    for (let i = 0; i < 3; i++) {
      if (z === 58 && i === 1) continue; // the flask on the microscope came from here
      const fx = INC.x + 14 + i * 14;
      back.push(`<path class="nv-flask-end" d="${flat(fx, z + 0.4, fx + 9, z + 7, 1.2, 3)}"/><path class="iso-line" data-tone="mid" d="${flat(fx, z + 0.4, fx + 9, z + 7, 1.2, 3)}${flat(fx + 9, z + 2.2, fx + 11.6, z + 5.2, 0.8, 2)}"/>`);
      back.push(`<path class="nv-medium" d="${flat(fx + 0.6, z + 1, fx + 8.4, z + 2.6, 0.6, 2)}"/>`);
    }
  }
  out.push(recess({ x0: INC.x + 8, x1: INC_SIDE - 20, z0: 26, z1: 94, r: 3, depth: 26 }, DF, back.join(""), "nv-cave"));
  out.push(`<g transform="${front(DF)}"><path class="nv-glass" d="${flat(INC.x + 8, 26, INC_SIDE - 20, 94, 3)}"/><path class="iso-line" data-tone="faint" data-free="" d="M${INC.x + 14} -88L${INC.x + 28} -64"/></g>`);
  const handle = { x: INC_SIDE - 12, y: DF, w: 3.4, d: 3, r: 1.2 };
  out.push(S(k.slabOf({ ...handle, x: handle.x + 0.2, w: 3 }, 54, 3, P, 2), { tone: "mid" }), S(k.slabOf({ ...handle, x: handle.x + 0.2, w: 3 }, 77, 3, P, 2), { tone: "mid" }));
  out.push(S(k.slabOf({ x: handle.x, y: DF + 3, w: 3.4, d: 2.4, r: 1.2 }, 52, 30, P, 3, 0.4), { tone: "mid" }));
  for (const z of [16, 92]) out.push(S(k.slabOf({ x: INC.x - 0.6, y: INC_FRONT - 4, w: 3, d: 8, r: 1 }, z, 8, P, 2), { tone: "mid" }));
  // Control panel: temperature and CO2 displays.
  const panel = (x0, text) => recess({ x0, x1: x0 + 24, z0: 108, z1: 118, r: 1.4, depth: 1 }, INC_FRONT, `<text class="nv-lcd" x="${x0 + 12}" y="-110.8" font-size="5" text-anchor="middle">${text}</text>`, "nv-screen");
  out.push(panel(INC.x + 8, "37.0"), panel(INC.x + 36, "5.0"));
  out.push(`<g transform="${front(INC_FRONT)}"><path class="iso-line" data-tone="lo" d="${flat(INC.x + 64, 109, INC.x + 69, 117, 1.2, 3)}"/></g>`);
  out.push(led("inc", INC_SIDE - 6, INC_FRONT, 113));
  return out.join("");
}

/* ---------- 3. inverted microscope with the culture flask ---------- */
function inverted() {
  const out = [`<path class="iso-halo" d="${k.haloOf(INV, 0, 8, P)}"/>`];
  out.push(S(k.slabOf(INV, 0, 10, P, 4, 1), { tone: "mid", inner: L(k.sideSeam(INV, 4, P, 4), { tone: "faint" }) }));
  out.push(screws(k.corners(INV, 5), 10));
  const pillar = { x: -72, y: -42, w: 22, d: 16, r: 3 };
  // Lamp arm: pillar at the back, arm reaching over the stage, lamp housing on top.
  out.push(S(k.slabOf(pillar, 10, 104, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(pillar, 60, P, 3), { tone: "faint" }) }));
  // Stage carrier and objective turret, under the stage.
  out.push(S(k.slabOf({ x: -74, y: -26, w: 26, d: 10, r: 1.5 }, 10, 30, P, 2, 0.4), { tone: "mid" }));
  const turret = along([-61, -6, 28], Z);
  out.push(S(G.solidOf([[0, 6], [3, 10], [7, 10], [8, 7]], turret, P), { tone: "mid" }));
  for (const [dx, dy] of [[-5, 4], [5, 4]]) out.push(S(k.cylinder(-61 + dx, -6 + dy, 2.4, 20, 8, P, 16), { tone: "mid" }));
  out.push(S(k.slabOf({ x: -110, y: -30, w: 98, d: 48, r: 2 }, 40, 4, P, 3, 0.6), { tone: "mid" }));
  out.push(L(k.planOutline({ x: -76, y: -14, w: 30, d: 16, r: 6 }, 44, P, 6), { tone: "faint" }));
  out.push(screws([[-106, -26], [-16, -26], [-106, 14], [-16, 14]], 44));
  // Stage clip pressing the flask's shoulder.
  out.push(S(k.slabOf({ x: -38, y: 2, w: 14, d: 3, r: 1 }, 44, 1.6, P, 2), { tone: "mid" }));
  out.push(flask());
  // Front of the base: binocular head with eyepieces tilted toward the user.
  out.push(S(k.slabOf({ x: -80, y: 14, w: 36, d: 14, r: 3 }, 10, 16, P, 3, 0.6), { tone: "mid" }));
  for (const x of [-70, -54]) {
    const F = along([x, 24, 24], [0, 0.55, 0.835]);
    out.push(S(G.solidOf([[0, 3.6], [11, 3.6], [11, 4.4], [16, 4.4]], F, P), { tone: "mid" }));
    out.push(L(G.circleOf(F, 16, 2.6, P), { tone: "lo" }));
  }
  // Focus knobs on the +x side of the stand.
  const knob = along([-50, -20, 20], X);
  out.push(S(G.disc(0, 2, 3, knob, P), { tone: "mid" }), S(G.disc(2, 6, 7, knob, P), { tone: "mid" }), ribbed(knob, 2, 6, 7, 30));
  out.push(S(G.disc(6, 9, 4, knob, P), { tone: "mid" }));
  // Lamp column, arm and condenser drawn after the flask: they stand behind it.
  return out.join("");
}

function invertedTop() {
  const out = [];
  out.push(S(k.slabOf({ x: -72, y: -42, w: 22, d: 44, r: 3 }, 108, 10, P, 3, 0.6), { tone: "mid" }));
  out.push(S(k.slabOf({ x: -75, y: -48, w: 28, d: 22, r: 5 }, 118, 16, P, 5, 0.6), { tone: "mid" }));
  out.push(L(Array.from({ length: 5 }, (_, i) => k.planOutline({ x: -71 + i * 4.4, y: -44, w: 2, d: 14, r: 1 }, 134, P, 3)).join(""), { tone: "faint" }));
  const cond = along([-61, -10, 84], Z);
  out.push(S(G.solidOf([[0, 7], [3, 7], [3, 5.2], [20, 5.2], [20, 6.4], [24, 6.4]], cond, P), { tone: "mid" }));
  out.push(led("inv", -49.6, -30, 112));
  return out.join("");
}

function flask() {
  const fz = FLASK_Z + 0.8;
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf(k.insetPlan(FLASK, 2), FLASK_Z, 0.1, P)}" style="filter:blur(3px)"/>`);
  const shell = k.slabOf(FLASK, FLASK_Z, FLASK_H, P, 3);
  out.push(`<path class="nv-flask-floor" d="${shell.fill}"/>`);
  const inner = k.insetPlan(FLASK, 1.2);
  const id = "nv-cells-clip";
  const local = k.pathOf(k.roundedPlan({ x: inner.x - FLASK.x, y: inner.y - FLASK.y, w: inner.w, d: inner.d, r: inner.r }, 3), true);
  const M = k.topMatrix([FLASK.x, FLASK.y], fz, P, "x");
  out.push(`<clipPath id="${id}"><path transform="${M}" d="${local}"/></clipPath>`);
  out.push(`<g clip-path="url(#${id})"><g transform="${M}" data-part="cells">`);
  out.push(`<path class="nv-cell" data-part="healthy" d=""/><path class="nv-syn" data-part="syn" d=""/><path class="nv-syn-fill" data-part="syn-fill" d=""/><path class="nv-nuc" data-part="nuclei" d=""/>`);
  out.push(`<path class="nv-dead" data-part="dead1" d=""/><path class="nv-dead" data-part="dead2" d="" opacity=".6"/><path class="nv-dead" data-part="dead3" d="" opacity=".32"/>`);
  out.push(`</g></g>`);
  // Medium surface and the glass shell, see-through.
  out.push(`<path class="nv-medium-top" d="${k.slabOf(inner, FLASK_Z, 3.2, P, 3).top}"/>`);
  out.push(`<path class="nv-glass nv-thin" d="${shell.top}"/>`);
  out.push(...shell.shades.map((d, i) => (d ? `<path class="nv-glass-side" data-shade="${i}" d="${d}"/>` : "")));
  out.push(L(shell.crease, { tone: "mid" }), L(shell.outline, { tone: "hi" }));
  out.push(L(k.planOutline(k.insetPlan(FLASK, 1.6), FLASK_Z + FLASK_H, P, 3), { tone: "faint" }));
  // Neck and vented cap.
  const neck = { x: FLASK.x + FLASK.w, y: FLASK.y + 9, w: 7, d: 14, r: 2 };
  const n = k.slabOf(neck, FLASK_Z + 0.6, 6.8, P, 3);
  out.push(`<path class="nv-glass" d="${n.fill}"/>`, L(n.outline, { tone: "hi" }));
  const capF = along([neck.x + neck.w, neck.y + neck.d / 2, FLASK_Z + 4], X);
  out.push(S(G.disc(0, 7, 6.2, capF, P), { tone: "mid" }), ribbed(capF, 0.4, 6.6, 6.2, 34));
  out.push(L(G.circleOf(capF, 7, 3.6, P), { tone: "lo" }));
  // Writing on the flask: two rule lines for the sample code.
  out.push(L([30, 20].map((w, i) => k.lineOnTop([FLASK.x + 5, FLASK.y + FLASK.d - 5 - i * 2.6], [FLASK.x + 5 + w, FLASK.y + FLASK.d - 5 - i * 2.6], FLASK_Z + FLASK_H, P)).join(""), { tone: "lo", free: true }));
  return out.join("");
}

/* ---------- 4. fluorescence microscope with the test slide ---------- */
function fluorescence() {
  const out = [`<path class="iso-halo" d="${k.haloOf(FLU, 0, 8, P)}"/>`];
  out.push(S(k.slabOf(FLU, 0, 12, P, 4, 1), { tone: "mid", inner: L(k.sideSeam(FLU, 5, P, 4), { tone: "faint" }) }));
  out.push(screws(k.corners(FLU, 5), 12));
  // Mercury lamp house on the back of the arm, with vent slots.
  const lamp = { x: 18, y: -70, w: 26, d: 22, r: 6 };
  out.push(S(k.slabOf(lamp, 96, 26, P, 6, 0.8), { tone: "mid" }));
  out.push(`<g transform="${side(lamp.x + lamp.w)}"><path class="iso-line" data-tone="faint" d="${Array.from({ length: 4 }, (_, i) => flat(-(lamp.y + 6.6 + i * 3.6), 101, -(lamp.y + 5 + i * 3.6), 117, 0.8, 3)).join("")}"/></g>`);
  out.push(S(k.slabOf({ x: 22, y: -50, w: 18, d: 6, r: 2 }, 102, 14, P, 3), { tone: "mid" }));
  // Pillar, stage carrier and stage.
  const pillar = { x: 16, y: -44, w: 28, d: 18, r: 4 };
  out.push(S(k.slabOf(pillar, 12, 104, P, 4, 0.6), { tone: "mid" }));
  out.push(S(k.slabOf({ x: 20, y: -26, w: 20, d: 10, r: 1.5 }, 30, 22, P, 2, 0.4), { tone: "mid" }));
  out.push(S(k.slabOf({ x: -4, y: -32, w: 70, d: 44, r: 2 }, 52, 4, P, 3, 0.6), { tone: "mid" }));
  out.push(screws([[0, -28], [62, -28], [0, 8], [62, 8]], SLIDE_Z));
  // Slide holder: a fixed jaw and a spring arm.
  out.push(S(k.slabOf({ x: 1, y: SLIDE.y - 3, w: 3, d: SLIDE.d + 6, r: 1 }, SLIDE_Z, 2.4, P, 2), { tone: "mid" }));
  out.push(slide());
  out.push(S(k.slabOf({ x: SLIDE.x + SLIDE.w + 0.2, y: SLIDE.y + 4, w: 4, d: SLIDE.d - 8, r: 1.4 }, SLIDE_Z, 2.4, P, 2), { tone: "mid" }));
  out.push(S(k.slabOf({ x: SLIDE.x + SLIDE.w + 4, y: SLIDE.y + SLIDE.d / 2 - 1.5, w: 4, d: 3, r: 1 }, SLIDE_Z, 2, P, 2), { tone: "mid" }));
  // Focus knobs.
  const knob = along([pillar.x + pillar.w, -32, 36], X);
  out.push(S(G.disc(0, 2, 3, knob, P), { tone: "mid" }), S(G.disc(2, 6, 8, knob, P), { tone: "mid" }), ribbed(knob, 2, 6, 8, 32));
  out.push(S(G.disc(6, 10, 4.4, knob, P), { tone: "mid" }), ribbed(knob, 6, 10, 4.4, 18));
  return out.join("");
}

function fluorescenceTop() {
  const out = [];
  // Arm over the stage, filter turret, nosepiece and objectives, head and eyepieces.
  out.push(S(k.slabOf({ x: 14, y: -44, w: 32, d: 50, r: 4 }, 104, 14, P, 4, 0.8), { tone: "mid" }));
  out.push(S(k.slabOf({ x: 46, y: -24, w: 5, d: 14, r: 1.5 }, 108, 6, P, 2), { tone: "mid" }));
  const nose = along([30, -4, 86], Z);
  out.push(S(G.solidOf([[0, 6], [4, 11], [14, 11], [18, 7]], nose, P), { tone: "mid" }));
  for (const [dx, dy, len] of [[-6, 2, 12], [6, 2, 10]]) {
    const F = along([30 + dx, -4 + dy, 86 - len], Z);
    out.push(S(G.solidOf([[0, 1.8], [2, 2.6], [len, 2.6]], F, P), { tone: "mid" }));
  }
  out.push(S(k.slabOf({ x: 18, y: -12, w: 24, d: 18, r: 3 }, 118, 10, P, 3, 0.6), { tone: "mid" }));
  for (const x of [24, 36]) {
    const F = along([x, 2, 126], [0, 0.6, 0.8]);
    out.push(S(G.solidOf([[0, 3.4], [12, 3.4], [12, 4.2], [17, 4.2]], F, P), { tone: "mid" }));
    out.push(L(G.circleOf(F, 17, 2.4, P), { tone: "lo" }));
  }
  return out.join("");
}

function power() {
  const out = [];
  out.push(S(k.slabOf(PSU, 0, 22, P, 2, 0.6), { tone: "mid", inner: L(k.sideSeam(PSU, 4, P, 2), { tone: "faint" }) }));
  const F = PSU.y + PSU.d;
  out.push(recess({ x0: PSU.x + 3, x1: PSU.x + 19, z0: 12, z1: 18, r: 1, depth: 0.8 }, F, `<text class="nv-lcd" x="${PSU.x + 11}" y="-13.6" font-size="3.6" text-anchor="middle">0213h</text>`, "nv-screen"));
  out.push(`<g transform="${front(F)}"><path class="iso-line" data-tone="lo" d="${flat(PSU.x + 4, 4, PSU.x + 9, 9, 1, 3)}"/></g>`);
  out.push(led("flu", PSU.x + 20, F, 6.5));
  out.push(screws([[PSU.x + 3, PSU.y + 3], [PSU.x + PSU.w - 3, PSU.y + 3]], 22));
  return out.join("");
}

function slide() {
  const out = [];
  const s = k.slabOf(SLIDE, SLIDE_Z, 1, P, 2);
  out.push(`<path class="nv-glass" d="${s.fill}"/>`);
  const M = k.topMatrix([SLIDE.x, SLIDE.y], SLIDE_Z + 1, P, "x");
  // Teflon mask with eight wells: the back row against known viruses, the front row with serum.
  const mask = `M14 1.4H${SLIDE.w - 1.4}V${SLIDE.d - 1.4}H14Z` + WELLS.map((w) => circle(w.u, w.v, 3.4)).join("");
  out.push(`<g transform="${M}">`);
  out.push(`<path class="nv-frost" d="M1 1H12.6V${SLIDE.d - 1}H1Z"/>`);
  out.push(`<path class="iso-line" data-tone="lo" data-free="" d="M3 6H10M3 9H8.6"/>`);
  out.push(`<path class="nv-mask" fill-rule="evenodd" d="${mask}"/>`);
  out.push(WELLS.map((w, i) => `<path class="nv-wellspot" d="${circle(w.u, w.v, 3.4)}"/><circle class="nv-glow" data-well="${i}" cx="${w.u}" cy="${w.v}" r="5.4" fill="url(#nv-glow)" opacity="0"/>`).join(""));
  out.push(`<path class="iso-line" data-tone="lo" d="${WELLS.map((w) => circle(w.u, w.v, 3.4)).join("")}"/>`);
  out.push(`<path class="nv-scan" data-part="scan" d="${circle(WELLS[0].u, WELLS[0].v, 4.4)}" opacity="0"/>`);
  out.push(`</g>`);
  out.push(...s.shades.map((d, i) => (d ? `<path class="nv-glass-side" data-shade="${i}" d="${d}"/>` : "")));
  out.push(L(s.outline, { tone: "hi" }));
  return out.join("");
}

/* ---------- 5. electron microscope ---------- */
const EM_FRONT = EM.y + EM.d;
function electron() {
  const out = [`<path class="iso-halo" d="${k.haloOf(EM, 0, 10, P)}"/>`, feet(EM, 7, 4, 3.4)];
  out.push(S(k.slabOf(EM, 4, 48, P, 4, 1.2), { tone: "mid", inner: L(k.sideSeam(EM, 44, P, 4), { tone: "faint" }) }));
  out.push(L(Array.from({ length: 6 }, (_, i) => k.planOutline({ x: EM.x + EM.w - 9, y: EM.y + 8 + i * 6, w: 4, d: 3, r: 1.5 }, 52, P, 3)).join(""), { tone: "faint" }));
  out.push(screws(k.corners(EM, 5), 52));
  // Viewing chamber window onto the phosphor screen.
  const WIN = { x0: EM.x + 21, x1: EM.x + 79, z0: 10, z1: 45, r: 3, depth: 8 };
  out.push(recess(WIN, EM_FRONT, screen(WIN), "nv-cave"));
  out.push(`<g transform="${front(EM_FRONT)}"><path class="nv-glass" d="${flat(WIN.x0, WIN.z0, WIN.x1, WIN.z1, WIN.r)}"/><path class="iso-line" data-tone="lo" d="${flat(WIN.x0 - 3, WIN.z0 - 3, WIN.x1 + 3, WIN.z1 + 3, 5)}"/></g>`);
  out.push(D([[WIN.x0 - 1.5, WIN.z0 - 1.5], [WIN.x1 + 1.5, WIN.z0 - 1.5], [WIN.x0 - 1.5, WIN.z1 + 1.5], [WIN.x1 + 1.5, WIN.z1 + 1.5]].map(([x, z]) => at([x, EM_FRONT, z])), { size: 0.45 }));
  // Knobs on the front: focus and magnification on the left, a vacuum gauge on the right.
  for (const z of [20, 34]) {
    const F = along([EM.x + 12, EM_FRONT, z], Y);
    out.push(S(G.disc(0, 2, 3, F, P), { tone: "mid" }), S(G.disc(2, 6, 5, F, P), { tone: "mid" }), ribbed(F, 2, 6, 5, 22));
    out.push(L(G.circleOf(F, 6, 1, P), { tone: "lo" }));
  }
  const g = [EM.x + EM.w - 12, 33];
  out.push(`<g transform="${front(EM_FRONT)}"><path class="nv-dial" d="${circle(g[0], -g[1], 6.4)}"/>`);
  out.push(`<path class="iso-line" data-tone="lo" d="${Array.from({ length: 9 }, (_, i) => { const a = -2 + (i / 8) * 4; return `M${(g[0] + Math.sin(a) * 6.4).toFixed(2)} ${(-g[1] - Math.cos(a) * 6.4).toFixed(2)}L${(g[0] + Math.sin(a) * 5).toFixed(2)} ${(-g[1] - Math.cos(a) * 5).toFixed(2)}`; }).join("")}"/>`);
  out.push(`<path class="iso-line" data-tone="hi" data-free="end" d="M${g[0]} ${-g[1]}L${g[0] - 3.6} ${-g[1] - 3.4}"/><path class="iso-line" data-tone="mid" d="${circle(g[0], -g[1], 0.8)}"/></g>`);
  out.push(led("em", EM.x + EM.w - 12, EM_FRONT, 18));
  // Binocular focusing scope over the window.
  out.push(S(k.slabOf({ x: EM.x + 38, y: EM_FRONT - 16, w: 24, d: 12, r: 3 }, 52, 8, P, 3, 0.5), { tone: "mid" }));
  for (const x of [EM.x + 44, EM.x + 56]) {
    const F = along([x, EM_FRONT - 6, 58], [0, 0.6, 0.8]);
    out.push(S(G.solidOf([[0, 2.8], [8, 2.8], [8, 3.4], [12, 3.4]], F, P), { tone: "mid" }));
    out.push(L(G.circleOf(F, 12, 2, P), { tone: "lo" }));
  }
  return out.join("");
}

function column() {
  const out = [];
  const [cx, cy] = EM_COL;
  // Lenses from the bottom: projector, intermediate, objective (with the specimen rod), two condensers, gun.
  const stack = [[0, 4, 26, "lo"], [4, 20, 18], [24, 4, 21], [28, 18, 18], [46, 4, 24], [50, 20, 22.5], [70, 4, 24], [74, 20, 17], [94, 4, 19.5], [98, 20, 15], [118, 3, 17], [121, 12, 12.4]];
  for (const [s0, h, r, tone] of stack) {
    const z = 52 + s0;
    const inner = h > 8 ? L(k.sideArc(cx, cy, r, z + h / 2, P, 48), { tone: "faint" }) : "";
    out.push(S(k.cylinder(cx, cy, r, z, h, P, 72, h > 8 ? 0 : 0.5), { tone: tone || "mid", inner }));
    if (h <= 4 && r > 20) out.push(k.dotsSvg(G.dotsOf(along([cx, cy, z], Z), h, r - 1.6, 16, P, { all: true }), { size: 0.45 }));
  }
  out.push(S(k.cylinder(cx, cy, 8, 185, 3, P, 40, 0.4), { tone: "mid" }));
  out.push(S(k.cylinder(cx, cy, 3, 188, 4, P, 20), { tone: "mid" }));
  // Specimen holder entering the objective lens from the +x side.
  const rod = along([cx + 22.4, cy, 52 + 60], X);
  out.push(S(G.disc(0, 3, 6, rod, P), { tone: "mid" }), S(G.disc(3, 20, 2, rod, P), { tone: "hi", crease: "lo" }), S(G.disc(20, 26, 4, rod, P), { tone: "mid" }), ribbed(rod, 20, 26, 4, 18));
  return out.join("");
}

function screen(WIN) {
  const cx = (WIN.x0 + WIN.x1) / 2;
  const cz = (WIN.z0 + WIN.z1) / 2;
  const R = 16.4;
  const Q = 1.32;
  // A paramyxovirus particle as a micrograph shows it: a round envelope with a fringe of spikes,
  // and the herringbone nucleocapsid coiled inside.
  const rnd = mulberry(7);
  const env = [];
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const r = Q * (7.2 + Math.sin(a * 3 + 0.6) * 0.45 + Math.sin(a * 5) * 0.25);
    env.push([cx + Math.cos(a) * r, -cz + Math.sin(a) * r * 0.94]);
  }
  const envD = "M" + env.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L") + "Z";
  const spikes = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const r = Q * (7.2 + Math.sin(a * 3 + 0.6) * 0.45 + Math.sin(a * 5) * 0.25);
    const x0 = cx + Math.cos(a) * r, y0 = -cz + Math.sin(a) * r * 0.94;
    spikes.push(`M${x0.toFixed(2)} ${y0.toFixed(2)}l${(Math.cos(a) * 1.7).toFixed(2)} ${(Math.sin(a) * 1.7).toFixed(2)}`);
  }
  const strands = [];
  const coil = (x0, y0, x1, y1, bend) => {
    const pts = [];
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const x = x0 + (x1 - x0) * t - (y1 - y0) * bend * Math.sin(Math.PI * t);
      const y = y0 + (y1 - y0) * t + (x1 - x0) * bend * Math.sin(Math.PI * t);
      pts.push([x, y]);
    }
    strands.push("M" + pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L"));
    for (let i = 1; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i + 1], [x, y] = pts[i];
      const l = Math.hypot(bx - ax, by - ay) || 1;
      const nx = -(by - ay) / l * 0.75, ny = (bx - ax) / l * 0.75;
      strands.push(`M${(x - nx).toFixed(2)} ${(y - ny).toFixed(2)}L${(x + nx).toFixed(2)} ${(y + ny).toFixed(2)}`);
    }
  };
  coil(cx - 6, -cz - 2.9, cx + 5, -cz - 4.5, 0.18);
  coil(cx - 4.8, -cz + 3.4, cx + 6, -cz + 1.1, -0.22);
  coil(cx - 1.6, -cz - 6.6, cx + 1.8, -cz + 6, 0.28);
  const grain = [];
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (R - 0.6);
    grain.push(circle(cx + Math.cos(a) * r, -cz + Math.sin(a) * r, 0.22 + rnd() * 0.18));
  }
  return [
    `<defs><filter id="nv-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur data-part="em-blur" stdDeviation="2.6"/></filter></defs>`,
    `<path class="nv-phosphor" d="${circle(cx, -cz, R)}"/>`,
    `<path class="nv-grain" d="${grain.join("")}"/>`,
    `<g data-part="virion" filter="url(#nv-blur)" opacity="0.15">`,
    `<path class="nv-env" d="${envD}"/>`,
    `<path class="nv-spike" d="${spikes.join("")}"/>`,
    `<path class="nv-np" d="${strands.join("")}"/>`,
    `</g>`,
    `<path class="iso-line" data-tone="lo" d="${circle(cx, -cz, R)}"/>`,
  ].join("");
}

/* ---------- 6. the source sign ---------- */
function sign() {
  const out = [`<path class="iso-halo" d="${k.haloOf(SIGN, 0, 6, P)}"/>`];
  out.push(S(k.slabOf(SIGN, 0, 6, P, 3, 0.6), { tone: "mid" }));
  out.push(L(k.planOutline({ x: SIGN.x + 6, y: SIGN.y + 9, w: SIGN.w - 12, d: 3, r: 1.5 }, 6, P, 3), { tone: "lo" }));
  out.push(screws([[SIGN.x + 3, SIGN.y + 3], [SIGN.x + SIGN.w - 3, SIGN.y + 3]], 6));
  const posts = [SIGN.x + 5, SIGN.x + SIGN.w - 5];
  out.push(S(k.cylinder(posts[0], SIGN.y + 10.5, 2.2, 6, 54, P, 16), { tone: "mid", crease: "none" }));
  // Cards hang from a bar: the back card says pig, the front card (mosquito) flips over the bar.
  const FY = SIGN.y + 12;
  const x0 = SIGN.x + 10, x1 = SIGN.x + SIGN.w - 10, z0 = 14, z1 = 56;
  const card = (id, word, pict, cls) =>
    `<g data-part="${id}" class="${cls}"><path class="nv-card" d="${flat(x0, z0, x1, z1, 1.4)}"/>` +
    `<text class="nv-sign-head" x="${(x0 + x1) / 2}" y="${-(z1 - 6.6)}" font-size="3.6" text-anchor="middle">SOURCE</text>` +
    `<path class="iso-line" data-tone="faint" d="M${x0} ${-(z1 - 9)}H${x1}"/>` +
    `<g class="nv-pict">${pict}</g>` +
    `<text class="nv-sign-word" x="${(x0 + x1) / 2}" y="${-(z0 + 4)}" font-size="6.2" text-anchor="middle">${word}</text>` +
    `<path class="iso-line" data-tone="lo" d="${flat(x0, z0, x1, z1, 1.4)}"/></g>`;
  const mx = (x0 + x1) / 2;
  const mos = mosquito(mx, -34);
  const pigD = pig(mx, -33);
  out.push(S(k.slabOf({ x: x0, y: FY - 1.2, w: x1 - x0, d: 1.2, r: 0.4 }, z0, z1 - z0, P, 2), { tone: "mid" }));
  out.push(`<g transform="${front(FY)}">${card("card-pig", "PIG", pigD, "nv-card-b")}<g data-part="flip">${card("card-mos", "MOSQUITO", mos, "nv-card-a")}</g></g>`);
  out.push(S(k.cylinder(posts[1], SIGN.y + 10.5, 2.2, 6, 54, P, 16), { tone: "mid", crease: "none" }));
  const bar = along([posts[0], SIGN.y + 10.5, 58.5], X);
  out.push(S(G.disc(-1, SIGN.w - 9, 2, bar, P), { tone: "mid" }));
  for (const x of [x0 + 10, x1 - 10]) {
    const F = along([x, SIGN.y + 10.5, 58.5], X);
    out.push(S(G.ringBand(-0.8, 0.8, 2, 3.2, F, P), { tone: "mid" }));
  }
  return out.join("");
}

function mosquito(x, y) {
  const body = `M${x - 9} ${y}Q${x - 2} ${y - 1.4} ${x + 7} ${y + 0.4}`;
  const head = circle(x + 8.4, y + 0.2, 1.4);
  const wings = `M${x - 1} ${y - 0.6}Q${x - 7} ${y - 9} ${x - 12} ${y - 7}Q${x - 6} ${y - 3} ${x - 1} ${y - 0.6}ZM${x + 1} ${y - 0.8}Q${x - 2} ${y - 10} ${x - 5} ${y - 10}Q${x - 2} ${y - 4} ${x + 1} ${y - 0.8}Z`;
  const legs = [[-2, -7, 7], [1, -3, 8], [4, 3, 7]].map(([s, dx, dy]) => `M${x + s} ${y}l${dx * 0.5} ${dy * 0.5}l${dx * 0.6} ${dy * 0.6}`).join("");
  const nose = `M${x + 9.6} ${y + 0.4}l4 1.6`;
  return `<path class="nv-pict-fill" d="${wings}"/><path class="nv-pict-line" d="${wings}"/><path class="nv-pict-line" data-free="" d="${body}${legs}${nose}"/><path class="nv-pict-body" d="${head}"/>`;
}

function pig(x, y) {
  const body = `M${x - 10} ${y + 1}C${x - 10} ${y - 7} ${x + 6} ${y - 8} ${x + 8} ${y - 2}C${x + 9} ${y + 4} ${x - 10} ${y + 7} ${x - 10} ${y + 1}Z`;
  const snout = flat(x + 8, -(y - 1.4), x + 11.4, -(y + 2.2), 1.2, 3);
  const ear = `M${x + 3} ${y - 5}l2 -3l1.6 3.4`;
  const legs = `M${x - 6} ${y + 4.2}v4M${x - 2} ${y + 4.8}v4M${x + 3} ${y + 4.4}v4M${x + 6} ${y + 3.2}v4`;
  const tail = `M${x - 10} ${y}q-2.4 -1.2 -1.6 -3`;
  return `<path class="nv-pict-fill" d="${body}${snout}"/><path class="nv-pict-line" d="${body}${snout}"/><path class="nv-pict-line" data-free="" d="${ear}${legs}${tail}"/><path class="nv-pict-body" d="${circle(x + 4.6, y - 2.2, 0.6)}"/>`;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- cell monolayer data ---------- */
function cellsData() {
  const rnd = mulberry(1999);
  const inner = k.insetPlan(FLASK, 1.2);
  const ox = inner.x - FLASK.x, oy = inner.y - FLASK.y;
  const cells = [];
  const step = CULTURE.cell;
  const rowH = step * 0.87;
  for (let r = 0; oy + r * rowH < oy + inner.d + step; r++) {
    for (let c = 0; ox + c * step < ox + inner.w + step; c++) {
      const u = ox + c * step + (r % 2 ? step / 2 : 0) + (rnd() - 0.5) * 0.5;
      const v = oy + r * rowH + (rnd() - 0.5) * 0.5;
      let best = Infinity, focus = 0;
      CULTURE.foci.forEach((f, i) => {
        const d = Math.hypot(u - f.u, v - f.v) * CULTURE.spread + f.start;
        if (d < best) { best = d; focus = i; }
      });
      const poly = [];
      const rad = step * 0.5;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.52 + (rnd() - 0.5) * 0.3;
        const rr = rad * (0.86 + rnd() * 0.18);
        poly.push([+(u + Math.cos(a) * rr).toFixed(2), +(v + Math.sin(a) * rr * 0.95).toFixed(2)]);
      }
      cells.push({ u: +u.toFixed(2), v: +v.toFixed(2), t: +(best + (rnd() - 0.5) * 0.35).toFixed(3), f: focus, poly, a: +(rnd() * Math.PI * 2).toFixed(2) });
    }
  }
  return cells;
}

/* ---------- assemble ---------- */
const defs = `<defs><radialGradient id="nv-glow"><stop offset="0" style="stop-color:var(--nv-core)"/><stop offset=".55" style="stop-color:var(--nv-glow)"/><stop offset=".78" style="stop-color:var(--nv-glow);stop-opacity:.55"/><stop offset="1" style="stop-color:var(--nv-glow);stop-opacity:0"/></radialGradient></defs>`;

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A virology lab bench, left to right: a biosafety cabinet with a container of cerebrospinal fluid, a CO2 incubator of culture flasks, an inverted microscope with one flask on its stage, a fluorescence microscope with an eight-well test slide, an electron microscope column with its viewing screen, and a flip sign naming the source of the outbreak. A wall calendar shows February and March 1999. Stepping through the days, the cells in the flask fuse into clusters from day 9 and then all die; the four wells for known viruses stay dark while the patients' serum wells glow green; the electron microscope resolves a paramyxovirus; the sign flips from mosquito to pig.",
  body: [defs, bench(), cabinet(), incubator(), inverted(), invertedTop(), fluorescence(), fluorescenceTop(), power(), electron(), column(), sign()],
});

// Pointer anchors: screen x of each instrument, as a share of the viewBox, mapped onto the timeline.
const sx = (x, y = 0, z = 0) => +(at([x, y, z])[0] / WIDTH).toFixed(4);
const ANCHORS = [
  [sx(INC.x + INC.w, 0), 0],
  [sx(INV.x + 8, 20), 0.02],
  [sx(INV.x + INV.w, 20), TIMELINE.culture[1]],
  [sx(FLU.x + 6, 20), TIMELINE.slides[0]],
  [sx(PSU.x + PSU.w, -20), TIMELINE.slides[1]],
  [sx(EM.x + 10, 30), TIMELINE.em[0]],
  [sx(EM.x + EM.w, 30), TIMELINE.em[1]],
  [sx(SIGN.x + 6, 10), TIMELINE.sign[0]],
  [sx(SIGN.x + SIGN.w - 10, 10), 1],
];

const DATA = { TIMELINE, CULTURE, WELLS, CELLS: cellsData(), ANCHORS };
const model = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const live = readFileSync(join(HERE, "live.js"), "utf8");

const CSS = `
.iso{--nv-glow:#14a650;--nv-core:#d6ffe2;--nv-well:#c3c7c2;--nv-mask:#8d918c;--nv-screen:#dfe4dc;--nv-lcd:#2f4a36;--nv-phos:#cfd5cc;--nv-ink:#2b2f2b;--nv-glass:#eef4f4;--nv-medium:#e9dede;--nv-cave:#e2e2de;--nv-page:#ffffff;--nv-ring:#c8352f;--nv-cell:#8c928c;--nv-cellfill:#f1eeea;--nv-syn:#e4d9d4}
.iso[data-theme="dark"]{--nv-glow:#42d67f;--nv-core:#effff4;--nv-well:#1b1d1b;--nv-mask:#0d0e0d;--nv-screen:#18201a;--nv-lcd:#8fd8a5;--nv-phos:#232823;--nv-ink:#d4dcd4;--nv-glass:#1f2526;--nv-medium:#241e1e;--nv-cave:#101010;--nv-page:#1d1d1d;--nv-ring:#ff6b6b;--nv-cell:#6d726d;--nv-cellfill:#1c1b1a;--nv-syn:#2c2523}
.nv-cave{fill:var(--nv-cave)}
.nv-well{fill:var(--anatomy-shade-1)}
.nv-screen{fill:var(--nv-screen)}
.nv-lcd{fill:var(--nv-lcd);font-family:var(--anatomy-mono);letter-spacing:.02em}
.nv-label{fill:var(--anatomy-hi);font-family:var(--anatomy-mono);font-weight:600;letter-spacing:.06em}
.nv-dial{fill:var(--anatomy-face);stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight)}
.nv-sash,.nv-glass{fill:var(--nv-glass);fill-opacity:.42;stroke:none}
.nv-thin{fill-opacity:.14}
.nv-glass-side{fill:var(--nv-glass);fill-opacity:.25}
.nv-flask-floor{fill:var(--nv-medium);fill-opacity:.55}
.nv-medium-top{fill:var(--nv-medium);fill-opacity:.35}
.nv-medium{fill:var(--nv-medium)}
.nv-flask-end{fill:var(--nv-glass)}
.nv-cell{fill:var(--nv-cellfill);stroke:var(--nv-cell);stroke-width:.4;vector-effect:none}
.nv-syn{fill:var(--nv-syn);stroke:var(--anatomy-hi);stroke-width:.9;vector-effect:none}
.nv-syn-fill{fill:var(--nv-syn);stroke:none}
.nv-nuc{fill:var(--anatomy-mid);stroke:none}
.nv-dead{fill:var(--anatomy-shade-0);stroke:var(--anatomy-hi);stroke-width:.4;vector-effect:none}
.nv-frost{fill:var(--anatomy-shade-1)}
.nv-mask{fill:var(--nv-mask)}
.nv-wellspot{fill:var(--nv-well)}
.nv-scan{fill:none;stroke:var(--anatomy-lit);stroke-width:.5;vector-effect:none}
.nv-phosphor{fill:var(--nv-phos)}
.nv-grain{fill:var(--nv-ink);opacity:.18}
.nv-env{fill:var(--nv-ink);fill-opacity:.12;stroke:var(--nv-ink);stroke-width:.5;vector-effect:none}
.nv-spike{fill:none;stroke:var(--nv-ink);stroke-width:.32;vector-effect:none;stroke-linecap:round}
.nv-np{fill:none;stroke:var(--nv-ink);stroke-width:.26;vector-effect:none;stroke-linecap:round}
.nv-page{fill:var(--nv-page)}
.nv-page-head{fill:var(--anatomy-shade-0)}
.nv-cal-head{fill:var(--anatomy-hi);font-family:var(--anatomy-mono);font-weight:600;letter-spacing:.08em}
.nv-cal-day{fill:var(--anatomy-mid);font-family:var(--anatomy-mono)}
.nv-cal-num{fill:var(--anatomy-hi);font-family:var(--anatomy-mono);opacity:.75}
.nv-cal-ring{fill:none;stroke:var(--nv-ring);stroke-width:.45;vector-effect:none}
.nv-tape{fill:var(--anatomy-shade-2);fill-opacity:.8}
.nv-card{fill:var(--anatomy-face)}
.nv-sign-head{fill:var(--anatomy-mid);font-family:var(--anatomy-mono);letter-spacing:.14em}
.nv-sign-word{fill:var(--anatomy-hi);font-family:var(--anatomy-mono);font-weight:600;letter-spacing:.06em}
.nv-pict-fill{fill:var(--anatomy-shade-1)}
.nv-pict-line{fill:none;stroke:var(--anatomy-hi);stroke-width:.45;vector-effect:none;stroke-linecap:round;stroke-linejoin:round}
.nv-pict-body{fill:var(--anatomy-hi)}
.nv-led[data-on] circle,.nv-led[data-on] path{fill:var(--anatomy-lit)}
.nv-credit{position:absolute;top:34px;right:20px;color:var(--anatomy-muted);font-family:var(--anatomy-mono);font-size:10px;letter-spacing:.04em;pointer-events:none}
.nv-stage{cursor:ew-resize;touch-action:pan-y}
.nv-stage:focus-visible{outline:1px dashed var(--anatomy-mid);outline-offset:6px}
.nv-scrub{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin:14px 6px 0;font-family:var(--anatomy-mono);font-size:10px;letter-spacing:.06em;color:var(--anatomy-muted);text-transform:uppercase}
.nv-scrub input{grid-column:1/-1;width:100%;margin:0 0 6px;accent-color:var(--anatomy-hi)}
.nv-scrub span{border-left:1px solid var(--anatomy-faint);padding-left:6px}
.nv-scrub span[data-on]{color:var(--anatomy-strong)}
@media (max-width:620px){.nv-credit{position:static;display:block;margin:6px 0 8px;text-align:right;white-space:normal}.iso-plate-corner[data-corner="hint"]{display:none}.iso-plate-corner[data-corner="title"]{white-space:normal;max-width:60%;text-align:right;line-height:1.35}.iso-plate-corner[data-corner="readout"]{white-space:normal;max-width:58%;text-align:right;line-height:1.35}.nv-scrub{font-size:8.5px}}
`;

const segs = [
  ["culture", TIMELINE.culture[0], TIMELINE.culture[1], "Culture"],
  ["slides", TIMELINE.slides[0], TIMELINE.slides[1], "Slides"],
  ["em", TIMELINE.em[0], TIMELINE.em[1], "Electron microscope"],
  ["sign", TIMELINE.sign[0], 1, "Source"],
];
const scrub = `<div class="nv-scrub"><input type="range" min="0" max="1000" value="0" step="1" aria-label="Step through the discovery: culture days, test slides, electron microscope, source" data-part="scrub">${segs.map(([id, , , label]) => `<span data-seg="${id}">${label}</span>`).join("")}</div>`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "Discovery of Nipah virus, Universiti Malaya, 1999",
  hint: "Hover or drag to step through the days",
  readout: "day 0 · ruled out 0/4 · antibody not tested · family unknown",
  keys: [
    { mark: "raised", label: "Culture flask on the inverted microscope: Vero cells inoculated with a patient's CSF" },
    { mark: "flat", label: "Test slide, back row: antisera to herpes simplex, measles, mumps, parainfluenza" },
    { mark: "green", label: "Front row: control serum, then two patients' sera and CSF against the new isolate" },
    { mark: "lit", label: "Indicator: the instrument at work" },
  ],
  caption:
    "From September 1998 an encephalitis outbreak among pig farmers in Malaysia was treated as Japanese encephalitis, a mosquito-borne virus, and fought with fogging and vaccination. After a farmer was admitted to University Malaya Medical Centre on 27 February 1999, virologist Chua Kaw Bing put his cerebrospinal fluid on Vero cells. On day 9 the monolayer showed damage, with cells fusing into clusters, and within days every cell in the flask was dead. Immunofluorescence ruled out herpes simplex, measles, mumps and parainfluenza, while patients' sera and CSF lit the infected cells bright green. At the US CDC in Fort Collins, electron microscopy showed a paramyxovirus, closely related to Hendra virus, spread by close contact rather than by mosquitoes. The response turned from fogging to pigs: about a million were culled. Named after the village of Sungai Nipah. Credit: Chua Kaw Bing, Lam Sai Kit et al., Science 2000. The bench brings together instruments in Kuala Lumpur and Fort Collins.",
  body: `<span class="nv-credit">Chua Kaw Bing, Lam Sai Kit et al., Science 2000</span><div class="iso-stage nv-stage" tabindex="0" role="slider" aria-label="Discovery timeline: arrow keys step through the days and tests" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">${svg}</div>${scrub}`,
});

const name = theme === "light" ? "nipah-discovery.html" : "nipah-discovery-dark.html";
writeFileSync(
  join(HERE, name),
  k.pageHtml({ title: "Discovery of Nipah virus", theme, body: `<style>${CSS}</style>${body}`, script: kitScript() + `const DATA = ${JSON.stringify(DATA)};\n` + model + live, width: 900 }),
);
console.log("wrote", name);
