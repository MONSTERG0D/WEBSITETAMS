/**
 * Phrase banks for the social menu (Part 8). All lines are original. `{time}` becomes Morning, Afternoon or Evening;
 * `{sir}` a polite address that depends on the speaker. pickLine(kind, ctx) chooses a bank from the context:
 *   ctx = { me (the speaker's first name), role, faction, mood ('drunk'|'sour'|null), tier ('villainous'…'honorable'), hour, wanted, anger, female }
 */
export const PHRASES = {
  // ---------------------------------------------------------------- what Eli says
  eliGreet: ['{time}.', 'Howdy.', '{time}, friend.', 'How do.', 'Afternoon. Nice day for it.', 'Evening.', 'Good to see a friendly face.', 'Keeping well?'],
  eliAntagonize: [
    'You always this ugly, or is it a special occasion?', "That hat's doing you no favours.", "I've met friendlier rattlesnakes.",
    "Your mother know you're out this late?", 'You smell like a wet mule.', "What're you looking at?", "Move. You're in my light.",
    'I seen scarecrows with more backbone.', "Something funny, partner?", 'You talk like a man with too many teeth.',
  ],
  eliDefuse: ['Easy now. No harm meant.', "Let's both walk away from this.", 'I spoke out of turn. My apologies.', "Not worth bleeding over, friend.", "Whoa, whoa. Put it away. We're square."],
  eliRob: ['Your money. Now.', 'Empty your pockets. Slow.', "Hands up and nobody gets hurt.", 'Wallet on the ground. Do it.', "Don't be a hero. Pay up."],
  // ---------------------------------------------------------------- greetings back
  greet: {
    friendly: [
      '{time} to you, {sir}.', 'Howdy! Fine day, ain\'t it?', 'Well, hello there.', 'Always glad to see a good man in town.', 'Pleasure, {sir}.',
      "Heard you helped folks out. Much obliged.", '{time}! You look like you rode a ways.', 'God bless, {sir}.', "Stop by the saloon later, first one's on me.",
      'Kind of you to say hello.', "Weather's holding, praise be.", 'Hello, hello!',
    ],
    neutral: [
      '{time}.', 'Howdy.', 'Mm. Hello.', "How do.", 'Can I help you?', "Stranger.", 'Hot one today.', 'Keep moving, I got work.',
      "Ain't seen you round here before.", 'Hm? Oh. {time}.', 'Yep.', 'Uh-huh.', "Mind the mud.",
    ],
    cold: [
      "I know who you are.", 'Keep walking, mister.', "We don't want trouble.", "I'll thank you to stay away from my family.",
      "...", 'Not you again.', "Folks like you oughta be run outta town.", 'Hmph.',
    ],
    night: ['Bit late to be wandering, ain\'t it?', "Can't sleep either?", 'Evening. Mind the dark.', "Lamp oil's dear. Get on home."],
    law: ['Keep your iron holstered in my town.', '{time}. Behave yourself.', 'Sheriff\'s office is on the square if you need it.', 'I got my eye on you, stranger.', 'Quiet day. Let\'s keep it that way.'],
    lawFriendly: ["Good to see you, {sir}. Town's safer with folks like you.", 'Afternoon. Heard good things.', "If you ever want a deputy's badge, you know where I am."],
    drunk: [
      'Hey! HEY! You\'re my besht friend.', "Who moved the ground?", 'I\'ll have you know I was a... a very important man.', 'Buy me a drink? Jusht one.',
      "Shhh. The horses are listening.", "You've got... four eyes. No. Two. Two eyes.", "Sing with me! No? Your loss.", 'Is it morning? It feels like morning.',
    ],
    outlaw: ["Don't look at me like that.", 'What do you want?', 'You lost, cowboy?', 'Move along.'],
  },
  refuse: ["I don't talk to your kind.", 'Get away from me.', "Folks seen what you done. Leave me be.", "I'll scream, I swear it.", "Not one word to you."],
  wanted: ["You're the one on the posters!", "Lord, it's him. Somebody fetch the sheriff!", "I didn't see nothing, I swear!", 'Stay back!'],
  // ---------------------------------------------------------------- being antagonized (anger 1 words, 2 shoves, 3 fight)
  antagonize: {
    1: ["Say that again, I dare you.", "You got a problem?", "Watch your mouth.", 'Big talk from a little man.', "You looking for trouble?", "Keep walking before I lose my temper."],
    2: ["That's it!", 'Get outta my face!', "You want some? Huh?", 'Back off!', 'I warned you!'],
    3: ['Right, put em up!', "You're gonna regret that!", "I'll knock your teeth out!", 'Come on then!', "That's the last mistake you make!"],
    gun: ['Draw, then!', "Reach for it. Go on.", "You picked the wrong day.", "I'll put you in the ground."],
    meek: ["I don't want no trouble.", "P-please, mister, I'm just going home.", "Why you gotta be like that?", 'Leave me be!'],
    drunk1: ["Ex-cuse me? I'll have you know my mother loved me.", "Sh-say that again. Slower.", "Who you callin' ugly, ugly?", 'Ooh, fancy words. Fancy man.'],
    drunk2: ["Thash it! Hold my bottle. Hold it!", "I'm gonna... I'm gonna shove you. Right... now.", "Nobody talks to {me} like that!", 'Put \'em up! Which ones are yours?'],
    drunk3: ["Ain't nobody... hic... ain't nobody beats {me}!", "I'm gonna fight you AND your twin!", "Come here, both of yous!", "Now you done it!"],
    law: ['That\'s enough out of you.', "Mouth off again and you'll spend the night in a cell.", "You want to try me, son?"],
  },
  // ---------------------------------------------------------------- defusing
  defuse: {
    ok: ['...Fine. Just get out of my sight.', 'Hmph. Lucky for you I got somewhere to be.', "All right. We're done here.", "Yeah, yeah. Forget it.", "Apology accepted. Barely."],
    fail: ["Too late for sorry!", "Sorry don't cut it!", 'Oh no you don\'t!', "You should've thought of that before!"],
    drunkOk: ["Awww. You're alright. You're alright!", "We're friends now. Best friends.", "Shure. Shure. Let's hug."],
    drunkFail: ["No! No. You hurt {me}'s feelings.", "Too late, friend. TOO LATE.", '{me} don\'t forgive. {me} don\'t... what was I saying?'],
  },
  // ---------------------------------------------------------------- robbery
  rob: {
    plead: ["Don't shoot! Take it, take it!", "Please, I got children!", "All right, all right, easy with that thing!", "Here, here, it's all I got!", 'Mercy, mister!'],
    poor: ["I ain't got nothing! Look, empty!", "You're robbing a poor man, you know that?", 'Two bits. That\'s all I got in this world.'],
    refuse: ["You'll have to kill me first.", "Not today, friend.", "You picked the wrong man to rob."],
    after: ["You'll hang for this!", "The sheriff'll hear about this!", 'Animal!', 'I hope it chokes you.'],
  },
  // ---------------------------------------------------------------- lawmen warning a respectable man
  warn: ["Stop right there! I'd hate to shoot a decent man.", "Don't make me do this, mister.", "Last warning. Hands where I can see them."],
};

