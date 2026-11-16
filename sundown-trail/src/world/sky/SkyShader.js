import * as THREE from 'three';

/**
 * Sky-dome shader (GAME_BIBLE §7 "Light"): palette gradient, HDR sun disc with a Mie-like halo, horizon haze that
 * meets the fog colour, two drifting cloud layers, hashed stars, a faint Milky Way and a phased moon.
 * The same material renders the camera dome and (with uEnvPass = 1, no sun disc or stars) the environment cube.
 */
export const SKY_VERTEX = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // always on the far plane
}`;

export const SKY_FRAGMENT = /* glsl */`
uniform vec3 uSunDir; uniform vec3 uMoonDir; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uFogColor;
uniform vec3 uSunColor; uniform vec3 uMoonColor; uniform float uSunDisc; uniform float uSunHalo; uniform float uDaylight; uniform float uNight;
uniform float uCloudCover; uniform float uDark; uniform vec4 uCloudOffset; uniform float uTime; uniform float uFlash;
uniform float uStars; uniform float uMilky; uniform float uMoonPhase; uniform float uEnvPass; uniform float uHaze; uniform float uExposureComp;
uniform sampler2D uCloudTex;
varying vec3 vDir;

float sHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
vec3 sHash3(vec3 p) { return vec3(sHash(p), sHash(p + 19.19), sHash(p + 47.43)); }

// One cloud layer: returns (density, light) for direction d.
vec3 cloudLayer(vec3 d, float height, vec2 offset, float scale, float cover, float softness, float stretch) {
  vec2 uv = d.xz / (d.y + height) * scale;
  uv.x *= stretch;
  uv += offset;
  float n = texture2D(uCloudTex, uv).r * 0.62 + texture2D(uCloudTex, uv * 2.7 + 0.37).g * 0.28 + texture2D(uCloudTex, uv * 7.3 - 0.21).r * 0.10;
  float lo = 1.0 - cover;
  float dens = max(smoothstep(lo - softness * 0.5, lo + softness, n), smoothstep(0.88, 1.0, cover)); // a full deck closes the gaps
  // Self-shadowing guess: sample a step toward the sun; denser there = darker here.
  vec2 toSun = normalize(uSunDir.xz + 1e-4) * 0.035;
  float n2 = texture2D(uCloudTex, uv + toSun).r * 0.7 + texture2D(uCloudTex, (uv + toSun) * 2.7 + 0.37).g * 0.3;
  float lit = clamp(1.0 - (n2 - n) * 3.0 - dens * 0.35, 0.0, 1.0);
  return vec3(dens * smoothstep(0.0, 0.12, d.y), lit, n);
}

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float up = max(y, 0.0);
  // --- base gradient: horizon to zenith, sun-side warmth at low sun
  float t = pow(up, 0.42);
  vec3 col = mix(uHorizon, uZenith, t);
  float mu = dot(d, uSunDir);
  float sunUp = smoothstep(-0.25, 0.05, uSunDir.y);
  float lowSun = 1.0 - smoothstep(0.05, 0.45, uSunDir.y);
  float side = max(dot(normalize(d.xz + 1e-4), normalize(uSunDir.xz + 1e-4)), 0.0);
  col += uSunColor * pow(side, 3.0) * (1.0 - t) * lowSun * sunUp * 0.55;
  // overcast: flatten toward a grey with the same brightness
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(lum) * vec3(0.92, 0.95, 1.0), uCloudCover * 0.75);
  col *= 1.0 - uDark * 0.55;
  // --- horizon haze meets the fog colour, ground below the horizon is fog
  float band = pow(1.0 - up, 7.0);
  col = mix(col, uFogColor, band * uHaze);
  col = mix(col, uFogColor, 1.0 - smoothstep(-0.08, 0.0, y));
  // --- Mie halo around the sun
  float m = max(mu, 0.0);
  float halo = pow(m, 10.0) * 0.28 + pow(m, 90.0) * 0.55 + pow(m, 900.0) * 1.4;
  col += uSunColor * halo * uSunHalo * (1.0 - uCloudCover * 0.6);
  // --- night sky: stars and Milky Way (not in the environment cube)
  if (uEnvPass < 0.5 && uNight > 0.01 && y > -0.02) {
    vec3 p = d * 260.0, c = floor(p), f = fract(p) - 0.5;
    float h = sHash(c);
    vec3 o = (sHash3(c) - 0.5) * 0.7;
    float s = step(0.982, h) * (1.0 - smoothstep(0.0, 0.16, length(f - o)));
    float tw = 0.65 + 0.35 * sin(uTime * (1.7 + h * 4.0) + h * 91.0);
    float bright = pow(fract(h * 37.1), 3.0) * 2.6 + 0.4;
    // Milky Way: a band around a tilted great circle, mottled by the cloud noise
    vec3 axis = normalize(vec3(0.42, 0.35, -0.84));
    float g = 1.0 - abs(dot(d, axis));
    vec2 mwUv = vec2(dot(d, normalize(cross(axis, vec3(0.0, 1.0, 0.0)))), dot(d, vec3(0.0, 1.0, 0.0))) * 1.7;
    float mn = texture2D(uCloudTex, mwUv + 0.13).r * texture2D(uCloudTex, mwUv * 2.3 - 0.4).g;
    float mw = pow(g, 4.0) * smoothstep(0.08, 0.5, mn);
    vec3 nightAdd = vec3(0.9, 0.95, 1.0) * s * tw * bright * uStars + vec3(0.55, 0.6, 0.8) * mw * uMilky * 0.05;
    col += nightAdd * uNight * smoothstep(-0.02, 0.15, y) * (1.0 - uCloudCover * 0.85);
  }
  // --- moon: disc with a soft terminator, plus a glow
  float mm = dot(d, uMoonDir);
  float moonVis = uNight * smoothstep(-0.03, 0.03, uMoonDir.y);
  if (moonVis > 0.001) {
    float disc = smoothstep(0.99955, 0.99968, mm);
    vec3 rel = d - uMoonDir * mm;
    vec3 sideDir = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)) + 1e-4);
    float shade = smoothstep(-0.2, 0.2, dot(rel, sideDir) * 90.0 + uMoonPhase);
    float glow = pow(max(mm, 0.0), 200.0) * 0.12 + pow(max(mm, 0.0), 12.0) * 0.03;
    float tex = 0.82 + 0.18 * texture2D(uCloudTex, rel.xy * 30.0).r;
    col += uMoonColor * (disc * shade * tex * (uEnvPass > 0.5 ? 0.0 : 6.0) + glow) * moonVis;
  }
  // --- sun disc (HDR, catches the bloom)
  if (uEnvPass < 0.5) col += uSunColor * smoothstep(0.99962, 0.99978, mu) * uSunDisc;
  // --- clouds: a high wispy layer and a lower puffy one
  if (y > 0.0) {
    vec3 hi = cloudLayer(d, 0.35, uCloudOffset.zw, 0.22, clamp(uCloudCover * 0.8 + 0.12, 0.0, 1.0), 0.45, 0.45);
    vec3 lo = cloudLayer(d, 0.12, uCloudOffset.xy, mix(0.55, 0.3, uDark), uCloudCover, 0.32 + uDark * 0.3, 1.0);
    float silver = pow(m, 6.0) * 1.6 + pow(m, 40.0) * 2.0;
    vec3 skyAmb = mix(uHorizon, uZenith, 0.5) * 0.9 + vec3(0.02);
    skyAmb = mix(skyAmb, vec3(dot(skyAmb, vec3(0.2126, 0.7152, 0.0722))), uCloudCover * 0.7); // overcast is grey, not blue
    vec3 sunLit = uSunColor * (0.75 + silver) * sunUp * (1.0 - uDark * 0.9);
    vec3 moonLit = uMoonColor * 0.18 * uNight;
    vec3 hiCol = skyAmb * 0.75 + sunLit * 0.9 + moonLit;
    col = mix(col, hiCol, hi.x * 0.55 * (1.0 - uDark * 0.5));
    vec3 base = mix(skyAmb * 0.55, skyAmb * 0.95, mix(lo.y, 0.6, uDark * 0.6)) * (1.0 - uDark * 0.72);
    base *= 1.0 - uDark * 0.45 * smoothstep(0.35, 0.85, lo.z); // heavy storm bellies
    vec3 loCol = base + (sunLit * lo.y + moonLit) * (1.0 - lo.x * 0.35);
    loCol *= 1.0 - uDark * 0.3;
    loCol = mix(loCol, uFogColor, band * 0.6);
    col = mix(col, loCol, lo.x);
  }
  // --- lightning lights the whole sky from inside the clouds
  col += vec3(0.75, 0.8, 1.0) * uFlash * (0.35 + 0.65 * uCloudCover) * (0.6 + 0.4 * up);
  col *= uExposureComp;
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * Seamless two-channel fbm value noise, generated on the CPU once (tiles in both directions).
 * @param {number} size power of two
 * @param {() => number} rand seeded random 0..1
 */
