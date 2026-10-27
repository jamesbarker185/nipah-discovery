
// Live page: DATA, TIMELINE, CULTURE, WELLS, stateAt and readoutOf are inlined before this.
const stage = document.querySelector(".nv-stage");
const svg = stage.querySelector("svg");
const q = (name) => svg.querySelector(`[data-part="${name}"]`);
const readout = document.querySelector("[data-readout]");
const range = document.querySelector('[data-part="scrub"]');
const segs = [...document.querySelectorAll("[data-seg]")];
const parts = {
  healthy: q("healthy"), syn: q("syn"), nuclei: q("nuclei"), synFill: q("syn-fill"), dead: [q("dead1"), q("dead2"), q("dead3")],
  scan: q("scan"), blur: q("em-blur"), virion: q("virion"), flip: q("flip"), feb: q("cal-feb"),
};
const glows = [...svg.querySelectorAll("[data-well]")];
const leds = Object.fromEntries([...svg.querySelectorAll("[data-led]")].map((el) => [el.dataset.led, el]));
const still = matchMedia("(prefers-reduced-motion: reduce)");

const circ = (x, y, r) => `M${(x - r).toFixed(2)} ${y.toFixed(2)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(2 * r).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-2 * r).toFixed(2)} 0Z`;
const polys = DATA.CELLS.map((c) => "M" + c.poly.map(([x, y]) => `${x} ${y}`).join("L") + "Z");
const ease = (t) => t * t * (3 - 2 * t);

let lastDay = -1;
function drawCells(day) {
  const d = Math.round(day * 50) / 50;
  if (d === lastDay) return;
  lastDay = d;
  const F = CULTURE.fuse;
  let healthy = "", nuclei = "", syn = "";
  const dead = ["", "", ""];
  DATA.CELLS.forEach((c, i) => {
    const p = d - c.t;
    if (p < 0) {
      healthy += polys[i];
      nuclei += circ(c.u, c.v, 0.4);
    } else if (p < F) {
      // Fused into a syncytium: neighbouring cells merge into one sheet and the nuclei crowd together.
      const f = CULTURE.foci[c.f];
      const pull = 0.22 * ease(p / F);
      const x = c.u + (f.u - c.u) * pull, y = c.v + (f.v - c.v) * pull;
      syn += circ(x, y, CULTURE.cell * 0.78);
      nuclei += circ(x, y, 0.46);
    } else {
      // Rounded up and lifting off: most cells wash away, a few stay as small refractile balls.
      const age = p - F;
      const keep = (c.a * 1000) % 1 < 0.38;
      if (!keep && age > 1.2) return;
      const drift = Math.min(age, 2) * 0.6;
      const r = 1.0 - Math.min(age, 2) * 0.2;
      dead[!keep ? 1 + (age > 0.6) : age < 0.8 ? 0 : 1] += circ(c.u + Math.cos(c.a) * drift, c.v + Math.sin(c.a) * drift, r);
    }
  });
  parts.healthy.setAttribute("d", healthy);
  parts.nuclei.setAttribute("d", nuclei);
  parts.syn.setAttribute("d", syn);
  parts.synFill.setAttribute("d", syn);
  parts.dead.forEach((el, i) => el.setAttribute("d", dead[i]));
}

let shown = "";
function draw(s) {
  const st = stateAt(s);
  drawCells(st.day);
  if (st.scan >= 0) {
    const w = WELLS[st.scan];
    parts.scan.setAttribute("d", circ(w.u, w.v, 4.4));
  }
  parts.scan.setAttribute("opacity", st.scanAlpha.toFixed(3));
  glows.forEach((el, i) => el.setAttribute("opacity", st.glow[i].toFixed(3)));
  const e = ease(st.em);
  parts.blur.setAttribute("stdDeviation", (2.6 * (1 - e)).toFixed(3));
  parts.virion.setAttribute("opacity", (0.12 + 0.88 * e).toFixed(3));
  // The mosquito card folds up over the bar; past halfway it is gone and the pig card shows.
  const f = st.flip;
  const top = -56;
  const scale = Math.cos(Math.min(f, 0.999) * Math.PI);
  parts.flip.setAttribute("transform", f <= 0 ? "" : `translate(0 ${top}) scale(1 ${Math.max(scale, 0.0001).toFixed(4)}) translate(0 ${-top})`);
  parts.flip.style.display = f >= 0.5 ? "none" : "";
  // The calendar turns to March once the culture is running (patient admitted 27 February).
  parts.feb.style.display = st.day >= 2 ? "none" : "";
  for (const [name, el] of Object.entries(leds)) {
    const on = (name === "inv" && st.stage === "culture") || (name === "flu" && st.stage === "slides") || (name === "em" && st.stage === "em");
    on ? el.setAttribute("data-on", "") : el.removeAttribute("data-on");
  }
  segs.forEach((el) => (el.dataset.seg === st.stage ? el.setAttribute("data-on", "") : el.removeAttribute("data-on")));
  const text = readoutOf(st);
  if (text !== shown) {
    readout.textContent = shown = text;
    stage.setAttribute("aria-valuetext", text);
  }
  stage.setAttribute("aria-valuenow", String(Math.round(s * 100)));
  if (document.activeElement !== range) range.value = String(Math.round(s * 1000));
}

