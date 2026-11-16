/** World layout (GAME_BIBLE §5). 1 unit = 1 m, Y up, north = −Z, east = +X. */
export const WORLD_SEED = 1899;

export const WORLD = Object.freeze({
  seed: WORLD_SEED, size: 2048, half: 1024, wall: 1000, waterLevel: 2, maxHeight: 260, snowLine: 180,
  /** New game starts at dawn where the Fort Granger road enters the map. */
  start: { x: 975, z: -80, hour: 6 + 10 / 60 },
  locations: {
    copperbell: { name: 'Copperbell', x: 40, z: 60, radius: 120, type: 'town' },
    ranch: { name: 'Rourke Ranch', x: -420, z: -160, radius: 60, type: 'home' },
    blackstoneEstate: { name: 'Blackstone Estate', x: 620, z: 180, radius: 70, type: 'estate' },
    saltmesaPost: { name: 'Saltmesa Trading Post', x: -560, z: 640, radius: 60, type: 'outpost' },
    cinderHideout: { name: 'Cinder Boys hideout', x: -820, z: 860, radius: 50, type: 'hideout' },
    lumberCamp: { name: 'Greywind Lumber Camp', x: 320, z: -720, radius: 70, type: 'camp' },
    hangingOak: { name: 'Hanging Oak', x: -150, z: 380, radius: 15, type: 'landmark' },
    oldMission: { name: 'Old Mission ruins', x: 480, z: 620, radius: 30, type: 'landmark' },
    stoneArch: { name: 'Stone Arch', x: -700, z: 420, radius: 25, type: 'landmark' },
    mirrorLake: { name: 'Mirror Lake', x: -260, z: -560, radius: 70, type: 'lake' },
    fortGrangerRoad: { name: 'Fort Granger road', x: 1000, z: -80, radius: 20, type: 'edge' },
  },
  /** River control points, north to south; it fades into the salt pan at the last point. */
  river: [[120, -1000], [150, -640], [60, -380], [-10, -120], [-20, 60], [-60, 300], [-200, 560], [-420, 880]],
  waterfall: { x: 150, z: -640 },
  /** Road splines (Catmull-Rom through these points), 6 m wide. Trails are narrower dirt paths. */
  roads: [
    { id: 'fortGranger', from: 'fortGrangerRoad', to: 'copperbell', points: [[1000, -80], [820, -60], [640, -10], [420, 30], [220, 50], [40, 60]] },
    { id: 'ranchRoad', from: 'copperbell', to: 'ranch', bridge: [-16, -30], points: [[40, 60], [10, 10], [-16, -30], [-120, -90], [-280, -150], [-420, -160]] },
    { id: 'estateRoad', from: 'copperbell', to: 'blackstoneEstate', points: [[40, 60], [200, 90], [400, 140], [620, 180]] },
    { id: 'saltmesaRoad', from: 'copperbell', to: 'saltmesaPost', ford: [-76, 330], points: [[40, 60], [10, 200], [-76, 330], [-250, 470], [-420, 580], [-560, 640]] },
    { id: 'hideoutTrail', from: 'saltmesaPost', to: 'cinderHideout', trail: true, points: [[-560, 640], [-650, 740], [-760, 800], [-820, 860]] },
    { id: 'greywindRoad', from: 'copperbell', to: 'lumberCamp', switchbacks: true, points: [[40, 60], [70, -100], [110, -300], [170, -460], [230, -560], [200, -620], [280, -660], [320, -720]] },
    { id: 'lakeTrail', from: 'ranch', to: 'mirrorLake', trail: true, points: [[-420, -160], [-380, -300], [-300, -440], [-260, -560]] },
  ],
  /** Bounty regions; terrain.getRegionAt returns the nearest center. */
  regions: {
    copperbell: { name: 'Ashwater Valley', x: 0, z: 0 },
    blackstone: { name: 'Blackstone Hills', x: 620, z: 120 },
    saltmesa: { name: 'Saltmesa', x: -600, z: 650 },
    greywind: { name: 'Greywind Range', x: 180, z: -760 },
  },
});
