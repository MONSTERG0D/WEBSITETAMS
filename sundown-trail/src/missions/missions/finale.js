import { onEvent, when, hint, talkStep, once, setTime, restage } from './helpers.js';
import { WORLD } from '../../data/world.js';

/**
 * The main story, missions 5–7 and the epilogue (Part 15, GAME_BIBLE §4). Original writing.
 *  5 Saltmesa   find Pike's trail at the trading post, survive the canyon narrows, a noon duel with Jack Ransome,
 *               ✦ spare Pike (he'll testify) or kill him (take his ledger)
 *  6 Greywind   by night into Blackstone's lumber camp for the original deed — quiet or loud — then the downhill chase
 *  7 Sundown    honor ≥ 20: hold the courthouse with Okafor, duel Silas Vane, see Crane arrested
 *               honor < 20: storm the estate, burn the deed vault, duel Vane, keep the ranch as a wanted man
 *  Epilogue     at the ranch at sundown: honor, companions and the ranch decide what's said
 */
const L = WORLD.locations;
const at = (p) => (ctx) => ctx.stage.place(p);
const officeInside = (ctx) => { const b = ctx.stage.buildingInfo('greywind', 'gw_office'); return b ? b.local.world(0, b.inside?.y ?? 0.3, -1.5) : ctx.stage.place('office'); };
const vault = (ctx) => (ctx.data.vault ||= ctx.m.sets?.vault?.clone() || ctx.stage.place(`flat:${L.blackstoneEstate.x + 30},${L.blackstoneEstate.z + 10}`)); // the permanent brick vault (Sets.js)

