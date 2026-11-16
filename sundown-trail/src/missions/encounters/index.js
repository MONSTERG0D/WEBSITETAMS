/**
 * Road encounters (Part 15): twelve small situations staged ahead of you on the road. Original writing.
 * Each is a quiet mission (kind 'encounter') whose first steps stage it around ctx.data.at; honor follows the
 * Bible's table (helping a stranger +5, robbing −5…). `regions` limits where it can happen; `day` keeps it to
 * daylight.
 */
const A = (ctx, dx = 0, dz = 0) => { const c = (ctx.data.at ||= ctx.game.player.position.clone()); ctx.data.center ||= c.clone(); return [c.x + dx, c.z + dz]; };
const honor = (ctx, v, why) => ctx.game.get('honor')?.change?.(v, why);
const pay = (ctx, v) => ctx.game.sys('wallet').add(v, 'encounter');
const tree = (id, name, nodes, start = 'a') => ({ id: `enc_${id}`, start, speakerName: name, nodes });
const talk = (key, t, store = 'r') => ({ id: 'talk', type: 'talk', npc: key, tree: t, store: `enc_${store}`, label: 'Talk', waypoint: false });
const res = (ctx, k = 'r') => ctx.flags[`enc_${k}`];

export const ENCOUNTERS = [
  { id: 'snakebite', title: 'Snakebite', day: true, steps: [
    { id: 'stage', type: 'wait', seconds: 0.1, waypoint: false, setup: (ctx) => ctx.stage.spawn('man', { name: 'Snakebit cowhand', role: 'cowboy', at: A(ctx, 5, 3), start: 'cower' }) },
    talk('man', tree('snake', 'Cowhand', {
      a: { speaker: 'npc', text: 'Rattler got me — in the hand. I can\'t feel my arm. Mister, please.', choices: [
        { text: 'Here, drink this tonic.', condition: (g) => g.sys('inventory').has('health_tonic'), action: (g) => g.sys('inventory').remove('health_tonic', 1), next: 'b', result: 'help' },
        { text: 'Hold still. I\'ll cut it and draw the poison.', next: 'b', result: 'help' },
        { text: 'You\'ll live or you won\'t.', next: 'c', result: 'ignore' },
      ] },
      b: { speaker: 'npc', text: 'God bless you. I owe you my life — what I\'ve got, anyhow.', next: null },
      c: { speaker: 'npc', text: '…', next: null },
    })),
    { id: 'end', type: 'wait', seconds: 0.5, onStart: (ctx) => { if (res(ctx) === 'help') { honor(ctx, 5, 'helped a stranger'); pay(ctx, 4); } } },
  ] },
  { id: 'brokenWagon', title: 'Broken wheel', day: true, steps: [
    { id: 'stage', type: 'wait', seconds: 0.1, waypoint: false, setup: (ctx) => { const a = A(ctx); ctx.stage.wagon('w', { path: [a, [a[0] + 4, a[1] + 1]], gait: 0 }).stop(); ctx.stage.spawn('farmer', { name: 'Homesteader', role: 'farmer', at: A(ctx, 3, 4) }); } },
    talk('farmer', tree('wheel', 'Homesteader', {
      a: { speaker: 'npc', text: 'Wheel came off in the rut and I can\'t lift the bed alone. Could you lend a back?', choices: [
        { text: 'Get the jack under it. On three.', next: 'b', result: 'help' }, { text: 'Can\'t stop, sorry.', next: 'c', result: 'ignore' } ] },
      b: { speaker: 'npc', text: 'There she goes! Here — it\'s not much, but it\'s honest.', next: null },
      c: { speaker: 'npc', text: 'Sure. Sure, I understand.', next: null },
    })),
    { id: 'end', type: 'wait', seconds: 0.5, onStart: (ctx) => { if (res(ctx) === 'help') { honor(ctx, 5, 'helped a stranger'); pay(ctx, 3); } } },
  ] },
  { id: 'ambush', title: 'Ambush', steps: [
    { id: 'stage', type: 'kill', group: 'amb', waypoint: false, text: 'Ambush!', setup: (ctx) => { const gg = ctx.stage.gang('amb', A(ctx, 10, 12), 3, { faction: 'outlaw', weapon: ['revolver'] }, 8); for (const n of gg) n.def.hostile = true; ctx.stage.attack('amb'); } },
  ] },
  { id: 'robbery', title: 'Robbery in progress', steps: [
    { id: 'stage', type: 'kill', group: 'rob', waypoint: false, text: 'Stop the robbery',
      setup: (ctx) => { const v = ctx.stage.spawn('victim', { name: 'Traveler', role: 'gentleman', at: A(ctx), start: 'surrender' }); const gg = ctx.stage.gang('rob', A(ctx, 3, 2), 2, { faction: 'outlaw', weapon: ['revolver'] }, 3); for (const n of gg) { n.def.hostile = true; if (v) n.aim?.(v.position); } ctx.stage.say(gg[0], 'Empty your pockets, dandy. Slow.'); },
      onEnd: (ctx) => { honor(ctx, 5, 'helped a stranger'); const v = ctx.stage.get('victim'); if (v && !v.dead) { ctx.stage.say(v, 'Thank heaven! Take this — please.'); pay(ctx, 8); } } },
  ] },
  { id: 'prisoner', title: 'The prisoner', steps: [
    { id: 'stage', type: 'wait', seconds: 0.1, waypoint: false, setup: (ctx) => { ctx.stage.spawn('law', { name: 'Deputy marshal', role: 'lawman', faction: 'law', at: A(ctx, 2, 0), weapon: ['repeater'] }); ctx.stage.spawn('pris', { name: 'Prisoner', role: 'cowboy', at: A(ctx, -1, 1), start: 'surrender' }); } },
    talk('pris', tree('pris', 'Prisoner', {
      a: { speaker: 'npc', text: 'I never shot that man! They need a neck for it, that\'s all. Cut me loose — I\'ll make it worth your while.', choices: [
        { text: 'Cut him loose.', next: 'b', result: 'free' }, { text: 'Tell it to the judge.', next: 'c', result: 'leave', honor: 1 } ] },
      b: { speaker: 'npc', text: 'Thank you, thank you — now run!', next: null },
      c: { speaker: 'npc', text: 'Then you\'re as bad as them.', next: null },
    })),
    { id: 'end', type: 'wait', seconds: 1, onStart: (ctx) => { if (res(ctx) === 'free') { const l = ctx.stage.get('law'), p = ctx.stage.get('pris'); p?.brain?.set?.('flee', { from: ctx.game.player.position.clone() }); if (l) { l.grudge?.(ctx.game.player.entity); l.brain?.fight?.(ctx.game.player.entity); } ctx.game.get('law')?.reportCrime?.('assault', ctx.game.player.position.clone(), { witnessed: true }); honor(ctx, -3, 'freed a prisoner'); pay(ctx, 15); } } },
  ] },
  { id: 'drunkDuel', title: 'A drunk\'s challenge', steps: [
    { id: 'stage', type: 'wait', seconds: 0.1, waypoint: false, setup: (ctx) => ctx.stage.spawn('drunk', { name: 'Drunk gunman', role: 'gambler', at: A(ctx, 3, 0), mood: 'drunk', weapon: ['revolver'] }) },
    talk('drunk', tree('drunk', 'Drunk gunman', {
      a: { speaker: 'npc', text: 'You! You looked at me. Nobody looks at Clem Durfee. Draw, you — you looker!', choices: [
        { text: 'All right, Clem. Count of the bell.', next: 'b', result: 'duel' }, { text: 'Go sleep it off, Clem.', next: 'c', result: 'walk', honor: 1 } ] },
      b: { speaker: 'npc', text: 'Hah! Now we\'re talking.', next: null },
      c: { speaker: 'npc', text: '…Yeah. Yeah, all right. My head hurts.', next: null },
    }), 'drunk'),
    { id: 'duel', type: 'custom', tick: (ctx) => (res(ctx, 'drunk') === 'duel' ? 'fight' : 'complete') },
    { id: 'fight', type: 'duel', npc: 'drunk', skill: 0.3, title: 'Clem Durfee' },
  ] },
  { id: 'lostTraveler', title: 'Lost traveler', regions: ['greywind', 'saltmesa'], steps: [
    { id: 'stage', type: 'wait', seconds: 0.1, waypoint: false, setup: (ctx) => ctx.stage.spawn('lost', { name: 'Traveler', role: 'townsman', at: A(ctx, 4, 2) }) },
    { id: 'talk', type: 'talk', npc: 'lost', tree: 'stranger_lost', store: 'enc_r', label: 'Talk', waypoint: false },
    { id: 'end', type: 'wait', seconds: 0.5, onStart: (ctx) => { if (res(ctx) === 'helped' || res(ctx) === 'paid') honor(ctx, 4, 'helped a stranger'); } },
  ] },
  { id: 'wolfRider', title: 'Wolves on a rider', regions: ['greywind', 'copperbell', 'blackstone'], steps: [
    { id: 'stage', type: 'custom', text: 'Help the rider!', waypoint: false,
      setup: (ctx) => { const r = ctx.stage.spawn('rider', { name: 'Rider', role: 'rancher', at: A(ctx), start: 'cower' }); const W = ctx.game.get('wildlife'); if (W) { W.spawn('wolf', ctx.stage.ground(...A(ctx, 14, 10)), { group: true, count: 3 }); for (const a of W.list) if (a.species === 'wolf' && a.position.distanceTo(r.position) < 40) { a.provoked = true; a.state = 'charge'; ctx.data.wolves = (ctx.data.wolves || []).concat(a); } } },
      tick: (ctx) => ((ctx.data.wolves || []).every((a) => !a.alive) ? true : null),
      onEnd: (ctx) => { honor(ctx, 5, 'helped a stranger'); const r = ctx.stage.get('rider'); if (r && !r.dead) { ctx.stage.say(r, 'Thought I was wolf-meat. Thank you, friend.'); pay(ctx, 6); } } },
  ] },
  { id: 'poacher', title: 'Poacher', regions: ['greywind', 'blackstone'], steps: [
    { id: 'stage', type: 'wait', seconds: 0.1, waypoint: false, setup: (ctx) => { ctx.stage.fire(A(ctx, -2, 0), 0.9); ctx.stage.spawn('poacher', { name: 'Poacher', role: 'cowboy', faction: 'outlaw', at: A(ctx, 1, 1), weapon: ['repeater'], aggression: 0.7 }); } },
    talk('poacher', tree('poach', 'Poacher', {
      a: { speaker: 'npc', text: 'Six does and a fawn, and I\'ll have the pelts sold before the warden wakes up. You got a problem with that?', choices: [
        { text: 'Leave the young ones. Take what you\'ve got and go.', next: 'b', result: 'warn', honor: 2 }, { text: 'Not my woods.', next: 'c', result: 'ignore' }, { text: 'I\'ve got a problem with you.', next: 'd', result: 'fight' } ] },
      b: { speaker: 'npc', text: 'Huh. Fine. Fine! Some people.', next: null }, c: { speaker: 'npc', text: 'Smart.', next: null }, d: { speaker: 'npc', text: 'Then let\'s settle it.', next: null },
    })),
    { id: 'end', type: 'custom', tick: (ctx, st) => { const p = ctx.stage.get('poacher'); if (res(ctx) === 'fight') { if (!st.f) { st.f = true; p.def.hostile = true; ctx.stage.attack('enemy'); p.brain?.fight?.(ctx.game.player.entity); } return p.dead || p.surrendered ? true : null; } if (res(ctx) === 'warn') p?.brain?.set?.('flee', { from: ctx.game.player.position.clone() }); return true; } },
  ] },
  { id: 'runawayHorse', title: 'Runaway horse', day: true, steps: [
    { id: 'stage', type: 'custom', text: 'Calm the runaway horse', waypoint: false,
      setup: (ctx) => { const h = ctx.stage.horse({ at: A(ctx, 6, 0), coat: 'grey', breed: 'quarter', name: 'Biscuit' }); if (h) { h.controller.goTo(ctx.stage.ground(...A(ctx, 60, 30)), 2); ctx.data.h = h; } },
      start: (ctx, st) => { st.ih = ctx.stage.interact(() => ctx.data.h?.position, 'Calm the horse', () => { st.done = true; ctx.data.h?.controller?.stop?.(); }, 3); },
      tick: (ctx, st) => (st.done ? true : null) },
    { id: 'owner', type: 'custom', start: (ctx, st) => { const h = ctx.data.h; const o = ctx.stage.spawn('owner', { name: 'Ranch hand', role: 'ranchwoman', at: [h.position.x + 5, h.position.z + 4] }); ctx.stage.lines([[o, 'Biscuit! You fool horse. Thank you, mister — here, for your trouble.']]).then(() => { pay(ctx, 5); honor(ctx, 2, 'helped a stranger'); st.done = true; }); }, tick: (ctx, st) => (st.done ? true : null) },
  ] },
  { id: 'funeral', title: 'Funeral procession', day: true, regions: ['copperbell', 'blackstone'], steps: [
    { id: 'stage', type: 'custom', text: '', waypoint: false,
      setup: (ctx) => { for (let i = 0; i < 4; i++) { const n = ctx.stage.spawn(`m${i}`, { name: 'Mourner', role: i % 2 ? 'townswoman' : 'townsman', at: A(ctx, i * 1.6, i * 0.8) }); n?.moveTo?.(ctx.stage.ground(...A(ctx, 80 + i * 1.6, 40)), 'walk'); } ctx.stage.say('m0', 'Rest easy, Hiram. Rest easy.'); },
      start: (ctx, st) => { st.ih = ctx.stage.interact(() => ctx.stage.get('m1')?.position, 'Take off your hat for the dead', () => { st.done = true; honor(ctx, 1, 'respect'); ctx.game.ui.notify('You take off your hat as they pass.'); }, 6); },
      tick: (ctx, st) => (st.done ? true : null) },
  ] },
  { id: 'preacher', title: 'Travelling preacher', day: true, steps: [
    { id: 'stage', type: 'wait', seconds: 0.1, waypoint: false, setup: (ctx) => ctx.stage.spawn('preach', { name: 'Preacher', role: 'preacher', at: A(ctx, 4, 2) }) },
    { id: 'talk', type: 'talk', npc: 'preach', tree: 'stranger_preacher', store: 'enc_r', label: 'Talk', waypoint: false },
  ] },
];

/** The trees above, for the dialogue registry. */
export const ENCOUNTER_TREES = [];
for (const e of ENCOUNTERS) for (const s of e.steps) if (s.tree && typeof s.tree === 'object') { ENCOUNTER_TREES.push(s.tree); s.tree = s.tree.id; }
