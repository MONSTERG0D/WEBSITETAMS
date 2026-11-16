import { SR, samples, buf, white, pink, brown, shape, ad, ahr, mix, biquad, lp1, hp1, osc, fm, tail, finish, gain, softClip } from './Core.js';

/**
 * Gunfire, reloads, impacts and fighting (Part 11). A gunshot is three layers: a supersonic crack (bright noise,
 * a few ms), the body (noise swept down through a low-pass plus a low thump) and a tail (the body through a short
 * baked reverb). Distant echoes are separate, darker sounds the SFX system schedules from the landscape.
 * Every generator takes a seeded random r and returns mono sample data.
 */

/** A gunshot from its character: crack brightness, body length, low thump, tail length. */
function gunshot(r, { crack = 1, body = 0.09, bodyHz = [5200, 380], low = 0.8, lowHz = 70, tailSec = 0.9, tailMix = 0.45, drive = 1.6, len = 1.6 }) {
  const n = samples(len), d = new Float32Array(n);
  const ck = white(samples(0.012), r); hp1(ck, 1800); shape(ck, (t) => ad(t, 0.0004, 0.0022)); mix(d, ck, crack * 1.4);
  const bd = white(n, r); biquad(bd, 'lowpass', (t) => bodyHz[1] + (bodyHz[0] - bodyHz[1]) * Math.exp(-t / (body * 0.6)), 0.9); shape(bd, (t) => ad(t, 0.0008, body)); mix(d, bd, 1.1);
  const th = osc(n, (t) => lowHz * (1 + 0.6 * Math.exp(-t / 0.03))); shape(th, (t) => ad(t, 0.001, body * 0.9)); mix(d, th, low);
  softClip(d, drive);
  tail(d, tailSec, tailMix, 0.55);
  lp1(d, (t) => 9000 - 6500 * Math.min(1, t / 0.4));
  return finish(d, 1, { fadeIn: 0.2, fadeOut: 60 });
}
/** The distant answer of a shot: no crack, low and smeared (used for echoes and far-away gunfire). */
function echo(r, { lowHz = 70, len = 2.2, bright = 900, roll = 0.5 }) {
  const n = samples(len), d = brown(n, r);
  mix(d, pink(n, r), 0.6); lp1(d, bright);
  shape(d, (t) => ad(t, 0.012, roll) * (1 + 0.4 * Math.sin(t * 9 + r() * 6)));
  const th = osc(n, lowHz * 0.8); shape(th, (t) => ad(t, 0.01, roll * 0.5)); mix(d, th, 0.5);
  return finish(d, 0.9, { fadeIn: 8, fadeOut: 200 });
}

/** A small mechanical click: noise tick plus a metallic ping. */
function click(d, at, r, { hz = 3200, amp = 1, ring = 0.012, tick = 1 } = {}) {
  const o = samples(at), n = samples(0.06), c = white(n, r);
  biquad(c, 'bandpass', hz * 0.7, 1.4); shape(c, (t) => ad(t, 0.0003, 0.004)); mix(d, c, amp * tick, o);
  const p = fm(n, hz * (0.9 + r() * 0.2), 1.41, (t) => 2 * Math.exp(-t / 0.01)); shape(p, (t) => ad(t, 0.0003, ring)); mix(d, p, amp * 0.5, o);
}
/** A heavier clack (lever, break-action, cylinder gate). */
function clack(d, at, r, { hz = 1400, amp = 1, body = 180 } = {}) {
  click(d, at, r, { hz, amp, ring: 0.02 });
  const o = samples(at), n = samples(0.08), b = osc(n, body); shape(b, (t) => ad(t, 0.001, 0.018)); mix(d, b, amp * 0.6, o);
  const s = white(n, r); lp1(s, 1200); shape(s, (t) => ad(t, 0.001, 0.02)); mix(d, s, amp * 0.4, o);
}
/** Brass on brass, on the ground, a shell bouncing. */
function tinkle(d, at, r, amp = 1, bounces = 3) {
  for (let b = 0; b < bounces; b++) {
    const o = samples(at + b * (0.09 - b * 0.02) + r() * 0.01), n = samples(0.12), f = 3600 + r() * 2400;
    const p = fm(n, f, 2.76, (t) => 3 * Math.exp(-t / 0.02)); shape(p, (t) => ad(t, 0.0002, 0.03 - b * 0.006)); mix(d, p, amp * (1 - b * 0.28), o);
  }
}

