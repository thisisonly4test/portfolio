import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { fitDistance, fovFor, mapDots, type Pt, type Quad, type Shot, type Vec3 } from './geometry';

/**
 * La pièce de whiterose, reconstruite en 3D d'après `terminal.webp` : un
 * bureau en bois dans le noir, une lampe d'architecte, un moniteur CRT vert,
 * une carte du monde en points lumineux au mur, une bibliothèque dans
 * l'ombre. Tout est généré : net à n'importe quel zoom, rien à télécharger.
 */

export interface Room {
  canvas: HTMLCanvasElement;
  shots: { room: () => Shot; screen: () => Shot; wall: () => Shot };
  /** Place la caméra et dessine une image. `t` en secondes. */
  render: (shot: Shot, t: number) => void;
  /** Coins du verre de l'écran, en pixels de la fenêtre, pour la dernière image. */
  screenQuad: () => Quad;
  /** Taille de l'écran à l'écran, en plan serré : la taille naturelle du terminal HTML. */
  screenBox: () => { w: number; h: number };
  project: (p: Vec3) => Pt;
  /** `text` : l'écran affiche un journal ; `off` : tube éteint, sous le terminal HTML. */
  setScreen: (mode: 'text' | 'off') => void;
  /** La machine peine : on coupe le halo lumineux, puis on baisse la résolution. */
  degrade: () => void;
  resize: (w: number, h: number) => void;
  dispose: () => void;
}

export function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Textures peintes au canvas
// ---------------------------------------------------------------------------

