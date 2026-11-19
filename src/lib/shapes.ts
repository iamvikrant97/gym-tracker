// Small drawing helpers shared by the front-view figure: smooth outlines along a bone, and pointed muscle-belly shapes.
export interface V { x: number; y: number }
export type Prof = [number, number, number][]; // [position along the bone, half-width on one side, half-width on the other]

const f2 = (n: number) => n.toFixed(2);

/** Unit vector at a right angle to a -> b. */
export function perp(a: V, b: V): V {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  return { x: -dy / d, y: dx / d };
}

/** A smooth closed outline along a bone, wider or narrower on each side. */
export function contour(a: V, b: V, n: V, prof: Prof): string {
  const dx = b.x - a.x, dy = b.y - a.y;
  const fr: V[] = [], bk: V[] = [];
  for (const [t, fw, bw] of prof) {
    const c = { x: a.x + dx * t, y: a.y + dy * t };
    fr.push({ x: c.x + n.x * fw, y: c.y + n.y * fw });
    bk.push({ x: c.x - n.x * bw, y: c.y - n.y * bw });
  }
  const pts = [...fr, ...bk.reverse()];
  const k = pts.length;
  const mp = (p: V, q: V) => `${f2((p.x + q.x) / 2)} ${f2((p.y + q.y) / 2)}`;
  let d = `M ${mp(pts[k - 1], pts[0])}`;
  for (let i = 0; i < k; i++) d += ` Q ${f2(pts[i].x)} ${f2(pts[i].y)} ${mp(pts[i], pts[(i + 1) % k])}`;
  return d + ' Z';
}

/** A pointed muscle-belly shape centred on (cx, cy), half-length rx, half-thickness ry, turned by rot degrees. */
export function lensPath(cx: number, cy: number, rx: number, ry: number, rot: number): string {
  const c = Math.cos((rot * Math.PI) / 180), s = Math.sin((rot * Math.PI) / 180);
  const pt = (x: number, y: number) => `${f2(cx + x * c - y * s)} ${f2(cy + x * s + y * c)}`;
  const k = ry * 1.55;
  return `M ${pt(-rx, 0)} Q ${pt(-rx * 0.1, -k)} ${pt(rx, 0)} Q ${pt(-rx * 0.1, k)} ${pt(-rx, 0)} Z`;
}

/** A lens along the bone a -> b, from t0 to t1 of its length, pushed `off` along the bone's normal. */
export function boneLens(a: V, b: V, t0: number, t1: number, thick: number, off = 0): string {
  const m = (t0 + t1) / 2, n = perp(a, b);
  const cx = a.x + (b.x - a.x) * m + n.x * off, cy = a.y + (b.y - a.y) * m + n.y * off;
  const len = Math.hypot(b.x - a.x, b.y - a.y) * (t1 - t0);
  return lensPath(cx, cy, len / 2, thick, (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
}