export const WEAPON_SOUNDS = {
  revolver_fire: (r) => gunshot(r, { crack: 1, body: 0.085, bodyHz: [5200, 420], low: 0.85, lowHz: 72, tailSec: 0.8, tailMix: 0.42, drive: 1.8, len: 1.25 }),
  repeater_fire: (r) => gunshot(r, { crack: 1.25, body: 0.075, bodyHz: [6500, 500], low: 0.7, lowHz: 80, tailSec: 1.1, tailMix: 0.48, drive: 1.6 }),
  shotgun_fire: (r) => gunshot(r, { crack: 0.7, body: 0.16, bodyHz: [3800, 220], low: 1.3, lowHz: 55, tailSec: 1.3, tailMix: 0.5, drive: 2.4, len: 2 }),
  rifle_fire: (r) => gunshot(r, { crack: 1.6, body: 0.07, bodyHz: [7500, 520], low: 0.75, lowHz: 66, tailSec: 1.6, tailMix: 0.55, drive: 1.5, len: 2.2 }),
  gun_echo_pistol: (r) => echo(r, { lowHz: 70, len: 1.8, bright: 800, roll: 0.35 }),
  gun_echo_rifle: (r) => echo(r, { lowHz: 64, len: 2.6, bright: 1100, roll: 0.6 }),
  gun_echo_shotgun: (r) => echo(r, { lowHz: 52, len: 2.4, bright: 650, roll: 0.55 }),
  bow_release: (r) => {
    const d = buf(0.45), tw = osc(d.length, (t) => 110 + 60 * Math.exp(-t / 0.02), 'tri'); shape(tw, (t) => ad(t, 0.001, 0.06) * (1 + 0.5 * Math.sin(t * 380))); mix(d, tw, 0.8);
    const w = white(d.length, r); biquad(w, 'bandpass', (t) => 2500 - 1800 * Math.min(1, t / 0.3), 1.2); shape(w, (t) => ahr(t, 0.02, 0.05, 0.25)); mix(d, w, 0.6);
    return finish(d, 0.8);
  },
  arrow_hit: (r) => {
    const d = buf(0.5), th = white(d.length, r); lp1(th, 700); shape(th, (t) => ad(t, 0.001, 0.025)); mix(d, th, 1);
    const wob = osc(d.length, 190, 'tri'); shape(wob, (t) => ad(t, 0.002, 0.12) * (0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 22))); mix(d, wob, 0.45);
    return finish(d, 0.85);
  },
  dry_fire: (r) => { const d = buf(0.12); click(d, 0.005, r, { hz: 2600, amp: 1 }); return finish(d, 0.6); },
  reload_revolver: (r) => {
    const d = buf(2.4); clack(d, 0.05, r, { hz: 1800 }); tinkle(d, 0.35, r, 0.6, 3); tinkle(d, 0.4, r, 0.5, 2);
    for (let i = 0; i < 4; i++) click(d, 0.85 + i * 0.26, r, { hz: 2400 + r() * 500, amp: 0.7 });
    clack(d, 1.95, r, { hz: 1600 }); click(d, 2.22, r, { hz: 3400, amp: 0.9, ring: 0.02 });
    return finish(d, 0.75);
  },
  reload_repeater: (r) => {
    const d = buf(3.2);
    for (let i = 0; i < 5; i++) { click(d, 0.25 + i * 0.42, r, { hz: 2100 + r() * 400, amp: 0.7 }); const o = samples(0.32 + i * 0.42), n = samples(0.1), s = white(n, r); biquad(s, 'bandpass', 1800, 2); shape(s, (t) => ahr(t, 0.01, 0.02, 0.05)); mix(d, s, 0.25, o); }
    clack(d, 2.6, r, { hz: 1200, body: 150 }); clack(d, 2.85, r, { hz: 1500, body: 170 });
    return finish(d, 0.75);
  },
  reload_shotgun: (r) => {
    const d = buf(2.6); clack(d, 0.08, r, { hz: 900, body: 120, amp: 1.2 }); tinkle(d, 0.32, r, 0.4, 2);
    for (let i = 0; i < 2; i++) { const o = 0.9 + i * 0.45; click(d, o, r, { hz: 1400, amp: 0.6 }); const s = white(samples(0.12), r); lp1(s, 900); shape(s, (t) => ahr(t, 0.01, 0.03, 0.06)); mix(d, s, 0.35, samples(o + 0.02)); }
    clack(d, 2.2, r, { hz: 1000, body: 110, amp: 1.3 });
    return finish(d, 0.8);
  },
  reload_rifle: (r) => { const d = buf(1.8); clack(d, 0.1, r, { hz: 1300, body: 140 }); tinkle(d, 0.35, r, 0.5, 3); click(d, 1.0, r, { hz: 1900, amp: 0.8 }); clack(d, 1.5, r, { hz: 1500, body: 150 }); return finish(d, 0.75); },
  reload_bow: (r) => { const d = buf(0.9), s = white(d.length, r); biquad(s, 'bandpass', 1200, 3); shape(s, (t) => ahr(t, 0.05, 0.2, 0.3) * 0.5); mix(d, s, 1); click(d, 0.62, r, { hz: 1100, amp: 0.4 }); return finish(d, 0.5); },
  shell_drop: (r) => { const d = buf(0.5); tinkle(d, 0.01, r, 1, 3); return finish(d, 0.5); },
  bullet_flyby: (r) => {
    const d = buf(0.35), w = white(d.length, r);
    biquad(w, 'bandpass', (t) => 3200 - 2200 * Math.min(1, t / 0.3), 3);
    shape(w, (t) => Math.exp(-(((t - 0.11) / 0.05) ** 2)));
    const s = osc(d.length, (t) => 1900 - 1100 * Math.min(1, t / 0.3)); shape(s, (t) => Math.exp(-(((t - 0.11) / 0.04) ** 2)) * 0.25); mix(w, s, 1);
    return finish(w, 0.7);
  },
};

