import * as THREE from 'three';

/**
 * Wildlife behaviour (Part 10). Prey graze, wander, go alert and bolt in zig-zags; senses are sight (cone,
 * shortened by crouching, stillness and night), hearing (the player's noise radius) and smell, which only
 * carries downwind — approach with the wind in your face and a deer won't scent you. Predators: wolves stalk,
 * circle and dart in to bite in packs (bolder at night), coyotes skulk and only press weak or lone prey,
 * bears rear, charge, hesitate and then commit or back off. Birds soar (hawks), peck and lift off in flocks
 * (crows) or run and flap (turkeys). Predators occasionally run down a rabbit or a deer.
 */
export const TUNING = {
  alertAt: 0.4, fleeAt: 1, decay: 0.12, safeDistance: 85, groupAlert: 30, turnWalk: 2.6, turnRun: 4.5, accel: 4, decel: 6,
  noise: { crouch: 2.5, crouchStill: 1, walk: 8, run: 14, sprint: 24, still: 2, horseWalk: 10, horseTrot: 18, horseCanter: 30, horseGallop: 45 },
  vis: { crouch: 0.5, still: 0.65, night: 0.55, mounted: 1.25 },
  smellBase: 0.3, wolf: { stalkTo: 16, circleR: 11, circleT: [3, 6], dayBoldness: 0.45, nightSense: 90 },
  bear: { bluffDist: 26, hesitateAt: 7, rearT: 1.4, hesitateT: 1.2, commit: 0.65 },
  chaseEvery: 25, chaseRange: 55, feedT: 25, probe: 4, hawkHeight: [32, 55], hawkRadius: [22, 42], crowScare: 13,
};

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const angleTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z) + Math.PI; // model faces −Z
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const rnd = (a, b) => a + Math.random() * (b - a);

/** Per-frame context shared by every animal: where the player is, how loud and visible, which way the wind blows. */
export function makeContext(sys) {
  const g = sys.game, pl = g.player, sky = g.sys('sky'), wind = g.sys('weather').wind || _w.set(1, 0, 0.3);
  const night = sky.isNight?.() ?? false, horse = pl.state === 'mounted' ? pl.horse : null;
  const hs = horse ? horse.speed || 0 : Math.hypot(pl.velocity?.x || 0, pl.velocity?.z || 0);
  const N = TUNING.noise;
  let noise;
  if (horse) noise = hs < 0.3 ? N.still * 2 : hs < 3 ? N.horseWalk : hs < 6 ? N.horseTrot : hs < 10 ? N.horseCanter : N.horseGallop;
  else noise = pl.crouched ? (hs > 0.2 ? N.crouch : N.crouchStill) : hs < 0.2 ? N.still : hs < 2.5 ? N.walk : hs < 5.5 ? N.run : N.sprint;
  let vis = 1;
  if (pl.crouched && !horse) vis *= TUNING.vis.crouch;
  if (hs < 0.2) vis *= TUNING.vis.still;
  if (night) vis *= TUNING.vis.night;
  if (horse) vis *= TUNING.vis.mounted;
  const wl = Math.hypot(wind.x, wind.z) || 1;
  return {
    player: pl.position, alive: pl.state !== 'dead', mounted: !!horse, horse, noise, vis, night,
    windX: wind.x / wl, windZ: wind.z / wl, target: horse ? horse.entity : pl.entity, playerHealth: pl.health,
  };
}

/** Builds awareness of the player from sight, smell and hearing. @returns detection rate this tick */
export function sense(a, ctx) {
  if (!ctx.alive) return 0;
  const S = a.def.senses, p = a.position, dx = p.x - ctx.player.x, dz = p.z - ctx.player.z, d = Math.hypot(dx, dz) || 0.01;
  let rate = 0;
  // sight: inside the field of view (most prey see almost all the way round)
  const R = S.sight * ctx.vis;
  if (d < R) {
    const fwdX = -Math.sin(a.yaw), fwdZ = -Math.cos(a.yaw), cos = (-dx * fwdX - dz * fwdZ) / d;
    if (cos > Math.cos((S.fov * Math.PI / 180) / 2)) rate += 1.3 * (1 - d / R) ** 0.7;
  }
  // smell: only when the wind carries from the player to the animal
  if (S.smell) {
    const down = (dx * ctx.windX + dz * ctx.windZ) / d; // +1 when the animal is straight downwind of the player
    const Rs = S.smell * (TUNING.smellBase + (1 - TUNING.smellBase) * Math.max(0, down));
    if (down > 0.15 && d < Rs) rate += 1.8 * (1 - d / Rs);
  }
  // hearing
  const Rn = ctx.noise * (S.hearing || 1);
  if (d < Rn) rate += 2.4 * (1 - d / Rn);
  a.dist = d;
  return rate;
}

