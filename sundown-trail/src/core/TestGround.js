import * as THREE from 'three';
import { RNG } from './utils/rng.js';

/** Flat 600 m test ground with a 1 m grid and a few obstacles. Installed by the terrain fallback until Part 1 exists. */
export class TestGround {
  constructor(game) { this.game = game; this.objects = []; this.colliders = []; this.disposables = []; this.interactables = []; }
  build() {
    const g = this.game, size = 600;
    const tex = this._groundTexture();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(size / 10, size / 10);
    tex.anisotropy = Math.min(8, g.renderer.capabilities.getMaxAnisotropy()); tex.colorSpace = THREE.SRGBColorSpace;
    const groundGeo = new THREE.PlaneGeometry(size, size), groundMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.name = 'TestGround';
    this._add(ground); this.disposables.push(tex, groundGeo, groundMat);
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5534, roughness: 0.85 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x8c8378, roughness: 0.9 });
    this.disposables.push(wood, stone);
    const box = (x, z, sx, sy, sz, rot = 0, mat = wood, surface = 'wood') => {
      const geo = new THREE.BoxGeometry(sx, sy, sz), m = new THREE.Mesh(geo, mat);
      m.position.set(x, sy / 2, z); m.rotation.y = rot; m.castShadow = m.receiveShadow = true;
      this._add(m); this.disposables.push(geo);
      this.colliders.push(g.physics.addCollider({ type: 'box', position: m.position, size: new THREE.Vector3(sx, sy, sz), rotationY: rot, surface, object: m }));
    };
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; box(Math.cos(a) * 14, Math.sin(a) * 14 - 14, 1.2, 1.2, 1.2, a); }
    for (let s = 0; s < 6; s++) box(10 + s * 0.8, 8, 0.8, 0.3 * (s + 1), 3, 0, stone, 'rock');
    box(15.2, 8, 3, 1.8, 3, 0, stone, 'rock');
    box(-12, 10, 12, 2.4, 0.6, 0, stone, 'rock');
    box(-20, -4, 8, 2.4, 0.6, Math.PI / 4, stone, 'rock');
    const postGeo = new THREE.CylinderGeometry(0.15, 0.18, 2.2, 10); this.disposables.push(postGeo);
    for (let i = 0; i < 5; i++) {
      const post = new THREE.Mesh(postGeo, wood);
      post.position.set(-6 + i * 3, 1.1, -26); post.castShadow = true; this._add(post);
      this.colliders.push(g.physics.addCollider({ type: 'cylinder', position: new THREE.Vector3(post.position.x, 0, post.position.z), radius: 0.18, height: 2.2, surface: 'wood' }));
    }
    this._sign(0, -3, 'Test ground', 'Terrain arrives in Part 1');
  }
  dispose() {
    for (const o of this.objects) o.removeFromParent();
    for (const c of this.colliders) this.game.physics.removeCollider(c);
    for (const h of this.interactables) this.game.interact.unregister(h);
    for (const d of this.disposables) d.dispose?.();
    this.objects.length = 0; this.colliders.length = 0; this.disposables.length = 0;
  }
  _add(o) { this.game.scene.add(o); this.objects.push(o); }
  _groundTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const x = c.getContext('2d'), rng = new RNG('test-ground');
    x.fillStyle = '#9c8a5a'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = `rgba(${90 + rng.int(0, 60)},${80 + rng.int(0, 50)},${40 + rng.int(0, 30)},0.18)`;
      x.fillRect(rng.range(0, 512), rng.range(0, 512), rng.range(2, 8), rng.range(2, 8));
    }
    x.strokeStyle = 'rgba(40,28,15,0.25)'; x.lineWidth = 1;
    for (let i = 0; i <= 10; i++) { const p = i * 51.2; x.beginPath(); x.moveTo(p, 0); x.lineTo(p, 512); x.moveTo(0, p); x.lineTo(512, p); x.stroke(); }
    x.strokeStyle = 'rgba(40,28,15,0.55)'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, 509, 509);
    return new THREE.CanvasTexture(c);
  }
  _sign(x, z, title, line) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#6b4a2f'; ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = '#3a2716'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, 502, 246);
    ctx.fillStyle = '#efe2c2'; ctx.textAlign = 'center';
    ctx.font = '64px Rye, Georgia, serif'; ctx.fillText(title, 256, 115);
    ctx.font = 'italic 30px Georgia, serif'; ctx.fillText(line, 256, 185);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const boardGeo = new THREE.BoxGeometry(2.6, 1.3, 0.08), boardMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    const board = new THREE.Mesh(boardGeo, boardMat); board.position.set(x, 1.7, z); board.castShadow = true; this._add(board);
    const legGeo = new THREE.BoxGeometry(0.12, 2.3, 0.12), legMat = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.9 });
    for (const dx of [-1.1, 1.1]) { const leg = new THREE.Mesh(legGeo, legMat); leg.position.set(x + dx, 1.15, z - 0.07); leg.castShadow = true; this._add(leg); }
    this.disposables.push(tex, boardGeo, boardMat, legGeo, legMat);
    this.colliders.push(this.game.physics.addCollider({ type: 'box', position: new THREE.Vector3(x, 1.15, z), size: new THREE.Vector3(2.6, 2.3, 0.3), surface: 'wood' }));
    this.interactables.push(this.game.interact.register({
      position: new THREE.Vector3(x, 0, z + 1.2), radius: 2.4, label: 'Read the sign',
      onInteract: (g) => g.ui.notify('This grid is temporary. Part 1 replaces it with Ashwater County.'),
    }));
  }
}