/** Counts every line (the Bible asks for 100+). */
export function countLines() {
  let n = 0;
  const walk = (v) => { if (Array.isArray(v)) n += v.length; else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(PHRASES);
  return n;
}

const TIERS = ['villainous', 'outlaw', 'drifter', 'respected', 'honorable'];
const timeWord = (h) => (h < 12 && h >= 4 ? 'Morning' : h < 18 && h >= 12 ? 'Afternoon' : 'Evening');
const fill = (s, ctx) => s.replace(/\{time\}/g, timeWord(ctx.hour ?? 12)).replace(/\{me\}/g, ctx.me || 'Earl').replace(/\{sir\}/g, ctx.female ? 'mister' : ctx.role === 'gentleman' ? 'sir' : 'friend');
export const pick = (list, rng = Math.random) => list[Math.floor(rng() * list.length) % list.length];

/**
 * A reply line for an action. kind: 'greet' | 'antagonize' | 'defuse' | 'rob' | 'eliGreet' | 'eliAntagonize' | 'eliDefuse' | 'eliRob'.
 * @returns {{ text: string, bank: string }}
 */
export function pickLine(kind, ctx = {}, rng = Math.random) {
  const P = PHRASES, ti = TIERS.indexOf(ctx.tier ?? 'drifter'), drunk = ctx.mood === 'drunk', law = ctx.faction === 'law';
  let bank, list;
  if (kind.startsWith('eli')) { bank = kind; list = P[kind]; }
  else if (kind === 'greet') {
    if (ctx.wanted && !law && ctx.faction === 'civilian') bank = 'wanted';
    else if (drunk) bank = 'greet.drunk';
    else if (law) bank = ti >= 3 ? 'greet.lawFriendly' : 'greet.law';
    else if (ctx.faction === 'cinder' || ctx.faction === 'blackstone') bank = 'greet.outlaw';
    else if (ti <= 1 && ctx.faction === 'civilian') bank = rng() < (ti === 0 ? 0.7 : 0.4) ? 'refuse' : 'greet.cold';
    else if ((ctx.hour ?? 12) >= 21 || (ctx.hour ?? 12) < 5) bank = 'greet.night';
    else bank = ti >= 3 || ctx.mood === 'cheery' ? 'greet.friendly' : ctx.mood === 'sour' ? 'greet.cold' : 'greet.neutral';
  } else if (kind === 'antagonize') {
    const a = Math.max(1, Math.min(3, ctx.anger || 1));
    if (drunk) bank = `antagonize.drunk${a}`;
    else if (law) bank = 'antagonize.law';
    else if (ctx.meek && a < 3) bank = 'antagonize.meek';
    else bank = ctx.gun && a >= 3 ? 'antagonize.gun' : `antagonize.${a}`;
  } else if (kind === 'defuse') bank = `defuse.${drunk ? (ctx.ok ? 'drunkOk' : 'drunkFail') : ctx.ok ? 'ok' : 'fail'}`;
  else if (kind === 'rob') bank = `rob.${ctx.refuse ? 'refuse' : ctx.after ? 'after' : ctx.poor ? 'poor' : 'plead'}`;
  else if (kind === 'warn') bank = 'warn';
  if (!list) list = bank.split('.').reduce((o, k) => o?.[k], P);
  if (!list?.length) return { text: '...', bank: bank || kind };
  return { text: fill(pick(list, rng), ctx), bank };
}