/** Bullet impacts by surface (also used for the short 'impact_*' names). */
export const IMPACT_SOUNDS = {
  bullet_impact_dirt: (r) => { const d = buf(0.45), n = white(d.length, r); lp1(n, 1600); shape(n, (t) => ad(t, 0.001, 0.03)); mix(d, n, 1); const g = white(d.length, r); biquad(g, 'bandpass', 3500, 0.8); shape(g, (t) => ad(t - 0.02, 0.01, 0.12) * (r() < 0.3 ? 1 : 0.3)); mix(d, g, 0.25); return finish(d, 0.75); },
  bullet_impact_wood: (r) => { const d = buf(0.4), k = osc(d.length, 240 + r() * 80, 'tri'); shape(k, (t) => ad(t, 0.0005, 0.025)); mix(d, k, 1); const s = white(d.length, r); biquad(s, 'bandpass', 1800, 1.5); shape(s, (t) => ad(t, 0.0003, 0.012)); mix(d, s, 1.2); return finish(d, 0.8); },
  bullet_impact_metal: (r) => { const d = buf(0.9), p = fm(d.length, 1300 + r() * 600, 2.4, (t) => 4 * Math.exp(-t / 0.06)); shape(p, (t) => ad(t, 0.0003, 0.22)); mix(d, p, 0.8); const s = white(d.length, r); hp1(s, 3000); shape(s, (t) => ad(t, 0.0002, 0.006)); mix(d, s, 1); return finish(d, 0.7); },
  bullet_impact_stone: (r) => { const d = buf(0.45), s = white(d.length, r); hp1(s, 1200); shape(s, (t) => ad(t, 0.0002, 0.01)); mix(d, s, 1.3); for (let i = 0; i < 5; i++) { const c = white(samples(0.03), r); biquad(c, 'bandpass', 2500 + r() * 3000, 3); shape(c, (t) => ad(t, 0.0002, 0.006)); mix(d, c, 0.4, samples(0.03 + r() * 0.2)); } return finish(d, 0.75); },
  bullet_impact_water: (r) => { const d = buf(0.7), s = white(d.length, r); biquad(s, 'bandpass', (t) => 900 + 1800 * Math.exp(-t / 0.05), 1.2); shape(s, (t) => ad(t, 0.002, 0.12)); mix(d, s, 1); for (let i = 0; i < 6; i++) { const b = osc(samples(0.05), (t) => 500 + r() * 600 + t * 4000); shape(b, (t) => ad(t, 0.002, 0.015)); mix(d, b, 0.25, samples(0.08 + r() * 0.3)); } return finish(d, 0.7); },
  bullet_impact_glass: (r) => { const d = buf(0.9); for (let i = 0; i < 14; i++) { const p = fm(samples(0.15), 2500 + r() * 4500, 1.5 + r(), (t) => 2 * Math.exp(-t / 0.02)); shape(p, (t) => ad(t, 0.0002, 0.03 + r() * 0.04)); mix(d, p, 0.35, samples(r() * 0.35 * (i / 14))); } const s = white(d.length, r); hp1(s, 2500); shape(s, (t) => ad(t, 0.0003, 0.03)); mix(d, s, 0.8); return finish(d, 0.75); },
  bullet_impact_flesh: (r) => { const d = buf(0.3), n = white(d.length, r); lp1(n, 500); shape(n, (t) => ad(t, 0.001, 0.035)); mix(d, n, 1); const th = osc(d.length, 95); shape(th, (t) => ad(t, 0.001, 0.04)); mix(d, th, 0.6); return finish(d, 0.6); },
};

