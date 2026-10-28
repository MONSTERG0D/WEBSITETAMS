#!/usr/bin/env python3
"""Generates the high-poly vector wolf used across the site (assets: _build/wolf.json).
Silhouette -> densified outline + interior points -> Delaunay -> keep inside triangles
-> shade each facet by a moonlight direction. Output is grouped by shade so the SVG stays small."""
import json, math, os, random
import numpy as np
from scipy.spatial import Delaunay
from matplotlib.path import Path

random.seed(17); np.random.seed(17)
HERE = os.path.dirname(os.path.abspath(__file__))

import sys; sys.path.insert(0, HERE)
from wolf_shape import BODY as _B, smooth_path, HEAD as _H, TAIL as _T, TORSO as _TO
BODY = [(p[0], p[1]) for p in _B]
EYE = []
CX, CY, R = 200, 180, 10000

def densify(poly, step):
    out = []
    for i in range(len(poly)):
        a = np.array(poly[i], float); b = np.array(poly[(i + 1) % len(poly)], float)
        n = max(1, int(np.linalg.norm(b - a) // step))
        for k in range(n): out.append(a + (b - a) * k / n)
    return np.array(out)

def tri_mesh(poly, step, n_inner, jitter=0.0):
    edge = densify(poly, step)
    path = Path(poly)
    xs, ys = zip(*poly)
    pts = []
    while len(pts) < n_inner:
        p = (random.uniform(min(xs), max(xs)), random.uniform(min(ys), max(ys)))
        if path.contains_point(p, radius=-3): pts.append(p)
    allp = np.vstack([edge, np.array(pts)])
    tri = Delaunay(allp)
    keep = []
    for s in tri.simplices:
        t = allp[s]
        c = t.mean(axis=0)
        mids = [(t[0] + t[1]) / 2, (t[1] + t[2]) / 2, (t[0] + t[2]) / 2]
        if (c[0]-CX)**2 + (c[1]-CY)**2 > (R+6)**2: continue
        if path.contains_point(c) and all(path.contains_point(m, radius=0.6) or path.contains_point(m, radius=-0.6) for m in mids):
            keep.append(t)
    return keep

def shade(t, light=np.array([-0.62, -0.78])):
    # fake normal from triangle orientation + position: facets facing the moon (upper-left) are lighter
    c = t.mean(axis=0)
    e1, e2 = t[1] - t[0], t[2] - t[0]
    n = np.array([e1[1] + e2[1], -(e1[0] + e2[0])]); n = n / (np.linalg.norm(n) + 1e-9)
    facing = abs(float(np.dot(n, light)))
    height = 1 - (c[1] - 30) / 345          # higher on the body = more moonlight
    left = 1 - (c[0] - 100) / 300
    rim = 0.0
    if RIM_PATH is not None and not RIM_PATH.contains_point(c):  # facets on the moon-facing edge catch light
        rim = 0.16 if (c[0] < 170 or c[1] < 120) else 0.05
    height = 1 - (c[1] - 10) / 340
    left = 1 - (c[0] - 60) / 330
    v = 0.24 * facing + 0.26 * height + 0.16 * left + rim - 0.10 + random.uniform(-0.07, 0.07)
    return max(0.0, min(0.56, v))

RIM_PATH = None

def build():
    global RIM_PATH
    # an inset copy of the outline; facets outside it are "rim" facets
    arr = np.array(BODY, float); c = arr.mean(axis=0)
    RIM_PATH = Path(c + (arr - c) * 0.88)
    body = tri_mesh(BODY, 7, 340)
    leg = []
    parts = {"head": Path([p[:2] for p in _H]), "tail": Path([p[:2] for p in _T])}
    buckets = {"head": {}, "tail": {}, "torso": {}}
    for t in body:
        o = round(shade(t) / 0.04) * 0.04
        c = t.mean(axis=0)
        part = "head" if parts["head"].contains_point(c) else ("tail" if parts["tail"].contains_point(c) else "torso")
        buckets[part].setdefault(f"{o:.2f}", []).append(t)
    def pd(ts): return "".join("M{:.0f} {:.0f}L{:.0f} {:.0f}L{:.0f} {:.0f}Z".format(*t[0], *t[1], *t[2]) for t in ts)
    out = {
        "body": smooth_path(_B),
        "parts": {n: {"path": smooth_path(pts), "shades": {k: pd(v) for k, v in sorted(buckets[n].items())}} for n, pts in (("head", _H), ("tail", _T), ("torso", _TO))},
        "count": len(body) + len(leg),
    }
    with open(os.path.join(HERE, "wolf.json"), "w") as f: json.dump(out, f)
    print("triangles:", out["count"], "bytes:", sum(len(v) for p in out["parts"].values() for v in p["shades"].values()))

if __name__ == "__main__":
    build()