export const FINAL_MISSIONS = [
  // ---------------------------------------------------------------- 5
  {
    id: 'saltmesa', title: 'Saltmesa', chapter: 5, kind: 'main', requires: (f) => f.done_payroll,
    giver: { at: () => ({ x: L.saltmesaPost.x + 6, z: L.saltmesaPost.z + 8 }), label: 'Ask after Wendell Pike', hint: 'at the Saltmesa Trading Post' },
    summary: 'Track Wendell Pike into the Cinder Boys\' canyons.',
    summaryDone: (f) => `Beat Jack Ransome at noon. ${f.m5_pike === 'spare' ? 'Pike rides with me now, ready to testify.' : 'Pike is dead; his ledger is in my saddlebag.'} The original deed is at the Greywind lumber camp.`,
    story: (f) => `In the Saltmesa canyons the Cinder Boys were waiting in the rocks. Jack Ransome called me out at noon, and he was slower. ${f.m5_pike === 'spare' ? 'Pike confessed everything and swore he\'d say it to a real judge.' : 'Pike confessed everything. I took his ledger and left him in the canyon.'} The original deed is in Blackstone's safe at Greywind.`,
    rewards: (f) => ({ money: 110, flags: f.m5_pike === 'spare' ? { pikeTestimony: true } : { pikeLedger: true }, items: f.m5_pike === 'spare' ? {} : { pike_ledger: 1 } }),
    steps: [
      { id: 'rosa', type: 'talk', text: 'Ask the trader about Pike', npc: 'rosa', tree: 'm5_trader', label: 'Talk to the trader',
        setup: (ctx) => ctx.stage.spawn('rosa', { name: 'Rosa Benavides', role: 'townswoman', at: [L.saltmesaPost.x + 4, L.saltmesaPost.z + 6] }) },
      { id: 'trail', type: 'ride', text: 'Follow the trail into the canyons', at: at('road:hideoutTrail:0.55'), radius: 25, checkpoint: true },
      { id: 'narrows', type: 'kill', text: 'Survive the ambush in the narrows', group: 'cinder', checkpoint: true, waypoint: false,
        setup: (ctx) => {
          const S = ctx.stage, p = S.place('road:hideoutTrail:0.72');
          S.gang('cinder', [p.x, p.z], 6, { role: 'outlaw', faction: 'cinder', weapon: ['repeater'], accuracy: 0.8 }, 22);
          for (const n of S.group('cinder')) n.def.hostile = true;
        },
        onStart: (ctx) => { ctx.stage.attack('cinder'); ctx.stage.say('eli', 'High ground. Ransome\'s boys.'); hint(ctx, 'cover', 'Crouch (Ctrl) behind rocks; peek out to shoot.'); } },
      { id: 'hideout', type: 'goto', text: 'Ride into the Cinder Boys\' camp', at: at('cinderHideout'), radius: 18, checkpoint: true,
        setup: (ctx) => {
          const S = ctx.stage, h = S.place('cinderHideout');
          S.spawn('ransome', { name: 'Jack Ransome', role: 'outlaw', faction: 'cinder', at: [h.x + 6, h.z + 2], weapon: ['revolver'], health: 160, accuracy: 1.1 });
          S.spawn('pike', { name: 'Wendell Pike', role: 'gentleman', at: [h.x - 6, h.z - 4], start: 'cower', canSurrender: true, hat: 'bowler' });
          if (ctx.m.sets?.campFire) S.fire(ctx.m.sets.campFire, 1.3);
        } },
      { id: 'callout', type: 'cutscene', shots: (ctx) => {
        const r = ctx.stage.get('ransome');
        return [
          { dur: 4, stage: () => r?.facePoint?.(ctx.game.player.position), from: { rel: 'eli', off: [1.2, 1.8, -2.5] }, look: { rel: 'ransome', off: [0, 1.5, 0] }, lines: [['ransome', 'You shot a lot of my boys getting here, Rourke.', 0.4]] },
          { dur: 4.5, from: { rel: 'ransome', off: [-1, 1.7, 3] }, look: { rel: 'ransome', off: [0, 1.6, 0] }, lines: [['ransome', 'Pike paid me to keep him breathing. Fair\'s fair — you want him, take him from me. Noon. In the open.', 0.3]] },
        ];
      } },
      { id: 'noon', type: 'custom', text: '', setup: restage(['ransome', 'pike'], 'hideout'), start: (ctx, st) => { setTime(ctx, 12, 'Noon').then(() => { st.done = true; }); }, tick: (ctx, st) => (st.done ? true : null), checkpoint: true, checkpointAt: at('cinderHideout') },
      { id: 'duel', type: 'duel', text: 'Duel Jack Ransome', npc: 'ransome', skill: 0.72, title: 'Jack Ransome', waypoint: false },
      { id: 'pike', type: 'talk', text: 'Deal with Wendell Pike', npc: 'pike', tree: 'm5_pike', store: 'm5_pike', expect: ['spare', 'kill'], label: 'Face Wendell Pike',
        onEnd: (ctx) => { const p = ctx.stage.get('pike'); if (ctx.flags.m5_pike === 'kill') { p?.die?.(null, ctx.game.player.entity); ctx.game.audio.play('revolver_fire', { position: p?.position }); ctx.game.ui.notify('Took Pike\'s ledger.'); } else { p?.brain?.set?.('idle'); ctx.game.ui.notify('Pike will testify. He\'ll make his own way to Copperbell.'); } } },
    ],
  },
  // ---------------------------------------------------------------- 6
  {
    id: 'greywind', title: 'Greywind', chapter: 6, kind: 'main', music: 'tension', requires: (f) => f.done_saltmesa,
    giver: { at: (g) => g.get('npcs')?.byId?.get('companion:mae')?.position || null, label: 'Plan the Greywind job', hint: 'Mae at the ranch' },
    summary: 'The original deed is in Blackstone\'s safe at the Greywind lumber camp.',
    summaryDone: (f) => `Took the original deed from the Greywind office ${f.m6_loud ? 'with half the camp shooting at me' : 'without a soul seeing me'} and outran Crane's riders down the pass.`,
    story: (f) => `I went up to Greywind in the dark. ${f.m6_loud ? 'They saw me, and it got loud.' : 'Nobody saw me come or go.'} In Blackstone's safe: my father's real deed, with his X on it. Crane's riders chased me down the pass; Juniper outran them all.`,
    rewards: { money: 40, items: { original_deed: 1 }, flags: { deed: true } },
    steps: [
      { id: 'brief', type: 'custom', start: (ctx, st) => ctx.stage.lines([['companion:mae', 'Greywind. In the snow, in the dark. Your daddy would\'ve called it a fool\'s errand.'], ['eli', 'And then he\'d have saddled up.'], ['companion:mae', 'Mm. He would. Bring that paper home.']]).then(() => { st.done = true; }), tick: (ctx, st) => (st.done ? true : null) },
      { id: 'overlook', type: 'ride', text: 'Ride up the pass to the camp', at: at('road:greywindRoad:0.83'), radius: 25, checkpoint: true },
      { id: 'dark', type: 'custom', text: 'Wait for dark', start: (ctx, st) => { const sky = ctx.game.sys('sky'); if ((sky.timeOfDay ?? 12) >= 21 || (sky.timeOfDay ?? 12) < 4) { st.done = true; return; } setTime(ctx, 22.5, 'Night falls on the pass.').then(() => { st.done = true; }); }, tick: (ctx, st) => (st.done ? true : null) },
      { id: 'sneak', type: 'stealth', text: 'Slip into the camp office unseen', group: 'camp', at: officeInside, radius: 3.5, checkpoint: true, onSpotted: 'loud',
        setup: (ctx) => {
          const S = ctx.stage, C = S.place('lumberCamp'), o = S.place('office');
          const route = (a, r) => [0, 1, 2, 3].map((k) => [C.x + Math.cos(a + k * 1.57) * r, C.z + Math.sin(a + k * 1.57) * r]);
          for (let i = 0; i < 6; i++) S.spawn(`guard${i}`, { name: 'Camp guard', role: 'worker', faction: 'blackstone', hostile: true, tag: 'camp', weapon: [i % 2 ? 'repeater' : 'shotgun'], at: route(i, 18 + (i % 3) * 8)[0], patrol: i < 4 ? route(i, 18 + (i % 3) * 8) : undefined, sight: 0.65, accuracy: 0.8 });
          S.spawn('lamp', { name: 'Night watchman', role: 'worker', faction: 'blackstone', hostile: true, tag: 'camp', at: [o.x + 3, o.z + 2], weapon: ['repeater'], sight: 0.6, pose: 'sit' });
          hint(ctx, 'stealth', 'Crouch (Ctrl) to move quietly. Keep out of the lantern light and behind the lumber stacks.');
        } },
      { id: 'loud', type: 'kill', text: 'They\'ve seen you — fight your way to the office', group: 'camp', waypoint: false, onStart: (ctx) => { ctx.flags.m6_loud = true; ctx.stage.attack('camp'); }, next: 'safe' },
      { id: 'safe', type: 'collect', text: 'Take the deed from the safe', items: [{ at: officeInside, label: 'Crack the company safe' }], onStart: (ctx) => { if (!ctx.flags.m6_loud) ctx.flags.m6_loud = false; }, waypoint: officeInside },
      talkStep('deed', [['eli', '"Josiah Rourke, his mark: X." There you are, Pa.']], { onEnd: (ctx) => ctx.game.audio.play('map_unfold', { volume: 0.6 }) }),
      { id: 'chase', type: 'ride', text: 'Get to Juniper and ride for the valley!', at: at('road:greywindRoad:0.35'), radius: 30, checkpoint: true, checkpointAt: at('road:greywindRoad:0.8'),
        setup: (ctx) => {
          const S = ctx.stage, p = S.place('road:greywindRoad:0.88');
          for (let i = 0; i < 3; i++) S.spawn(`rider${i}`, { name: 'Blackstone rider', role: 'cowboy', faction: 'blackstone', hostile: true, tag: 'riders', at: [p.x + i * 4, p.z + 6], weapon: ['repeater'], mounted: true, aggression: 0.9 });
          S.after(1.5, () => { S.attack('riders'); const h = ctx.game.get('horses'); if (ctx.game.player.state !== 'mounted') h?.whistle?.(); });
        },
        onStart: (ctx) => hint(ctx, 'chase', 'Tap Shift to gallop. Fire from the saddle by aiming.') },
    ],
  },
  // ---------------------------------------------------------------- 7
  {
    id: 'sundown', title: 'Sundown', chapter: 7, kind: 'main', requires: (f) => f.done_greywind,
    giver: { at: (g) => g.get('npcs')?.byId?.get('companion:mae')?.position || null, label: 'Finish it', hint: 'at the ranch' },
    summary: 'End it with Judge Crane.',
    summaryDone: (f) => (f.ending === 'honest' ? 'Held the courthouse with Okafor and killed Silas Vane in the street. Crane was arrested.' : 'Burned Crane\'s deed vault and killed Silas Vane. The ranch is mine — by force.'),
    rewards: (f) => (f.ending === 'honest' ? { money: 150, honor: 5 } : { money: 150, honor: -5 }),
    prepare: (ctx) => { if (!ctx.flags.sundownPath) ctx.flags.sundownPath = (ctx.game.get('honor')?.value ?? 0) >= 20 ? 'honest' : 'outlaw'; },
    onComplete: (ctx) => { ctx.flags.ending = ctx.flags.sundownPath; setTimeout(() => ctx.m.start('epilogue'), 4200); },
    steps: [
      { id: 'branch', type: 'custom', tick: (ctx) => (ctx.flags.sundownPath === 'honest' ? 'courthouse' : 'estate') },
      // ---- honest
      { id: 'courthouse', type: 'ride', text: 'Bring the deed to Marshal Okafor at the courthouse', at: at('courthouse'), radius: 12, checkpoint: true,
        setup: (ctx) => {
          const S = ctx.stage, c = S.place('courthouse');
          S.spawn('okafor', { name: 'Marshal Ruth Okafor', role: 'marshal', faction: 'ally', at: [c.x + 2, c.z], weapon: ['repeater'], health: 260 });
          S.spawn('dep1', { name: 'Deputy Ostrom', role: 'lawman', faction: 'ally', tag: 'allies', at: [c.x - 3, c.z + 2], weapon: ['shotgun'], health: 160 });
          S.spawn('dep2', { name: 'Deputy Hale', role: 'lawman', faction: 'ally', tag: 'allies', at: [c.x + 5, c.z + 3], weapon: ['repeater'], health: 160 });
          if (ctx.flags.pikeTestimony) S.spawn('pike', { name: 'Wendell Pike', role: 'gentleman', at: [c.x - 1, c.z - 3], hat: 'bowler', start: 'cower' });
        } },
      { id: 'hand', type: 'talk', text: 'Give Okafor the deed', npc: 'okafor', tree: 'm7_okafor', label: 'Hand Okafor the deed', onEnd: (ctx) => { ctx.game.sys('inventory').remove('original_deed', 1); } },
      { id: 'siege', type: 'defend', text: 'Hold the courthouse', seconds: 75, group: 'crane', protect: 'okafor', at: at('courthouse'), radius: 80, clear: true, checkpoint: true, failText: 'Marshal Okafor was killed.',
        during: (ctx, st, dt) => {
          const S = ctx.stage; st.w = (st.w ?? 2) - dt;
          if (st.w <= 0 && (st.n || 0) < 3) {
            st.w = 24; st.n = (st.n || 0) + 1;
            const c = S.place('courthouse'), t = ctx.game.get('towns')?.towns?.get('copperbell'), u = t?.axis || { x: 1, z: 0 }, d = 70 + st.n * 5, side = st.n % 2 ? 1 : -1;
            const gang = S.gang(`crane${st.n}_`, [c.x + u.x * d * side, c.z + u.z * d * side], 4, { role: 'thug', faction: 'blackstone', tag: 'crane', weapon: ['repeater'], accuracy: 0.8 }, 6);
            for (const n of gang) n.def.hostile = true;
            S.attack('crane');
            S.say('okafor', st.n === 1 ? 'Here they come!' : st.n === 2 ? 'More from the east end!' : 'Last of them — hold!');
          }
        } },
      { id: 'vane', type: 'cutscene', checkpoint: true,
        setup: (ctx) => { const c = ctx.stage.place('courthouse'), t = ctx.game.get('towns')?.towns?.get('copperbell'), u = t?.axis || { x: 1, z: 0 }; ctx.stage.spawn('vane', { name: 'Silas Vane', role: 'gentleman', faction: 'blackstone', at: [c.x + u.x * 16, c.z + u.z * 16], weapon: ['revolver'], health: 200, hat: 'gambler' }); },
        shots: (ctx) => [
          { dur: 4, from: { rel: 'vane', off: [1.5, 1.7, 4] }, look: { rel: 'vane', off: [0, 1.6, 0] }, lines: [['vane', 'Marshal. Rourke. The judge regrets he can\'t attend.', 0.3]] },
          { dur: 4.5, from: { rel: 'eli', off: [-1.3, 1.8, -2.4] }, look: { rel: 'vane', off: [0, 1.5, 0] }, lines: [['eli', 'You\'re the one who held the pen over his hand, weren\'t you?', 0.2], ['vane', 'I\'m the one who holds everything for him. Step into the street.', 2.4]] },
        ] },
      { id: 'duel', type: 'duel', text: 'Duel Silas Vane', npc: 'vane', skill: 0.93, title: 'Silas Vane', waypoint: false },
      { id: 'arrest', type: 'cutscene', shots: (ctx) => {
        const c = ctx.stage.place('courthouse');
        return [
          { dur: 1, stage: () => { ctx.stage.spawn('crane', { name: 'Judge Thaddeus Crane', role: 'gentleman', faction: 'civilian', at: [c.x - 6, c.z + 4], hat: 'bowler', start: 'surrender' }); } },
          { dur: 5, from: [c.x + 6, c.y + 2.4, c.z + 9], look: [c.x - 4, c.y + 1.5, c.z + 3], lines: [['okafor', 'Thaddeus Crane, you\'re under arrest for fraud, forgery and conspiracy to murder.', 0.4], ['crane', 'You\'ll never make it stick in this county.', 3.6]] },
          { dur: 4.5, from: { rel: 'eli', off: [1, 1.7, 2.5] }, look: { rel: 'eli', off: [0, 1.6, 0] }, lines: [['okafor', 'It isn\'t your county anymore, Judge. Mr. Rourke — go home. It\'s yours.', 0.4]] },
        ];
      }, next: 'complete' },
      // ---- outlaw
      { id: 'estate', type: 'ride', text: 'Ride to Blackstone Estate', at: at('blackstoneEstate'), radius: 70, checkpoint: true,
        setup: (ctx) => {
          const S = ctx.stage, e = S.place('blackstoneEstate'), v = vault(ctx);
          if (!ctx.m.sets?.vault) ctx.data.vaultInfo = S.cabin(v, 0.4, { paint: 'brick', w: 6, d: 5, porch: false, windows: 0 });
          const gang = S.gang('estate', [e.x, e.z], 8, { role: 'thug', faction: 'blackstone', weapon: ['repeater'], accuracy: 0.85 }, 26);
          for (const n of gang) n.def.hostile = true;
        } },
      { id: 'storm', type: 'kill', text: 'Clear Crane\'s guards', group: 'estate', waypoint: false, onStart: (ctx) => ctx.stage.attack('estate') },
      { id: 'burn', type: 'deliver', text: 'Set the deed vault alight', at: vault, label: 'Pour the lamp oil and strike a match', radius: 4, onEnd: (ctx) => { const v = vault(ctx); ctx.stage.fire(v, 5); ctx.stage.fire([v.x + 2, v.z + 1], 4); ctx.game.get('law')?.reportCrime?.('robbery', v.clone()); } },
      { id: 'vane2', type: 'cutscene', checkpoint: true,
        setup: (ctx) => { const v = vault(ctx); ctx.stage.spawn('vane', { name: 'Silas Vane', role: 'gentleman', faction: 'blackstone', at: [v.x + 14, v.z + 8], weapon: ['revolver'], health: 200, hat: 'gambler' }); },
        shots: () => [
          { dur: 4.5, from: { rel: 'vane', off: [1.5, 1.7, 4] }, look: { rel: 'vane', off: [0, 1.6, 0] }, lines: [['vane', 'Every deed in the county, burning. You\'ve made yourself an outlaw for a few acres of dirt.', 0.3]] },
          { dur: 3.5, from: { rel: 'eli', off: [-1.3, 1.8, -2.4] }, look: { rel: 'vane', off: [0, 1.5, 0] }, lines: [['eli', 'My dirt.', 0.6]] },
        ] },
      { id: 'duel2', type: 'duel', text: 'Duel Silas Vane', npc: 'vane', skill: 0.93, title: 'Silas Vane', waypoint: false },
      talkStep('flee', [['eli', 'Crane\'s got no deed now, no gun, and no reason to stay. Neither do I. Time to ride.']], { onEnd: (ctx) => { const law = ctx.game.get('law'); law?.reportCrime?.('murder', ctx.game.player.position.clone()); } }),
      when('away', 'Ride for the ranch', (ctx) => ctx.game.player.position.distanceTo(ctx.stage.place('ranch')) < 60, { at: at('ranch'), next: 'complete' }),
    ],
  },
  // ---------------------------------------------------------------- epilogue
  {
    id: 'epilogue', title: 'Epilogue', kind: 'main', quietEnd: true, requires: (f) => f.done_sundown && !f.done_epilogue,
    summary: 'Sundown at the Rourke Ranch.',
    steps: [
      { id: 'home', type: 'custom', start: (ctx, st) => { const r = ctx.stage.place('ranchYard'); ctx.stage.teleport(r.x, r.z, { horse: true }); setTime(ctx, 18.6).then(() => { st.done = true; }); }, tick: (ctx, st) => (st.done ? true : null) },
      { id: 'scene', type: 'cutscene', shots: (ctx) => epilogueShots(ctx) },
      { id: 'end', type: 'custom', start: (ctx, st) => { ctx.m.titleCard('Sundown Trail', 'The end', () => { st.done = true; ctx.game.ui.openScreen('credits'); }); }, tick: (ctx, st) => (st.done ? true : null), next: 'complete' },
    ],
  },
];