/** Steering: avoid water, steep ground and the world wall by probing ahead and turning away. */
function steer(sys, a, heading) {
  const T = sys.terrain, p = a.position, L = TUNING.probe + a.speed * 0.4;
  for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4]) {
    const h = heading + off, x = p.x - Math.sin(h) * L, z = p.z - Math.cos(h) * L;
    if (Math.abs(x) > sys.bound || Math.abs(z) > sys.bound) continue;
    if (T.isWater?.(x, z)) continue;
    const dy = T.getHeightAt(x, z) - p.y;
    if (dy > L * 0.9) continue;
    return h;
  }
  return heading + Math.PI;
}

function setState(a, s, t = 0) { a.state = s; a.stateT = t; }
function fleeFrom(a, from, zig = true) {
  a.fleeFrom = from; // a live reference when fleeing the player, a fixed point for a gunshot
  setState(a, 'flee', 0); a.zigT = Math.random() * 6; a._zig = zig;
}
export function alarm(sys, a, from) {
  if (!a.alive || a.state === 'flee') return;
  if (a.isPredator && a.def.temper !== 'skittish' && a.state !== 'graze' && a.state !== 'wander') return;
  a.awareness = 1.2; fleeFrom(a, from);
  if (a.group) for (const m of a.group) if (m !== a && m.alive && m.position.distanceTo(a.position) < TUNING.groupAlert && m.state !== 'flee' && !m.isPredator) { m.awareness = 1.2; fleeFrom(m, from); }
}