/** Fists, knife, falls. */
export const FIGHT_SOUNDS = {
  punch_hit: (r) => { const d = buf(0.3), th = osc(d.length, (t) => 120 * (1 + Math.exp(-t / 0.01))); shape(th, (t) => ad(t, 0.001, 0.05)); mix(d, th, 1); const s = white(d.length, r); lp1(s, 2400); shape(s, (t) => ad(t, 0.0005, 0.015)); mix(d, s, 0.9); softClip(d, 2); return finish(d, 0.85); },
  punch_whoosh: (r) => { const d = buf(0.3), s = white(d.length, r); biquad(s, 'bandpass', (t) => 600 + 2200 * Math.sin(Math.PI * Math.min(1, t / 0.22)), 1.5); shape(s, (t) => ahr(t, 0.06, 0.03, 0.14)); return finish(mix(d, s, 1), 0.5); },
  body_fall: (r) => { const d = buf(0.9), th = osc(d.length, 60); shape(th, (t) => ad(t, 0.003, 0.09)); mix(d, th, 1); const s = brown(d.length, r); shape(s, (t) => ad(t, 0.004, 0.12)); mix(d, s, 0.9); const g = white(d.length, r); lp1(g, 1800); shape(g, (t) => ad(t - 0.1, 0.01, 0.2) * 0.3); mix(d, g, 1); return finish(d, 0.8); },
  knife_slash: (r) => { const d = buf(0.35), s = white(d.length, r); biquad(s, 'bandpass', (t) => 2500 + 4000 * Math.min(1, t / 0.12), 2.5); shape(s, (t) => ahr(t, 0.03, 0.03, 0.12)); mix(d, s, 1); const m = fm(d.length, 4200, 1.3, 1); shape(m, (t) => ad(t - 0.05, 0.005, 0.08) * 0.15); mix(d, m, 1); return finish(d, 0.55); },
  knife_hit: (r) => { const d = buf(0.3), n = white(d.length, r); lp1(n, 900); shape(n, (t) => ad(t, 0.001, 0.03)); mix(d, n, 1); const s = white(d.length, r); biquad(s, 'bandpass', 3000, 2); shape(s, (t) => ad(t, 0.001, 0.05)); mix(d, s, 0.5); return finish(d, 0.6); },
  dodge: (r) => { const d = buf(0.4), s = white(d.length, r); lp1(s, (t) => 400 + 1600 * Math.sin(Math.PI * Math.min(1, t / 0.3))); shape(s, (t) => ahr(t, 0.05, 0.08, 0.2)); return finish(mix(d, s, 1), 0.45); },
  shove: (r) => { const d = buf(0.35), th = osc(d.length, 90); shape(th, (t) => ad(t, 0.004, 0.06)); mix(d, th, 1); const s = brown(d.length, r); shape(s, (t) => ad(t, 0.003, 0.08)); mix(d, s, 0.8); return finish(d, 0.7); },
};
void gain; void SR;