export function createCloudTexture(size, rand) {
  const data = new Uint8Array(size * size * 4);
  const channel = (offset) => {
    const out = new Float32Array(size * size);
    let amp = 1, total = 0;
    for (let period = 4; period <= size / 4; period *= 2) {
      const grid = new Float32Array(period * period);
      for (let i = 0; i < grid.length; i++) grid[i] = rand();
      const cell = size / period;
      for (let y = 0; y < size; y++) {
        const gy = y / cell, y0 = Math.floor(gy), ty = gy - y0, sy = ty * ty * (3 - 2 * ty);
        const r0 = (y0 % period) * period, r1 = ((y0 + 1) % period) * period;
        for (let x = 0; x < size; x++) {
          const gx = x / cell, x0 = Math.floor(gx), tx = gx - x0, sx = tx * tx * (3 - 2 * tx);
          const c0 = x0 % period, c1 = (x0 + 1) % period;
          const a = grid[r0 + c0] + (grid[r0 + c1] - grid[r0 + c0]) * sx;
          const b = grid[r1 + c0] + (grid[r1 + c1] - grid[r1 + c0]) * sx;
          out[y * size + x] += (a + (b - a) * sy) * amp;
        }
      }
      total += amp; amp *= 0.55;
    }
    // stretch the contrast so coverage thresholds have room
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < out.length; i++) { const v = out[i] / total; out[i] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
    for (let i = 0; i < out.length; i++) data[i * 4 + offset] = Math.round(255 * (out[i] - lo) / (hi - lo || 1));
  };
  channel(0); channel(1);
  for (let i = 0; i < size * size; i++) { data[i * 4 + 2] = 0; data[i * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.needsUpdate = true;
  return tex;
}
