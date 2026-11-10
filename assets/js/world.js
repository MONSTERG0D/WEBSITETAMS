/* =====================================================================
   THE AAMIR SHEIKH — living 3D hero
   Three.js r170 (MIT licence, assets/js/vendor/three/LICENSE.txt).

   Loaded by main.js on the home page only, after the page has painted, and
   only on devices that can run it smoothly (phones, reduced motion and
   browsers without WebGL keep the flat hero). Everything here is original
   and procedural: the city, rain, neon, steam and lightning. The heroine is
   a Blender model (assets/models/riot-heroine.glb) that drops in when it exists.

   Riot  — a neon rooftop at night, in the rain. Money Follows plays on a
           billboard inside the world.
   Noir / Village — to come; until then those themes keep the flat hero.
   ===================================================================== */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));

const QUALITY = {
  high: { dpr: 1.75, rain: 1700, buildings: 150, shadows: true, splashes: 34, steam: 16 },
  mid:  { dpr: 1.25, rain: 900,  buildings: 100, shadows: false, splashes: 22, steam: 10 },
  low:  { dpr: 1,    rain: 420,  buildings: 70,  shadows: false, splashes: 12, steam: 6 },
};

/* ---------------------------------------------------------------- small texture helpers */
function canvasTexture(w, h, draw, srgb = true) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function softDot() {
  return canvasTexture(64, 64, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.35, "rgba(255,255,255,.42)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
}
function skyTexture(stops) {
  const t = canvasTexture(4, 512, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  t.magFilter = THREE.LinearFilter;
  return t;
}
function neonSign(text, { color = "#ff0054", font = "700 120px 'Anton', Impact, sans-serif", w = 1024, h = 256, vertical = false } = {}) {
  return canvasTexture(w, h, (x) => {
    x.clearRect(0, 0, w, h);
    x.font = font; x.textAlign = "center"; x.textBaseline = "middle";
    x.shadowColor = color; x.shadowBlur = 28; x.fillStyle = color;
    if (vertical) {
      const chars = [...text], step = h / (chars.length + .5);
      chars.forEach((ch, i) => { x.fillText(ch, w / 2, step * (i + .75)); x.fillText(ch, w / 2, step * (i + .75)); });
    } else { x.fillText(text, w / 2, h / 2); x.fillText(text, w / 2, h / 2); }
    x.shadowBlur = 0; x.fillStyle = "rgba(255,255,255,.85)";
    x.font = font.replace(/\d+px/, (m) => Math.round(parseInt(m, 10) * .97) + "px");
    if (vertical) { const chars = [...text], step = h / (chars.length + .5); chars.forEach((ch, i) => x.fillText(ch, w / 2, step * (i + .75))); }
    else x.fillText(text, w / 2, h / 2);
  });
}

/* ---------------------------------------------------------------- engine */
export function createWorld(opts) {
  const host = opts.host, Q = QUALITY[opts.quality] || QUALITY.mid;
  const renderer = new THREE.WebGLRenderer({ antialias: opts.quality !== "low", powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.dpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = Q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = "w3d-canvas"; canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  scene.environment = envTex;

  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 260);
  const ctx = { THREE, scene, camera, renderer, Q, video: opts.video, root: opts.root || "", glow: softDot(), onThunder: opts.onThunder || (() => {}) };
  const worlds = {};
  let current = null, running = false, visible = true, raf = 0, t = 0;
  const clock = new THREE.Clock(false);
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  let layout = { aspect: 16 / 9 };

  function ensure(ui) {
    if (worlds[ui] !== undefined) return worlds[ui];
    worlds[ui] = ui === "riot" ? buildRiot(ctx) : null;
    return worlds[ui];
  }
  function setUI(ui) {
    Object.values(worlds).forEach((w) => { if (w) w.group.visible = false; });
    current = ensure(ui);
    if (current) { current.group.visible = true; scene.background = current.background; scene.fog = current.fog; current.layout(layout); }
    canvas.style.visibility = current ? "visible" : "hidden";
    sync();
    return !!current;
  }
  function resize() {
    const r = host.getBoundingClientRect(), w = Math.max(1, r.width | 0), h = Math.max(1, r.height | 0);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    layout = { aspect: w / h, w, h };
    if (current) current.layout(layout);
    if (!running && current) renderer.render(scene, camera);
  }
  // adaptive resolution: if frames keep running slow, render fewer pixels
  let slow = 0, dprNow = renderer.getPixelRatio();
  function frame() {
    raf = 0;
    if (!running) return;
    const raw = clock.getDelta(), dt = Math.min(raw, 0.05); t += dt;
    slow = raw > 1 / 38 ? slow + raw : Math.max(0, slow - raw * 0.5);
    if (slow > 2 && dprNow > 1) { dprNow = Math.max(1, +(dprNow - 0.25).toFixed(2)); renderer.setPixelRatio(dprNow); resize(); slow = 0; }
    pointer.sx = damp(pointer.sx, pointer.x, 3, dt); pointer.sy = damp(pointer.sy, pointer.y, 3, dt);
    if (current) { current.update(t, dt, pointer); renderer.render(scene, camera); }
    raf = requestAnimationFrame(frame);
  }
  function sync() {
    const go = !!current && visible && !document.hidden && !paused;
    if (go && !running) { running = true; clock.start(); clock.getDelta(); raf = requestAnimationFrame(frame); }
    else if (!go && running) { running = false; clock.stop(); if (raf) cancelAnimationFrame(raf); raf = 0; }
  }
  let paused = false;
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; sync(); }, { threshold: 0.01 });
  io.observe(host);
  const ro = new ResizeObserver(resize); ro.observe(host);
  const onVis = () => sync();
  document.addEventListener("visibilitychange", onVis);
  const onMove = (e) => { pointer.x = (e.clientX / window.innerWidth) * 2 - 1; pointer.y = (e.clientY / window.innerHeight) * 2 - 1; };
  window.addEventListener("pointermove", onMove, { passive: true });
  function click(clientX, clientY) {
    if (!current) return false;
    const r = canvas.getBoundingClientRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return false;
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    return current.click(ndc);
  }
  /* the Blender heroine (Draco-compressed GLB); resolves once she stands on the roof */
  function loadHeroine(url) {
    const w = ensure("riot");
    if (!w) return Promise.reject(new Error("riot world unavailable"));
    const draco = new DRACOLoader().setDecoderPath(ctx.root + "assets/js/vendor/draco/");
    const loader = new GLTFLoader().setDRACOLoader(draco);
    return loader.loadAsync(url).then((gltf) => {
      w.setHeroine(makeHeroine(gltf));
      draco.dispose();
      if (!running && current) renderer.render(scene, camera);
      return true;
    });
  }
  resize();
  return {
    setUI, click, loadHeroine,
    pause() { paused = true; sync(); }, resume() { paused = false; sync(); },
    // fixed-step render for previews and tests (stops the live loop)
    step(dt) { paused = true; sync(); if (!current) return; t += dt; pointer.sx = damp(pointer.sx, pointer.x, 3, dt); pointer.sy = damp(pointer.sy, pointer.y, 3, dt); current.update(t, dt, pointer); renderer.render(scene, camera); },
    get running() { return running; },
    destroy() {
      running = false; cancelAnimationFrame(raf); io.disconnect(); ro.disconnect();
      document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pointermove", onMove);
      Object.values(worlds).forEach((w) => w && w.dispose && w.dispose());
      envTex.dispose(); pmrem.dispose(); renderer.dispose(); canvas.remove();
    },
  };
}

/* =====================================================================
   RIOT — neon rooftop in the rain
   ===================================================================== */
function buildRiot(ctx) {
  const { scene, camera, Q } = ctx;
  const g = new THREE.Group(); g.name = "riot"; scene.add(g);
  const PINK = 0xff0054, LIME = 0x9eff00, CYAN = 0x35d0ff;
  const disposables = [];
  const keep = (o) => { disposables.push(o); return o; };

  const background = keep(skyTexture([[0, "#030308"], [.42, "#0d0718"], [.62, "#2a0c2c"], [.72, "#3d1230"], [.8, "#160814"], [1, "#07050b"]]));
  const fog = new THREE.FogExp2(0x150a1c, 0.026);

  /* lights */
  const hemi = new THREE.HemisphereLight(0x6a4aa0, 0x050308, 0.55); g.add(hemi);
  const amb = new THREE.AmbientLight(0x2a1838, 0.35); g.add(amb);
  const key = new THREE.DirectionalLight(0xc8d8ff, 1.2); key.position.set(-4, 7, 6);
  if (Q.shadows) { key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -6; key.shadow.camera.right = 6; key.shadow.camera.top = 6; key.shadow.camera.bottom = -2; key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02; }
  g.add(key); g.add(key.target); key.target.position.set(1, 0, 0);
  const rimPink = new THREE.PointLight(PINK, 40, 14, 2); rimPink.position.set(3.4, 2.6, -1.6); g.add(rimPink);
  const rimLime = new THREE.PointLight(LIME, 16, 10, 2); rimLime.position.set(-1.0, 2.0, -1.8); g.add(rimLime);
  const cyanFill = new THREE.PointLight(CYAN, 26, 22, 2); cyanFill.position.set(-5.5, 3.2, -6); g.add(cyanFill);
  const boardLight = new THREE.PointLight(0xffd0e0, 22, 9, 2); boardLight.position.set(3.9, 3.0, -4.2); g.add(boardLight);

  /* wet rooftop: smooth puddles in a rougher deck */
  const rough = keep(canvasTexture(512, 512, (x, w, h) => {
    x.fillStyle = "rgb(176,176,176)"; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { const v = 140 + Math.random() * 80 | 0; x.fillStyle = `rgba(${v},${v},${v},.35)`; x.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 2 + Math.random() * 6); }
    for (let i = 0; i < 8; i++) { const px = Math.random() * w, py = Math.random() * h, r = 20 + Math.random() * 70, gr = x.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, "rgba(105,105,105,.8)"); gr.addColorStop(.6, "rgba(105,105,105,.4)"); gr.addColorStop(1, "rgba(105,105,105,0)"); x.fillStyle = gr; x.beginPath(); x.ellipse(px, py, r * 1.6, r * rand(.18, .45), Math.random() * 3, 0, Math.PI * 2); x.fill(); }
    x.strokeStyle = "rgba(110,110,110,.35)"; x.lineWidth = 2;
    for (let i = 0; i <= 8; i++) { x.beginPath(); x.moveTo(i * w / 8, 0); x.lineTo(i * w / 8, h); x.stroke(); x.beginPath(); x.moveTo(0, i * h / 8); x.lineTo(w, i * h / 8); x.stroke(); }
  }, false));
  rough.wrapS = rough.wrapT = THREE.RepeatWrapping; rough.repeat.set(5, 5);
  const floorMat = keep(new THREE.MeshStandardMaterial({ color: 0x0b0b10, roughness: 1, roughnessMap: rough, metalness: 0.05, envMapIntensity: 1.0 }));
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(36, 36)), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.name = "floor"; g.add(floor);

  /* parapet, railing and rooftop props */
  const concrete = keep(new THREE.MeshStandardMaterial({ color: 0x15141b, roughness: 0.85 }));
  const steel = keep(new THREE.MeshStandardMaterial({ color: 0x23232c, roughness: 0.45, metalness: 0.7 }));
  const wall = new THREE.Mesh(keep(new THREE.BoxGeometry(26, 0.9, 0.35)), concrete); wall.position.set(0, 0.45, -3.2); wall.castShadow = wall.receiveShadow = true; g.add(wall);
  const sideL = new THREE.Mesh(keep(new THREE.BoxGeometry(0.35, 0.9, 12)), concrete); sideL.position.set(-8, 0.45, 2.6); g.add(sideL);
  const railGeo = keep(new THREE.CylinderGeometry(0.03, 0.03, 26, 8)); railGeo.rotateZ(Math.PI / 2);
  [1.25, 1.65].forEach((y) => { const r = new THREE.Mesh(railGeo, steel); r.position.set(0, y, -3.2); g.add(r); });
  const postGeo = keep(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 8));
  for (let x = -12; x <= 12; x += 1.6) { const p = new THREE.Mesh(postGeo, steel); p.position.set(x, 1.3, -3.2); g.add(p); }
  // AC units with a vent (steam source)
  const acGeo = keep(new THREE.BoxGeometry(1.3, 0.85, 0.9));
  [[-3.4, -1.9], [-5.0, -1.4]].forEach(([x, z], i) => { const ac = new THREE.Mesh(acGeo, steel); ac.position.set(x, 0.425, z); ac.rotation.y = i ? 0.3 : -0.1; ac.castShadow = ac.receiveShadow = true; g.add(ac); });
  const fanGeo = keep(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 20));
  const fan = new THREE.Mesh(fanGeo, keep(new THREE.MeshStandardMaterial({ color: 0x0d0d12, roughness: .6, metalness: .4 }))); fan.position.set(-3.4, 0.88, -1.9); g.add(fan);
  // water tank silhouette
  const tank = new THREE.Group();
  const tankBody = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.1, 1.1, 2.0, 24)), keep(new THREE.MeshStandardMaterial({ color: 0x1b1418, roughness: .9 })));
  tankBody.position.y = 3.0; tank.add(tankBody);
  const tankRoof = new THREE.Mesh(keep(new THREE.ConeGeometry(1.2, 0.7, 24)), steel); tankRoof.position.y = 4.35; tank.add(tankRoof);
  const legGeo = keep(new THREE.CylinderGeometry(0.06, 0.06, 2.0, 6));
  [[.75, .75], [-.75, .75], [.75, -.75], [-.75, -.75]].forEach(([x, z]) => { const l = new THREE.Mesh(legGeo, steel); l.position.set(x, 1.0, z); tank.add(l); });
  tank.position.set(-6.8, 0, -5.2); g.add(tank);
  // antenna with a blinking warning light
  const ant = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.03, 0.05, 4.2, 6)), steel); ant.position.set(-4.4, 2.1, -4.0); g.add(ant);
  const blinkMat = keep(new THREE.SpriteMaterial({ map: ctx.glow, color: 0xff2a2a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const blink = new THREE.Sprite(blinkMat); blink.scale.set(.45, .45, 1); blink.position.set(-4.4, 4.25, -4.0); g.add(blink);

  /* billboard with Money Follows playing inside the world */
  const board = new THREE.Group();
  const frame = new THREE.Mesh(keep(new THREE.BoxGeometry(2.05, 3.5, 0.14)), steel); frame.position.z = -0.08; board.add(frame);
  let screenMat;
  if (ctx.video) {
    const vt = keep(new THREE.VideoTexture(ctx.video)); vt.colorSpace = THREE.SRGBColorSpace;
    screenMat = keep(new THREE.MeshBasicMaterial({ map: vt, toneMapped: false }));
  } else screenMat = keep(new THREE.MeshBasicMaterial({ color: 0x220012 }));
  const screen = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.8, 3.2)), screenMat); screen.name = "billboard"; board.add(screen);
  const boardGlow = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: ctx.glow, color: 0xff7ab0, transparent: true, opacity: .28, blending: THREE.AdditiveBlending, depthWrite: false })));
  boardGlow.scale.set(5.5, 6.5, 1); boardGlow.position.z = -0.2; board.add(boardGlow);
  const boardLegGeo = keep(new THREE.BoxGeometry(0.12, 2.2, 0.12));
  [-.7, .7].forEach((x) => { const l = new THREE.Mesh(boardLegGeo, steel); l.position.set(x, -2.7, -0.1); board.add(l); });
  const plate = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.0, 0.36)), keep(new THREE.MeshBasicMaterial({ map: keep(neonSign("MONEY FOLLOWS ▶", { color: "#ff0054", font: "700 96px 'Anton', Impact, sans-serif", w: 1024, h: 180 })), transparent: true, toneMapped: false, depthWrite: false })));
  plate.position.set(0, -1.86, 0.02); board.add(plate);
  board.position.set(6.2, 3.3, -9.5); board.rotation.y = -0.42; board.scale.setScalar(0.95); g.add(board);

  /* the city: one draw call, windows drawn in the shader from world position */
  const N = Q.buildings, bGeo = keep(new THREE.BoxGeometry(1, 1, 1)); bGeo.translate(0, 0.5, 0);
  const bMat = keep(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFog: { value: new THREE.Color(0x150a1c) }, uDensity: { value: 0.013 } },
    vertexShader: `
      varying vec3 vW; varying vec3 vN; varying float vDepth; varying vec3 vSeed;
      void main(){
        vec4 w = modelMatrix * instanceMatrix * vec4(position,1.0);
        vW = w.xyz; vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        vSeed = (modelMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
        vec4 mv = viewMatrix * w; vDepth = -mv.z; gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uFog; uniform float uDensity;
      varying vec3 vW; varying vec3 vN; varying float vDepth; varying vec3 vSeed;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      void main(){
        vec3 wall = vec3(0.010,0.009,0.016);
        vec3 col = wall;
        if (abs(vN.y) < 0.5) {
          float u = (abs(vN.x) > 0.5 ? vW.z : vW.x) * 1.15;
          vec2 cell = floor(vec2(u, vW.y * 0.95)); vec2 f = fract(vec2(u, vW.y * 0.95));
          float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.22, f.y) * step(f.y, 0.72);
          float r = h(cell + vSeed.xz * 0.37);
          float lit = step(0.62, r);
          float flick = step(0.995, h(cell + floor(uTime * 0.7) + vSeed.xz));
          vec3 wc = r > 0.97 ? vec3(1.0,0.2,0.45) : r > 0.94 ? vec3(0.3,0.85,1.0) : r > 0.925 ? vec3(0.65,1.0,0.25) : mix(vec3(1.0,0.78,0.5), vec3(0.85,0.9,1.0), h(cell.yx));
          col = mix(wall, wc * (0.28 + 0.32 * r), win * clamp(lit - flick, 0.0, 1.0));
        } else col = vec3(0.008,0.007,0.012);
        float fogF = 1.0 - exp(-uDensity * uDensity * vDepth * vDepth);
        gl_FragColor = vec4(mix(col, uFog, fogF), 1.0);
        #include <colorspace_fragment>
      }`,
    fog: false,
  }));
  const city = new THREE.InstancedMesh(bGeo, bMat, N); city.frustumCulled = false;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  let i = 0, tries = 0;
  while (i < N && tries++ < N * 20) {
    const ang = rand(-1.25, 1.25) + Math.PI, dist = rand(26, 125);
    const x = Math.sin(ang) * dist * 1.25, z = Math.cos(ang) * dist - 4;
    if (z > -24 && Math.abs(x) < 28) continue;
    const w = rand(3, 8), d = rand(3, 8), hgt = rand(10, 44) * (dist > 70 ? 1.2 : 1);
    ps.set(x, -36, z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(-.25, .25)); sc.set(w, hgt, d);
    city.setMatrixAt(i++, m4.compose(ps, q, sc));
  }
  city.count = i; g.add(city);

  /* neon signs on the nearest towers */
  const signs = [];
  function addSign(tex, w, h, pos, rotY, color, glowScale) {
    const m = keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    const s = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h)), m); s.position.copy(pos); s.rotation.y = rotY; g.add(s);
    const gl = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: ctx.glow, color, transparent: true, opacity: .32, blending: THREE.AdditiveBlending, depthWrite: false })));
    gl.scale.set(w * glowScale, h * glowScale, 1); gl.position.copy(pos); gl.position.z -= .05; g.add(gl);
    signs.push({ m, gl, base: .32, next: rand(2, 9), off: 0 });
  }
  addSign(keep(neonSign("ザ・アーミル", { color: "#ff0054", font: "900 150px 'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif", w: 256, h: 1024, vertical: true })), 1.5, 6, new THREE.Vector3(10.5, 5.0, -17), -0.4, PINK, 2.2);
  addSign(keep(neonSign("TAS", { color: "#9eff00", font: "italic 700 200px 'Caveat', 'Segoe Print', cursive", w: 512, h: 256 })), 3.4, 1.7, new THREE.Vector3(-7.5, 9.0, -30), 0.35, LIME, 2.0);
  addSign(keep(neonSign("RIOT", { color: "#35d0ff", font: "700 190px 'Anton', Impact, sans-serif", w: 1024, h: 256 })), 5.6, 1.4, new THREE.Vector3(8.5, 7.6, -27), -0.35, CYAN, 1.8);

  /* rain — positions computed in the shader (no per-frame CPU work) */
  const R = Q.rain, seeds = new Float32Array(R * 2 * 4), ends = new Float32Array(R * 2), dummy = new Float32Array(R * 2 * 3);
  for (let k = 0; k < R; k++) {
    const x = rand(-10, 10), y = rand(0, 11), z = rand(-9, 6), s = rand(8, 12);
    for (let e = 0; e < 2; e++) { const o = (k * 2 + e); seeds.set([x, y, z, s], o * 4); ends[o] = e; }
  }
  const rGeo = keep(new THREE.BufferGeometry());
  rGeo.setAttribute("position", new THREE.BufferAttribute(dummy, 3));
  rGeo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
  rGeo.setAttribute("aEnd", new THREE.BufferAttribute(ends, 1));
  const rMat = keep(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uWind: { value: 1 } },
    vertexShader: `
      attribute vec4 aSeed; attribute float aEnd; uniform float uTime; uniform float uWind;
      varying float vA;
      void main(){
        float y = mod(aSeed.y - uTime * aSeed.w, 11.0);
        vec3 p = vec3(aSeed.x + uWind * 0.06 * (11.0 - y), y, aSeed.z);
        p.y += aEnd * 0.36; p.x -= aEnd * uWind * 0.03;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = mix(0.55, 0.0, aEnd) * smoothstep(34.0, 3.0, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(0.78, 0.86, 1.0, vA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const rain = new THREE.LineSegments(rGeo, rMat); rain.frustumCulled = false; g.add(rain);

  /* splashes on the wet floor */
  const ringGeo = keep(new THREE.RingGeometry(0.04, 0.06, 20)); ringGeo.rotateX(-Math.PI / 2);
  const splashes = [];
  for (let k = 0; k < Q.splashes; k++) {
    const m = keep(new THREE.MeshBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    const s = new THREE.Mesh(ringGeo, m); s.position.y = 0.012; g.add(s); splashes.push({ s, m, age: rand(0, .5), life: rand(.35, .6) });
  }
  function respawn(sp, x, z) { sp.s.position.x = x !== undefined ? x : rand(-5.5, 6); sp.s.position.z = z !== undefined ? z : rand(-2.8, 3.5); sp.age = 0; sp.life = rand(.35, .6); }

  /* steam from the AC vent */
  const steamMat = keep(new THREE.SpriteMaterial({ map: ctx.glow, color: 0xb9a8e8, transparent: true, opacity: .1, depthWrite: false }));
  const steam = [];
  for (let k = 0; k < Q.steam; k++) { const sp = new THREE.Sprite(steamMat.clone()); keep(sp.material); g.add(sp); steam.push({ sp, age: k / Q.steam * 4, life: 4 }); }

  /* lightning: a sheet of light behind the city */
  const flashMat = keep(new THREE.MeshBasicMaterial({ color: 0xd9ccff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  const flash = new THREE.Mesh(keep(new THREE.PlaneGeometry(400, 160)), flashMat); flash.position.set(0, 40, -120); g.add(flash);
  let nextBolt = rand(9, 18), bolt = -1;

  /* camera framing per screen shape */
  const focus = new THREE.Vector3(1.0, 1.35, 0), camBase = new THREE.Vector3(0, 1.6, 7.4), heroSpot = new THREE.Vector3(1.7, 0, 0.4);
  function layout(L) {
    const a = L.aspect || 1.6;
    if (a >= 1.55) { heroSpot.set(2.1, 0, 0.4); focus.set(1.3, 1.05, 0); camBase.set(0, 1.35, 5.6); camera.fov = 32; }
    else if (a >= 1.15) { heroSpot.set(1.6, 0, 0.4); focus.set(1.0, 1.1, 0); camBase.set(0, 1.4, 6.4); camera.fov = 34; }
    else { heroSpot.set(0.6, 0, 0.6); focus.set(0.5, 1.2, 0); camBase.set(0, 1.5, 7.8); camera.fov = 40; }
    camera.updateProjectionMatrix();
    if (heroine) heroine.position.copy(heroSpot);
  }
  let heroine = null;

  /* the living loop */
  const tmp = new THREE.Vector3();
  function update(t, dt, pointer) {
    // camera drifts with the mouse and a slow breath
    tmp.set(camBase.x + pointer.sx * 0.55 + Math.sin(t * 0.13) * 0.12, camBase.y - pointer.sy * 0.22 + Math.sin(t * 0.21) * 0.05, camBase.z);
    camera.position.lerp(tmp, 1 - Math.exp(-4 * dt));
    camera.lookAt(focus.x + pointer.sx * 0.15, focus.y - pointer.sy * 0.08, focus.z);
    // wind gusts
    const wind = 1 + Math.sin(t * 0.35) * 0.5 + Math.sin(t * 1.3) * 0.2;
    rMat.uniforms.uTime.value = t; rMat.uniforms.uWind.value = wind;
    bMat.uniforms.uTime.value = t;
    fan.rotation.y += dt * 6;
    // splashes
    splashes.forEach((sp) => { sp.age += dt; if (sp.age > sp.life) respawn(sp); const k = sp.age / sp.life; const s = 1 + k * 3.2; sp.s.scale.set(s, 1, s); sp.m.opacity = (1 - k) * 0.12; });
    // steam
    steam.forEach((st) => { st.age += dt; if (st.age > st.life) st.age = 0; const k = st.age / st.life; st.sp.position.set(-3.4 + wind * k * 0.9 + Math.sin(st.age * 2 + st.life) * .1, 0.95 + k * 2.6, -1.9 - k * 0.4); const s = 0.6 + k * 2.2; st.sp.scale.set(s, s, 1); st.sp.material.opacity = Math.sin(k * Math.PI) * 0.13; });
    // antenna blink
    blinkMat.opacity = (t % 1.6) < 0.18 ? 1 : 0.08;
    // neon flicker
    signs.forEach((s) => { s.next -= dt; if (s.next <= 0) { s.off = rand(.05, .22); s.next = rand(3, 11); } if (s.off > 0) { s.off -= dt; const on = Math.random() > .5; s.m.opacity = on ? 1 : .25; s.gl.material.opacity = on ? s.base : .05; } else { s.m.opacity = 1; s.gl.material.opacity = s.base + Math.sin(t * 3 + s.base) * .03; } });
    // lightning
    nextBolt -= dt;
    if (nextBolt <= 0) { strike(); nextBolt = rand(14, 28); }
    if (bolt >= 0) {
      bolt += dt;
      const f = bolt < .07 ? 1 : bolt < .14 ? .2 : bolt < .22 ? .85 : Math.max(0, 1 - (bolt - .22) * 3);
      flashMat.opacity = f * .55; hemi.intensity = .55 + f * 2.4;
      if (bolt > .6) { bolt = -1; flashMat.opacity = 0; hemi.intensity = .55; }
    }
    if (heroine && heroine.userData.update) heroine.userData.update(t, dt, pointer, wind);
  }
  function strike() { bolt = 0; ctx.onThunder(); }

  /* clicks: lightning + a burst of splashes where you clicked on the roof */
  const ray = new THREE.Raycaster();
  function click(ndc) {
    ray.setFromCamera(ndc, camera);
    if (heroine && heroine.userData.hit && ray.intersectObject(heroine, true).length) { heroine.userData.action && heroine.userData.action(); return true; }
    const hit = ray.intersectObject(floor, false)[0];
    if (hit) { for (let k = 0; k < Math.min(8, splashes.length); k++) respawn(splashes[k], hit.point.x + rand(-.25, .25), hit.point.z + rand(-.25, .25)); }
    strike(); nextBolt = rand(14, 28);
    return true;
  }

  return {
    group: g, background, fog, layout, update, click,
    setHeroine(obj) { if (heroine) g.remove(heroine); heroine = obj; if (obj) { obj.position.copy(heroSpot); g.add(obj); } },
    dispose() { disposables.forEach((d) => d.dispose && d.dispose()); scene.remove(g); },
  };
}

/* =====================================================================
   HEROINE — original Blender model, alive on the roof: holds her stance,
   breathes, follows the pointer with her eyes, hair and coat move in the
   wind (vertex shader, weight baked in Blender), click her for a slash.
   ===================================================================== */
function windShader(U, hair) {
  // hair streams out to her left; the coat tails fly out behind her and ripple
  const amp = hair ? "0.42" : "0.6", dir = hair ? "vec3(0.88, 0.24, -0.34)" : "vec3(0.78, 0.22, -0.62)";
  const spd = hair ? "2.4" : "2.0", flare = hair ? "0.04" : "0.2", sway = hair ? "0.03" : "0.06";
  return (sh) => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uWind = U.uWind;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 aWind;\nuniform float uTime;\nuniform float uWind;\nvarying float vWind;")
      .replace("#include <skinning_vertex>", `#include <skinning_vertex>
        float wk = clamp(aWind.x, 0.0, 1.0); vWind = wk;
        float wph = uTime * ${spd} - wk * 6.0 + position.x * 3.0 + position.z * 2.0;
        float wg = uWind * (0.78 + 0.22 * sin(wph));
        float wk15 = wk * sqrt(wk);
        transformed += ${dir} * wk15 * ${amp} * wg;
        transformed.xz += normalize(position.xz + vec2(1e-4)) * wk * ${flare} * wg;
        transformed.y += sin(wph * 1.7) * ${sway} * wk * uWind;
        transformed.z += sin(wph * 1.3 + 1.0) * ${sway} * wk * uWind;`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vWind;");
    if (hair) sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>",
      "#include <map_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.0, 0.014), smoothstep(0.62, 1.0, vWind) * 0.85);");
  };
}

function makeHeroine(gltf) {
  const model = gltf.scene;
  const wrap = new THREE.Group(); wrap.name = "heroine"; wrap.add(model);
  wrap.scale.setScalar(0.86); wrap.rotation.y = -0.28;
  const U = { uTime: { value: 0 }, uWind: { value: 1 } };
  let edgeMat = null;
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    const geo = o.geometry, wind = !!geo.getAttribute("color");
    if (wind) { geo.setAttribute("aWind", geo.getAttribute("color")); geo.deleteAttribute("color"); }
    const fix = (m) => {
      const name = m.name || "";
      m.vertexColors = false;
      if (/long01|eyebrow|eyelash/i.test(name)) { m.transparent = false; m.alphaTest = 0.5; m.depthWrite = true; m.side = THREE.DoubleSide; }
      else if (m.transparent) { m.transparent = false; m.depthWrite = true; }
      if (name === "Heroine.body") m.color.setRGB(1.0, 0.88, 0.8);
      if (name === "tas_edge") edgeMat = m;
      if (!wind) return m;
      const w = m.clone(), hair = /long01/i.test(name);
      w.onBeforeCompile = windShader(U, hair);
      w.customProgramCacheKey = () => "tas-wind-" + (hair ? "hair" : "cloth");
      return w;
    };
    o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material);
  });
  const bone = (n) => model.getObjectByName("mixamorig" + n);
  const B = { hips: bone("Hips"), sp1: bone("Spine1"), sp2: bone("Spine2"), neck: bone("Neck"), head: bone("Head"), lArm: bone("LeftArm"), rArm: bone("RightArm"), rFore: bone("RightForeArm") };
  // the stance is a one-frame clip: apply it once, remember it, and rebuild from it every frame
  const mixer = new THREE.AnimationMixer(model);
  const clip = gltf.animations.find((a) => a.name === "stance") || gltf.animations[0];
  if (clip) { mixer.clipAction(clip).play(); mixer.update(0); }
  const rest = [];
  model.traverse((o) => { if (o.isBone) rest.push([o, o.quaternion.clone(), o.position.clone()]); });
  const e = new THREE.Euler(), q = new THREE.Quaternion();
  const turn = (b, x, y, z) => { if (!b) return; e.set(x, y, z); q.setFromEuler(e); b.quaternion.multiply(q); };
  const look = { x: 0, y: 0 };
  let slash = -1;
  wrap.userData.hit = true;
  wrap.userData.action = () => { if (slash < 0) slash = 0; };
  wrap.userData.update = (t, dt, pointer, wind) => {
    U.uTime.value = t; U.uWind.value = 0.78 + 0.22 * wind;
    for (let i = 0; i < rest.length; i++) { rest[i][0].quaternion.copy(rest[i][1]); rest[i][0].position.copy(rest[i][2]); }
    const br = Math.sin(t * 1.5);
    turn(B.sp1, br * 0.012, 0, 0); turn(B.sp2, br * 0.02, 0, 0); turn(B.neck, -br * 0.01, 0, 0);
    if (B.hips) B.hips.position.y += Math.sin(t * 1.5 + 0.6) * 0.006;
    look.x = damp(look.x, pointer.sx, 2.2, dt); look.y = damp(look.y, pointer.sy, 2.2, dt);
    turn(B.neck, look.y * 0.05, -look.x * 0.12, 0); turn(B.head, look.y * 0.14, -look.x * 0.3, 0);
    turn(B.lArm, 0, 0, Math.sin(t * 0.8) * 0.035);
    turn(B.rFore, Math.sin(t * 0.9 + 1.0) * 0.025, 0, 0);
    if (slash >= 0) {
      slash += dt; const k = Math.min(1, slash / 0.55), s = Math.sin(k * Math.PI);
      turn(B.rArm, 0, 0, s * 0.55); turn(B.rFore, 0, 0, s * 0.25);
      if (edgeMat) edgeMat.emissiveIntensity = 6 + s * 22;
      if (k >= 1) { slash = -1; if (edgeMat) edgeMat.emissiveIntensity = 6; }
    }
  };
  return wrap;
}
