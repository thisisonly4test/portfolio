import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { EventLog } from '../site/events';
import { damp, pathPoints, progressToT, seeded } from './path';

/**
 * Le monde en 3D : une infrastructure dans le noir, que le paquet du
 * visiteur traverse au rythme du défilement. Chaque équipement a sa propre
 * forme : globe (Internet), portique de pare-feu, baies de serveurs,
 * commutateur câblé, arbre d'annuaire, histogramme du SIEM, tunnel VPN.
 */

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  hopNodes: string[];
  labels: { host: string; role: string }[];
  events?: EventLog;
  reducedMotion: boolean;
  mobile: boolean;
}

export interface World {
  setProgress: (p: number) => void;
  destroy: () => void;
}

const BG = 0x17181c;
const ACCENT = new THREE.Color('#e8b04a');
const OK = new THREE.Color('#4fbf7f');
const ERR = new THREE.Color('#e5484d');
const DIM = new THREE.Color('#3a3b43');
const DIM_2 = new THREE.Color('#4a4b55');

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Étiquette texte qui fait toujours face à la caméra. */
function label(host: string, role: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.font = '500 54px "IBM Plex Mono", monospace';
  g.fillStyle = '#ececec';
  g.fillText(host, 8, 58);
  g.font = '400 34px "IBM Plex Mono", monospace';
  g.fillStyle = '#8b8b95';
  g.fillText(role, 8, 108);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true }));
  sprite.scale.set(6.4, 1.6, 1);
  sprite.center.set(0, 0);
  return sprite;
}