/** One AI step for a ground animal (prey or predator). Sets a.heading / a.targetSpeed and the anim params. */
export function thinkGround(sys, a, ctx, dt) {
  const S = a.def, sp = S.speeds, an = a.anim;
  a.stateT += dt;
  // bleeding out
  if (a.bleed > 0) {
    a.health -= a.bleed * a.maxHealth * dt; a.entity.health = Math.max(0, a.health);
    if (Math.random() < dt * (a.speed > 1 ? 0.8 : 0.3)) sys.hunting?.bloodDrop?.(a);
    if (a.health <= 0) { a.die({ bledOut: true, weaponId: a.lastWeapon, source: a.lastAttacker }); return; }
  }
  if ((a._sense -= dt) <= 0) {
    a._sense = 0.2;
    const rate = sense(a, ctx);
    a.awareness = Math.max(0, Math.min(1.3, a.awareness + (rate > 0 ? rate * 0.2 : -TUNING.decay * 0.2)));
  }
  if (a.isPredator) return thinkPredator(sys, a, ctx, dt);
  // ---- prey
  an.earsBack = 0; an.crouch = 0; an.rear = 0;
  if (a.state !== 'flee' && a.awareness >= TUNING.fleeAt) alarm(sys, a, ctx.player);
  switch (a.state) {
    case 'graze': {
      a.targetSpeed = 0;
      an.graze = Math.min(1, an.graze + dt * 1.5);
      if (a.awareness > TUNING.alertAt) { setState(a, 'alert'); break; }
      if (a.stateT > (a._dur ||= rnd(6, 14))) { a._dur = 0; setState(a, Math.random() < 0.55 ? 'wander' : 'look'); a.wanderTo = null; }
      an.alert = Math.max(0, an.alert - dt);
      break;
    }
    case 'look': { // head up, ears turning, then back to grazing
      a.targetSpeed = 0; an.graze = Math.max(0, an.graze - dt * 2); an.alert = Math.min(0.5, an.alert + dt);
      if (a.awareness > TUNING.alertAt) setState(a, 'alert');
      else if (a.stateT > 2.2) setState(a, 'graze');
      break;
    }
    case 'wander': {
      an.graze = Math.max(0, an.graze - dt * 2);
      if (!a.wanderTo) { const r = rnd(6, 16), h = Math.random() * Math.PI * 2; a.wanderTo = new THREE.Vector3(a.position.x + Math.sin(h) * r, 0, a.position.z + Math.cos(h) * r); }
      a.heading = steer(sys, a, angleTo(a.position, a.wanderTo));
      a.targetSpeed = sp.walk;
      if (Math.hypot(a.wanderTo.x - a.position.x, a.wanderTo.z - a.position.z) < 1.2 || a.stateT > 14) setState(a, 'graze');
      if (a.awareness > TUNING.alertAt) setState(a, 'alert');
      break;
    }
    case 'alert': { // freeze and stare at the noise; stamp and flag the tail when it's getting close
      a.targetSpeed = 0; an.graze = Math.max(0, an.graze - dt * 3); an.alert = Math.min(1, an.alert + dt * 3);
      const want = wrap(angleTo(a.position, ctx.player) - a.yaw);
      an.lookYaw += (Math.max(-1, Math.min(1, want)) - an.lookYaw) * Math.min(1, dt * 4);
      an.tailUp = Math.min(1, a.awareness);
      if (Math.abs(want) > 1.2 && a.stateT > 1) a.heading = a.yaw + want * 0.5; // turn the body a little
      if (a.awareness < TUNING.alertAt * 0.5 && a.stateT > 3) { setState(a, 'graze'); an.lookYaw = 0; an.tailUp = 0; }
      break;
    }
    case 'flee': {
      an.graze = 0; an.alert = 1; an.lookYaw *= 0.9; an.tailUp = S.look.flagTail ? 1 : 0.5;
      const away = angleTo(a.position, a.fleeFrom) + Math.PI;
      a.zigT += dt;
      const zig = a._zig ? Math.sin(a.zigT * (1.6 + (S.zigzag || 0) * 2)) * (S.zigzag || 0) : 0;
      a.heading = steer(sys, a, away + zig);
      const tired = a.bleed > 0 ? 0.7 : 1, burst = a.stateT < 6 ? 1 : 0.75;
      a.targetSpeed = sp.run * tired * burst;
      const d = Math.hypot(a.position.x - a.fleeFrom.x, a.position.z - a.fleeFrom.z);
      if (d > TUNING.safeDistance && a.stateT > 6 && a.awareness < 0.9) { setState(a, a.bleed > 0 ? 'wounded' : 'wander'); a.wanderTo = null; an.tailUp = 0; }
      break;
    }
    case 'wounded': { // exhausted: stands head-low, moves off slowly if pushed
      a.targetSpeed = 0; an.graze = 0.4; an.alert = 0.3;
      if (a.awareness > 0.9) alarm(sys, a, ctx.player);
      break;
    }
    case 'dead': break;
  }
}

