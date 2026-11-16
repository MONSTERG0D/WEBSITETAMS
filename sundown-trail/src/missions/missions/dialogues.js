/**
 * Story dialogue trees for Part 15 (original writing). Registered with the dialogue system by the missions system.
 * Choices may carry `honor` (applied on choosing) and `result` (stored by the mission step).
 */
export const STORY_DIALOGUES = [
  { id: 'm2_clerk', start: 'a', speakerName: 'Clerk Abner Haskell', nodes: {
    a: { speaker: 'npc', text: 'Rourke? The Rourke parcel. Section nine, Ashwater. Transferred to Blackstone Land and Cattle, March of ninety-six. All proper. Judge Crane\'s seal right there.', next: 'b' },
    b: { speaker: 'eli', text: 'Let me see the signature.', next: 'c' },
    c: { speaker: 'npc', text: '"Josiah Rourke." Fine hand. Witnessed and notarized, too.', choices: [
      { text: 'My father couldn\'t write his own name. He signed with an X.', next: 'd' },
      { text: 'Who notarized it?', next: 'e' },
    ] },
    d: { speaker: 'npc', text: '…Well. I only keep the book, Mr. Rourke. I don\'t argue with judges. And neither should you.', next: 'f' },
    e: { speaker: 'npc', text: 'The notary\'s mark is smudged. Plenty of notaries pass through. Plenty don\'t stay.', next: 'f' },
    f: { speaker: 'eli', text: 'Somebody wrote this. Somebody knows.', next: null },
  } },
  { id: 'm2_pruitt', start: 'a', speakerName: 'Sheriff Amos Pruitt', nodes: {
    a: { speaker: 'npc', text: 'Eli Rourke. Stockade didn\'t take the starch out of you. I heard you were asking after deeds.', choices: [
      { text: 'Somebody stole my father\'s land with a forged paper.', next: 'b' },
      { text: 'Who pays your wages these days, Amos? The county, or the judge?', next: 'c', honor: -0.5 },
      { text: 'Just visiting.', next: 'd' },
    ] },
    b: { speaker: 'npc', text: 'Somebody filed a paper with a judge\'s seal. That makes it the law. You want to fight the law, you know where that got you last time.', next: 'e' },
    c: { speaker: 'npc', text: 'Careful. I can find you a cell faster than you found that deed.', next: 'e' },
    d: { speaker: 'npc', text: 'Visit quiet, then. Crane\'s men drink at the Brass Rail and they don\'t like the name Rourke.', next: 'e' },
    e: { speaker: 'npc', text: 'Go home, Eli. Fix your roof. Don\'t make me ride out there.', next: null },
  } },
  { id: 'm2_homesteader', start: 'a', speakerName: 'Tom Reese', nodes: {
    a: { speaker: 'npc', text: 'Sir — you look like a man who can count. That Blackstone agent says my seed money\'s short by twelve dollars. I counted it twice at home. He says pay or he forecloses by Friday.', choices: [
      { text: 'Let me have a word with him.', next: 'help', result: 'help', honor: 1 },
      { text: 'Here. Twelve dollars. Pay him and go home.', next: 'pay', result: 'pay', action: (g) => { if (g.sys('wallet').spend(12, 'gift')) g.get('honor')?.change?.(4, 'helped homesteader'); } },
      { text: 'Not my business.', next: 'no', result: 'ignore' },
    ] },
    help: { speaker: 'npc', text: 'God bless you. He\'s the one in the bowler, by the store.', next: null },
    pay: { speaker: 'npc', text: 'I — thank you. I\'ll remember the name Rourke kindly. Not everyone in this town will.', next: null },
    no: { speaker: 'npc', text: 'No. No, I suppose it isn\'t.', next: null },
  } },
  { id: 'm3_thug', start: 'a', speakerName: 'Blackstone rider', nodes: {
    a: { speaker: 'npc', text: 'Don\'t — I\'m done, I\'m done! It was the foreman\'s idea. The judge wanted the Talbots gone by winter, that\'s all I know.', choices: [
      { text: 'Get on your horse and don\'t stop until Fort Granger.', next: 'spare', result: 'spare', honor: 4 },
      { text: 'You set a family\'s house on fire.', next: 'exec', result: 'execute' },
    ] },
    spare: { speaker: 'npc', text: 'Yes sir. Yes sir. You won\'t see me again.', next: null },
    exec: { speaker: 'eli', text: '…', next: null },
  } },
  { id: 'm3_talbot', start: 'a', speakerName: 'Walt Talbot', nodes: {
    a: { speaker: 'npc', text: 'We\'d be ashes with the barn if you hadn\'t come. Rourke, isn\'t it? Your daddy helped me raise that roof.', next: 'b' },
    b: { speaker: 'npc', text: 'Crane\'s company is doing this all over the valley. But I hear a circuit marshal\'s on the Fort Granger road — a woman named Okafor. She\'s not on anybody\'s payroll.', next: 'c' },
    c: { speaker: 'npc', text: 'And Blackstone moves its payroll by coach on the estate road. Fat with money. Just so you know where Crane keeps his blood.', next: null },
  } },
  { id: 'm4_okafor', start: 'a', speakerName: 'Marshal Ruth Okafor', nodes: {
    a: { speaker: 'npc', text: 'Mr. Rourke. Walt Talbot wrote to me about you. I have a wagon of county records on the Fort Granger road — land filings Crane would very much like burned before they reach a courtroom.', next: 'b' },
    b: { speaker: 'npc', text: 'Ride with it. Keep it whole to Copperbell, and I\'ll find you the name of the man who wrote your father\'s deed.', choices: [
      { text: 'I\'ll ride with your wagon, Marshal.', next: 'yes', result: 'escort', honor: 1 },
      { text: 'Paper\'s slow. Crane\'s payroll coach is on the estate road today — I\'ll take what he values.', next: 'rob', result: 'rob' },
    ] },
    yes: { speaker: 'npc', text: 'Good. The wagon\'s waiting east of town. Expect company.', next: null },
    rob: { speaker: 'npc', text: 'Then you and I will meet again, Mr. Rourke, and you won\'t like which side of the bars you\'re on.', next: null },
  } },
  { id: 'm5_trader', start: 'a', speakerName: 'Rosa Benavides', nodes: {
    a: { speaker: 'npc', text: 'A soft-handed man in a city collar? Pike. He bought water and bullets with shaking hands and rode for the canyons. The Cinder Boys have him — or he has them, the way he pays.', next: 'b' },
    b: { speaker: 'npc', text: 'Follow the trail southwest past the red bluffs. And go slow in the narrows. Jack Ransome likes high ground.', next: null },
  } },
  { id: 'm5_pike', start: 'a', speakerName: 'Wendell Pike', nodes: {
    a: { speaker: 'npc', text: 'Don\'t shoot! I only drew it — the hand, the seal, the date. Crane paid two hundred dollars and said nobody\'d ever check a dead man\'s mark!', next: 'b' },
    b: { speaker: 'npc', text: 'The original\'s not burned — he\'s too careful. It\'s in the company safe at the Greywind lumber camp office. I can testify. I\'ll swear to all of it.', choices: [
      { text: 'Then you\'ll ride with me and say it to a judge who isn\'t Crane.', next: 'spare', result: 'spare', honor: 4 },
      { text: 'You stole my father\'s land for two hundred dollars.', next: 'kill', result: 'kill', honor: -6 },
    ] },
    spare: { speaker: 'npc', text: 'Anything. Anything you say. Just keep me away from Silas Vane.', next: null },
    kill: { speaker: 'eli', text: 'I\'ll take that ledger of yours. It can do the talking.', next: null },
  } },
  { id: 'm7_okafor', start: 'a', speakerName: 'Marshal Ruth Okafor', nodes: {
    a: { speaker: 'npc', text: 'The original deed, with your father\'s mark. And the forger\'s word. Mr. Rourke, that\'s a case.', next: 'b' },
    b: { speaker: 'npc', text: 'Crane will know by nightfall. He\'ll send everything he has at this courthouse before I can wire the territorial judge. Will you hold the door with me?', choices: [
      { text: 'I didn\'t ride this far to leave now.', next: 'c', honor: 1 },
      { text: 'Let them come.', next: 'c' },
    ] },
    c: { speaker: 'npc', text: 'Then load up. They\'re coming down the street.', next: null },
  } },
  { id: 'side_hollis', start: 'a', speakerName: 'Hollis Grant', nodes: {
    a: { speaker: 'npc', text: 'You\'re the Rourke boy. Folks say you can shoot. Folks say all kinds of things.', next: 'b' },
    b: { speaker: 'npc', text: 'Six bottles on the rail out back. Twenty seconds. Do it, and I\'ll teach you what your eyes are for. Miss, and you buy the next round.', choices: [
      { text: 'Line them up.', next: 'c' },
      { text: 'Another time.', next: 'no', result: 'no' },
    ] },
    c: { speaker: 'npc', text: 'Draw when you\'re ready.', next: null },
    no: { speaker: 'npc', text: 'Another time, then. I\'ll be right here. I\'m always right here.', next: null },
  } },
  { id: 'side_june', start: 'a', speakerName: 'June Whitfield', nodes: {
    a: { speaker: 'npc', text: 'Line\'s dead east of town again. Third time this month. It\'s always dead when Marshal Okafor\'s wires are due — funny how that works.', next: 'b' },
    b: { speaker: 'npc', text: 'If somebody found who\'s cutting it and spliced it back, I\'d owe them. I\'d owe them a great deal, actually — I\'m about done with this town.', next: null },
  } },
  { id: 'side_abel', start: 'a', speakerName: 'Abel Hutchins', nodes: {
    a: { speaker: 'npc', text: 'Rustlers took five head out of my pen last night. Good stock — I raised two of them from foals. Tracks run west toward the Stone Arch.', next: 'b' },
    b: { speaker: 'npc', text: 'Bring them home and bring me the man that took them — breathing, if you can. I want the sheriff to see his face.', next: null },
  } },
];