/** The epilogue speaks to what the player did. */
function epilogueShots(ctx) {
  const g = ctx.game, honor = g.get('honor')?.value ?? 0, comp = g.get('companions')?.list?.() || [], ranch = g.get('ranch');
  const built = ranch ? Object.values(ranch.levels).filter(Boolean).length : 0, f = ctx.flags, R = ctx.stage.place('ranch'), y = R.y;
  const lines = [];
  lines.push(f.ending === 'honest' ? 'Crane went to the territorial prison in the spring. The land company sold its claims for pennies.' : 'They put my face on posters from here to Fort Granger. Nobody\'s come to collect yet.');
  lines.push(honor >= 60 ? 'Folks tip their hats in Copperbell now. Some of them even mean it.' : honor >= 20 ? 'Copperbell decided I was more good than bad. That\'s about what I decided too.' : honor > -20 ? 'Some days I\'m not sure what I am. Mae says that\'s called being a person.' : 'Mothers pull their children off the street when I ride in. I earned that.');
  lines.push(built >= 8 ? 'Every board of the old place is standing again, and then some. Pa wouldn\'t know it.' : built >= 4 ? 'The ranch is half built and all mine. That\'s enough for this year.' : 'The house still lets in the rain. Mae says I\'ll fix it when I\'m done fixing everybody else.');
  const names = comp.filter((c) => c.home && c.id !== 'mae').map((c) => c.name.split(' ')[0]);
  lines.push(names.length ? `${names.join(', ').replace(/, ([^,]*)$/, ' and $1')} sit by the fire most nights. Mae feeds us all and complains about it.` : 'Mae and I eat supper by the fire. It\'s quiet. I don\'t mind quiet now.');
  return [
    { dur: 6, from: [R.x + 30, y + 14, R.z + 34], to: [R.x + 18, y + 9, R.z + 24], look: [R.x - 4, y + 2, R.z - 6], lines: [['eli', lines[0], 0.6]] },
    { dur: 6, from: [R.x + 6, y + 2.2, R.z + 6], to: [R.x + 4, y + 1.8, R.z + 4], look: [R.x, y + 0.8, R.z], lines: [['eli', lines[1], 0.4]] },
    { dur: 6, from: [R.x - 20, y + 6, R.z + 18], to: [R.x - 26, y + 7, R.z + 10], look: [R.x - 8, y + 2, R.z - 6], lines: [['eli', lines[2], 0.4]] },
    { dur: 6.5, from: [R.x + 3, y + 1.6, R.z + 3.5], look: [R.x, y + 1, R.z], lines: [['eli', lines[3], 0.4]] },
    { dur: 4, from: [R.x + 40, y + 30, R.z + 60], to: [R.x + 60, y + 50, R.z + 90], look: [R.x, y, R.z], fade: 'out' },
  ];
}
void onEvent; void once;
