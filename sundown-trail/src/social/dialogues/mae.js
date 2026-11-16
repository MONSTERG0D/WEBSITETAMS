/**
 * Mae Dorsey's introduction (Part 8 seed; mission 1 "Homecoming" in Part 15 starts it at the ruined ranch).
 * Mae was a friend of the Rourke family and cooked for the ranch hands; she's sharp-tongued and warm, and she's been
 * living in what's left of the house since Blackstone seized the ranch with a forged deed while Eli was in the
 * Fort Granger stockade. Original writing.
 */
export const maeIntro = {
  id: 'mae_intro', start: 'hello', speakerName: 'Mae Dorsey',
  nodes: {
    hello: { speaker: 'npc', text: "Well, I'll be. Eli Rourke. So they finally opened that stockade gate. Six years, and you didn't write me but twice.", next: 'eli1' },
    eli1: {
      speaker: 'eli', text: 'Mae.',
      choices: [
        { text: "I'm sorry, Mae. I should've written.", next: 'sorry', honor: 1 },
        { text: "Didn't think anybody'd be waiting.", next: 'waiting' },
        { text: "I'm not here to be scolded.", next: 'scold' },
      ],
    },
    sorry: { speaker: 'npc', text: "Sorry don't fix a roof. But it's a start. Come here, let me look at you. Thinner. Greyer. Meaner round the eyes.", next: 'ranch' },
    waiting: { speaker: 'npc', text: "Somebody always waits. That's what home is, you fool. Even when it's falling down round their ears.", next: 'ranch' },
    scold: { speaker: 'npc', text: "Then you came to the wrong porch. I've scolded better men than you, and fed 'em after. Sit down before you fall down.", next: 'ranch' },
    ranch: {
      speaker: 'eli', text: 'What happened to the place?',
      choices: [
        { text: 'Who did this?', next: 'who' },
        { text: 'How have you been living out here?', next: 'living', honor: 0.5 },
        { text: "Doesn't matter. I'm only passing through.", next: 'passing', result: 'cold' },
      ],
    },
    who: { speaker: 'npc', text: "Fire took the barn the winter your father passed. The rest, Blackstone took with paper: a deed with Judge Crane's name on it, saying your daddy sold. He never sold. Paper burns slower, but it burns.", next: 'crane' },
    living: { speaker: 'npc', text: "Same as ever. Chickens, a garden, a shotgun for the coyotes and one for the lawyers. Can't say which gets more use.", next: 'crane' },
    passing: { speaker: 'npc', text: "Passing through. Mm-hm. That's why the first place you rode from Fort Granger was these ashes. Sit. Eat. Lie to me tomorrow.", next: 'crane' },
    crane: {
      speaker: 'npc', text: "That deed's a forgery, Eli, sure as I'm standing here. Blackstone fences this land come spring unless somebody stands on it and proves it. That somebody's you.",
      choices: [
        { text: "Then I'll stand on it.", next: 'stay', result: 'stay', honor: 1 },
        { text: 'How do you prove a deed is forged?', next: 'note' },
        { text: "Let Crane have it. It's just dirt.", next: 'dirt', result: 'doubt' },
      ],
    },
    note: { speaker: 'npc', text: "Somebody wrote it. Somebody knows. And Crane owns the sheriff, so it won't be easy. But a man has to decide to stay before he can fight for anything.", next: 'decide' },
    decide: {
      speaker: 'eli', text: '...',
      choices: [
        { text: "All right. I'm staying.", next: 'stay', result: 'stay', honor: 1 },
        { text: "I'll think on it.", next: 'think', result: 'undecided' },
      ],
    },
    dirt: { speaker: 'npc', text: "It's your mother's grave and your father's sweat. Dirt. Hmph. You sleep on that, and see if it lets you.", next: 'supper' },
    think: { speaker: 'npc', text: "Think with a full belly, then. Nobody ever decided anything right on an empty one.", next: 'supper' },
    stay: { speaker: 'npc', text: "Good. Then tomorrow you start earning. Tonight, you eat. There's beans, there's coffee, and there's no arguing.", next: 'supper' },
    supper: {
      speaker: 'npc', text: "Here. Take these for the road, too. Don't let that horse of yours eat 'em.",
      onEnter: (g) => { const inv = g.sys('inventory'); inv.add?.('canned_beans', 1); inv.add?.('coffee', 1); g.ui.notify('Mae gave you canned beans and coffee.'); },
      choices: [
        { text: 'Thank you, Mae.', next: 'bye', honor: 0.5 },
        { text: '(Nod.)', next: 'bye' },
      ],
    },
    bye: { speaker: 'npc', text: "Welcome home, Eli. Now wash your hands.", next: null },
  },
};
