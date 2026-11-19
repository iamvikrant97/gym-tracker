// Turns a polygon ("M x y L x y ... Z", or a list of points) into a smooth closed curve, so hand-placed outlines look organic.
export type Pt = [number, number];

export function parsePoly(d: string): Pt[] {
  const n = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
  return pts;
}

/** Closed Catmull-Rom style curve through the points. `k` is how round it is (0 = polygon, 1 = very soft). */
export function smoothClosed(pts: Pt[], k = 0.8): string {
  const n = pts.length;
  if (n < 3) return '';
  const f = (x: number) => Math.round(x * 100) / 100;
  let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * k, p1[1] + ((p2[1] - p0[1]) / 6) * k];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * k, p2[1] - ((p3[1] - p1[1]) / 6) * k];
    d += ` C ${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + ' Z';
}

export const smoothD = (d: string, k = 0.8) => smoothClosed(parsePoly(d), k);
