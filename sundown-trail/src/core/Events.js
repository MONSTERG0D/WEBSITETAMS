/** Event catalog (GAME_BIBLE §11). Payload shapes are noted beside each name. */
export const EVENTS = Object.freeze({
  GAME_START: 'game:start', GAME_PAUSE: 'game:pause', GAME_RESUME: 'game:resume',
  GAME_SAVED: 'game:saved', GAME_LOADED: 'game:loaded',                 // {slot}
  TIME_HOUR: 'time:hour', TIME_DAWN: 'time:dawn', TIME_DUSK: 'time:dusk', // {hour, day}
  WEATHER_CHANGED: 'weather:changed', WEATHER_LIGHTNING: 'weather:lightning', // {from, to} · {position}
  ZONE_ENTERED: 'zone:entered', ZONE_EXITED: 'zone:exited',              // {zone}
  PLAYER_DAMAGED: 'player:damaged', PLAYER_DIED: 'player:died', PLAYER_RESPAWNED: 'player:respawned',
  PLAYER_MOUNTED: 'player:mounted', PLAYER_DISMOUNTED: 'player:dismounted', // {horse}
  HORSE_CALLED: 'horse:called', HORSE_GAIT: 'horse:gait', HORSE_BOND: 'horse:bond', HORSE_HURT: 'horse:hurt', HORSE_DIED: 'horse:died',
  WEAPON_EQUIPPED: 'weapon:equipped', WEAPON_FIRED: 'weapon:fired', WEAPON_RELOADED: 'weapon:reloaded',
  COMBAT_HIT: 'combat:hit', COMBAT_KILL: 'combat:kill', FOCUS_START: 'focus:start', FOCUS_END: 'focus:end',
  NPC_ALERTED: 'npc:alerted', NPC_SURRENDERED: 'npc:surrendered', NPC_DIED: 'npc:died',
  CRIME_COMMITTED: 'crime:committed', WANTED_CHANGED: 'wanted:changed', BOUNTY_CHANGED: 'bounty:changed', LAW_ESCAPED: 'law:escaped',
  HONOR_CHANGED: 'honor:changed', SOCIAL_GREET: 'social:greet', SOCIAL_ANTAGONIZE: 'social:antagonize', SOCIAL_ROB: 'social:rob',
  DIALOGUE_START: 'dialogue:start', DIALOGUE_END: 'dialogue:end',
  MONEY_CHANGED: 'money:changed', ITEM_ADDED: 'item:added', ITEM_REMOVED: 'item:removed', ITEM_REJECTED: 'item:rejected', // Part 14: {id, qty} didn't fit in the satchel
  ANIMAL_KILLED: 'animal:killed', HUNTING_SKINNED: 'hunting:skinned',
  CORE_LOW: 'core:low', CAMP_MADE: 'camp:made', CAMP_SLEPT: 'camp:slept',
  RANCH_UPGRADED: 'ranch:upgraded', COMPANION_RECRUITED: 'companion:recruited',
  MISSION_AVAILABLE: 'mission:available', MISSION_STARTED: 'mission:started', MISSION_STEP: 'mission:step',
  MISSION_COMPLETED: 'mission:completed', MISSION_FAILED: 'mission:failed',
  ENCOUNTER_STARTED: 'encounter:started', ENCOUNTER_RESOLVED: 'encounter:resolved',
  UI_SCREEN: 'ui:screen',                                                 // {name, open}
  // Added in Part 0 (recorded in PROGRESS.md)
  SETTINGS_CHANGED: 'settings:changed',                                   // {key, value}
  INPUT_DEVICE: 'input:device',                                           // {device}
  POINTER_UNLOCKED: 'input:unlocked',
  QUALITY_CHANGED: 'quality:changed',                                     // {preset}
  // Added in Part 1
  LOADING_PROGRESS: 'loading:progress',                                   // {progress 0..1, label}
});

export const {
  GAME_START, GAME_PAUSE, GAME_RESUME, GAME_SAVED, GAME_LOADED, TIME_HOUR, TIME_DAWN, TIME_DUSK,
  WEATHER_CHANGED, WEATHER_LIGHTNING, ZONE_ENTERED, ZONE_EXITED, PLAYER_DAMAGED, PLAYER_DIED, PLAYER_RESPAWNED,
  PLAYER_MOUNTED, PLAYER_DISMOUNTED, HORSE_CALLED, HORSE_GAIT, HORSE_BOND, HORSE_HURT, HORSE_DIED,
  WEAPON_EQUIPPED, WEAPON_FIRED, WEAPON_RELOADED, COMBAT_HIT, COMBAT_KILL, FOCUS_START, FOCUS_END,
  NPC_ALERTED, NPC_SURRENDERED, NPC_DIED, CRIME_COMMITTED, WANTED_CHANGED, BOUNTY_CHANGED, LAW_ESCAPED,
  HONOR_CHANGED, SOCIAL_GREET, SOCIAL_ANTAGONIZE, SOCIAL_ROB, DIALOGUE_START, DIALOGUE_END,
  MONEY_CHANGED, ITEM_ADDED, ITEM_REMOVED, ITEM_REJECTED, ANIMAL_KILLED, HUNTING_SKINNED, CORE_LOW, CAMP_MADE, CAMP_SLEPT,
  RANCH_UPGRADED, COMPANION_RECRUITED, MISSION_AVAILABLE, MISSION_STARTED, MISSION_STEP, MISSION_COMPLETED,
  MISSION_FAILED, ENCOUNTER_STARTED, ENCOUNTER_RESOLVED, UI_SCREEN, SETTINGS_CHANGED, INPUT_DEVICE,
  POINTER_UNLOCKED, QUALITY_CHANGED, LOADING_PROGRESS,
} = EVENTS;

export default EVENTS;
