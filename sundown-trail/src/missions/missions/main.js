import { EVENTS, onEvent, when, hint, talkStep, brawlStep, once } from './helpers.js';
import { WORLD } from '../../data/world.js';

/**
 * The main story, missions 1–4 (Part 15, GAME_BIBLE §4). Original writing. ✦ marks an honor choice.
 *  1 Homecoming          dawn on the Fort Granger road → the ruined ranch → Mae → the first camp (tutorial)
 *  2 Paper and Lead      the forged deed at the courthouse, Sheriff Pruitt, the store, greeting and antagonizing,
 *                        ✦ the cheated homesteader, a saloon brawl
 *  3 Blackstone Weather  the Talbot homestead burning; drive off Blackstone's riders; ✦ spare or execute
 *  4 The Payroll Road    ✦ escort Okafor's evidence wagon or rob Crane's payroll coach; both name Wendell Pike
 */
const MAE = 'npc:companion:mae';
const at = (p) => (ctx) => ctx.stage.place(p);
const homestead = (ctx) => (ctx.data.home ||= ctx.stage.place('flat:-70,185'));

export const MAIN_MISSIONS = [
  // ---------------------------------------------------------------- 1
  {
    id: 'homecoming', title: 'Homecoming', chapter: 1, kind: 'main', music: null, quietEnd: false,
    summary: 'Ride home to the Rourke place and see what\'s left of it.',
    story: 'Mae was waiting in the ashes, same as ever. I made my first camp in my father\'s yard and slept like a man who\'d earned it.',
    rewards: { money: 25, items: { canned_beans: 1, jerky: 2 } },
    steps: [
      { id: 'dawn', type: 'cutscene', text: '', shots: (ctx) => {
        const p = ctx.game.player.position, y = p.y, T = ctx.game.sys('terrain'), hy = (x, z, up) => Math.max(y, T.getHeightAt(x, z)) + up; // above whatever ground is there
        return [
          { dur: 4.5, from: [p.x - 30, hy(p.x - 30, p.z - 12, 9), p.z - 12], to: [p.x - 18, hy(p.x - 18, p.z - 6, 5), p.z - 6], look: [p.x, y + 1.5, p.z], lines: [['eli', 'Six years. Road\'s the same. I\'m not.', 1.2]] },
          { dur: 3.5, from: { rel: 'eli', off: [1.4, 1.9, 3.2] }, look: { rel: 'eli', off: [0, 1.5, -20] }, lines: [['eli', 'Come on, Juniper. Let\'s go home.', 0.6]] },
        ];
      } },
      { id: 'ride1', type: 'ride', text: 'Ride west toward Copperbell', at: at('road:fortGranger:0.8'), radius: 30, checkpoint: true,
        onStart: (ctx) => { hint(ctx, 'move', 'WASD steers Juniper; tap Shift to spur her to a faster gait, hold it to keep it.', 'Left thumb steers; tap Spur to go faster.', 'Left stick steers; click L3 to spur.'); ctx.stage.after(14, () => hint(ctx, 'map', 'M opens the map; the dashed line on the minimap follows the road to your waypoint.', 'Tap Map for the map; the dashed line follows the road.')); } },
      { id: 'ride2', type: 'ride', text: 'Take the ranch road to the Rourke place', at: at('ranchYard'), radius: 22, checkpoint: true, waypointLabel: 'Rourke Ranch' },
      when('dismount', 'Climb down from the saddle', (ctx) => ctx.game.player.state === 'onFoot', { onStart: (ctx) => hint(ctx, 'dismount', 'Press E to dismount.', 'Tap Use to dismount.', 'Press X to dismount.') }),
      { id: 'mae', type: 'talk', text: 'Find out who\'s living in the ruins', npc: MAE, label: 'Talk to the woman by the chimney', tree: 'mae_intro', store: 'maeChoice', waypoint: (ctx) => ctx.game.get('npcs')?.byId?.get('companion:mae')?.position || ctx.stage.place('ranch') },
      onEvent('whistle', EVENTS.HORSE_CALLED || 'horse:called', 'Whistle for Juniper', null, {
        begin: (ctx) => hint(ctx, 'whistle', 'Press H to whistle; she\'ll come to you.', 'Tap Horse to whistle.', 'Press Y to whistle.'),
        check: (ctx, st, dt) => { const h = ctx.game.get('horses')?.playerHorse; st.t = (st.t || 0) + dt; return (ctx.game.input.pressed('whistle') && st.t > 0.3) || (h && h.position.distanceTo(ctx.game.player.position) < 4 && st.t > 3); },
      }),
      onEvent('camp', EVENTS.CAMP_MADE, 'Make camp in the yard', null, { begin: (ctx) => hint(ctx, 'camp', 'Hold B to make camp (or use the satchel, I).', 'Open the Bag and choose Make camp here.', 'Hold D-pad left to make camp.') }),
      onEvent('sleep', EVENTS.CAMP_SLEPT, 'Sleep in your bedroll', null, { begin: (ctx) => hint(ctx, 'sleep', 'Walk to the bedroll and press E to sleep.') }),
    ],
  },
  // ---------------------------------------------------------------- 2
  {
    id: 'paperLead', title: 'Paper and Lead', chapter: 2, kind: 'main', requires: (f) => f.done_homecoming,
    giver: { at: (g) => g.get('npcs')?.byId?.get('companion:mae')?.position || null, label: 'Talk to Mae about the deed', hint: 'Mae at the ranch' },
    summary: 'Find out how a dead man signed away his land.',
    summaryDone: (f) => `The deed carries a fine hand my father never had. Pruitt warned me off. ${f.m2_homesteader === 'ignore' ? 'I walked past a cheated man.' : 'I stood up for a homesteader named Tom Reese.'}`,
    story: (f) => `In Copperbell the deed book showed my father's name in a clerk's handwriting. Crane's sheriff told me to go home. ${f.m2_homesteader === 'ignore' ? 'A homesteader asked me for help and I kept walking.' : 'I helped a homesteader named Reese stand his ground.'} Then Crane's men found me in the Brass Rail.`,
    rewards: { money: 25 },
    steps: [
      talkStep('brief', [[MAE.slice(4), 'The county keeps a deed book at the courthouse. If that paper\'s a lie, the lie\'s written down somewhere.'], ['eli', 'Then I\'ll go read it.'], [MAE.slice(4), 'Read it, don\'t burn it. And stay out of the Brass Rail.']]),
      { id: 'town', type: 'ride', text: 'Ride to Copperbell', at: at('copperbell'), radius: 40, checkpoint: true },
      { id: 'clerk', type: 'talk', text: 'Read the deed book at the courthouse', npc: 'clerk', tree: 'm2_clerk', label: 'Ask the clerk for the Rourke deed', at: at('courthouse'),
        setup: (ctx) => { ctx.stage.spawn('clerk', { name: 'Abner Haskell', role: 'gentleman', at: ctx.stage.place('courthouse'), wander: false, canSurrender: true }); } },
      { id: 'sheriff', type: 'talk', text: 'Call on Sheriff Pruitt', npc: (ctx) => ctx.game.get('npcs')?.byId?.get('pruitt') || ctx.stage.get('pruitt'), tree: 'm2_pruitt', label: 'Talk to the sheriff', at: at('sheriff'),
        setup: (ctx) => { if (!ctx.game.get('npcs')?.byId?.get('pruitt')) ctx.stage.spawn('pruitt', { name: 'Sheriff Amos Pruitt', role: 'lawman', faction: 'law', at: ctx.stage.place('sheriff'), weapon: ['revolver'] }); } },
      onEvent('shop', EVENTS.ITEM_ADDED, 'Buy cartridges at the general store', (p) => p.id?.startsWith('ammo_'), { at: at('general'),
        begin: (ctx) => { hint(ctx, 'shop', 'Walk up to the counter and press E to shop.'); if (ctx.game.sys('wallet').money < 2) ctx.game.sys('wallet').add(3, 'mae'); } }),
      onEvent('greet', EVENTS.SOCIAL_GREET, 'Greet someone on the street', null, { waypoint: false, begin: (ctx) => hint(ctx, 'greet', 'Hold Q near someone, point at Greet and let go.', 'Hold Talk near someone and swipe to Greet.', 'Hold D-pad up near someone and choose Greet.') }),
      { id: 'reese', type: 'talk', text: 'Someone\'s waving you down', npc: 'reese', tree: 'm2_homesteader', store: 'm2_homesteader', expect: ['help', 'pay', 'ignore'], checkpoint: true, at: (ctx) => ctx.stage.get('reese')?.position,
        setup: (ctx) => {
          const g = ctx.stage.place('general'), b = ctx.stage.buildingInfo('copperbell', 'general'), side = b ? b.spec.yaw : 0;
          ctx.stage.spawn('reese', { name: 'Tom Reese', role: 'farmer', at: [g.x + Math.cos(side) * 4, g.z - Math.sin(side) * 4] });
          ctx.stage.spawn('agent', { name: 'Blackstone land agent', role: 'gentleman', faction: 'blackstone', at: [g.x - Math.cos(side) * 5, g.z + Math.sin(side) * 5], hat: 'bowler', canSurrender: true, aggression: 0.2 });
        },
        next: (ctx) => (ctx.flags.m2_homesteader === 'help' ? 'agent' : 'saloon') },
      onEvent('agent', EVENTS.SOCIAL_ANTAGONIZE, 'Lean on the land agent', (p, ctx) => p.npc === ctx.stage.get('agent') && p.level >= 2, { at: (ctx) => ctx.stage.get('agent')?.position,
        begin: (ctx) => hint(ctx, 'antagonize', 'Hold Q near him and choose Antagonize. Twice should do it.'),
        onEnd: (ctx) => { const a = ctx.stage.get('agent'); ctx.stage.say(a, 'All right! All right. The account was... miscounted. Mr. Reese is paid in full.'); ctx.game.get('honor')?.change?.(5, 'helped homesteader'); a?.brain?.set?.('flee', { from: ctx.game.player.position.clone() }); } }),
      { id: 'saloon', type: 'goto', text: 'Get a drink at the Brass Rail', at: at('saloon'), radius: 4, checkpoint: true,
        setup: (ctx) => {
          const b = ctx.stage.buildingInfo('copperbell', 'saloon'), p = b ? b.local.world(1.5, 0.3, 0) : ctx.stage.place('saloon');
          ctx.stage.spawn('dutch', { name: 'Dutch Keller', role: 'thug', faction: 'blackstone', at: [p.x, p.z], aggression: 0.8, health: 140, weapon: [] });
          ctx.stage.spawn('crony', { name: 'Blackstone hand', role: 'cowboy', faction: 'blackstone', at: [p.x + 1.5, p.z + 1], aggression: 0.5 });
        } },
      when('inside', 'Find a spot at the bar', (ctx) => ctx.game.get('towns')?.zone?.building === 'saloon'),
      talkStep('provoke', [['dutch', 'Well now. Josiah Rourke\'s jailbird. Judge Crane sends his regards.'], ['eli', 'Tell the judge I got them.'], ['dutch', 'Tell him yourself. When you wake up.']],
        { onStart: (ctx) => { const d = ctx.stage.get('dutch'); d?.moveTo?.(ctx.game.player.position, 'walk', { direct: true }); } }),
      brawlStep('brawl', 'dutch', 'Win the fistfight', { onStart: (ctx) => hint(ctx, 'fists', 'Left click punches, right click blocks, Space dodges.', 'Tap Fire to punch, Aim to block.', 'RT punches, LT blocks.') }),
      talkStep('pruittEnd', (ctx) => [[ctx.game.get('npcs')?.byId?.get('pruitt') || 'Sheriff Pruitt', 'That\'s enough! Rourke — out. And Keller, you crawl home before I count to ten.'], ['eli', 'He started it, Amos.'], [ctx.game.get('npcs')?.byId?.get('pruitt') || 'Sheriff Pruitt', 'And I\'ll finish it. Go home.']]),
    ],
  },
  // ---------------------------------------------------------------- 3
  {
    id: 'weather', title: 'Blackstone Weather', chapter: 3, kind: 'main', music: 'tension', requires: (f) => f.done_paperLead,
    giver: { at: (g) => g.get('npcs')?.byId?.get('companion:mae')?.position || null, label: 'Mae has news', hint: 'Mae at the ranch' },
    summary: 'Smoke over the Saltmesa road: the Talbot place is burning.',
    summaryDone: (f) => `Drove Blackstone's riders off the Talbot place. ${f.m3_thug === 'spare' ? 'Let the last one ride.' : 'Shot the last one where he knelt.'}`,
    story: (f) => `Crane's riders set the Talbot homestead alight. We drove them off. ${f.m3_thug === 'spare' ? 'The last one begged and I let him go.' : 'The last one begged. I didn\'t listen.'} Walt Talbot told me about a marshal on the Fort Granger road — and Crane's payroll coach.`,
    rewards: { money: 40 },
    prepare: (ctx) => { homestead(ctx); },
    steps: [
      talkStep('brief', [[MAE.slice(4), 'Smoke over the Saltmesa road. That\'s the Talbot place, Eli — Walt and Nora and the little ones.'], ['eli', 'Blackstone?'], [MAE.slice(4), 'Who else sets fires before breakfast? Go.']]),
      { id: 'ride', type: 'ride', text: 'Ride to the Talbot homestead', at: homestead, radius: 60, checkpoint: true,
        setup: (ctx) => {
          const h = homestead(ctx), S = ctx.stage, yaw = 0.6;
          ctx.data.cabin = S.cabin(h, yaw);
          S.fire([h.x - 1.5, h.z], 4); S.fire([h.x + 2.5, h.z + 1], 3); S.fire([h.x + 9, h.z - 6], 2.5);
          S.spawn('walt', { name: 'Walt Talbot', role: 'farmer', at: [h.x - 14, h.z + 10], start: 'cower', canSurrender: true });
          S.spawn('nora', { name: 'Nora Talbot', role: 'ranchwoman', at: [h.x - 15, h.z + 12], start: 'cower' });
          S.gang('riders', [h.x + 4, h.z + 14], 5, { role: 'thug', faction: 'blackstone', weapon: ['revolver'], aggression: 0.75, accuracy: 0.75 }, 9);
          S.spawn('leader', { name: 'Blackstone foreman', role: 'cowboy', faction: 'blackstone', hostile: true, tag: 'riders', at: [h.x + 10, h.z + 4], weapon: ['repeater'], aggression: 0.35, canSurrender: true, health: 140 });
          for (const n of S.group('riders')) n.def.hostile = true;
        } },
      { id: 'fight', type: 'kill', text: 'Drive off Blackstone\'s riders', group: 'riders', waypoint: false,
        onStart: (ctx) => { ctx.stage.attack('riders'); hint(ctx, 'shoot', 'Right click to aim, left click to fire, R reloads. Stay behind the well and the wagon. Press V while aiming for Focus.', 'Aim, then Fire. Take cover behind things. Focus slows time.', 'LT aims, RT fires, R3 for Focus.'); },
        during: (ctx, st) => { const S = ctx.stage, left = S.alive('riders'), L = S.get('leader'); once(st, 'yield', () => left.length === 1 && left[0] === L && !L.dead, () => { L.brain.set('surrender'); S.say(L, 'Enough! I yield — I yield!'); }); } },
      { id: 'mercy', type: 'talk', text: (ctx) => (ctx.stage.get('leader')?.dead ? 'See to the Talbots' : 'Decide what to do with the foreman'), npc: 'leader', tree: 'm3_thug', store: 'm3_thug', expect: ['spare', 'execute'], label: 'Face the foreman',
        onStart: (ctx) => { if (ctx.stage.get('leader')?.dead) { ctx.flags.m3_thug = 'dead'; ctx.runner.goto('talbot'); } },
        onEnd: (ctx) => { const L = ctx.stage.get('leader'); if (!L || L.dead) return; if (ctx.flags.m3_thug === 'execute') { ctx.game.get('honor')?.change?.(-6, 'executed a surrendered man'); L.die?.(null, ctx.game.player.entity); ctx.game.audio.play('revolver_fire', { position: L.position }); } else { L.brain.set('flee', { from: ctx.game.player.position.clone() }); } } },
      { id: 'talbot', type: 'talk', text: 'See to the Talbots', npc: 'walt', tree: 'm3_talbot', label: 'Talk to Walt Talbot' },
    ],
  },
  // ---------------------------------------------------------------- 4
  {
    id: 'payroll', title: 'The Payroll Road', chapter: 4, kind: 'main', requires: (f) => f.done_weather,
    giver: { at: (g) => { const t = g.get('towns')?.towns?.get('copperbell'), b = t?.buildings?.find((x) => x.id === 'sheriff'); return b ? { x: b.front.x + Math.sin(b.spec.yaw) * 5, z: b.front.z + Math.cos(b.spec.yaw) * 5 } : { x: 40, z: 60 }; }, label: 'Meet Marshal Okafor', hint: 'outside the sheriff\'s office in Copperbell' },
    summary: 'Hurt Crane where it counts: his money, or his secrets.',
    summaryDone: (f) => (f.payroll === 'rob' ? 'Robbed Crane\'s payroll coach. Among the money: a receipt to one Wendell Pike, notary.' : 'Brought Okafor\'s evidence wagon into Copperbell. The records name the notary: Wendell Pike.'),
    story: (f) => (f.payroll === 'rob' ? 'I took Crane\'s payroll off his own coach. Six hundred dollars, and one scrap of paper worth more: two hundred paid to a Wendell Pike, notary, "for the Rourke matter."' : 'I rode with Marshal Okafor\'s wagon and we fought it into Copperbell. In her records was the name of the man who notarized my father\'s deed: Wendell Pike. Pike has run for Saltmesa.'),
    rewards: (f) => (f.payroll === 'rob' ? { money: 600, honor: -5, flags: { pikeKnown: true } } : { money: 60, honor: 5, flags: { pikeKnown: true } }),
    steps: [
      { id: 'okafor', type: 'talk', text: 'Hear the marshal out', npc: 'okafor', tree: 'm4_okafor', store: 'payroll', expect: ['escort', 'rob'], label: 'Talk to Marshal Okafor',
        setup: (ctx) => { const p = ctx.stage.place('sheriff'); ctx.stage.spawn('okafor', { name: 'Marshal Ruth Okafor', role: 'marshal', faction: 'ally', at: [p.x + 2, p.z + 2], weapon: ['revolver', 'repeater'], health: 200 }); },
        next: (ctx) => (ctx.flags.payroll === 'rob' ? 'robRide' : 'escortRide') },
      // ---- escort
      { id: 'escortRide', type: 'ride', text: 'Ride east to meet the evidence wagon', at: at('road:fortGranger:0.55'), radius: 25, checkpoint: true,
        setup: (ctx) => {
          const S = ctx.stage, path = S.roadPath('fortGranger', 0.55, 0.985);
          S.wagon('evidence', { path, coach: false, driver: { key: 'deputy', name: 'Deputy Nils Ostrom', role: 'lawman', faction: 'ally', weapon: ['shotgun'] }, gait: 1 }).stop();
          const p0 = path[0]; S.spawn('okafor', { name: 'Marshal Ruth Okafor', role: 'marshal', faction: 'ally', at: [p0[0] + 4, p0[1] + 3], weapon: ['revolver', 'repeater'], health: 220, mounted: true });
        } },
      { id: 'escort', type: 'escort', text: 'Escort the wagon to Copperbell', wagon: 'evidence', lostText: 'The evidence wagon was lost.',
        onStart: (ctx) => { const w = ctx.stage.wagons.get('evidence'); w?.go(); ctx.stage.say('okafor', 'Stay close. If they come, they\'ll come from the hills.'); },
        fail: (ctx) => (ctx.stage.get('okafor')?.dead ? 'Marshal Okafor was killed.' : null),
        during: (ctx, st, dt) => {
          const S = ctx.stage, w = S.wagons.get('evidence'), o = S.get('okafor');
          if (o && !o.dead && w && o.brain?.calm !== false && !['fight'].includes(o.brain?.state)) { st.o = (st.o || 0) - dt; if (st.o <= 0) { st.o = 1; o.moveTo?.(w.position, 'run'); } }
          once(st, 'ambush', () => w && w.i > w.path.length * 0.4, () => {
            w.stop(); const p = w.position, fx = Math.cos(w.yaw), fz = -Math.sin(w.yaw);
            S.gang('ambush', [p.x + fx * 28 - Math.sin(w.yaw) * 30, p.z + fz * 28 - Math.cos(w.yaw) * 30], 6, { role: 'thug', faction: 'blackstone', weapon: ['repeater'], accuracy: 0.7 }, 12);
            S.attack('ambush'); S.say('okafor', 'There! In the rocks — protect the wagon!');
          });
          once(st, 'clear', () => st.ambush && S.alive('ambush').length === 0, () => { w?.go(); S.say('okafor', 'Keep it rolling. Copperbell\'s close.'); });
        } },
      talkStep('escortEnd', [['okafor', 'Whole. Every page. Let me see what Crane wanted burned…'], ['okafor', 'Here. Rourke parcel, notarized by Wendell Pike. Pike drew up three land transfers for Blackstone, and all three owners were dead or in prison at the time.'], ['eli', 'Where is he?'], ['okafor', 'Ran for Saltmesa when I came into the county. Find him before Crane does.']], { next: 'complete' }),
      // ---- robbery
      { id: 'robRide', type: 'ride', text: 'Ride to the estate road and lay up', at: at('road:estateRoad:0.5'), radius: 30, checkpoint: true },
      { id: 'coach', type: 'custom', text: 'Stop Crane\'s payroll coach', checkpoint: true, waypoint: false,
        setup: (ctx) => {
          const S = ctx.stage, path = S.roadPath('estateRoad', 0.98, 0.12);
          S.wagon('payroll', { path, coach: true, strongbox: true, color: 0x2a2a2e, driver: { key: 'driver', name: 'Blackstone driver', role: 'cowboy', faction: 'blackstone', weapon: ['shotgun'], canSurrender: true }, gait: 2 });
          const p0 = path[2] || path[0];
          for (let i = 0; i < 3; i++) S.spawn(`guard${i}`, { name: 'Blackstone guard', role: 'thug', faction: 'blackstone', tag: 'guards', at: [p0[0] + (i - 1) * 3, p0[1] + 4], weapon: ['repeater'], mounted: true, aggression: 0.8 });
          S.after(1, () => hint(ctx, 'rob', 'Shoot the guards, the driver or the team. A coach with no driver stops.'));
        },
        tick: (ctx, st, dt) => {
          const S = ctx.stage, w = S.wagons.get('payroll');
          // guards ride alongside until there's trouble
          for (const n of S.group('guards')) if (!n.dead && n.brain?.calm !== false && n.brain?.state !== 'fight' && w) { n._t = (n._t || 0) - dt; if (n._t <= 0) { n._t = 0.8; n.moveTo?.(w.position, 'run'); } }
          const trouble = S.group('guards').some((n) => n.dead || n.brain?.state === 'fight') || S.get('driver')?.dead;
          if (trouble && !st.alarm) { st.alarm = true; for (const n of S.group('guards')) { n.def.hostile = true; } S.attack('guards'); ctx.game.get('law')?.reportCrime?.('robbery', w.position.clone()); }
          if (w?.arrived) return { fail: 'The payroll got through to Copperbell.' };
          const down = S.group('guards').every((n) => n.dead || n.surrendered) && (!S.get('driver') || S.get('driver').dead || S.get('driver').surrendered || S.get('driver').brain?.state === 'flee');
          if (down) w?.stop();
          return down && w?.stopped ? true : null;
        } },
      { id: 'strongbox', type: 'custom', text: 'Open the strongbox',
        start: (ctx, st) => { const w = ctx.stage.wagons.get('payroll'); st.h = ctx.stage.interact(() => w?.position, 'Shoot off the lock', () => { st.done = true; ctx.game.audio.play('revolver_fire', { position: w.position }); if (w?.strongbox) w.strongbox.visible = false; }, 3.5); },
        tick: (ctx, st) => (st.done ? true : null) },
      talkStep('loot', [['eli', 'Six hundred dollars of Crane\'s money… and what\'s this. "Paid W. Pike, notary, two hundred, for services in the Rourke matter."'], ['eli', 'Wendell Pike. Now you\'ve got a name.']]),
      when('escape', 'Get away from the scene (lose the law if they come)', (ctx, st, dt) => { const law = ctx.game.get('law'), w = ctx.stage.wagons.get('payroll'); const far = w && w.position.distanceTo(ctx.game.player.position) > 250; return !law?.isWanted?.() ? (st.t = (st.t || 0) + dt) > 8 || far : false; }, { waypoint: false }),
    ],
  },
];
void WORLD;
