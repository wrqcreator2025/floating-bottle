import * as T from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const ease = (t) => 1 - (1 - t) ** 4;
const V = (x, y, z) => new T.Vector3(x, y, z);
const mat = (color, roughness = 0.8) =>
  new T.MeshStandardMaterial({ color, roughness });
function mesh(geometry, material, parent, position = [0, 0, 0]) {
  const m = new T.Mesh(geometry, material);
  m.position.set(...position);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function box(parent, size, position, material) {
  return mesh(new T.BoxGeometry(...size), material, parent, position);
}
function label(text, color = '#344742', background = '#74887e') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.font = '38px "Noto Sans SC Variable", sans-serif';
  ctx.fillText(text, 256, 143);
  const texture = new T.CanvasTexture(c);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

export function createWorld(container, onAction, onFrame) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new T.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(
    Math.min(devicePixelRatio, innerWidth < 700 ? 1.5 : 1.8),
  );
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  container.append(renderer.domElement);
  const scene = new T.Scene();
  scene.fog = new T.Fog('#a9c5d0', 65, 240);
  const camera = new T.PerspectiveCamera(
    43,
    innerWidth / innerHeight,
    0.05,
    550,
  );
  const environment = new RoomEnvironment();
  const pmrem = new T.PMREMGenerator(renderer);
  const env = pmrem.fromScene(environment, 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.3;
  environment.dispose();
  pmrem.dispose();
  const sky = mesh(
    new T.SphereGeometry(400, 32, 16),
    new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new T.Color('#79acd1') },
        bottom: { value: new T.Color('#e0e8df') },
      },
      vertexShader:
        'varying vec3 v;void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:
        'varying vec3 v;uniform vec3 top;uniform vec3 bottom;void main(){float h=normalize(v).y;gl_FragColor=vec4(mix(bottom,top,smoothstep(-.03,.32,h)),1.);\n#include <colorspace_fragment>\n}',
    }),
    scene,
  );
  sky.castShadow = false;
  sky.receiveShadow = false;
  scene.add(new T.HemisphereLight('#e7f1ff', '#8e8670', 0.9));
  const sun = new T.DirectionalLight('#fff4dc', 2.0);
  sun.position.set(-16, 24, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.025;
  scene.add(sun);
  const normalSize = 256,
    normalData = new Uint8Array(normalSize * normalSize * 4),
    heights = new Float32Array(normalSize * normalSize);
  // A seeded, tileable multi-scale height field has no preferred direction.
  // Water.js then samples it at four drifting scales, avoiding repeated bands.
  let seed = 73129;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const smooth = (x) => x * x * (3 - 2 * x);
  for (const [cells, amplitude] of [
    [4, 0.5],
    [8, 0.26],
    [16, 0.14],
    [32, 0.07],
  ]) {
    const grid = Array.from({ length: cells * cells }, random);
    for (let y = 0; y < normalSize; y++)
      for (let x = 0; x < normalSize; x++) {
        const gx = (x / normalSize) * cells,
          gy = (y / normalSize) * cells,
          x0 = Math.floor(gx) % cells,
          y0 = Math.floor(gy) % cells,
          x1 = (x0 + 1) % cells,
          y1 = (y0 + 1) % cells,
          tx = smooth(gx - Math.floor(gx)),
          ty = smooth(gy - Math.floor(gy)),
          top = T.MathUtils.lerp(
            grid[y0 * cells + x0],
            grid[y0 * cells + x1],
            tx,
          ),
          bottom = T.MathUtils.lerp(
            grid[y1 * cells + x0],
            grid[y1 * cells + x1],
            tx,
          );
        heights[y * normalSize + x] +=
          T.MathUtils.lerp(top, bottom, ty) * amplitude;
      }
  }
  for (let y = 0; y < normalSize; y++)
    for (let x = 0; x < normalSize; x++) {
      const left =
          heights[y * normalSize + ((x - 1 + normalSize) % normalSize)],
        right = heights[y * normalSize + ((x + 1) % normalSize)],
        down = heights[((y - 1 + normalSize) % normalSize) * normalSize + x],
        up = heights[((y + 1) % normalSize) * normalSize + x],
        n = V((left - right) * 5.5, (down - up) * 5.5, 1).normalize(),
        i = (y * normalSize + x) * 4;
      normalData[i] = (n.x * 0.5 + 0.5) * 255;
      normalData[i + 1] = (n.y * 0.5 + 0.5) * 255;
      normalData[i + 2] = n.z * 255;
      normalData[i + 3] = 255;
    }
  const normals = new T.DataTexture(normalData, normalSize, normalSize);
  normals.wrapS = normals.wrapT = T.RepeatWrapping;
  normals.magFilter = normals.minFilter = T.LinearFilter;
  normals.needsUpdate = true;
  const water = new Water(new T.PlaneGeometry(1000, 1000), {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: normals,
    sunDirection: sun.position.clone().normalize(),
    sunColor: 0xfff8ee,
    waterColor: 0x214b5a,
    distortionScale: 0.32,
    fog: true,
    alpha: 1,
  });
  water.rotation.x = -Math.PI / 2;
  scene.add(water);
  water.material.uniforms.size.value = 5.5;
  water.material.fragmentShader = water.material.fragmentShader
    .replace('float rf0 = 0.3;', 'float rf0 = 0.06;')
    .replace('vec3( 0.1 ) + reflectionSample * 0.9', 'reflectionSample * 0.65');

  const island = new T.Group();
  scene.add(island);
  const sand = mat('#d5cbb3'),
    stone = mat('#969d98'),
    grass = mat('#819281'),
    plaster = mat('#e5e1d4'),
    roof = mat('#667982', 0.62),
    wood = mat('#bbae95'),
    dark = mat('#354b53');
  const points = [],
    indices = [],
    rings = 16,
    segments = 96;
  for (let r = 0; r <= rings; r++)
    for (let s = 0; s <= segments; s++) {
      const angle = (s / segments) * Math.PI * 2,
        p = r / rings,
        rad = 1 + 0.07 * Math.sin(angle * 5) + 0.05 * Math.cos(angle * 3);
      points.push(
        Math.cos(angle) * 5.8 * p * rad,
        0.64 * (1 - p * p) - 0.16 + Math.sin(angle * 3) * 0.07 * p,
        Math.sin(angle) * 3.1 * p * rad,
      );
      if (r < rings && s < segments) {
        const a = r * (segments + 1) + s,
          b = a + segments + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(points, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const ground = mesh(geo, sand, island);
  ground.userData.action = 'island';
  const rockData = [
    [-3.2, 0.28, 0.2, 1.1, 0.68, 0.8],
    [-4.1, 0.1, 0.8, 0.65, 0.45, 0.7],
    [-2.4, 0.2, 1.2, 0.8, 0.55, 0.6],
    [3.2, 0.19, 0.5, 1, 0.7, 0.75],
    [4, 0.07, 1.2, 0.6, 0.4, 0.6],
    [2.7, 0.24, -1.2, 0.8, 0.6, 0.9],
    [-1.9, 0.3, -1.7, 0.7, 0.4, 0.6],
  ];
  rockData.forEach((r, i) => {
    const rock = mesh(
      new T.IcosahedronGeometry(1, 2),
      stone,
      island,
      r.slice(0, 3),
    );
    rock.scale.set(...r.slice(3));
    rock.rotation.set(i * 0.32, i * 0.83, 0.2);
  });
  for (let i = 0; i < 35; i++) {
    const a = i * 2.399,
      r = 1.4 + (i % 6) * 0.37;
    const x = Math.cos(a) * r,
      z = Math.sin(a) * r * 0.59 - 0.45;
    if (Math.abs(x) < 1.4 && Math.abs(z) < 1.2) continue;
    const shrub = mesh(
      new T.IcosahedronGeometry(0.28 + (i % 4) * 0.06, 1),
      grass,
      island,
      [x, 0.45, z],
    );
    shrub.scale.set(1, 0.56, 1);
  }
  const house = new T.Group();
  house.position.set(0, 0.39, -0.25);
  island.add(house);
  house.userData.action = 'house';
  box(house, [2.7, 1.7, 2.15], [0, 0.85, 0], plaster);
  const gable = new T.Shape();
  gable.moveTo(-1.35, 0);
  gable.lineTo(1.35, 0);
  gable.lineTo(0, 0.85);
  gable.closePath();
  mesh(
    new T.ExtrudeGeometry(gable, { depth: 2.15, bevelEnabled: false }),
    plaster,
    house,
    [0, 1.7, -1.075],
  );
  [-1, 1].forEach((side) => {
    const slope = box(house, [1.77, 0.09, 2.55], [side * 0.72, 2.09, 0], roof);
    slope.rotation.z = side * -0.565;
    for (let i = 0; i < 18; i++) {
      const rib = box(
        house,
        [1.78, 0.02, 0.014],
        [side * 0.72, 2.15, -1.2 + i * 0.14],
        roof,
      );
      rib.rotation.z = side * -0.565;
    }
  });
  box(house, [0.59, 1.29, 0.07], [-0.65, 0.65, 1.11], dark);
  box(house, [0.045, 1.34, 0.13], [-0.98, 0.66, 1.13], wood);
  box(house, [0.045, 1.34, 0.13], [-0.32, 0.66, 1.13], wood);
  box(house, [0.74, 0.04, 0.4], [-0.65, 0.025, 1.3], sand);
  const windowMat = new T.MeshStandardMaterial({
    color: '#6e8d96',
    metalness: 0.42,
    roughness: 0.2,
  });
  box(house, [0.88, 0.77, 0.05], [0.61, 0.99, 1.11], windowMat);
  [
    [0.12, 0.99, 0.05, 0.85],
    [1.1, 0.99, 0.05, 0.85],
    [0.61, 0.57, 1.03, 0.05],
    [0.61, 1.42, 1.03, 0.05],
  ].forEach(([x, y, w, h]) => box(house, [w, h, 0.1], [x, y, 1.14], wood));
  box(house, [0.03, 0.78, 0.1], [0.61, 0.99, 1.15], wood);

  function makeBottle(parent, scale = 1) {
    const group = new T.Group();
    parent.add(group);
    group.scale.setScalar(scale);
    const profile = [
      [0, 0],
      [0.23, 0],
      [0.3, 0.06],
      [0.31, 0.2],
      [0.31, 0.93],
      [0.28, 1.04],
      [0.16, 1.18],
      [0.125, 1.25],
      [0.125, 1.53],
      [0.145, 1.54],
      [0.145, 1.61],
      [0.1, 1.61],
      [0.1, 1.25],
      [0.145, 1.15],
      [0.26, 0.95],
      [0.265, 0.12],
      [0, 0.1],
    ].map(([x, y]) => new T.Vector2(x, y));
    const glass = new T.MeshPhysicalMaterial({
      color: '#e5f2eb',
      metalness: 0,
      roughness: 0.09,
      transmission: 0.92,
      thickness: 0.12,
      ior: 1.45,
      transparent: true,
      opacity: 1,
      side: T.DoubleSide,
      envMapIntensity: 1.5,
      attenuationColor: new T.Color('#b7d4c5'),
      attenuationDistance: 4,
    });
    const body = mesh(new T.LatheGeometry(profile, 48), glass, group);
    body.castShadow = false;
    const paper = mesh(
      new T.CylinderGeometry(0.09, 0.09, 0.82, 24),
      mat('#fff5d7'),
      group,
      [0.02, 0.62, 0],
    );
    paper.rotation.z = -0.13;
    const tie = mesh(
      new T.TorusGeometry(0.095, 0.012, 8, 24),
      mat('#a98a64'),
      group,
      [0.02, 0.64, 0],
    );
    tie.rotation.x = Math.PI / 2;
    const cork = mesh(
      new T.CylinderGeometry(0.125, 0.105, 0.25, 24),
      mat('#b39162'),
      group,
      [0, 1.62, 0],
    );
    cork.userData.action = 'cork';
    group.userData.cork = cork;
    group.userData.paper = paper;
    group.userData.tie = tie;
    return group;
  }
  const bottle = makeBottle(scene, 0.75);
  bottle.position.set(0.8, 0.01, 9);
  bottle.rotation.z = -0.38;
  bottle.userData.action = 'bottle';

  const room = new T.Group();
  room.position.x = 100;
  scene.add(room);
  room.visible = false;
  const roomLight = new T.DirectionalLight('#fff3dd', 2.4);
  roomLight.position.set(96, 8, 6);
  roomLight.target.position.set(100, 0, 0);
  roomLight.castShadow = true;
  roomLight.shadow.mapSize.set(1024, 1024);
  roomLight.shadow.camera.left = -6;
  roomLight.shadow.camera.right = 6;
  roomLight.shadow.camera.top = 6;
  roomLight.shadow.camera.bottom = -6;
  roomLight.shadow.normalBias = 0.025;
  scene.add(roomLight, roomLight.target);
  box(room, [12, 0.15, 9], [0, -0.15, 0], wood);
  box(room, [12, 6, 0.15], [0, 2.7, -2.6], plaster);
  // A quiet sky beyond the window keeps the interior airy without introducing
  // a second, visibly disconnected water surface.
  box(room, [0.15, 6, 8], [-5, 2.7, 1], plaster);
  const vista = new T.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader:
      'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 v;uniform float time;
      float cloud(vec2 p){
        float a=sin(p.x*5.2+sin(p.y*3.1))*sin(p.y*4.3-p.x*1.7);
        float b=sin(p.x*10.4-p.y*2.2+time*.025)*.35;
        return smoothstep(.32,.82,a*.55+b*.18+.46);
      }
      void main(){
        vec3 low=vec3(.77,.84,.84), high=vec3(.39,.61,.76);
        vec3 c=mix(low,high,smoothstep(0.,1.,v.y));
        float haze=1.-smoothstep(.05,.48,v.y);
        c=mix(c,vec3(.91,.9,.82),haze*.22);
        float cl=cloud(vec2(v.x*1.15+time*.002,v.y*1.3));
        c=mix(c,vec3(.91,.93,.9),cl*.13*smoothstep(.32,.78,v.y));
        gl_FragColor=vec4(c,1.);
      }`,
  });
  box(room, [3.6, 2.9, 0.1], [2.35, 2.6, -2.45], vista);
  [
    [0.48, 2.6, 0.12, 3.12],
    [4.22, 2.6, 0.12, 3.12],
    [2.35, 1.1, 3.85, 0.12],
    [2.35, 4.12, 3.85, 0.12],
  ].forEach(([x, y, w, h]) => box(room, [w, h, 0.25], [x, y, -2.15], wood));
  box(room, [7, 0.16, 3.7], [0, 0.78, 0], wood);
  [-2.8, 2.8].forEach((x) => box(room, [0.18, 0.8, 2.8], [x, 0.3, 0], wood));
  const cabinet = new T.Group();
  cabinet.position.set(-1.45, 0.86, -0.65);
  room.add(cabinet);
  cabinet.userData.action = 'cabinet';
  const cabinetBack = mat('#a99f8d', 0.92);
  const cabinetWood = mat('#b8ac94', 0.78);
  box(cabinet, [2.2, 2.22, 0.1], [0, 1.13, -0.5], cabinetBack);
  [-1.16, 1.16].forEach((x) =>
    box(cabinet, [0.14, 2.42, 1.08], [x, 1.16, 0], cabinetWood),
  );
  [0, 1.15, 2.35].forEach((y) =>
    box(cabinet, [2.46, 0.13, 1.08], [0, y, 0], cabinetWood),
  );
  [-0.38, 0.38].forEach((x) =>
    box(cabinet, [0.075, 2.22, 1.02], [x, 1.14, 0], cabinetWood),
  );
  box(cabinet, [2.7, 0.1, 1.2], [0, 2.48, 0], cabinetWood);
  const shelfBottles = [];
  for (let i = 0; i < 6; i++) {
    const b = makeBottle(cabinet, 0.58);
    b.position.set(((i % 3) - 1) * 0.76, 0.08 + Math.floor(i / 3) * 1.17, 0.08);
    b.rotation.y = ((i % 3) - 1) * 0.08;
    b.userData.action = 'records';
    shelfBottles.push(b);
  }
  const diary = new T.Group();
  diary.position.set(1.55, 0.9, 0.48);
  diary.rotation.y = -0.15;
  room.add(diary);
  diary.userData.action = 'diary';
  const cloth = mat('#6c8279');
  box(diary, [1.65, 0.08, 2.03], [0, 0, 0], cloth);
  box(diary, [1.53, 0.22, 1.94], [0.01, 0.13, 0], mat('#f0eadd'));
  const cover = new T.Group();
  cover.position.set(-0.82, 0.29, 0);
  diary.add(cover);
  const coverMesh = box(cover, [1.65, 0.07, 2.03], [0.82, 0, 0], cloth);
  // This pale lining turns into the left-hand page as the cover opens.
  box(cover, [1.53, 0.035, 1.91], [0.82, -0.052, 0], mat('#f0eadd'));
  const title = mesh(
    new T.PlaneGeometry(1.4, 0.7),
    new T.MeshStandardMaterial({ map: label('我的经历'), roughness: 1 }),
    cover,
    [0.82, 0.038, -0.2],
  );
  title.rotation.x = -Math.PI / 2;
  const ribbon = box(
    diary,
    [0.07, 0.015, 0.35],
    [0.35, 0.03, 1.08],
    mat('#b8ad8c'),
  );
  const ripple = mesh(
    new T.RingGeometry(0.97, 1, 96),
    new T.MeshBasicMaterial({
      color: '#deeeeb',
      transparent: true,
      opacity: 0,
      side: T.DoubleSide,
      depthWrite: false,
    }),
    scene,
  );
  ripple.rotation.x = -Math.PI / 2;
  ripple.position.y = 0.045;
  ripple.visible = false;

  let view = 'home',
    tween = null,
    busy = false,
    drag = null,
    progress = 0,
    hoverX = 0,
    hoverY = 0,
    waveAt = -100,
    throwTween = null,
    sealTween = null,
    frame = 0,
    capLift = 0,
    pickupTween = null,
    bottleKind = 'receive',
    easedHoverX = 0,
    easedHoverY = 0;
  let currentLook = V(0, 0.65, 0),
    cameraBase = V(0, 4.3, 23),
    sampleVisible = true;
  const ray = new T.Raycaster(),
    pointer = new T.Vector2();
  function pose(name) {
    const mobile = innerWidth < 700;
    const poses = {
      home: [
        [0, 4.3, mobile ? 31 : 23],
        [0, 0.65, 0],
      ],
      island: [
        [0.8, 3.1, mobile ? 15 : 11],
        [0, 1, 0],
      ],
      room: [
        [100, 3.5, mobile ? 10.6 : 7.1],
        [100, 1.55, 0],
      ],
      cabinet: [
        [98.55, 2.9, mobile ? 6.5 : 4.45],
        [98.55, 1.95, -0.55],
      ],
      diary: [
        [101.6, 4.4, 4.7],
        [101.4, 1.1, 0.1],
      ],
      bottle: [
        [0.8, 1.72, mobile ? 14 : 13.2],
        [0.8, 1.02, 9],
      ],
    };
    return poses[name] ?? poses.home;
  }
  function go(name, instant = false) {
    const previousView = view;
    view = name;
    const p = pose(name);
    const indoor = ['room', 'cabinet', 'diary'].includes(name);
    room.visible = indoor;
    water.visible = !indoor;
    roomLight.visible = indoor;
    sun.visible = !indoor;
    island.visible = !indoor;
    bottle.visible = !indoor && (sampleVisible || name === 'bottle');
    capLift = 0;
    bottle.userData.cork.position.y = 1.62;
    bottle.userData.cork.rotation.z = 0;
    if (name === 'bottle') {
      if (previousView !== 'bottle') {
        if (bottleKind === 'write') {
          bottle.position.set(0.8, -0.72, 9.05);
          bottle.rotation.set(0, 0, 0);
          bottle.scale.setScalar(0.66);
        }
        bottle.userData.paper.visible = bottleKind === 'receive';
        bottle.userData.tie.visible = bottleKind === 'receive';
        pickupTween = {
          at: performance.now() + (reduced ? 0 : 180),
          duration: reduced ? 1 : 1250,
          from: bottle.position.clone(),
          to: V(0.8, 0.3, 9.05),
          rotationFrom: bottle.rotation.z,
          scaleFrom: bottle.scale.x,
        };
        busy = true;
      } else if (!pickupTween) {
        bottle.position.set(0.8, 0.3, 9.05);
        bottle.scale.setScalar(0.78);
        bottle.rotation.z = 0;
      }
    } else if (!throwTween) {
      bottle.userData.paper.visible = true;
      bottle.userData.tie.visible = true;
      bottle.scale.setScalar(0.75);
      bottle.position.set(0.8, 0.01, 9);
      bottle.rotation.z = -0.38;
    }
    const jump = Math.abs(cameraBase.x - p[0][0]) > 50;
    if (jump || instant) {
      cameraBase.fromArray(p[0]);
      currentLook.fromArray(p[1]);
      tween = null;
      busy = !!pickupTween;
    } else {
      tween = {
        at: performance.now(),
        duration: reduced ? 1 : 1050,
        from: cameraBase.clone(),
        to: V(...p[0]),
        lookFrom: currentLook.clone(),
        lookTo: V(...p[1]),
      };
      busy = true;
    }
  }
  go('home', true);
  function project(position) {
    const p = position.clone().project(camera);
    return {
      x: (p.x * 0.5 + 0.5) * innerWidth,
      y: (-0.5 * p.y + 0.5) * innerHeight,
      visible: p.z < 1 && p.z > -1,
    };
  }
  function hit(e) {
    pointer.set(
      (e.clientX / innerWidth) * 2 - 1,
      (-e.clientY / innerHeight) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    const list =
      view === 'room'
        ? [cabinet, diary]
        : view === 'cabinet'
          ? [cabinet]
          : view === 'bottle'
            ? [bottle]
            : [island, bottle].filter((o) => o.visible);
    const hits = ray.intersectObjects(list, true);
    for (const h of hits) {
      let o = h.object;
      while (o) {
        if (
          o.userData.action &&
          (o.userData.action !== 'cork' || view === 'bottle')
        )
          return o;
        o = o.parent;
      }
    }
    return null;
  }
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (busy || throwTween || sealTween || e.button > 0) return;
    const h = hit(e);
    drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      lastY: e.clientY,
      moved: 0,
      hit: h,
      cap: view === 'bottle',
    };
    renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    hoverX = e.clientX / innerWidth - 0.5;
    hoverY = e.clientY / innerHeight - 0.5;
    if (!drag || drag.id !== e.pointerId) {
      container.classList.toggle('over-object', !!hit(e));
      return;
    }
    drag.moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    if (drag.cap) {
      capLift = T.MathUtils.clamp((drag.y - e.clientY) / 110, 0, 1);
      bottle.userData.cork.position.y = 1.62 + capLift * 0.7;
      bottle.userData.cork.rotation.z = -capLift * 0.35;
      if (capLift > 0.7) {
        drag = null;
        onAction('uncork');
      }
    } else if (
      ['home', 'island'].includes(view) &&
      (!drag.hit || drag.hit.userData.action === 'bottle')
    ) {
      progress = T.MathUtils.clamp(
        progress + (e.clientY - drag.lastY) / 260,
        0,
        1,
      );
      bottle.position.z = 9 + progress * 3;
      bottle.scale.setScalar(0.75 + progress * 0.4);
      if (progress > 0.97) {
        drag = null;
        progress = 0;
        onAction('bottle');
      }
    }
    drag && (drag.lastY = e.clientY);
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.cap) {
      capLift = 0;
      bottle.userData.cork.position.y = 1.62;
      bottle.userData.cork.rotation.z = 0;
      return;
    }
    if (d.moved < 9 && d.hit) {
      const action = d.hit.userData.action;
      onAction(action === 'records' && view === 'room' ? 'cabinet' : action);
    }
  });
  renderer.domElement.addEventListener('pointercancel', () => {
    drag = null;
    capLift = 0;
    bottle.userData.cork.position.y = 1.62;
  });
  renderer.domElement.addEventListener('pointerleave', () => {
    hoverX = 0;
    hoverY = 0;
  });
  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    go(view, true);
  }
  window.addEventListener('resize', resize);
  function animate(now) {
    frame = requestAnimationFrame(animate);
    if (document.hidden) return;
    const t = now * 0.001;
    vista.uniforms.time.value = reduced ? 0 : t * 0.3;
    if (tween) {
      const p = Math.min(1, (now - tween.at) / tween.duration),
        e = ease(p);
      cameraBase.lerpVectors(tween.from, tween.to, e);
      currentLook.lerpVectors(tween.lookFrom, tween.lookTo, e);
      if (p === 1) {
        tween = null;
        busy = !!pickupTween;
      }
    }
    if (pickupTween && now >= pickupTween.at) {
      const p = Math.min(1, (now - pickupTween.at) / pickupTween.duration),
        e = ease(p),
        lift = Math.sin(p * Math.PI) * 0.24;
      bottle.position.lerpVectors(pickupTween.from, pickupTween.to, e);
      bottle.position.y += lift;
      bottle.rotation.z = T.MathUtils.lerp(pickupTween.rotationFrom, 0, e);
      bottle.rotation.y = Math.sin(p * Math.PI) * -0.16;
      bottle.scale.setScalar(T.MathUtils.lerp(pickupTween.scaleFrom, 0.78, e));
      if (p === 1) {
        pickupTween = null;
        busy = !!tween;
        bottle.rotation.y = 0;
        onAction('picked');
      }
    }
    if (sealTween) {
      const p = Math.min(1, (now - sealTween.at) / sealTween.duration),
        e = ease(p);
      bottle.userData.paper.visible = true;
      bottle.userData.paper.position.y = T.MathUtils.lerp(1.38, 0.62, e);
      bottle.userData.paper.scale.y = T.MathUtils.lerp(0.18, 1, e);
      bottle.userData.tie.visible = p > 0.68;
      bottle.userData.cork.position.y = T.MathUtils.lerp(2.35, 1.62, e);
      bottle.userData.cork.rotation.z = T.MathUtils.lerp(-0.45, 0, e);
      if (p === 1) {
        sealTween = null;
        bottle.userData.paper.position.y = 0.62;
        bottle.userData.paper.scale.set(1, 1, 1);
        go('home');
        bottle.visible = true;
        throwTween = {
          at: now + (reduced ? 0 : 120),
          duration: reduced ? 80 : 1800,
          from: V(0.8, 0.2, 10),
          to: V(2, 0.02, 5),
        };
      }
    }
    camera.position.copy(cameraBase);
    easedHoverX = T.MathUtils.lerp(easedHoverX, hoverX, 0.055);
    easedHoverY = T.MathUtils.lerp(easedHoverY, hoverY, 0.055);
    if (!reduced && !busy) {
      const outdoor = !['room', 'cabinet', 'diary'].includes(view);
      camera.position.x += easedHoverX * (outdoor ? 0.62 : 0.18);
      camera.position.y -= easedHoverY * (outdoor ? 0.2 : 0.07);
    }
    const parallaxLook = currentLook.clone();
    if (!reduced && !busy && !['room', 'cabinet', 'diary'].includes(view)) {
      parallaxLook.x -= easedHoverX * 0.16;
      parallaxLook.y += easedHoverY * 0.06;
    }
    camera.lookAt(parallaxLook);
    if (!reduced) water.material.uniforms.time.value = t * 0.32;
    if (!throwTween && view !== 'bottle') {
      bottle.position.y = 0.02 + Math.sin(t * 1.2) * 0.065;
      bottle.rotation.z = -0.38 + Math.sin(t * 0.8) * 0.055;
    }
    if (view === 'diary')
      cover.rotation.z = T.MathUtils.lerp(cover.rotation.z, 3.05, 0.075);
    else cover.rotation.z = T.MathUtils.lerp(cover.rotation.z, 0, 0.075);
    if (throwTween) {
      const p = Math.min(1, (now - throwTween.at) / throwTween.duration);
      bottle.position.lerpVectors(throwTween.from, throwTween.to, p);
      bottle.position.y += Math.sin(p * Math.PI) * 2.8;
      bottle.rotation.z = p * 1.7;
      const s = 0.85 - 0.4 * p;
      bottle.scale.setScalar(s);
      if (p === 1) {
        ripple.position.set(bottle.position.x, 0.045, bottle.position.z);
        waveAt = t;
        ripple.visible = true;
        throwTween = null;
        onAction('landed');
      }
    }
    const wave = t - waveAt;
    if (wave < 2.5) {
      ripple.scale.setScalar(0.2 + wave * 2.6);
      ripple.material.opacity = (1 - wave / 2.5) * 0.38;
    } else ripple.visible = false;
    renderer.render(scene, camera);
    const corkPos = bottle.userData.cork.getWorldPosition(new T.Vector3());
    onFrame?.({
      house: project(V(0, 1.15, 1)),
      bottle: project(bottle.position.clone().add(V(0, 0.65, 0))),
      cork: project(corkPos),
      cabinet: project(V(98.55, 1.8, 0.1)),
      diary: project(V(101.55, 1.1, 0.48)),
      busy,
    });
  }
  frame = requestAnimationFrame(animate);
  return {
    go,
    setBottleKind(value) {
      bottleKind = value === 'write' ? 'write' : 'receive';
    },
    setSampleVisible(value) {
      sampleVisible = value;
      if (!['room', 'cabinet', 'diary', 'bottle'].includes(view)) {
        bottle.visible = value;
        if (value && !throwTween) {
          bottle.position.set(0.8, 0.01, 9);
          bottle.scale.setScalar(0.75);
          bottle.rotation.z = -0.38;
        }
      }
    },
    uncork() {
      capLift = 1;
      bottle.userData.cork.position.y = 2.35;
      bottle.userData.cork.rotation.z = -0.45;
    },
    launch() {
      bottle.userData.paper.visible = true;
      bottle.userData.paper.position.y = 1.38;
      bottle.userData.paper.scale.set(1, 0.18, 1);
      bottle.userData.tie.visible = false;
      bottle.visible = true;
      busy = true;
      sealTween = {
        at: performance.now(),
        duration: reduced ? 1 : 720,
      };
    },
    updateCabinet() {
      shelfBottles.forEach((b) => {
        b.visible = true;
      });
    },
    dispose() {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      env.dispose();
      renderer.dispose();
    },
  };
}
