// The discovery as one timeline, s from 0 to 1, shared by the build and the page.
// Culture days follow Chua's account: damage on day 9, every cell dead within days.

export const TIMELINE = { culture: [0, 0.5], slides: [0.52, 0.74], em: [0.76, 0.88], sign: [0.9, 1], days: 14 };

// Vero monolayer in the flask's own floor coordinates (58 × 32 units). Damage starts at a few foci on
// day 9 and spreads outward; a cell fuses into the cluster (a syncytium) for `fuse` days, then rounds up,
// lifts off and dies.
export const CULTURE = {
  cell: 2.5,
  spread: 0.13, // days per unit of distance from a focus
  fuse: 1.2,
  foci: [
    { u: 15, v: 11, start: 9.0 },
    { u: 39, v: 23, start: 9.4 },
    { u: 48, v: 8, start: 10.0 },
  ],
};

// Eight wells on the slide (slide coordinates, 56 × 22). Back row: antisera to known viruses, each
// against the new isolate. Front row: a control serum, then two patients' sera and a patient's CSF.
export const WELLS = [
  { u: 20, v: 6.6, name: "herpes simplex", kind: "known" },
  { u: 30, v: 6.6, name: "measles", kind: "known" },
  { u: 40, v: 6.6, name: "mumps", kind: "known" },
  { u: 50, v: 6.6, name: "parainfluenza", kind: "known" },
  { u: 20, v: 15.4, name: "control serum", kind: "control" },
  { u: 30, v: 15.4, name: "patient serum", kind: "patient" },
  { u: 40, v: 15.4, name: "patient serum", kind: "patient" },
  { u: 50, v: 15.4, name: "patient CSF", kind: "patient" },
];

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth01 = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const READ = [0.04, 0.16, 0.28, 0.4, 0.56]; // slide progress at which each of the first five wells is read
const READ_SPAN = 0.1;

export function stateAt(s) {
  const T = TIMELINE;
  const day = T.days * clamp01(s / T.culture[1]);
  const u = clamp01((s - T.slides[0]) / (T.slides[1] - T.slides[0]));
  const ruled = READ.slice(0, 4).filter((r) => u >= r + READ_SPAN).length;
  let scan = -1, scanAlpha = 0;
  READ.forEach((r, i) => {
    if (u >= r && u < r + READ_SPAN) { scan = i; scanAlpha = Math.sin(((u - r) / READ_SPAN) * Math.PI); }
  });
  const glow = [0, 0, 0, 0, 0, smooth01((u - 0.7) / 0.14), smooth01((u - 0.76) / 0.14), smooth01((u - 0.82) / 0.14)];
  const em = clamp01((s - T.em[0]) / (T.em[1] - T.em[0]));
  const flip = clamp01((s - T.sign[0]) / (1 - T.sign[0]));
  const antibody = glow[5] > 0.5 ? "positive" : u >= READ[4] ? "testing" : "not tested";
  const family = em >= 0.82 ? "Paramyxoviridae" : "unknown";
  const stage = s < T.slides[0] - 0.01 ? "culture" : s < T.em[0] - 0.01 ? "slides" : s < T.sign[0] - 0.01 ? "em" : "sign";
  return { day, ruled, scan, scanAlpha, glow, em, flip, antibody, family, stage };
}

export const readoutOf = (st) => `day ${Math.floor(st.day + 1e-6)} · ruled out ${st.ruled}/4 · antibody ${st.antibody} · family ${st.family}`;
