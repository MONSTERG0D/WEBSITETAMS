import * as THREE from 'three';
import { onEvent, when, hint, talkStep, once, restage } from './helpers.js';
import { WORLD } from '../../data/world.js';

/**
 * Side content (Part 15): the three recruitment missions, six delivery and escort jobs, and three stranger quest
 * chains of two steps each. Original writing. (Abel's horse-breaking job is his daily ranch job from Part 13.)
 */
const L = WORLD.locations;
const at = (p) => (ctx) => ctx.stage.place(p);
const front = (id, out = 5) => (g) => { const t = g.get('towns')?.towns?.get('copperbell'), b = t?.buildings?.find((x) => x.id === id); return b ? { x: b.front.x + Math.sin(b.spec.yaw) * out, z: b.front.z + Math.cos(b.spec.yaw) * out } : { x: L.copperbell.x, z: L.copperbell.z }; };
const near = (loc, dx = 6, dz = 6) => () => ({ x: L[loc].x + dx, z: L[loc].z + dz });
const job = (f) => f.done_paperLead;

/** Six bottles on a rail, each with a collider that bursts it when shot. */
function bottleRail(ctx, p, yaw) {
  const S = ctx.stage, grp = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.9 }), glass = new THREE.MeshStandardMaterial({ color: 0x3e6a2a, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 });
  const rail = new THREE.Mesh(new THREE.BoxGeometry(5, 0.1, 0.12), wood); rail.position.y = 1.05; grp.add(rail);
  for (const x of [-2.4, 2.4]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), wood); post.position.set(x, 0.55, 0); grp.add(post); }
  grp.position.copy(p); grp.rotation.y = yaw; S.add(grp); grp.updateMatrixWorld(true);
  const bottles = [];
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.3, 8), glass); b.position.set(-2 + i * 0.8, 1.25, 0); grp.add(b); b.updateMatrixWorld(true);
    const wp = b.getWorldPosition(new THREE.Vector3());
    const c = S.collider({ type: 'box', position: wp, size: new THREE.Vector3(0.14, 0.32, 0.14), rotationY: yaw, surface: 'glass', tag: 'target', object: b });
    b.userData.onHit = () => { if (!b.visible) return; b.visible = false; ctx.game.physics.removeCollider(c); ctx.game.audio.play('bullet_impact_glass', { position: wp }); ctx.game.sys('vfx').spawn('impact_glass', { position: wp }); ctx.data.broken = (ctx.data.broken || 0) + 1; };
    bottles.push(b);
  }
  return bottles;
}

