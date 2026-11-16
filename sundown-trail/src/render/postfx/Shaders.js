/**
 * PostFX shaders. Every pass draws one full-screen triangle pair; vUv is 0..1.
 * The composite is a single merged pass (motion blur, AO, DOF, bloom, god rays, exposure, ACES, grade,
 * Focus look, vignette, grain, flash, sRGB) so phones pay for one full-resolution pass.
 */
export const QUAD_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** 4 bilinear taps = a 4×4 box: full resolution → quarter. */
export const DOWNSAMPLE_FRAG = /* glsl */`
uniform sampler2D tInput; uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tInput, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tInput, vUv + uTexel * vec2(1.0, -1.0)).rgb
         + texture2D(tInput, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tInput, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(min(c * 0.25, vec3(6.0e4)), 1.0);
}`;

/** Soft-knee threshold; the clamp stops single bright pixels from flickering. */
export const BRIGHT_FRAG = /* glsl */`
uniform sampler2D tInput; uniform float uThreshold; uniform float uKnee; uniform float uExposure;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tInput, vUv).rgb * uExposure;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float w = max(soft, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(min(c * w, vec3(24.0)) / max(uExposure, 1e-3), 1.0); // un-exposed: the composite applies exposure once
}`;

/** 9-tap Gaussian using linear filtering (5 fetches). */
export const BLUR_FRAG = /* glsl */`
uniform sampler2D tInput; uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tInput, vUv).rgb * 0.2270270270;
  c += texture2D(tInput, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tInput, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tInput, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture2D(tInput, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

/** God rays: march toward the sun's screen position collecting unoccluded sky. RAY_SAMPLES is a define. */
export const RAYS_FRAG = /* glsl */`
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uSun; uniform float uDensity; uniform float uDecay; uniform float uAspect;
varying vec2 vUv;
void main() {
  vec2 delta = (uSun - vUv) * uDensity / float(RAY_SAMPLES);
  vec2 uv = vUv; float illum = 1.0; vec3 acc = vec3(0.0);
  for (int i = 0; i < RAY_SAMPLES; i++) {
    uv += delta;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
    float sky = step(0.99999, texture2D(tDepth, uv).x);
    vec2 d = (uv - uSun) * vec2(uAspect, 1.0);
    float sun = exp(-dot(d, d) * 18.0);
    vec3 c = texture2D(tColor, uv).rgb;
    acc += min(c, vec3(4.0)) * sky * (0.25 + sun) * illum;
    illum *= uDecay;
  }
  gl_FragColor = vec4(acc / float(RAY_SAMPLES), 1.0);
}`;

/** Light SSAO (High only): 8 spiral samples in view space, normals from depth derivatives. Output in .r. */
export const SSAO_FRAG = /* glsl */`
#include <packing>
uniform sampler2D tDepth; uniform mat4 uInvProj; uniform mat4 uProj; uniform float uNear; uniform float uFar; uniform float uRadius; uniform vec2 uTexel; uniform float uTime;
varying vec2 vUv;
vec3 viewPos(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
float h12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float d = texture2D(tDepth, vUv).x;
  if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 P = viewPos(vUv);
  vec3 N = normalize(cross(dFdx(P), dFdy(P)));
  float ao = 0.0, ang = h12(gl_FragCoord.xy) * 6.2831;
  float rad = uRadius / max(-P.z, 0.5);
  for (int i = 0; i < 8; i++) {
    float f = (float(i) + 0.5) / 8.0;
    ang += 2.3999632;
    vec2 off = vec2(cos(ang), sin(ang)) * rad * f * vec2(uProj[0][0], uProj[1][1]) * 0.5;
    vec3 S = viewPos(vUv + off);
    vec3 v = S - P;
    float dist = length(v);
    float occ = max(dot(N, v / max(dist, 1e-4)) - 0.12, 0.0) * (1.0 - smoothstep(uRadius * 0.6, uRadius * 2.0, dist));
    ao += occ;
  }
  ao = clamp(1.0 - ao / 8.0 * 1.6, 0.0, 1.0);
  gl_FragColor = vec4(ao, ao, ao, 1.0);
}`;

/** Final composite. Feature switches are defines: MOTION_SAMPLES, USE_AO, USE_DOF, USE_RAYS, USE_DEPTH. */
export const COMPOSITE_FRAG = /* glsl */`
#include <packing>
uniform sampler2D tScene; uniform sampler2D tDepth; uniform sampler2D tBloomA; uniform sampler2D tBloomB; uniform sampler2D tRays;
uniform sampler2D tAO; uniform sampler2D tDof;
uniform vec2 uResolution; uniform float uTime; uniform float uExposure; uniform float uBloom; uniform float uRays; uniform vec3 uRayColor;
uniform mat4 uInvViewProj; uniform mat4 uPrevViewProj; uniform float uMotion; uniform float uAOStrength;
uniform float uNear; uniform float uFar; uniform vec3 uDof; // focus distance, focus range, amount
uniform float uWarmth; uniform float uSaturation; uniform float uContrast; uniform vec3 uLift; uniform vec3 uGamma; uniform vec3 uGain; uniform float uSepia;
uniform float uFocus; uniform float uVignette; uniform float uGrain; uniform vec4 uFlash; uniform float uDither; uniform float uHeat; uniform float uRadial;
varying vec2 vUv;

vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 acesFilmic(vec3 c) { // three.js ACESFilmicToneMapping (r160), exposure applied by the caller
  const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  c = IN * (c / 0.6); c = RRTAndODTFit(c); return clamp(OUT * c, 0.0, 1.0);
}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, pow(c, vec3(1.0 / 2.4)) * 1.055 - 0.055, step(0.0031308, c)); }
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

void main() {
  vec2 uv = vUv;
  vec2 cen = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  float r = length(cen);
  // Focus: a faint heat shimmer at the screen edges
  if (uFocus > 0.001) {
    float edge = smoothstep(0.45, 0.95, r) * uFocus;
    uv += vec2(sin(uv.y * 40.0 + uTime * 3.0), cos(uv.x * 36.0 - uTime * 2.6)) * 0.0025 * edge;
  }
#ifdef USE_DEPTH
  // desert heat haze: distant ground shimmers
  if (uHeat > 0.001) {
    float d0 = texture2D(tDepth, uv).x;
    float vz0 = -perspectiveDepthToViewZ(d0, uNear, uFar);
    float far = smoothstep(35.0, 160.0, vz0) * step(d0, 0.99999);
    uv += vec2(sin(uv.y * 220.0 + uTime * 7.0), cos(uv.x * 160.0 + uTime * 5.3)) * 0.0011 * uHeat * far;
  }
  float depth = texture2D(tDepth, uv).x;
#endif
  vec3 c = texture2D(tScene, uv).rgb;
#if MOTION_SAMPLES > 0
  {
    vec4 wp = uInvViewProj * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0); wp /= wp.w;
    vec4 pp = uPrevViewProj * wp; vec2 prev = pp.xy / pp.w * 0.5 + 0.5;
    vec2 vel = (uv - prev) * uMotion + (uv - 0.5) * uRadial;
    float L = length(vel);
    if (L > 0.035) vel *= 0.035 / L;
    if (L > 0.0008) {
      vec3 acc = c;
      for (int i = 1; i < MOTION_SAMPLES; i++) {
        float t = float(i) / float(MOTION_SAMPLES - 1) - 0.5;
        acc += texture2D(tScene, uv + vel * t).rgb;
      }
      c = acc / float(MOTION_SAMPLES);
    }
  }
#endif
#ifdef USE_AO
  if (uAOStrength > 0.0) c *= mix(1.0, texture2D(tAO, uv).r, uAOStrength);
#endif
#ifdef USE_DOF
  if (uDof.z > 0.0) {
    float vz = -perspectiveDepthToViewZ(depth, uNear, uFar);
    float coc = smoothstep(uDof.y * 0.5, uDof.y * 2.0, abs(vz - uDof.x)) * uDof.z;
    c = mix(c, texture2D(tDof, uv).rgb, coc);
  }
#endif
  c += (texture2D(tBloomA, uv).rgb * 0.6 + texture2D(tBloomB, uv).rgb * 0.9) * uBloom;
#ifdef USE_RAYS
  c += texture2D(tRays, uv).rgb * uRayColor * uRays;
#endif
  c *= uExposure;
  // white balance before the curve keeps highlights natural
  c *= vec3(1.0 + 0.08 * uWarmth, 1.0 + 0.012 * uWarmth, 1.0 - 0.11 * uWarmth);
  c = acesFilmic(c);
  c = toSRGB(c);
  // grade in display space: lift / gamma / gain, contrast, saturation, sepia
  c = uGain * (c + uLift * (1.0 - c));
  c = pow(max(c, vec3(0.0)), 1.0 / uGamma);
  c = (c - 0.5) * uContrast + 0.5;
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma), c, uSaturation);
  vec3 sep = vec3(luma) * vec3(1.07, 0.94, 0.74) + vec3(0.03, 0.015, 0.0);
  c = mix(c, sep, uSepia);
  // Focus: desaturated sepia and a heavy vignette
  if (uFocus > 0.001) {
    vec3 fs = vec3(luma) * vec3(1.1, 0.96, 0.78);
    c = mix(c, mix(fs, c, 0.25), uFocus * 0.85);
  }
  float vig = smoothstep(0.35, 1.05, r) * (uVignette + uFocus * 0.55);
  c *= 1.0 - vig;
  // grain (more in the shadows), flash, dither
  float n = hash(gl_FragCoord.xy + fract(uTime * 7.31) * 913.0) - 0.5;
  c += n * uGrain * (1.0 - luma * 0.6);
  c = mix(c, uFlash.rgb, clamp(uFlash.a, 0.0, 1.0));
  c += (hash(gl_FragCoord.yx * 1.37 + 0.5) - 0.5) * uDither;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

/** Probe: copies a depth texture into an 8-bit target so the CPU can check MSAA depth resolve works. */
export const DEPTH_PROBE_FRAG = /* glsl */`
uniform sampler2D tDepth; varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tDepth, vUv).x, 0.0, 0.0, 1.0); }`;

/** Linear view depth in metres (for soft particles). */
export const LINEAR_DEPTH_FRAG = /* glsl */`
#include <packing>
uniform sampler2D tDepth; uniform float uNear; uniform float uFar; varying vec2 vUv;
void main() { float d = texture2D(tDepth, vUv).x; gl_FragColor = vec4(d >= 1.0 ? 1e4 : -perspectiveDepthToViewZ(d, uNear, uFar), 0.0, 0.0, 1.0); }`;