/** Predators: wolves (packs), coyotes (skittish), bears (territorial). */
function thinkPredator(sys, a, ctx, dt) {
  const S = a.def, sp = S.speeds, an = a.anim, T = S.temper, W = TUNING.wolf, B = TUNING.bear;
  an.graze = Math.max(0, an.graze - dt); an.tailUp = 0;
  const d = a.dist ?? Math.hypot(a.position.x - ctx.player.x, a.position.z - ctx.player.z);
  // a pack at night has been following your scent for a while: inside 90 m they know where you are
  if (T === 'pack' && ctx.night && ctx.alive && d < TUNING.wolf.nightSense) a.awareness = Math.max(a.awareness, 0.75);
  const hurt = a.health < a.maxHealth * 0.35, aware = a.awareness > 0.6 || a.provoked;
  // morale: hurt animals run, a pack that has lost half its number scatters
  const packLost = a.group ? a.group.filter((m) => !m.alive).length / a.group.length : 0;
  if ((hurt || packLost >= 0.5) && a.state !== 'flee') { fleeFrom(a, ctx.player, false); }
  let bold = 1;
  if (T === 'pack') bold = ctx.night ? 1 : W.dayBoldness + (a.provoked ? 0.6 : 0);
  if (T === 'skittish') bold = (ctx.night && (a.group?.filter((m) => m.alive).length || 1) >= 2) || ctx.playerHealth < 40 || a.provoked ? 0.8 : 0;
  if (!ctx.alive) bold = 0;
  switch (a.state) {
    case 'graze': case 'wander': case 'look': {
      a.targetSpeed = a.state === 'wander' ? sp.walk : 0;
      if (a.state === 'wander') {
        if (!a.wanderTo) { const r = rnd(10, 25), h = Math.random() * Math.PI * 2; a.wanderTo = new THREE.Vector3(a.position.x + Math.sin(h) * r, 0, a.position.z + Math.cos(h) * r); }
        a.heading = steer(sys, a, angleTo(a.position, a.wanderTo));
        if (Math.hypot(a.wanderTo.x - a.position.x, a.wanderTo.z - a.position.z) < 1.5 || a.stateT > 16) setState(a, 'graze');
      } else if (a.stateT > (a._dur ||= rnd(5, 12))) { a._dur = 0; setState(a, 'wander'); a.wanderTo = null; }
      if (aware) {
        if (T === 'territorial') { if (d < B.bluffDist || a.provoked) setState(a, 'bluff'); }
        else if (bold >= 0.75 || (bold > 0 && d < 20)) setState(a, 'stalk');
        else alarm(sys, a, ctx.player);
      }
      break;
    }
    case 'stalk': { // low and quiet, ears back, closing in
      an.earsBack = 0.6; an.crouch = 0.45; an.alert = 0.6;
      a.heading = steer(sys, a, angleTo(a.position, ctx.player));
      a.targetSpeed = d > 40 ? sp.trot : sp.walk * 1.3;
      if (d < W.stalkTo) setState(a, T === 'pack' && (a.group?.length || 1) > 1 ? 'circle' : 'charge');
      if (d > 120 || (!aware && a.stateT > 10)) setState(a, 'wander');
      break;
    }
    case 'circle': { // pack orbits, growling, then one by one dart in
      an.earsBack = 0.8; an.crouch = 0.3;
      if (!a._orbit) { a._orbit = Math.random() < 0.5 ? 1 : -1; a._circleT = rnd(...W.circleT); }
      const ang = Math.atan2(a.position.x - ctx.player.x, a.position.z - ctx.player.z) + a._orbit * 0.6;
      _v.set(ctx.player.x + Math.sin(ang) * W.circleR, 0, ctx.player.z + Math.cos(ang) * W.circleR);
      a.heading = steer(sys, a, angleTo(a.position, _v));
      a.targetSpeed = sp.trot * 0.8;
      if (a.stateT > a._circleT) { a._orbit = 0; setState(a, 'charge'); sys.sound?.(a, 'growl'); }
      break;
    }
    case 'bluff': { // bear: rears up and roars
      a.targetSpeed = 0; an.rear = Math.min(1, an.rear + dt * 2.5); an.alert = 1;
      a.heading = a.yaw + wrap(angleTo(a.position, ctx.player) - a.yaw) * 0.3;
      if (a.stateT < dt * 1.5) sys.sound?.(a, 'roar');
      if (a.stateT > B.rearT) { an.rear = 0; setState(a, 'charge'); a._hesitated = !!a.provoked; }
      break;
    }
    case 'hesitate': { // bear stops short, huffs, then commits or backs off
      a.targetSpeed = 0; an.rear = 0; an.earsBack = 0.5; an.alert = 1;
      if (a.stateT > B.hesitateT) {
        if (Math.random() < B.commit || a.provoked) setState(a, 'charge');
        else { setState(a, 'retreat'); a.retreatT = 6; }
      }
      break;
    }
    case 'charge': {
      an.earsBack = 1; an.crouch = 0.1; an.rear = 0;
      a.heading = angleTo(a.position, ctx.player);
      a.targetSpeed = sp.run;
      if (T === 'territorial' && !a._hesitated && d < B.hesitateAt) { a._hesitated = true; setState(a, 'hesitate'); break; }
      if (d < S.attack.range) setState(a, 'attack');
      if (d > 70 && !a.provoked) setState(a, 'wander');
      break;
    }
    case 'attack': {
      a.targetSpeed = 0; an.earsBack = 1;
      a.heading = angleTo(a.position, ctx.player);
      if ((a._cool = (a._cool || 0) - dt) <= 0 && d < S.attack.range + 0.4) {
        a._cool = S.attack.cooldown;
        sys.bite(a, ctx.target);
        an.rear = T === 'territorial' ? 0.5 : 0;
        if (T !== 'territorial') { setState(a, 'retreat'); a.retreatT = rnd(0.8, 1.6); } // hit and run
      }
      if (d > S.attack.range + 1.2) setState(a, 'charge');
      if (a.stateT > 0.35) an.rear = 0;
      break;
    }
    case 'retreat': {
      an.earsBack = 0.7;
      a.heading = steer(sys, a, angleTo(a.position, ctx.player) + Math.PI + (a._orbit || 0.4));
      a.targetSpeed = T === 'territorial' ? sp.walk * 1.5 : sp.trot;
      if (a.stateT > a.retreatT) setState(a, T === 'territorial' ? 'wander' : 'charge');
      break;
    }
    case 'flee': {
      a.heading = steer(sys, a, angleTo(a.position, ctx.player) + Math.PI);
      a.targetSpeed = sp.run * (hurt ? 0.75 : 1); an.earsBack = 1;
      if (d > 110) { setState(a, 'wander'); a.provoked = false; a.awareness = 0; }
      break;
    }
    case 'hunt': { // running down prey
      const prey = a.prey;
      if (!prey || !prey.alive) { setState(a, prey && !prey.alive ? 'feed' : 'wander'); break; }
      a.heading = steer(sys, a, angleTo(a.position, prey.position));
      a.targetSpeed = sp.run;
      if (prey.position.distanceTo(a.position) < (S.attack.range + prey.def.radius)) prey.die({ predator: true, source: a.entity });
      if (a.stateT > 16 || aware && d < 30) { setState(a, 'wander'); a.prey = null; }
      break;
    }
    case 'feed': {
      a.targetSpeed = 0; an.graze = 1;
      if (a.stateT > TUNING.feedT || (aware && d < 25)) { setState(a, aware ? 'stalk' : 'wander'); a.prey = null; }
      break;
    }
  }
}

