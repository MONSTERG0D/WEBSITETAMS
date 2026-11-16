/**
 * Base class for every game system (GAME_BIBLE §10).
 * Lifecycle: constructor(game) → init() → update()/lateUpdate() each frame → dispose().
 */
export default class System {
  constructor(game) { this.game = game; }
  /** Build meshes, register colliders, listen to events. */
  async init() {}
  /** @param {number} dt scaled seconds (rawDt × game.timeScale) @param {number} rawDt unscaled seconds, ≤ 0.05 */
  update(dt, rawDt) {}
  /** Runs after every system's update: cameras, follow-UI. */
  lateUpdate(dt, rawDt) {}
  /** @returns {object|null} JSON-safe slice for saves. */
  serialize() { return null; }
  /** Must accept missing (undefined) or older data. */
  deserialize(data) {}
  dispose() {}
}
export { System };