export const SIDE_MISSIONS = [
  // ================================================================ recruitment
  {
    id: 'recruitHollis', title: 'An Old Gun', kind: 'side', requires: (f, g) => f.done_paperLead && !g.get('companions')?.has?.('hollis'),
    giver: { at: front('saloon', 4), label: 'Talk to the old gunslinger', npc: { name: 'Hollis Grant', role: 'gentleman', hat: 'cattleman' } },
    summary: 'Hollis Grant wants to see if the Rourke boy can shoot.',
    onComplete: (ctx) => ctx.game.get('companions')?.recruit?.('hollis'),
    story: 'An old gunslinger named Hollis Grant set six bottles on a rail and dared me. I broke them all. He\'s coming to the ranch.',
    rewards: { money: 10 },
    steps: [
      { id: 'meet', type: 'talk', text: 'Talk to Hollis Grant', npc: 'hollis', tree: 'side_hollis', store: 'hollis', setup: (ctx) => { const p = front('saloon', 4)(ctx.game); ctx.stage.spawn('hollis', { name: 'Hollis Grant', role: 'gentleman', at: [p.x + 0.8, p.z + 0.8], hat: 'cattleman' }); }, next: (ctx) => (ctx.flags.hollis === 'no' ? 'complete' : 'rail') },
      { id: 'rail', type: 'custom', text: 'Break six bottles in twenty seconds', checkpoint: true,
        setup: (ctx) => { restage(['hollis'], 'meet')(ctx); const p = front('saloon', 4)(ctx.game), b = ctx.stage.buildingInfo('copperbell', 'saloon'), yaw = (b?.spec.yaw ?? 0); const q = ctx.stage.ground(p.x + Math.sin(yaw) * 11, p.z + Math.cos(yaw) * 11); ctx.data.broken = 0; bottleRail(ctx, q, yaw); ctx.data.railAt = q; },
        start: (ctx, st) => { st.t = 0; ctx.stage.say('hollis', 'Clock starts now.'); hint(ctx, 'bottles', 'Aim (right click) and fire. Focus (V) slows the clock.'); },
        tick: (ctx, st, dt) => { st.t += dt; const left = Math.max(0, 20 - st.t); ctx.game.ui.setObjective(`Break six bottles · ${ctx.data.broken}/6 · ${left.toFixed(0)} s`); if (ctx.data.broken >= 6) return true; return left <= 0 ? { fail: 'Out of time. Hollis is grinning.' } : null; } },
      talkStep('done', [['hollis', 'Huh. Your daddy couldn\'t do that. I\'ll ride out to your place — somebody ought to teach you the rest.']]),
    ],
  },
  {
    id: 'recruitJune', title: 'The Wire', kind: 'side', requires: (f, g) => f.done_weather && !g.get('companions')?.has?.('june'),
    giver: { at: front('post', 4), label: 'Talk to the telegraph operator', npc: { name: 'June Whitfield', role: 'townswoman' } },
    summary: 'Someone keeps cutting the telegraph line east of Copperbell.',
    onComplete: (ctx) => ctx.game.get('companions')?.recruit?.('june'),
    story: 'Blackstone men were cutting the telegraph wire whenever Okafor\'s messages were due. I spliced it back. June Whitfield quit the post office the same afternoon.',
    rewards: { money: 20, honor: 2 },
    prepare: (ctx) => { const p = ctx.stage.place('road:fortGranger:0.72'); ctx.data.cut ||= ctx.stage.ground(p.x + 8, p.z + 9); },
    steps: [
      { id: 'meet', type: 'talk', text: 'Talk to June Whitfield', npc: 'june', tree: 'side_june', setup: (ctx) => { const p = front('post', 4)(ctx.game); ctx.stage.spawn('june', { name: 'June Whitfield', role: 'townswoman', at: [p.x + 0.8, p.z + 0.8] }); } },
      { id: 'ride', type: 'ride', text: 'Follow the wire east', at: (ctx) => ctx.data.cut, radius: 45, checkpoint: true,
        setup: (ctx) => { const c = ctx.data.cut; const gang = ctx.stage.gang('cutters', [c.x + 6, c.z + 4], 3, { role: 'thug', faction: 'blackstone', weapon: ['revolver'] }, 5); for (const n of gang) n.def.hostile = true; } },
      { id: 'fight', type: 'kill', text: 'Deal with the wire cutters', group: 'cutters', waypoint: false, onStart: (ctx) => ctx.stage.attack('cutters') },
      { id: 'splice', type: 'deliver', text: 'Splice the wire', at: (ctx) => ctx.data.cut, label: 'Splice the cut wire', radius: 3 },
      talkStep('done', [['eli', 'That ought to hold. June\'ll want to hear.']], { onEnd: (ctx) => ctx.game.ui.notify('June Whitfield is moving to the ranch.') }),
    ],
  },
  {
    id: 'recruitAbel', title: 'Horse Sense', kind: 'side', requires: (f, g) => f.done_paperLead && !g.get('companions')?.has?.('abel'),
    giver: { at: near('saltmesaPost', -10, 8), label: 'Talk to the horse wrangler', npc: { name: 'Abel Hutchins', role: 'rancher' } },
    summary: 'Rustlers drove off Abel Hutchins\'s horses toward the Stone Arch.',
    onComplete: (ctx) => ctx.game.get('companions')?.recruit?.('abel'),
    story: (f) => `Abel Hutchins's horses were rustled to the Stone Arch. I brought them back${f.abelRustler === 'alive' ? ', and the rustler too, trussed like a hog' : ''}. Abel's bringing his stock to the ranch.`,
    rewards: (f) => ({ money: f.abelRustler === 'alive' ? 35 : 20, honor: f.abelRustler === 'alive' ? 3 : 1 }),
    prepare: (ctx) => { ctx.data.pen ||= ctx.stage.place(`flat:${L.stoneArch.x + 25},${L.stoneArch.z + 15}`); },
    steps: [
      { id: 'meet', type: 'talk', text: 'Talk to Abel Hutchins', npc: 'abel', tree: 'side_abel', setup: (ctx) => { const p = near('saltmesaPost', -10, 8)(); ctx.stage.spawn('abel', { name: 'Abel Hutchins', role: 'rancher', at: [p.x + 0.8, p.z + 0.8] }); } },
      { id: 'ride', type: 'ride', text: 'Track the horses to the Stone Arch', at: (ctx) => ctx.data.pen, radius: 50, checkpoint: true,
        setup: (ctx) => {
          const S = ctx.stage, p = ctx.data.pen;
          for (let i = 0; i < 3; i++) S.horse({ at: [p.x + i * 2.5, p.z + 3], coat: ['pinto', 'chestnut', 'black'][i], breed: 'mustang', name: ['Pepper', 'Socks', 'Crow'][i] });
          const g2 = S.gang('rustlers', [p.x - 8, p.z - 6], 2, { role: 'cowboy', faction: 'outlaw', weapon: ['revolver'] }, 4);
          const boss = S.spawn('boss', { name: 'Ezra "Two-Bit" Loomis', role: 'outlaw', faction: 'outlaw', hostile: true, tag: 'rustlers', at: [p.x - 2, p.z - 9], weapon: ['revolver'], canSurrender: true, aggression: 0.4 });
          for (const n of [...g2, boss]) if (n) n.def.hostile = true;
        } },
      { id: 'fight', type: 'kill', text: 'Run off the rustlers (hogtie Loomis if you can: lasso, then E)', group: 'rustlers', waypoint: false, onStart: (ctx) => { ctx.stage.attack('rustlers'); hint(ctx, 'lasso', 'Pick the lasso from the weapon wheel (Tab), throw it at him, then press E to hogtie.'); },
        onEnd: (ctx) => { const b = ctx.stage.get('boss'); ctx.flags.abelRustler = b && !b.dead ? 'alive' : 'dead'; } },
      { id: 'untie', type: 'collect', text: 'Cut the horses loose', items: [0, 1, 2].map((i) => ({ at: (ctx) => ctx.stage.horses[i]?.position || ctx.data.pen, label: 'Cut the picket rope' })) },
      talkStep('done', [['eli', 'Pepper, Socks and Crow. Abel\'ll be glad to see you.']], { onEnd: (ctx) => ctx.game.ui.notify('Abel Hutchins is bringing his stock to the ranch.') }),
    ],
  },
  // ================================================================ jobs (deliveries and escorts)
  {
    id: 'jobMedicine', title: 'Medicine for Saltmesa', kind: 'job', requires: job,
    giver: { at: front('doctor', 4), label: 'Job: carry medicine to Saltmesa', marker: true },
    summary: 'Carry a crate of quinine to the Saltmesa Trading Post.', rewards: { money: 25, honor: 1 },
    steps: [
      { id: 'pick', type: 'collect', text: 'Pick up the medicine crate', items: [{ at: (ctx) => front('doctor', 3)(ctx.game), label: 'Take the medicine crate' }] },
      { id: 'ride', type: 'ride', text: 'Deliver it to the Saltmesa Trading Post', at: at('saltmesaPost'), radius: 30, checkpoint: true,
        during: (ctx, st) => once(st, 'ambush', () => ctx.game.player.position.distanceTo(ctx.stage.place('road:saltmesaRoad:0.6')) < 60, () => { const p = ctx.stage.place('road:saltmesaRoad:0.62'); const gg = ctx.stage.gang('bandits', [p.x + 15, p.z], 2, { faction: 'outlaw' }, 5); for (const n of gg) n.def.hostile = true; ctx.stage.attack('bandits'); }) },
      { id: 'hand', type: 'deliver', text: 'Hand the crate to the trader', at: (ctx) => { const p = ctx.stage.place('saltmesaPost'); return { x: p.x + 4, z: p.z + 6 }; }, label: 'Hand over the medicine' },
    ],
  },
  {
    id: 'jobMail', title: 'Mail for Greywind', kind: 'job', requires: job,
    giver: { at: front('post', 6), label: 'Job: carry the mail to Greywind', marker: true },
    summary: 'The lumber camp\'s mailbag.', rewards: { money: 20 },
    steps: [
      { id: 'pick', type: 'collect', text: 'Take the mailbag', items: [{ at: (ctx) => front('post', 3)(ctx.game), label: 'Take the mailbag' }] },
      { id: 'ride', type: 'ride', text: 'Ride the mail up to Greywind', at: at('lumberCamp'), radius: 40, checkpoint: true },
      { id: 'hand', type: 'deliver', text: 'Hand the mail to the foreman', at: (ctx) => { const p = ctx.stage.place('lumberCamp'); return { x: p.x + 5, z: p.z + 3 }; }, label: 'Hand over the mailbag', setup: (ctx) => { const p = ctx.stage.place('lumberCamp'); ctx.stage.spawn('foreman', { name: 'Camp foreman', role: 'worker', at: [p.x + 5.6, p.z + 3.6] }); } },
    ],
  },
  {
    id: 'jobSeed', title: 'Seed for the Talbots', kind: 'job', requires: (f) => f.done_weather,
    giver: { at: front('general', 4), label: 'Job: seed for the Talbots', marker: true },
    summary: 'Walt Talbot can\'t afford to come to town after the fire. Carry his seed out.', rewards: { money: 15, honor: 3 },
    steps: [
      { id: 'pick', type: 'collect', text: 'Load the seed sacks', items: [{ at: (ctx) => front('general', 3)(ctx.game), label: 'Take the seed sacks' }] },
      { id: 'ride', type: 'ride', text: 'Ride to the Talbot place', at: at('flat:-70,185'), radius: 40, checkpoint: true },
      { id: 'hand', type: 'deliver', text: 'Give Walt the seed', at: (ctx) => { const p = ctx.stage.place('flat:-70,185'); return { x: p.x - 10, z: p.z + 8 }; }, label: 'Give Walt the seed', setup: (ctx) => { const p = ctx.stage.place('flat:-70,185'); ctx.stage.spawn('walt', { name: 'Walt Talbot', role: 'farmer', at: [p.x - 10.5, p.z + 8.5] }); } },
    ],
  },
  {
    id: 'jobPreacher', title: 'The Preacher\'s Road', kind: 'job', requires: job,
    giver: { at: front('church', 5), label: 'Job: escort the preacher\'s wagon', marker: true },
    summary: 'Escort Reverend Marsh\'s wagon to a burial at Hanging Oak.', rewards: { money: 30, honor: 2 },
    steps: [
      { id: 'start', type: 'goto', text: 'Meet the wagon at the church', at: at('church'), radius: 12, checkpoint: true,
        setup: (ctx) => { const S = ctx.stage, path = S.roadPath('saltmesaRoad', 0.02, 0.42); S.wagon('preacher', { path, driver: { key: 'marsh', name: 'Reverend Josiah Marsh', role: 'preacher' }, gait: 1 }).stop(); } },
      { id: 'escort', type: 'escort', text: 'Escort the wagon to Hanging Oak', wagon: 'preacher', onStart: (ctx) => ctx.stage.wagons.get('preacher')?.go(),
        during: (ctx, st) => { const w = ctx.stage.wagons.get('preacher'); once(st, 'amb', () => w && w.i > w.path.length * 0.5, () => { w.stop(); const p = w.position; const gg = ctx.stage.gang('road', [p.x + 22, p.z + 10], 3, { faction: 'outlaw' }, 6); for (const n of gg) n.def.hostile = true; ctx.stage.attack('road'); ctx.stage.say('marsh', 'Lord preserve us — robbers!'); }); once(st, 'go', () => st.amb && ctx.stage.alive('road').length === 0, () => w.go()); } },
      talkStep('done', [['marsh', 'Bless you, son. There\'s a grave to say words over, and you\'ve kept me from needing one.']]),
    ],
  },
  {
    id: 'jobOre', title: 'The Ore Wagon', kind: 'job', requires: (f) => f.done_weather,
    giver: { at: near('lumberCamp', 8, 12), label: 'Job: escort the ore wagon', marker: true },
    summary: 'Bring the camp\'s supply wagon down the pass to Copperbell.', rewards: { money: 35 },
    steps: [
      { id: 'start', type: 'goto', text: 'Meet the wagon at the camp', at: at('road:greywindRoad:0.95'), radius: 14, checkpoint: true,
        setup: (ctx) => { const S = ctx.stage, path = S.roadPath('greywindRoad', 0.95, 0.05); S.wagon('ore', { path, driver: { key: 'teamster', name: 'Teamster', role: 'worker' }, gait: 1 }).stop(); } },
      { id: 'escort', type: 'escort', text: 'Escort the wagon down to Copperbell', wagon: 'ore', onStart: (ctx) => ctx.stage.wagons.get('ore')?.go(),
        during: (ctx, st) => { const w = ctx.stage.wagons.get('ore'); once(st, 'wolves', () => w && w.i > w.path.length * 0.3, () => { const W = ctx.game.get('wildlife'), p = w.position; W?.spawn?.('wolf', new THREE.Vector3(p.x + 25, 0, p.z + 15), { group: true, count: 4 }); for (const a of W?.list || []) if (a.species === 'wolf' && a.position.distanceTo(p) < 60) { a.provoked = true; a.state = 'charge'; } ctx.stage.say('teamster', 'Wolves! Keep \'em off the team!'); }); } },
    ],
  },
  {
    id: 'jobStage', title: 'The Fort Granger Stage', kind: 'job', requires: job,
    giver: { at: front('hotel', 4), label: 'Job: ride shotgun on the stage', marker: true },
    summary: 'Ride shotgun for the stagecoach from the county line to Copperbell.', rewards: { money: 35, honor: 1 },
    steps: [
      { id: 'start', type: 'ride', text: 'Ride out to meet the stage at the county line', at: at('road:fortGranger:0.08'), radius: 25, checkpoint: true,
        setup: (ctx) => { const S = ctx.stage, path = S.roadPath('fortGranger', 0.08, 0.97); S.wagon('stage', { path, coach: true, color: 0x6a2a1e, driver: { key: 'whip', name: 'Stage driver', role: 'cowboy' }, gait: 1 }).stop(); } },
      { id: 'escort', type: 'escort', text: 'Ride shotgun to Copperbell', wagon: 'stage', onStart: (ctx) => ctx.stage.wagons.get('stage')?.go(),
        during: (ctx, st) => { const w = ctx.stage.wagons.get('stage'); once(st, 'amb', () => w && w.i > w.path.length * 0.55, () => { w.stop(); const p = w.position; const gg = ctx.stage.gang('hold', [p.x - 20, p.z - 20], 4, { faction: 'outlaw', mounted: false }, 6); for (const n of gg) n.def.hostile = true; ctx.stage.attack('hold'); ctx.stage.say('whip', 'Road agents! Get \'em off us!'); }); once(st, 'go', () => st.amb && ctx.stage.alive('hold').length === 0, () => w.go()); } },
    ],
  },
  // ================================================================ stranger chains
  {
    id: 'pete1', title: 'Old Pete\'s Map', kind: 'stranger', requires: () => true,
    giver: { at: near('oldMission', 6, 10), label: 'Talk to the old prospector', npc: { name: 'Old Pete', role: 'farmer' } },
    summary: 'Old Pete lost his mule — and the map in its saddlebag — near the Stone Arch.', rewards: { money: 10, honor: 2 },
    steps: [
      talkStep('meet', [['pete', 'Mule threw her pack at the Stone Arch and run off. My map\'s in that pack, mister. Twenty years of looking, all on one page.'], ['eli', 'I\'ll see if it\'s still there.']], { setup: (ctx) => { const p = near('oldMission', 6, 10)(); ctx.stage.spawn('pete', { name: 'Old Pete', role: 'farmer', at: [p.x + 0.8, p.z + 0.8] }); } }),
      { id: 'find', type: 'collect', setup: restage(['pete'], 'meet'), text: 'Find Pete\'s pack near the Stone Arch', items: [{ at: (ctx) => ctx.stage.place(`flat:${L.stoneArch.x - 18},${L.stoneArch.z + 12}`), label: 'Search the spilled pack' }], waypoint: (ctx) => ctx.stage.place('stoneArch'), checkpoint: true },
      { id: 'back', type: 'deliver', text: 'Bring the map back to Pete', at: (ctx) => ctx.stage.get('pete')?.position || near('oldMission', 6, 10)(), label: 'Give Pete his map', onEnd: (ctx) => ctx.stage.say('pete', 'That\'s her! Come see me again, friend. Got a claim to show you.') },
    ],
  },
  {
    id: 'pete2', title: 'Claim Jumpers', kind: 'stranger', requires: (f) => f.done_pete1,
    giver: { at: near('oldMission', 6, 10), label: 'Talk to Old Pete', npc: { name: 'Old Pete', role: 'farmer' } },
    summary: 'Somebody\'s jumped Old Pete\'s claim.', rewards: { money: 20, items: { gold_nugget: 2 }, honor: 5 },
    prepare: (ctx) => { ctx.data.claim ||= ctx.stage.place(`flat:${L.oldMission.x + 70},${L.oldMission.z - 40}`); },
    steps: [
      talkStep('meet', [['pete', 'Followed the map, found color, staked it proper. Now there\'s three hard men digging my hole.'], ['eli', 'Not for long.']], { setup: (ctx) => { const p = near('oldMission', 6, 10)(); ctx.stage.spawn('pete', { name: 'Old Pete', role: 'farmer', at: [p.x + 0.8, p.z + 0.8] }); } }),
      { id: 'ride', type: 'ride', text: 'Ride to Pete\'s claim', at: (ctx) => ctx.data.claim, radius: 40, checkpoint: true, setup: (ctx) => { const c = ctx.data.claim, gg = ctx.stage.gang('jumpers', [c.x, c.z], 3, { faction: 'outlaw', weapon: ['shotgun'] }, 6); for (const n of gg) n.def.hostile = true; } },
      { id: 'fight', type: 'kill', text: 'Run off the claim jumpers', group: 'jumpers', waypoint: false, onStart: (ctx) => ctx.stage.attack('jumpers') },
      talkStep('done', [['eli', 'Claim\'s clear. Pete can keep the nuggets he left in the sluice for me.']]),
    ],
  },
  {
    id: 'widow1', title: 'The Hanging Oak', kind: 'stranger', requires: (f) => f.done_homecoming,
    giver: { at: near('hangingOak', 5, 4), label: 'Talk to the woman at the oak', npc: { name: 'Mercy Hale', role: 'townswoman' } },
    summary: 'Mercy Hale\'s husband was hanged from the oak. She wants to know who.', rewards: { money: 0, honor: 2 },
    steps: [
      talkStep('meet', [['mercy', 'They hanged my Samuel from this tree and told the sheriff he stole cattle. Sam never stole a thing.'], ['mercy', 'Somebody dropped something in the grass that night. I can\'t bear to look.']], { setup: (ctx) => { const p = near('hangingOak', 5, 4)(); ctx.stage.spawn('mercy', { name: 'Mercy Hale', role: 'townswoman', at: [p.x + 0.8, p.z + 0.8] }); } }),
      { id: 'search', type: 'collect', text: 'Search the grass under the oak', items: [{ at: near('hangingOak', -4, -3), label: 'Pick up the armband' }] },
      talkStep('tell', [['eli', 'A Blackstone armband, stitched with a name: G. Pell.'], ['mercy', 'Gus Pell. He rides for Crane. He\'s camped by the lake trail most nights.']]),
    ],
  },
  {
    id: 'widow2', title: 'Gus Pell', kind: 'stranger', requires: (f) => f.done_widow1,
    giver: { at: near('hangingOak', 5, 4), label: 'Talk to Mercy Hale', npc: { name: 'Mercy Hale', role: 'townswoman' } },
    summary: 'Find Gus Pell at his camp on the lake trail.', rewards: (f) => ({ money: 15, honor: f.pell === 'alive' ? 6 : 2 }),
    prepare: (ctx) => { const p = ctx.stage.place('road:lakeTrail:0.55'); ctx.data.camp ||= ctx.stage.place(`flat:${p.x + 30},${p.z}`); },
    steps: [
      { id: 'ride', type: 'ride', text: 'Find Gus Pell\'s camp on the lake trail', at: (ctx) => ctx.data.camp, radius: 35, checkpoint: true,
        setup: (ctx) => { const c = ctx.data.camp; ctx.stage.fire(c, 1.2); const p = ctx.stage.spawn('pell', { name: 'Gus Pell', role: 'thug', faction: 'blackstone', hostile: true, tag: 'pell', at: [c.x + 3, c.z + 2], weapon: ['revolver'], canSurrender: true, aggression: 0.5 }); const gg = ctx.stage.gang('pell', [c.x - 4, c.z + 4], 2, { role: 'cowboy', faction: 'blackstone' }, 3); void p; void gg; } },
      { id: 'fight', type: 'kill', text: 'Take Gus Pell — dead or alive', group: 'pell', waypoint: false, onStart: (ctx) => ctx.stage.attack('pell'), onEnd: (ctx) => { const p = ctx.stage.get('pell'); ctx.flags.pell = p && !p.dead ? 'alive' : 'dead'; if (p && !p.dead) ctx.stage.say(p, 'All right! I\'ll tell the sheriff. Crane ordered it — I\'ll swear it!'); } },
      talkStep('done', (ctx) => [['eli', ctx.flags.pell === 'alive' ? 'Pell will tell the circuit judge who gave the order. Mercy deserves that much.' : 'Pell won\'t hang anyone else. Mercy deserves more than that, but it\'s what there is.']]),
    ],
  },
  {
    id: 'bell1', title: 'The Preacher\'s Bell', kind: 'stranger', requires: (f) => f.done_paperLead,
    giver: { at: front('church', 3), label: 'Talk to the preacher', npc: { name: 'Reverend Josiah Marsh', role: 'preacher' } },
    summary: 'Drunks stole the church bell for the brass. They\'re camped by Mirror Lake.', rewards: { money: 0 },
    prepare: (ctx) => { ctx.data.camp ||= ctx.stage.place(`flat:${L.mirrorLake.x + 80},${L.mirrorLake.z + 40}`); },
    steps: [
      talkStep('meet', [['marsh', 'Some fools hauled our bell off in a wagon last Sunday. Brass fetches a price in Saltmesa. Mirror Lake, they said in the saloon.'], ['eli', 'I\'ll fetch it back.']], { setup: (ctx) => { const p = front('church', 3)(ctx.game); ctx.stage.spawn('marsh', { name: 'Reverend Josiah Marsh', role: 'preacher', at: [p.x + 0.8, p.z + 0.8] }); } }),
      { id: 'ride', type: 'ride', text: 'Ride to the thieves\' camp by Mirror Lake', at: (ctx) => ctx.data.camp, radius: 40, checkpoint: true, setup: (ctx) => { const c = ctx.data.camp; ctx.stage.fire(c, 1.4); const gg = ctx.stage.gang('drunks', [c.x, c.z], 3, { faction: 'outlaw', role: 'gambler', accuracy: 0.6, mood: 'drunk' }, 5); for (const n of gg) n.def.hostile = true; } },
      { id: 'fight', type: 'kill', text: 'Deal with the bell thieves', group: 'drunks', waypoint: false, onStart: (ctx) => ctx.stage.attack('drunks') },
      { id: 'take', type: 'collect', text: 'Load the bell', items: [{ at: (ctx) => ({ x: ctx.data.camp.x + 4, z: ctx.data.camp.z - 3 }), label: 'Heave the bell onto your horse' }], onEnd: (ctx) => { ctx.flags.bellFound = true; } },
    ],
  },
  {
    id: 'bell2', title: 'Sunday Bell', kind: 'stranger', requires: (f) => f.done_bell1,
    giver: { at: front('church', 3), label: 'Bring the bell to the church', npc: { name: 'Reverend Josiah Marsh', role: 'preacher' } },
    summary: 'Hang the bell back in Copperbell\'s church.', rewards: { money: 15, honor: 3 },
    steps: [
      talkStep('meet', [['marsh', 'You found her! Help me raise her — she\'s heavier than my sermons.']], { setup: (ctx) => { const p = front('church', 3)(ctx.game); ctx.stage.spawn('marsh', { name: 'Reverend Josiah Marsh', role: 'preacher', at: [p.x + 0.8, p.z + 0.8] }); } }),
      { id: 'hang', type: 'deliver', text: 'Raise the bell into the steeple', at: (ctx) => front('church', 1)(ctx.game), label: 'Haul on the rope', onEnd: (ctx) => { ctx.game.get('ambience')?.bell?.(3); } },
      talkStep('done', [['marsh', 'Listen to that. The whole valley can hear Copperbell again.']]),
    ],
  },
];
void onEvent; void when;