/** Texture de halo radial pour le paquet. */
function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,214,140,1)');
  grad.addColorStop(0.25, 'rgba(232,176,74,0.55)');
  grad.addColorStop(1, 'rgba(232,176,74,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWorld(o: SceneOptions): World {
  const rand = seeded(1337);
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: !o.mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, o.mobile ? 1 : 1.5));
  renderer.setClearColor(BG);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(BG, o.mobile ? 0.016 : 0.011);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 420);

  scene.add(new THREE.HemisphereLight(0x9aa2bc, 0x1a1b20, 1.4));
  const moon = new THREE.DirectionalLight(0xaab4d0, 1.0);
  moon.position.set(-30, 60, 20);
  scene.add(moon);

  // ---------- trajet ----------
  const points = pathPoints(o.hopNodes).map((v) => new THREE.Vector3(...v));
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const stationT = points.map((_, i) => (points.length > 1 ? i / (points.length - 1) : 0));

  // Fibre : un tube où circulent des impulsions ; la partie parcourue s'allume.
  const flowUniforms = { uTime: { value: 0 }, uHead: { value: 0 }, uColor: { value: ACCENT.clone() } };
  const flowMat = new THREE.ShaderMaterial({
    uniforms: flowUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uHead; uniform vec3 uColor; varying vec2 vUv;
      void main() {
        float pulse = smoothstep(0.92, 1.0, fract(vUv.x * 140.0 - uTime * 1.2));
        float done = step(vUv.x, uHead);
        float a = 0.07 + done * 0.28 + pulse * (0.25 + done * 0.5);
        gl_FragColor = vec4(uColor, a);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, o.mobile ? 300 : 700, 0.07, 6, false), flowMat));

  // Sol : une grille qui se perd dans le brouillard.
  const grid = new THREE.GridHelper(900, 225, 0x36363e, 0x26262c);
  grid.position.set(0, -7, -200);
  scene.add(grid);

  // ---------- décor : un centre de données à perte de vue ----------
  const buildingCount = o.mobile ? 150 : 360;
  const buildings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x22232a, roughness: 0.92, metalness: 0.15 }), buildingCount);
  const m = new THREE.Matrix4();
  const edges: number[] = [];
  const box = [-0.5, 0.5];
  const ledPositions: number[] = [];
  const ledColors: number[] = [];
  // Abscisse du trajet pour une profondeur donnée : les bâtiments restent à distance.
  const samples = curve.getPoints(200);
  const pathXAt = (z: number) => samples.reduce((best, p) => (Math.abs(p.z - z) < Math.abs(best.z - z) ? p : best)).x;
  for (let i = 0; i < buildingCount; i++) {
    const side = rand() < 0.5 ? -1 : 1;
    const z = 30 - rand() * 460;
    const x = pathXAt(z) + side * (17 + rand() * 70);
    const w = 2 + rand() * 6;
    const d = 2 + rand() * 6;
    const hgt = 2 + Math.pow(rand(), 1.6) * 30;
    m.compose(new THREE.Vector3(x, -7 + hgt / 2, z), new THREE.Quaternion(), new THREE.Vector3(w, hgt, d));
    buildings.setMatrixAt(i, m);
    // Arêtes de chaque bâtiment : une ville en fil de fer qui se devine dans le brouillard.
    const corner = (cx: number, cy: number, cz: number) => [x + cx * w, -7 + hgt / 2 + cy * hgt, z + cz * d];
    for (const a of box) for (const b of box) {
      edges.push(...corner(-0.5, a, b), ...corner(0.5, a, b));
      edges.push(...corner(a, -0.5, b), ...corner(a, 0.5, b));
      edges.push(...corner(a, b, -0.5), ...corner(a, b, 0.5));
    }
    // Quelques diodes sur la face tournée vers le trajet.
    const leds = Math.floor(rand() * 6);
    for (let k = 0; k < leds; k++) {
      ledPositions.push(x - side * (w / 2 + 0.05), -7 + rand() * hgt, z + (rand() - 0.5) * d);
      const c = rand() < 0.75 ? OK : ACCENT;
      ledColors.push(c.r, c.g, c.b);
    }
  }
  scene.add(buildings);
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edges, 3));
  scene.add(new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0x3a3a44, transparent: true, opacity: 0.9 })));
  const ledGeo = new THREE.BufferGeometry();
  ledGeo.setAttribute('position', new THREE.Float32BufferAttribute(ledPositions, 3));
  const ledColorAttr = new THREE.Float32BufferAttribute(ledColors, 3);
  const ledBase = Float32Array.from(ledColors);
  ledGeo.setAttribute('color', ledColorAttr);
  scene.add(new THREE.Points(ledGeo, new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false })));

  // ---------- équipements ----------
  const animated: ((t: number, dt: number, head: THREE.Vector3) => void)[] = [];
  const frameAt = (i: number) => {
    const pos = curve.getPoint(stationT[i]!);
    const tan = curve.getTangent(stationT[i]!).normalize();
    const side = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
    return { pos, tan, side };
  };
  const lineMat = (color: THREE.Color, opacity = 1) => new THREE.LineBasicMaterial({ color, transparent: true, opacity });

  o.hopNodes.forEach((node, i) => {
    const { pos, tan, side } = frameAt(i);
    const group = new THREE.Group();
    group.position.copy(pos);
    scene.add(group);
    const tag = label(o.labels[i]?.host ?? node, o.labels[i]?.role ?? '');
    tag.position.copy(side.clone().multiplyScalar(3.2)).add(new THREE.Vector3(0, 3.2, 0));
    group.add(tag);

    switch (node) {
      case 'client': {
        // Internet : un globe en fil de fer, d'où part le paquet.
        const globe = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(3.6, 2)), lineMat(DIM_2, 0.8));
        const dots = new THREE.Points(new THREE.IcosahedronGeometry(3.62, 3), new THREE.PointsMaterial({ color: ACCENT, size: 0.07, transparent: true, opacity: 0.7 }));
        group.add(globe, dots);
        tag.position.set(4.4, 2.6, 0);
        animated.push((t) => {
          globe.rotation.y = dots.rotation.y = t * 0.08;
          globe.rotation.x = dots.rotation.x = Math.sin(t * 0.05) * 0.2;
        });
        break;
      }
      case 'fw': {
        // Pare-feu : un mur de lignes, ouvert au centre, et trois anneaux qui inspectent.
        const wall: number[] = [];
        for (let y = -7; y <= 8; y += 0.55) {
          for (const [a, b] of [[-22, -5.2], [5.2, 22]] as const) {
            const p1 = side.clone().multiplyScalar(a).add(new THREE.Vector3(0, y, 0));
            const p2 = side.clone().multiplyScalar(b).add(new THREE.Vector3(0, y, 0));
            wall.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
          }
        }
        const wallGeo = new THREE.BufferGeometry();
        wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wall, 3));
        const wallMat = lineMat(DIM, 0.9);
        group.add(new THREE.LineSegments(wallGeo, wallMat));
        const rings = [4.2, 4.8, 5.4].map((r, k) => {
          const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 6, 96), new THREE.MeshBasicMaterial({ color: DIM_2.clone(), transparent: true, opacity: 0.9 }));
          mesh.lookAt(tan);
          mesh.userData.speed = (k % 2 ? -1 : 1) * (0.2 + k * 0.1);
          group.add(mesh);
          return mesh;
        });
        let flash = 0;
        animated.push((_t, dt, head) => {
          const d = head.distanceTo(pos);
          if (d < 2.5) flash = 1;
          flash = Math.max(0, flash - dt * 0.8);
          for (const r of rings) {
            r.rotateOnAxis(new THREE.Vector3(0, 0, 1), r.userData.speed * dt);
            (r.material as THREE.MeshBasicMaterial).color.copy(DIM_2).lerp(OK, flash);
          }
          wallMat.color.copy(DIM).lerp(OK, flash * 0.6);
        });
        break;
      }
      case 'web': {
        // DMZ : des baies de serveurs, diodes qui clignotent.
        const rackMat = new THREE.MeshStandardMaterial({ color: 0x24252c, roughness: 0.7, metalness: 0.4 });
        const ledCount = 4 * 14 * 3;
        const leds = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.08, 0.04), new THREE.MeshBasicMaterial({ color: 0xffffff }), ledCount);
        let li = 0;
        const ledState: THREE.Color[] = [];
        for (const off of [-7.5, -5, 5, 7.5]) {
          const base = side.clone().multiplyScalar(off).add(new THREE.Vector3(0, -3.6, 0));
          const rack = new THREE.Mesh(new THREE.BoxGeometry(2, 7, 1.8), rackMat);
          rack.position.copy(base);
          // La façade (+z local) regarde le trajet.
          rack.lookAt(new THREE.Vector3(0, base.y, 0));
          group.add(rack);
          for (let r = 0; r < 14; r++) {
            for (let c = 0; c < 3; c++) {
              const local = new THREE.Vector3((c - 1) * 0.4, -3 + r * 0.45, 0.92);
              local.applyQuaternion(rack.quaternion).add(rack.position);
              m.makeTranslation(local.x, local.y, local.z);
              leds.setMatrixAt(li, m);
              const col = rand() < 0.8 ? OK.clone() : ACCENT.clone();
              ledState.push(col);
              leds.setColorAt(li, col);
              li++;
            }
          }
        }
        group.add(leds);
        let acc = 0;
        animated.push((_t, dt) => {
          acc += dt;
          if (acc < 0.12) return;
          acc = 0;
          for (let k = 0; k < 6; k++) {
            const idx = Math.floor(Math.random() * ledCount);
            const on = Math.random() < 0.6;
            leds.setColorAt(idx, on ? ledState[idx]! : DIM);
          }
          leds.instanceColor!.needsUpdate = true;
        });
        break;
      }
      case 'core': {
        // Commutateur cœur : 48 ports, et des câbles qui partent dans tous les sens.
        const sw = new THREE.Mesh(new THREE.BoxGeometry(11, 0.9, 2.8), new THREE.MeshStandardMaterial({ color: 0x26272e, roughness: 0.6, metalness: 0.5 }));
        sw.position.set(0, -3.4, 0);
        // Face avant (+z local) tournée vers la caméra, qui arrive par derrière.
        sw.lookAt(sw.position.clone().sub(tan));
        group.add(sw);
        const ports = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff }), 48);
        for (let k = 0; k < 48; k++) {
          m.makeTranslation(-4.95 + (k % 24) * 0.43, k < 24 ? 0.18 : -0.12, 1.42);
          ports.setMatrixAt(k, m);
          ports.setColorAt(k, rand() < 0.85 ? OK : DIM);
        }
        sw.add(ports);
        const cableMat = lineMat(new THREE.Color('#24242a'), 0.9);
        for (let k = 0; k < (o.mobile ? 14 : 30); k++) {
          const start = new THREE.Vector3((rand() - 0.5) * 10, -3.4, 0).applyQuaternion(sw.quaternion);
          const end = side.clone().multiplyScalar((rand() < 0.5 ? -1 : 1) * (12 + rand() * 30)).add(new THREE.Vector3(0, -7, (rand() - 0.5) * 40));
          const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, -3.5 - rand() * 2, 0));
          const c = new THREE.CatmullRomCurve3([start, mid, end]);
          group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.getPoints(30)), cableMat));
        }
        let acc = 0;
        animated.push((_t, dt) => {
          acc += dt;
          if (acc < 0.09) return;
          acc = 0;
          const k = Math.floor(Math.random() * 48);
          ports.setColorAt(k, Math.random() < 0.15 ? ACCENT : Math.random() < 0.85 ? OK : DIM);
          ports.instanceColor!.needsUpdate = true;
        });
        break;
      }
      case 'ad': {
        // Annuaire : un arbre (domaine, unités d'organisation, objets) qui tourne lentement.
        const tree = new THREE.Group();
        tree.position.set(0, 2.5, 0);
        group.add(tree);
        const nodeGeo = new THREE.OctahedronGeometry(0.32);
        const edge: number[] = [];
        const add = (p: THREE.Vector3, depth: number) => {
          const mesh = new THREE.Mesh(nodeGeo, new THREE.MeshBasicMaterial({ color: depth === 0 ? ACCENT : depth === 1 ? DIM_2 : DIM }));
          mesh.position.copy(p);
          tree.add(mesh);
          if (depth >= 2) return;
          const n = depth === 0 ? 4 : 3;
          for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2 + depth;
            const r = depth === 0 ? 4.2 : 1.7;
            const child = p.clone().add(new THREE.Vector3(Math.cos(a) * r, -2.4, Math.sin(a) * r));
            edge.push(p.x, p.y, p.z, child.x, child.y, child.z);
            add(child, depth + 1);
          }
        };
        add(new THREE.Vector3(0, 3, 0), 0);
        const eg = new THREE.BufferGeometry();
        eg.setAttribute('position', new THREE.Float32BufferAttribute(edge, 3));
        tree.add(new THREE.LineSegments(eg, lineMat(DIM_2, 0.8)));
        animated.push((t) => (tree.rotation.y = t * 0.12));
        break;
      }
      case 'siem': {
        // SIEM : un cercle d'histogrammes qui réagit aux vrais événements du site.
        const N = 32;
        const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 1, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
        const heights = Array.from({ length: N }, () => 1 + rand() * 2);
        const targets = [...heights];
        const IDLE = OK.clone().multiplyScalar(0.35);
        const colors = Array.from({ length: N }, () => IDLE.clone());
        group.add(bars);
        const place = () => {
          for (let k = 0; k < N; k++) {
            const a = (k / N) * Math.PI * 2;
            const hgt = heights[k]!;
            m.compose(new THREE.Vector3(Math.cos(a) * 10, -7 + hgt / 2, Math.sin(a) * 10), new THREE.Quaternion(), new THREE.Vector3(1.3, hgt, 1.3));
            bars.setMatrixAt(k, m);
            bars.setColorAt(k, colors[k]!);
          }
          bars.instanceMatrix.needsUpdate = true;
          bars.instanceColor!.needsUpdate = true;
        };
        place();
        o.events?.subscribe((e) => {
          const k = e.id % N;
          targets[k] = Math.min(14, 4 + e.level * 0.8);
          colors[k]!.copy(e.level >= 10 ? ERR : e.level >= 5 ? ACCENT : OK);
        });
        animated.push((t, dt) => {
          for (let k = 0; k < N; k++) {
            const idle = 1 + 2.2 * (0.5 + 0.5 * Math.sin(t * 0.9 + k * 0.7));
            targets[k] = Math.max(idle, targets[k]! - dt * 1.2);
            heights[k] = damp(heights[k]!, targets[k]!, 6, dt);
            colors[k]!.lerp(IDLE, dt * 0.25);
          }
          place();
        });
        break;
      }
      case 'vpn': {
        // VPN : un tunnel d'anneaux à traverser, avant la sortie.
        const start = stationT[i - 1] ?? 0;
        const end = stationT[i]!;
        const count = o.mobile ? 26 : 44;
        const rings: THREE.Mesh[] = [];
        for (let k = 0; k < count; k++) {
          const tt = start + (end - start) * (0.35 + 0.65 * (k / (count - 1)));
          const p = curve.getPoint(tt);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.03, 6, 64), new THREE.MeshBasicMaterial({ color: DIM_2.clone(), transparent: true, opacity: 0.9 }));
          ring.position.copy(p).sub(pos);
          ring.lookAt(ring.position.clone().add(curve.getTangent(tt)));
          group.add(ring);
          rings.push(ring);
        }
        animated.push((t) => {
          rings.forEach((r, k) => {
            const wave = Math.max(0, Math.sin(t * 2.2 - k * 0.35));
            (r.material as THREE.MeshBasicMaterial).color.copy(DIM_2).lerp(ACCENT, wave * wave * 0.85);
          });
        });
        break;
      }
    }
  });

  // ---------- le paquet ----------
  const packet = new THREE.Group();
  packet.add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd68c') })));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.set(3.4, 3.4, 1);
  packet.add(halo);
  const light = new THREE.PointLight(ACCENT, 40, 26, 1.6);
  packet.add(light);
  scene.add(packet);

  const TRAIL = 48;
  const trailPos = new Float32Array(TRAIL * 3);
  const trailCol = new Float32Array(TRAIL * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
  for (let k = 0; k < TRAIL; k++) {
    const f = 1 - k / TRAIL;
    trailCol.set([ACCENT.r * f, ACCENT.g * f, ACCENT.b * f], k * 3);
  }
  scene.add(new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));

  // ---------- rendu ----------
  let composer: EffectComposer | null = null;
  if (!o.mobile) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.9, 0.55, 0.12));
    composer.addPass(new OutputPass());
  }

  const resize = () => {
    const w = o.canvas.clientWidth || window.innerWidth;
    const h = o.canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    // Sur grand écran, le contenu est à gauche : on décale le sujet vers la droite.
    if (w > 900) camera.setViewOffset(w, h, -w * 0.2, 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  const pointer = { x: 0, y: 0 };
  const onPointer = (e: PointerEvent) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener('pointermove', onPointer, { passive: true });

  let target = 0;
  let shown = 0;
  let initialized = false;
  const look = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const clock = new THREE.Clock();
  let elapsed = 0;
  let raf = 0;
  const par = { x: 0, y: 0 };

  // Qualité adaptative : si la machine peine, on coupe le flou lumineux puis on baisse la résolution.
  let slowTime = 0;
  let tier = 0;
  const degrade = () => {
    tier++;
    if (tier === 1 && composer) composer = null;
    else renderer.setPixelRatio(Math.max(0.5, renderer.getPixelRatio() * 0.7));
    resize();
    o.canvas.dataset.quality = String(tier);
  };

  const frame = () => {
    raf = requestAnimationFrame(frame);
    const raw = clock.getDelta();
    const dt = Math.min(raw, 0.05);
    if (document.hidden) return;
    if (tier < 4) {
      slowTime = raw > 0.034 ? slowTime + raw : Math.max(0, slowTime - raw * 0.5);
      if (slowTime > 1.2) {
        slowTime = 0;
        degrade();
      }
    }
    if (!o.reducedMotion) elapsed += dt;
    flowUniforms.uTime.value = elapsed;

    shown = o.reducedMotion ? target : damp(shown, target, 3.2, dt);
    const t = progressToT(shown, points.length);
    const head = curve.getPoint(t);
    const tan = curve.getTangent(Math.min(t, 0.999)).normalize();
    packet.position.copy(head);
    halo.scale.setScalar(3.2 + Math.sin(elapsed * 3) * 0.25);
    flowUniforms.uHead.value = t;

    // Traînée : les positions récentes sur la courbe, en arrière du paquet.
    for (let k = 0; k < TRAIL; k++) {
      const p = curve.getPoint(Math.max(0, t - k * 0.0011));
      trailPos.set([p.x, p.y, p.z], k * 3);
    }
    trailGeo.attributes.position!.needsUpdate = true;

    // Caméra : derrière et au-dessus du paquet ; plus loin au départ, pour voir le globe.
    const intro = Math.max(0, 1 - shown * 1.6);
    const back = 12 + intro * 9;
    par.x = damp(par.x, pointer.x, 2, dt);
    par.y = damp(par.y, pointer.y, 2, dt);
    const sideV = tmp.crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
    camPos
      .copy(head)
      .addScaledVector(tan, -back)
      .add(new THREE.Vector3(0, 3.6 + intro * 3 - par.y * 1.2, 0))
      .addScaledVector(sideV, par.x * 2.2);
    if (!initialized) {
      camera.position.copy(camPos);
      initialized = true;
    } else camera.position.lerp(camPos, 1 - Math.exp(-6 * dt));
    look.copy(head).addScaledVector(tan, 5);
    camera.lookAt(look);

    for (const fn of animated) fn(elapsed, o.reducedMotion ? 0 : dt, head);

    // Diodes du décor : quelques-unes s'éteignent et se rallument.
    if (!o.reducedMotion && ledBase.length) {
      for (let k = 0; k < 8; k++) {
        const idx = Math.floor(Math.random() * (ledBase.length / 3)) * 3;
        const on = Math.random() < 0.7 ? 1 : 0.15;
        ledColorAttr.array[idx] = ledBase[idx]! * on;
        ledColorAttr.array[idx + 1] = ledBase[idx + 1]! * on;
        ledColorAttr.array[idx + 2] = ledBase[idx + 2]! * on;
      }
      ledColorAttr.needsUpdate = true;
    }

    if (composer) composer.render();
    else renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return {
    setProgress: (p) => {
      target = Math.max(0, Math.min(p, points.length - 1));
    },
    destroy: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
      renderer.dispose();
    },
  };
}
