/**
 * Three generic stranger conversations (Part 8 seeds) showing the tree format: plain branches, honor on choices,
 * conditions, actions on the wallet and inventory, timed choices, and branches decided by a function. Original writing.
 */
const money = (g) => g.sys('wallet').money;

/** A lost traveler asks the way. Help, mislead, or ask for something in return. */
export const lostTraveler = {
  id: 'stranger_lost', start: 'ask', speakerName: 'Traveler',
  nodes: {
    ask: { speaker: 'npc', text: "Pardon me, friend. I'm trying to reach Saltmesa before dark. Been going in circles since noon. Is it this way?", next: 'eli' },
    eli: {
      speaker: 'eli', text: '...',
      choices: [
        { text: 'Follow the road south past the ford. Stay off the salt pan at night.', next: 'thanks', honor: 1, result: 'helped' },
        { text: "Directions cost a dollar.", next: 'pay' },
        { text: 'Head north. Up into the mountains.', next: 'misled', honor: -1, result: 'misled' },
      ],
    },
    thanks: { speaker: 'npc', text: "South past the ford. Bless you. If you're ever through Saltmesa, I'll stand you a meal.", next: null },
    pay: {
      speaker: 'npc', text: "A dollar? For pointing? ...Fine. Here. Times being what they are.",
      onEnter: (g) => g.sys('wallet').add(1, 'directions'),
      choices: [{ text: 'South past the ford. Mind the salt pan.', next: 'thanks2', result: 'paid' }],
    },
    thanks2: { speaker: 'npc', text: 'Cheaper than a guide, I suppose. Good day.', next: null },
    misled: { speaker: 'npc', text: "North? Huh. Funny, I'd have sworn the desert was... well. Thank you kindly.", next: null },
  },
};

/** A preacher collecting for the church roof. Give, decline, or mock (a timed answer: he won't wait forever). */
export const preacher = {
  id: 'stranger_preacher', start: 'hello', speakerName: 'Preacher',
  nodes: {
    hello: { speaker: 'npc', text: "Good day to you, brother. The Lord's house in Copperbell leaks like a sieve. Would you spare something for the roof?", next: 'eli' },
    eli: {
      speaker: 'eli', text: '...', timeout: 12, timeoutChoice: 2,
      choices: [
        { text: 'Here. Five dollars.', next: 'thanks', honor: 1, condition: (g) => money(g) >= 5, action: (g) => g.sys('wallet').spend(5, 'donation'), result: 'donated' },
        { text: 'Here, a dollar. It\'s what I can spare.', next: 'small', condition: (g) => money(g) >= 1, action: (g) => g.sys('wallet').spend(1, 'donation'), result: 'small' },
        { text: "Not today, preacher.", next: 'no', result: 'declined' },
        { text: 'Maybe God should fix His own roof.', next: 'mock', honor: -1, result: 'mocked' },
      ],
    },
    thanks: { speaker: 'npc', text: 'Five dollars! That is a shingle and a half. You will be remembered in my prayers, brother.', next: null },
    small: { speaker: 'npc', text: "The widow's mite counts as much as the rich man's purse. Thank you.", next: null },
    no: { speaker: 'npc', text: 'Another time, then. The door is always open. The roof, sadly, also.', next: null },
    mock: { speaker: 'npc', text: "He did, brother. He sent you. You simply declined the work. Good day.", next: null },
  },
};

/** A card sharp offers a coin toss for two dollars. The branch is decided by the coin. */
export const coinToss = {
  id: 'stranger_cardsharp', start: 'offer', speakerName: 'Card sharp',
  nodes: {
    offer: { speaker: 'npc', text: "You have the look of a sporting man. Two dollars says this coin lands on the lady. Call it.", next: 'eli' },
    eli: {
      speaker: 'eli', text: '...',
      choices: [
        { text: "Heads. Two dollars.", next: (g) => (Math.random() < 0.5 ? 'win' : 'lose'), condition: (g) => money(g) >= 2 },
        { text: "Let me see that coin first.", next: 'coin' },
        { text: 'No thanks.', next: 'pass', result: 'passed' },
      ],
    },
    coin: { speaker: 'npc', text: "Suspicious! I like that. Same face both sides? Look, see, an eagle. Honest as the day. Now, two dollars?", next: 'eli' },
    win: { speaker: 'npc', text: (g) => { g.sys('wallet').add(2, 'bet'); return "Well, would you look at that. The lady smiles on you. Two dollars, as promised."; }, next: null },
    lose: { speaker: 'npc', text: (g) => { g.sys('wallet').spend(2, 'bet'); return "The eagle! Bad luck, friend. Better luck next time. There's always a next time."; }, next: null },
    pass: { speaker: 'npc', text: "Pity. Fortune favours the bold, they say. Also the house.", next: null },
  },
};