function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Plâtre sombre, taché, un peu verdâtre. */
function plaster() {
  const r = rand(7);
  return canvasTexture(1024, 512, (g) => {
    g.fillStyle = '#3a3a2f';
    g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 2600; i++) {
      const x = r() * 1024;
      const y = r() * 512;
      const s = 4 + r() * 60;
      g.fillStyle = `rgba(${r() < 0.5 ? '20,20,14' : '80,78,62'},${0.025 + r() * 0.05})`;
      g.beginPath();
      g.arc(x, y, s, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 40000; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 230},0.035)`;
      g.fillRect(r() * 1024, r() * 512, 1.5, 1.5);
    }
  });
}

/** Bois du bureau : veines longues, vernis usé. */
function wood() {
  const r = rand(11);
  return canvasTexture(1024, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#6b4528');
    grad.addColorStop(1, '#5a3820');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 256);
    for (let i = 0; i < 220; i++) {
      const y = r() * 256;
      g.strokeStyle = `rgba(${r() < 0.6 ? '35,18,8' : '140,95,55'},${0.08 + r() * 0.18})`;
      g.lineWidth = 0.6 + r() * 2.2;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= 1024; x += 32) g.lineTo(x, y + Math.sin(x / (60 + r() * 90) + i) * (2 + r() * 4));
      g.stroke();
    }
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(20,10,4,${0.05 + r() * 0.1})`;
      g.beginPath();
      g.ellipse(r() * 1024, r() * 256, 10 + r() * 50, 2 + r() * 6, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Le journal vert du moniteur, comme sur la photo : lignes serrées, un bloc plus clair en bas. */
function screenLog() {
  const r = rand(23);
  const words = ['sshd', 'kernel', 'iptables', 'ACCEPT', 'DROP', 'tcp', 'udp', 'eth0', 'tun0', 'wr-node', 'auth', 'session', 'opened', 'closed', '0x', 'relay', 'sync', 'ok'];
  const hex = () => Math.floor(r() * 0xffff).toString(16).padStart(4, '0');
  return canvasTexture(768, 576, (g) => {
    const grad = g.createRadialGradient(384, 260, 40, 384, 288, 520);
    grad.addColorStop(0, '#36d295');
    grad.addColorStop(0.6, '#1f9e6c');
    grad.addColorStop(1, '#0c5136');
    g.fillStyle = grad;
    g.fillRect(0, 0, 768, 576);
    g.fillStyle = 'rgba(210,255,232,0.16)';
    g.fillRect(0, 400, 768, 150);
    g.font = '15px "IBM Plex Mono", monospace';
    g.fillStyle = 'rgba(236,255,244,0.92)';
    g.shadowColor = 'rgba(200,255,225,0.9)';
    g.shadowBlur = 6;
    for (let y = 42; y < 556; y += 19) {
      let line = `${hex()}  ${hex()}  `;
      const n = 2 + Math.floor(r() * 7);
      for (let i = 0; i < n; i++) line += `${words[Math.floor(r() * words.length)]} `;
      if (r() < 0.3) line += `${Math.floor(r() * 255)}.${Math.floor(r() * 255)}.0.${Math.floor(r() * 255)}`;
      g.fillText(line.slice(0, 20 + Math.floor(r() * 60)), 34, y);
    }
    g.shadowBlur = 0;
    for (let y = 0; y < 576; y += 3) {
      g.fillStyle = 'rgba(0,30,15,0.12)';
      g.fillRect(0, y, 768, 1);
    }
  });
}

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// ---------------------------------------------------------------------------
// La pièce
// ---------------------------------------------------------------------------

const SCREEN_W = 0.4;
const SCREEN_H = 0.305;

export function createRoom(opts: { mobile: boolean }): Room {
  const canvas = document.createElement('canvas');
  canvas.className = 'wr-canvas';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.mobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x050504);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b0a07, 0.06);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.02, 30);
  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);

  const mat = (p: THREE.MeshStandardMaterialParameters) => keep(new THREE.MeshStandardMaterial(p));
  const box = (w: number, h: number, d: number) => keep(new THREE.BoxGeometry(w, h, d));
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, shadow = true) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = shadow;
    o.receiveShadow = true;
    return o;
  };

  // ---------- murs, sol ----------
  const plasterTex = keep(plaster());
  plasterTex.wrapS = plasterTex.wrapT = THREE.RepeatWrapping;
  plasterTex.repeat.set(2, 1);
  const wallMat = mat({ map: plasterTex, roughness: 0.95, metalness: 0 });
  scene.add(mesh(keep(new THREE.PlaneGeometry(9, 4.2)), wallMat, 0.3, 2.1, 0, false));
  const side = mesh(keep(new THREE.PlaneGeometry(5, 4.2)), wallMat, 2.9, 2.1, 2.5, false);
  side.rotation.y = -Math.PI / 2;
  scene.add(side);
  const floor = mesh(keep(new THREE.PlaneGeometry(9, 6)), mat({ color: 0x15100b, roughness: 0.9 }), 0.3, 0, 3, false);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // ---------- bureau ----------
  const woodTex = keep(wood());
  const deskMat = mat({ map: woodTex, roughness: 0.62, metalness: 0.02 });
  const desk = new THREE.Group();
  desk.add(mesh(box(3.0, 0.045, 0.85), deskMat, 0.3, 0.737, 0.55));
  desk.add(mesh(box(3.0, 0.12, 0.03), deskMat, 0.3, 0.66, 0.97));
  for (const x of [-1.15, 1.75]) desk.add(mesh(box(0.06, 0.72, 0.7), deskMat, x, 0.36, 0.55));
  scene.add(desk);
  const top = 0.76;

  // ---------- moniteur CRT ----------
  const monitor = new THREE.Group();
  monitor.position.set(1.04, top, 0.43);
  monitor.rotation.y = -0.5;
  const plastic = mat({ color: 0x1a1e1b, roughness: 0.55, metalness: 0.08 });
  const plasticDark = mat({ color: 0x0d100e, roughness: 0.7 });
  monitor.add(mesh(keep(new THREE.CylinderGeometry(0.15, 0.16, 0.022, 40)), plastic, 0, 0.011, 0.02));
  monitor.add(mesh(box(0.09, 0.13, 0.07), plasticDark, 0, 0.085, 0.0));
  monitor.add(mesh(keep(new RoundedBoxGeometry(0.58, 0.5, 0.3, 4, 0.035)), plastic, 0, 0.4, 0.0));
  monitor.add(mesh(keep(new RoundedBoxGeometry(0.46, 0.4, 0.3, 4, 0.05)), plastic, 0, 0.41, -0.24));
  // Cadre intérieur sombre, en retrait, autour du verre.
  const bezel = mesh(keep(new THREE.ShapeGeometry(roundedRect(SCREEN_W + 0.05, SCREEN_H + 0.045, 0.035))), plasticDark, 0, 0.405, 0.151, false);
  monitor.add(bezel);
  const logTex = keep(screenLog());
  const screenOn = keep(new THREE.MeshBasicMaterial({ map: logTex, toneMapped: false }));
  const screenOff = keep(new THREE.MeshBasicMaterial({ color: 0x0a1712, toneMapped: false }));
  const glassGeo = keep(new THREE.ShapeGeometry(roundedRect(SCREEN_W, SCREEN_H, 0.03), 12));
  // UV de la forme : on les ramène sur [0, 1] pour la texture.
  {
    const uv = glassGeo.attributes.uv as THREE.BufferAttribute;
    const pos = glassGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / SCREEN_W + 0.5, pos.getY(i) / SCREEN_H + 0.5);
  }
  const glass = mesh(glassGeo, screenOn, 0, 0.405, 0.153, false);
  monitor.add(glass);
  // Petite diode et molettes sous l'écran.
  monitor.add(mesh(keep(new THREE.SphereGeometry(0.005, 8, 8)), keep(new THREE.MeshBasicMaterial({ color: 0x6dff9e, toneMapped: false })), 0.22, 0.19, 0.152, false));
  for (const x of [0.15, 0.18]) {
    const knob = mesh(keep(new THREE.CylinderGeometry(0.008, 0.008, 0.01, 16)), plasticDark, x, 0.19, 0.153, false);
    knob.rotation.x = Math.PI / 2;
    monitor.add(knob);
  }
  scene.add(monitor);
  monitor.updateMatrixWorld(true);

  const screenLocal = [
    new THREE.Vector3(-SCREEN_W / 2, 0.405 + SCREEN_H / 2, 0.154),
    new THREE.Vector3(SCREEN_W / 2, 0.405 + SCREEN_H / 2, 0.154),
    new THREE.Vector3(SCREEN_W / 2, 0.405 - SCREEN_H / 2, 0.154),
    new THREE.Vector3(-SCREEN_W / 2, 0.405 - SCREEN_H / 2, 0.154),
  ];
  const screenWorld = screenLocal.map((p) => monitor.localToWorld(p.clone()));
  const screenCenter = monitor.localToWorld(new THREE.Vector3(0, 0.405, 0.154));
  const screenNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(monitor.quaternion).normalize();
  const screenLeft = new THREE.Vector3(-1, 0, 0).applyQuaternion(monitor.quaternion).normalize();

  // ---------- clavier ----------
  const kb = new THREE.Group();
  kb.position.set(0.56, top, 0.76);
  kb.rotation.y = -0.14;
  kb.add(mesh(box(0.46, 0.026, 0.165), plasticDark, 0, 0.013, 0));
  const keyGeo = box(0.024, 0.012, 0.024);
  const keyMat = mat({ color: 0x101312, roughness: 0.5, emissive: 0x041a0f, emissiveIntensity: 0.6 });
  const keys = new THREE.InstancedMesh(keyGeo, keyMat, 5 * 16);
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 16; col++) {
      m4.makeTranslation(-0.2 + col * 0.0268, 0.032, -0.06 + row * 0.029);
      keys.setMatrixAt(k++, m4);
    }
  keys.castShadow = true;
  kb.add(keys);
  scene.add(kb);

  // ---------- tasse ----------
  const mugMat = mat({ color: 0x3b403b, roughness: 0.35, metalness: 0.05 });
  const mug = new THREE.Group();
  mug.position.set(1.58, top, 0.86);
  mug.add(mesh(keep(new THREE.CylinderGeometry(0.046, 0.042, 0.105, 28, 1, true)), keep(new THREE.MeshStandardMaterial({ color: 0x3b403b, roughness: 0.35, side: THREE.DoubleSide })), 0, 0.0525, 0));
  mug.add(mesh(keep(new THREE.CircleGeometry(0.042, 24)), mugMat, 0, 0.004, 0).rotateX(-Math.PI / 2));
  mug.add(mesh(keep(new THREE.CircleGeometry(0.044, 24)), mat({ color: 0x120a05, roughness: 0.2 }), 0, 0.085, 0).rotateX(-Math.PI / 2));
  const handle = mesh(keep(new THREE.TorusGeometry(0.03, 0.007, 10, 24, Math.PI)), mugMat, 0.046, 0.055, 0);
  handle.rotation.z = -Math.PI / 2;
  mug.add(handle);
  scene.add(mug);

  // ---------- lampe d'architecte ----------
  const metal = mat({ color: 0x2b2722, roughness: 0.45, metalness: 0.6 });
  const lamp = new THREE.Group();
  lamp.position.set(-0.02, top, 0.3);
  lamp.add(mesh(keep(new THREE.CylinderGeometry(0.07, 0.085, 0.03, 32)), metal, 0, 0.015, 0));
  const rod = (a: THREE.Vector3, b: THREE.Vector3, r = 0.008) => {
    const len = a.distanceTo(b);
    const m = mesh(keep(new THREE.CylinderGeometry(r, r, len, 10)), metal);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return m;
  };
  const j0 = new THREE.Vector3(0, 0.03, 0);
  const j1 = new THREE.Vector3(-0.02, 0.36, 0.0);
  const j2 = new THREE.Vector3(0.05, 0.62, 0.05);
  lamp.add(rod(j0, j1), rod(j0.clone().add(new THREE.Vector3(0.02, 0, 0)), j1.clone().add(new THREE.Vector3(0.02, 0, 0)), 0.004));
  lamp.add(rod(j1, j2), rod(j1.clone().add(new THREE.Vector3(0.015, 0, 0)), j2.clone().add(new THREE.Vector3(0.015, 0, 0)), 0.004));
  lamp.add(mesh(keep(new THREE.SphereGeometry(0.014, 12, 12)), metal, j1.x, j1.y, j1.z));
  const shade = new THREE.Group();
  shade.position.copy(j2);
  shade.rotation.z = -0.15;
  shade.rotation.x = -0.5;
  shade.add(mesh(keep(new THREE.ConeGeometry(0.12, 0.16, 40, 1, true)), mat({ color: 0x2b2620, roughness: 0.5, metalness: 0.5, side: THREE.FrontSide }), 0, -0.05, 0));
  shade.add(mesh(keep(new THREE.ConeGeometry(0.119, 0.16, 40, 1, true)), keep(new THREE.MeshBasicMaterial({ color: 0xffc98a, side: THREE.BackSide, toneMapped: false })), 0, -0.05, 0, false));
  shade.add(mesh(keep(new THREE.CylinderGeometry(0.03, 0.035, 0.05, 16)), metal, 0, 0.035, 0));
  const bulb = mesh(keep(new THREE.SphereGeometry(0.032, 20, 20)), keep(new THREE.MeshBasicMaterial({ color: 0xfff3d6, toneMapped: false })), 0, -0.1, 0, false);
  shade.add(bulb);
  lamp.add(shade);
  scene.add(lamp);
  lamp.updateMatrixWorld(true);
  const bulbWorld = bulb.getWorldPosition(new THREE.Vector3());
  // Halo de l'ampoule dans l'air poussiéreux, comme sur la photo.
  const haloTex = keep(
    canvasTexture(256, 256, (g) => {
      const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      grad.addColorStop(0, 'rgba(255,214,150,0.9)');
      grad.addColorStop(0.25, 'rgba(255,170,90,0.35)');
      grad.addColorStop(1, 'rgba(255,140,60,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 256);
    }),
  );
  const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55, toneMapped: false })));
  halo.position.copy(bulbWorld);
  halo.scale.setScalar(0.75);
  scene.add(halo);

  // ---------- radio, cartes électroniques, câbles ----------
  const radio = new THREE.Group();
  radio.position.set(-0.6, top, 0.36);
  radio.rotation.y = 0.15;
  radio.add(mesh(box(0.25, 0.14, 0.13), mat({ color: 0x3a2b1f, roughness: 0.7 }), 0, 0.07, 0));
  radio.add(mesh(box(0.15, 0.08, 0.005), mat({ color: 0x1a1612, roughness: 0.9 }), -0.03, 0.075, 0.066));
  radio.add(mesh(keep(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 16)), metal, 0.08, 0.075, 0.068).rotateX(Math.PI / 2));
  scene.add(radio);

  const pcbMat = mat({ color: 0x1d3b26, roughness: 0.55, metalness: 0.1 });
  const chipMat = mat({ color: 0x0b0b0b, roughness: 0.4 });
  const capMat = mat({ color: 0x2a3540, roughness: 0.3, metalness: 0.4 });
  const r = rand(5);
  for (const [x, z, a, w, d] of [
    [-0.42, 0.66, 0.3, 0.17, 0.11],
    [0.1, 0.6, -0.2, 0.14, 0.09],
    [0.3, 0.42, 0.1, 0.12, 0.08],
    [-0.75, 0.68, -0.4, 0.12, 0.08],
  ] as const) {
    const b = new THREE.Group();
    b.position.set(x, top, z);
    b.rotation.y = a;
    b.add(mesh(box(w, 0.008, d), pcbMat, 0, 0.004, 0));
    for (let i = 0; i < 6; i++) b.add(mesh(box(0.012 + r() * 0.03, 0.006, 0.01 + r() * 0.02), chipMat, (r() - 0.5) * w * 0.8, 0.011, (r() - 0.5) * d * 0.8));
    for (let i = 0; i < 3; i++) b.add(mesh(keep(new THREE.CylinderGeometry(0.004, 0.004, 0.014, 10)), capMat, (r() - 0.5) * w * 0.8, 0.015, (r() - 0.5) * d * 0.8));
    scene.add(b);
  }
  const cable = (pts: [number, number, number][], radius: number, color: number) => {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    scene.add(mesh(keep(new THREE.TubeGeometry(curve, 80, radius, 8, false)), mat({ color, roughness: 0.6 })));
  };
  const y = top + 0.006;
  cable([[0.95, y + 0.1, 0.3], [0.8, y + 0.02, 0.45], [0.5, y + 0.05, 0.55], [0.15, y, 0.6]], 0.006, 0x121212);
  cable([[0.9, y + 0.05, 0.35], [0.6, y + 0.07, 0.4], [0.35, y, 0.43], [0.0, y + 0.06, 0.55], [-0.4, y, 0.66]], 0.005, 0x1a1a1a);
  cable([[0.12, y, 0.6], [-0.05, y + 0.08, 0.5], [-0.3, y + 0.04, 0.55], [-0.42, y, 0.66]], 0.003, 0x6d1f1c);
  cable([[-0.42, y, 0.66], [-0.55, y + 0.09, 0.55], [-0.6, y + 0.05, 0.43]], 0.003, 0x7a6a24);
  cable([[0.3, y, 0.42], [0.45, y + 0.11, 0.5], [0.62, y + 0.03, 0.62], [0.75, y, 0.68]], 0.004, 0x151515);
  cable([[-0.75, y, 0.68], [-0.9, y + 0.06, 0.55], [-1.0, y, 0.4], [-1.05, y - 0.3, 0.3]], 0.005, 0x101010);

  // ---------- bibliothèque dans l'ombre ----------
  const shelfMat = mat({ color: 0x24170e, roughness: 0.8 });
  const shelf = new THREE.Group();
  shelf.position.set(-1.45, 0, 0.19);
  for (const x of [-0.58, 0.58]) shelf.add(mesh(box(0.04, 2.4, 0.36), shelfMat, x, 1.2, 0));
  for (const sy of [0.05, 0.5, 0.95, 1.4, 1.85, 2.3]) shelf.add(mesh(box(1.16, 0.03, 0.36), shelfMat, 0, sy, 0));
  shelf.add(mesh(box(1.16, 2.4, 0.02), shelfMat, 0, 1.2, -0.17));
  const bookGeo = box(1, 1, 1);
  const bookMat = mat({ roughness: 0.85 });
  const books = new THREE.InstancedMesh(bookGeo, bookMat, 200);
  const palette = [0x2a3a2c, 0x3b2a1e, 0x1f2a2a, 0x4a3a28, 0x2c2222, 0x354235, 0x1c1c18];
  const col = new THREE.Color();
  let bi = 0;
  for (const sy of [0.065, 0.515, 0.965, 1.415, 1.865]) {
    let x = -0.54;
    while (x < 0.52 && bi < 200) {
      const w = 0.022 + r() * 0.03;
      const h = 0.24 + r() * 0.15;
      const tilt = r() < 0.08 ? 0.25 : 0;
      m4.compose(
        new THREE.Vector3(x + w / 2, sy + h / 2, 0.02 + r() * 0.04),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, tilt)),
        new THREE.Vector3(w, h, 0.2 + r() * 0.06),
      );
      books.setMatrixAt(bi, m4);
      books.setColorAt(bi, col.setHex(palette[Math.floor(r() * palette.length)]!));
      bi++;
      x += w + (r() < 0.1 ? 0.04 : 0.002);
    }
  }
  books.count = bi;
  shelf.add(books);
  scene.add(shelf);

  // ---------- carte du monde en points ----------
  const dots = mapDots();
  const dotMesh = new THREE.InstancedMesh(keep(new THREE.CircleGeometry(0.0054, 10)), keep(new THREE.MeshBasicMaterial({ toneMapped: false })), dots.length);
  dots.forEach((p, i) => {
    m4.makeTranslation(p.x, p.y, p.z);
    dotMesh.setMatrixAt(i, m4);
    const b = 0.45 + r() * 0.5;
    dotMesh.setColorAt(i, col.setRGB(0.16 * b, 1.35 * b, 0.62 * b));
  });
  scene.add(dotMesh);

  // ---------- lumières ----------
  scene.add(new THREE.HemisphereLight(0x3a4a3c, 0x0b0805, 0.45));
  const shelfFill = new THREE.PointLight(0xc08850, 0.5, 3, 1.5);
  shelfFill.position.set(-1.0, 1.5, 1.0);
  scene.add(shelfFill);
  const spot = new THREE.SpotLight(0xffa95e, 11, 6, 1.0, 0.9, 1.6);
  spot.position.copy(bulbWorld);
  spot.target.position.set(bulbWorld.x + 0.15, top, bulbWorld.z + 0.25);
  spot.castShadow = true;
  spot.shadow.mapSize.set(opts.mobile ? 1024 : 2048, opts.mobile ? 1024 : 2048);
  spot.shadow.bias = -0.0004;
  spot.shadow.radius = 4;
  scene.add(spot, spot.target);
  const lampGlow = new THREE.PointLight(0xffa85c, 1.6, 5, 1.6);
  lampGlow.position.copy(bulbWorld).add(new THREE.Vector3(0, 0.05, 0.05));
  scene.add(lampGlow);
  const crtLight = new THREE.PointLight(0x3dff9c, 1.5, 4, 1.7);
  crtLight.position.copy(screenCenter).addScaledVector(screenNormal, 0.55);
  scene.add(crtLight);
  const mapLight = new THREE.PointLight(0x2bff8a, 0.9, 2.5, 1.5);
  mapLight.position.set(1.3, 2.0, 0.45);
  scene.add(mapLight);

  // ---------- rendu ----------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.6, 0.55, 0.7);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let vw = 1;
  let vh = 1;
  let glow = true;
  function resize(w: number, h: number) {
    vw = w;
    vh = h;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
  }

  const aspect = () => vw / vh;
  const v3 = (v: THREE.Vector3): Vec3 => ({ x: v.x, y: v.y, z: v.z });

  const shots = {
    /** Le cadre de la photo : la pièce, la lampe à gauche, le moniteur à droite. */
    room: (): Shot => {
      const a = aspect();
      const narrow = Math.min(1, Math.max(0, (1.25 - a) / 0.8));
      return {
        pos: { x: -0.1 + narrow * 0.75, y: 1.46, z: 2.35 + narrow * 0.15 },
        target: { x: 0.66 + narrow * 0.34, y: 1.34 + narrow * 0.12, z: 0.3 },
        fov: fovFor(a, 68 - narrow * 30, 38, 64),
      };
    },
    /** Face à l'écran, un peu à gauche et au-dessus, comme assis devant. */
    screen: (): Shot => {
      const a = aspect();
      const fov = 34;
      const d = fitDistance(SCREEN_W, SCREEN_H, fov, a, 0.72);
      const pos = screenCenter.clone().addScaledVector(screenNormal, d).addScaledVector(screenLeft, d * 0.1).add(new THREE.Vector3(0, d * 0.05, 0));
      return { pos: v3(pos), target: v3(screenCenter), fov };
    },
    /** Recul vers la carte : tout le monde au mur, le haut de l'écran en bas du cadre. */
    wall: (): Shot => {
      const a = aspect();
      const fov = 46;
      // En portrait, la carte déborde un peu sur les côtés plutôt que de devenir minuscule.
      const d = fitDistance(a < 1 ? 1.3 : 1.75, 1.15, fov, a, 0.95);
      return { pos: { x: 1.15, y: 1.66, z: d }, target: { x: 1.3, y: 1.62, z: 0 }, fov };
    },
  };

  function place(cam: THREE.PerspectiveCamera, s: Shot) {
    cam.position.set(s.pos.x, s.pos.y, s.pos.z);
    cam.fov = s.fov;
    cam.aspect = aspect();
    cam.updateProjectionMatrix();
    cam.lookAt(s.target.x, s.target.y, s.target.z);
    cam.updateMatrixWorld();
  }

  const tmp = new THREE.Vector3();
  const toPx = (cam: THREE.Camera, p: THREE.Vector3): Pt => {
    tmp.copy(p).project(cam);
    return { x: ((tmp.x + 1) / 2) * vw, y: ((1 - tmp.y) / 2) * vh };
  };

  const probe = new THREE.PerspectiveCamera();

  return {
    canvas,
    shots,
    render(shot, t) {
      place(camera, shot);
      // La lampe grésille, à peine ; le tube respire.
      const flick = 0.97 + Math.sin(t * 9.3) * 0.02 + Math.sin(t * 23.1) * 0.015;
      spot.intensity = 11 * flick;
      lampGlow.intensity = 1.6 * flick;
      halo.material.opacity = 0.55 * flick;
      crtLight.intensity = 1.5 * (0.96 + Math.sin(t * 2.1) * 0.04);
      if (glow) composer.render();
      else renderer.render(scene, camera);
    },
    screenQuad: () => screenWorld.map((p) => toPx(camera, p)) as Quad,
    screenBox() {
      place(probe, shots.screen());
      const q = screenWorld.map((p) => toPx(probe, p));
      return {
        w: Math.round((q[1]!.x - q[0]!.x + q[2]!.x - q[3]!.x) / 2),
        h: Math.round((q[3]!.y - q[0]!.y + q[2]!.y - q[1]!.y) / 2),
      };
    },
    project: (p) => toPx(camera, new THREE.Vector3(p.x, p.y, p.z)),
    setScreen(mode) {
      glass.material = mode === 'text' ? screenOn : screenOff;
      crtLight.color.setHex(mode === 'text' ? 0x3dff9c : 0x1d7a4c);
    },
    resize,
    degrade() {
      if (glow) glow = false;
      else renderer.setPixelRatio(Math.max(0.5, renderer.getPixelRatio() * 0.7));
      resize(vw, vh);
    },
    dispose() {
      composer.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
    },
  };
}