/** Birds: hawks soar in circles; crows peck and lift off as a flock; turkeys run and flap. */
export function thinkBird(sys, a, ctx, dt) {
  const S = a.def, an = a.anim, T = sys.terrain;
  a.stateT += dt;
  if (S.bird === 'sky') {
    if (!a.circle) a.circle = { c: a.position.clone(), r: rnd(...TUNING.hawkRadius), h: rnd(...TUNING.hawkHeight), dir: Math.random() < 0.5 ? 1 : -1, ang: Math.random() * 6 };
    const c = a.circle;
    c.ang += c.dir * (S.speeds.trot / c.r) * dt;
    const x = c.c.x + Math.cos(c.ang) * c.r, z = c.c.z + Math.sin(c.ang) * c.r, y = Math.max(T.getHeightAt(x, z), sys.water) + c.h + Math.sin(a.stateT * 0.3) * 3;
    a.yaw = Math.atan2(x - a.position.x, z - a.position.z) + Math.PI;
    a.position.set(x, y, z); a.speed = S.speeds.trot;
    an.flying = 1; an.glide = Math.sin(a.stateT * 0.4 + a.seed) > -0.6; an.bank = -c.dir * 0.35; an.pitch = 0;
    return;
  }
  if ((a._sense -= dt) <= 0) { a._sense = 0.25; const rate = sense(a, ctx); a.awareness = Math.max(0, Math.min(1.3, a.awareness + (rate > 0 ? rate * 0.25 : -0.03))); }
  if (S.bird === 'flock') {
    switch (a.state) {
      case 'graze': case 'wander': case 'look': {
        an.flying = Math.max(0, an.flying - dt * 3); an.graze = 1;
        if (!a.hopT || (a.hopT -= dt) <= 0) { a.hopT = rnd(1, 4); a.heading = Math.random() * Math.PI * 2; a.targetSpeed = Math.random() < 0.4 ? S.speeds.walk : 0; }
        if (a.awareness > 0.5 || (a.dist ?? 99) < TUNING.crowScare) liftFlock(sys, a, ctx.player);
        break;
      }
      case 'fly': {
        an.flying = 1; an.graze = 0; an.glide = false;
        const h = a.flight;
        h.t += dt;
        const k = Math.min(1, h.t / h.T);
        const gy = T.getHeightAt(a.position.x, a.position.z);
        a.position.x += Math.sin(h.dir) * S.speeds.trot * dt; a.position.z += Math.cos(h.dir) * S.speeds.trot * dt;
        const alt = Math.sin(Math.PI * k) * 16 + 0.05;
        a.position.y += ((gy + alt) - a.position.y) * Math.min(1, dt * 3);
        a.yaw = h.dir + Math.PI; a.speed = 0;
        if (k >= 1) { setState(a, 'graze'); a.awareness = 0; an.flying = 0; a.position.y = gy; }
        break;
      }
    }
    return;
  }
  // turkeys: ground prey with a short flapping escape when something gets close
  thinkGround(sys, a, ctx, dt);
  an.flying = a.state === 'flee' && a.stateT < 1.2 && (a.dist ?? 99) < 9 ? 1 : Math.max(0, an.flying - dt * 2);
}