// Idle tour: glide between the beats of the story and hold on each.
const T = TIMELINE;
const dayAt = (d) => (d / T.days) * T.culture[1];
const BEATS = [
  [0, 1.4], [dayAt(8), 0.8], [dayAt(9.4), 2.2], [dayAt(11), 1.6], [dayAt(14), 2], [T.slides[0] + 0.12, 0.6], [T.slides[1], 2.4], [T.em[1], 2.4], [1, 3.2],
];
const GLIDE = [0, 3.2, 1.8, 2.2, 2.6, 3.4, 3.4, 2.6, 2.2];
let s = 0, target = 0, touring = !still.matches, beat = 0, beatClock = 0, holding = true;
let frame = 0, last = 0, visible = false, idleTimer = 0, from = 0;

function tour(dt) {
  beatClock += dt;
  if (holding) {
    if (beatClock >= BEATS[beat][1]) { holding = false; beatClock = 0; from = target; beat = (beat + 1) % BEATS.length; }
  } else {
    const span = beat === 0 ? 2.4 : GLIDE[beat];
    const t = Math.min(1, beatClock / span);
    target = from + (BEATS[beat][0] - from) * ease(t);
    if (t >= 1) { holding = true; beatClock = 0; }
  }
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
  last = now;
  if (touring) tour(dt);
  s = still.matches ? target : s + (target - s) * (1 - Math.exp(-dt / 0.3));
  if (Math.abs(target - s) < 1e-4) s = target;
  draw(s);
  const settled = !touring && s === target;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (next) => {
  touring = false;
  target = Math.min(1, Math.max(0, next));
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (still.matches) return;
    touring = true; holding = true; beatClock = 0;
    beat = BEATS.reduce((best, b, i) => (Math.abs(b[0] - target) < Math.abs(BEATS[best][0] - target) ? i : best), 0);
    run();
  }, 4200);
  run();
};

const fromPointer = (fx) => {
  const A = DATA.ANCHORS;
  if (fx <= A[0][0]) return 0;
  for (let i = 1; i < A.length; i++) if (fx <= A[i][0]) return A[i - 1][1] + ((fx - A[i - 1][0]) / (A[i][0] - A[i - 1][0])) * (A[i][1] - A[i - 1][1]);
  return 1;
};
stage.addEventListener("pointermove", (event) => {
  const box = svg.getBoundingClientRect();
  steer(fromPointer((event.clientX - box.left) / box.width));
});
range.addEventListener("input", () => steer(Number(range.value) / 1000));
stage.addEventListener("keydown", (event) => {
  const st = stateAt(target);
  const stops = [...Array.from({ length: T.days + 1 }, (_, d) => dayAt(d)), T.slides[0] + 0.03, T.slides[0] + 0.065, T.slides[0] + 0.09, T.slides[0] + 0.115, T.slides[0] + 0.15, T.slides[1], T.em[1], 1];
  let i = stops.findIndex((v) => v > target + 1e-4);
  if (i < 0) i = stops.length;
  let to = null;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") to = stops[Math.min(stops.length - 1, i)];
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") to = stops[Math.max(0, stops.findLastIndex((v) => v < target - 1e-4))] ?? 0;
  if (event.key === "Home") to = 0;
  if (event.key === "End") to = 1;
  if (to === null) return;
  event.preventDefault();
  void st;
  steer(to);
});
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) { touring = false; target = s = 1; }
const preset = new URLSearchParams(location.search).get("s");
if (preset !== null) { touring = false; target = s = Number(preset); }
draw(s);
window.__nv = { set: (v) => { touring = false; target = s = v; draw(s); }, stateAt };
