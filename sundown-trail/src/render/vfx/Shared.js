import * as THREE from 'three';

/**
 * Uniform objects shared by every VFX material (by reference, so one write updates them all).
 * VFX.update writes time, wind, light and fog; PostFX writes the soft-particle depth and resolution.
 */
export const VFX_LAYER = 2; // soft effects render in PostFX's second pass on High

export const SHARED = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector3(1, 0, 0.3) },
  uLight: { value: new THREE.Color(1, 1, 1) },     // ambient + a little sun, for lit (alpha) effects
  uFogColor: { value: new THREE.Color(0.8, 0.85, 0.9) },
  uFogDensity: { value: 0.0009 },
  tDepthLin: { value: null },                      // linear view depth (metres) of the opaque scene, High only
  uSoft: { value: 0 },                             // 1 when tDepthLin is valid this frame
  uResolution: { value: new THREE.Vector2(1, 1) },
};

/** GLSL shared by effect fragment shaders: exponential-squared fog and soft-particle fade. */
export const SHARED_FRAG_GLSL = /* glsl */`
uniform vec3 uFogColor; uniform float uFogDensity; uniform sampler2D tDepthLin; uniform float uSoft; uniform vec2 uResolution;
float vfxFog(float dist) { float f = uFogDensity * dist; return 1.0 - exp(-f * f); }
float vfxSoft(float viewDist, float softness) {
  if (uSoft < 0.5 || softness <= 0.0) return 1.0;
  float scene = texture2D(tDepthLin, gl_FragCoord.xy / uResolution).r;
  return clamp((scene - viewDist) / softness, 0.0, 1.0);
}`;

/** Copy SHARED's uniform objects into a uniforms map (same objects, not clones). */
export function withShared(uniforms) { return Object.assign(uniforms, SHARED); }