function liftFlock(sys, a, from) {
  const dir = angleTo(a.position, from) + Math.PI + rnd(-0.6, 0.6);
  for (const m of a.group || [a]) {
    if (!m.alive || m.state === 'fly') continue;
    m.flight = { t: -Math.random() * 0.4, T: rnd(5, 8), dir: dir + rnd(-0.3, 0.3) };
    setState(m, 'fly'); m.anim.flying = 1;
  }
  sys.sound?.(a, 'caw');
}

/** Moves a ground animal along its heading with acceleration, turning and collision (near the player). */
export function moveGround(sys, a, dt, near) {
  const turn = a.speed > a.def.speeds.trot ? TUNING.turnRun : TUNING.turnWalk;
  const dy = wrap(a.heading - a.yaw);
  a.yaw = wrap(a.yaw + Math.max(-turn * dt, Math.min(turn * dt, dy)));
  const ds = a.targetSpeed - a.speed;
  a.speed += Math.sign(ds) * Math.min(Math.abs(ds), (ds > 0 ? TUNING.accel * (1 + a.def.speeds.run / 8) : TUNING.decel) * dt);
  // slow down while turning hard so they swing round rather than skate
  const sp = a.speed * (1 - Math.min(0.5, Math.abs(dy) * 0.25));
  a.velocity.x = -Math.sin(a.yaw) * sp; a.velocity.z = -Math.cos(a.yaw) * sp;
  if (near) {
    a.velocity.y = Math.min(0, a.velocity.y);
    const r = Math.min(0.45, a.def.radius);
    sys.game.physics.moveCapsule(a.position, a.velocity, r, Math.max(0.3, a.def.look.shape.height), dt, { wasGrounded: true, stepHeight: 0.45 });
    const gy = sys.terrain.getHeightAt(a.position.x, a.position.z);
    if (a.position.y < gy) { a.position.y = gy; a.velocity.y = 0; }
  } else {
    a.position.x += a.velocity.x * dt; a.position.z += a.velocity.z * dt;
    a.position.y = sys.terrain.getHeightAt(a.position.x, a.position.z);
  }
  a.object3d.rotation.set(0, a.yaw, 0);
  // tilt to the slope a little
  const n = sys.terrain.getNormalAt?.(a.position.x, a.position.z, _u);
  if (n && !a.def.look.shape.bird) { const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw); a.object3d.rotateX(Math.max(-0.35, Math.min(0.35, -(n.x * fx + n.z * fz) / Math.max(0.3, n.y)))); }
}
