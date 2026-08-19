// Mise en place de la scène Three.js + construction des modèles 3D
// (chats, chien, arches de porte) à partir de primitives low-poly.
// Tout est généré par code : aucune bibliothèque de modèles externe.

function checkWebGL(){
  try{
    const test = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (test.getContext('webgl') || test.getContext('experimental-webgl')));
  }catch(e){ return false; }
}

const webglSupported = checkWebGL();

let scene, camera, renderer, sunLight;
let leaderGroup, bossGroup;
let enemyVisuals = []; // pool de groupes 3D réutilisés, index-aligné avec enemyPool (state.js)
let followerBodyInst, followerHeadInst, followerShadowInst;
let iconTextures = {};
let doorGlowTexture;
let catMaterial, followerMaterial, bossMaterial, enemyMaterial, shadowMaterial;
let particleGeometry, projectileGeometry;
const dummy3D = webglSupported ? new THREE.Object3D() : null;

function createIconTexture(kind){
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const cx = c.getContext('2d');
  cx.translate(size/2, size/2);
  cx.scale(2.6, 2.6);
  if(kind === 'croquette'){
    cx.fillStyle = '#E3A857';
    [[-8,4],[8,4],[0,-6]].forEach(off=>{
      cx.beginPath();
      cx.ellipse(off[0], off[1], 9, 7, 0.3, 0, Math.PI*2);
      cx.fill();
    });
  } else if(kind === 'heart'){
    cx.fillStyle = '#E0607A';
    cx.beginPath();
    cx.moveTo(0, -4);
    cx.bezierCurveTo(-2, -10, -14, -10, -14, -2);
    cx.bezierCurveTo(-14, 6, -6, 10, 0, 16);
    cx.bezierCurveTo(6, 10, 14, 6, 14, -2);
    cx.bezierCurveTo(14, -10, 2, -10, 0, -4);
    cx.fill();
  } else {
    cx.fillStyle = '#5B8FBF';
    cx.beginPath();
    cx.moveTo(0,-14);
    cx.quadraticCurveTo(14,6,0,16);
    cx.quadraticCurveTo(-14,6,0,-14);
    cx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function createGroundTexture(){
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const cx = c.getContext('2d');
  cx.fillStyle = '#8FAE6B';
  cx.fillRect(0,0,256,256);
  // allée centrale plus claire
  cx.fillStyle = '#A9C486';
  cx.fillRect(96, 0, 64, 256);
  // touffes d'herbe décoratives
  cx.fillStyle = 'rgba(90,120,70,0.35)';
  for(let i=0;i<40;i++){
    const x = Math.random()*256, y = Math.random()*256;
    cx.beginPath();
    cx.ellipse(x, y, 5, 3, Math.random()*Math.PI, 0, Math.PI*2);
    cx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 22);
  return tex;
}

function createSkyTexture(){
  const w = 300, h = 600;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d');
  const grad = cx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#7FB2E0');
  grad.addColorStop(0.42, '#BEE0EC');
  grad.addColorStop(0.72, '#F3E3C4');
  grad.addColorStop(1, '#F6E9CF');
  cx.fillStyle = grad;
  cx.fillRect(0, 0, w, h);

  cx.fillStyle = 'rgba(255,255,255,0.8)';
  const clouds = [[0.18,0.14],[0.68,0.10],[0.42,0.24],[0.85,0.27],[0.1,0.32],[0.55,0.33]];
  clouds.forEach(([cxr,cyr])=>{
    const px = cxr*w, py = cyr*h;
    for(let i=0;i<4;i++){
      cx.beginPath();
      cx.ellipse(px + (Math.random()-0.5)*36, py + (Math.random()-0.5)*8, 20+Math.random()*12, 11+Math.random()*5, 0, 0, Math.PI*2);
      cx.fill();
    }
  });

  return new THREE.CanvasTexture(c);
}

function createGlowTexture(){
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const cx = c.getContext('2d');
  const grad = cx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = grad;
  cx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function createSunGlowTexture(){
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const cx = c.getContext('2d');
  const grad = cx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  grad.addColorStop(0, 'rgba(255,250,230,0.9)');
  grad.addColorStop(0.4, 'rgba(255,244,214,0.35)');
  grad.addColorStop(1, 'rgba(255,244,214,0)');
  cx.fillStyle = grad;
  cx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function buildMountainRange(){
  const matFar = new THREE.MeshStandardMaterial({ color: 0x7E9C9C, flatShading:true, roughness:1 });
  const matNear = new THREE.MeshStandardMaterial({ color: 0x5F8778, flatShading:true, roughness:1 });
  for(let i=0;i<9;i++){
    const x = -34 + i*8.5 + (Math.random()-0.5)*3;
    const height = 9 + Math.random()*7;
    const radius = 7 + Math.random()*4;
    const geo = new THREE.ConeGeometry(radius, height, 5);
    const mesh = new THREE.Mesh(geo, i % 2 === 0 ? matFar : matNear);
    mesh.position.set(x, height/2 - 0.6, -40 - Math.random()*10);
    mesh.rotation.y = Math.random()*Math.PI;
    scene.add(mesh);
  }
}

function buildCatGroup(colorHex, detailed){
  const g = new THREE.Group();
  const mat = detailed ? catMaterial : followerMaterial;

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), mat);
  body.scale.set(1, 0.82, 1.35);
  body.position.y = 0.34;
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), mat);
  head.position.set(0, 0.58, -0.32);
  g.add(head);

  if(detailed){
    const earGeo = new THREE.ConeGeometry(0.09, 0.16, 4);
    const earL = new THREE.Mesh(earGeo, mat);
    earL.position.set(-0.13, 0.78, -0.34);
    earL.rotation.z = -0.3;
    g.add(earL);
    const earR = earL.clone();
    earR.position.x = 0.13;
    earR.rotation.z = 0.3;
    g.add(earR);

    const tail1 = new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.06,0.5,6), mat);
    tail1.position.set(0, 0.42, 0.55);
    tail1.rotation.x = -0.9;
    g.add(tail1);
    const tail2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.045,0.35,6), mat);
    tail2.position.set(0, 0.62, 0.78);
    tail2.rotation.x = -1.9;
    g.add(tail2);

    const eyeGeo = new THREE.SphereGeometry(0.035, 6, 6);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2a2018 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.09, 0.6, -0.52);
    g.add(eyeL);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.09;
    g.add(eyeR);
  }

  return g;
}

function buildBossGroup(mat){
  const g = new THREE.Group();

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), mat);
  body.scale.set(1.05, 0.85, 1.3);
  body.position.y = 0.68;
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), mat);
  head.position.set(0, 1.15, -0.55);
  g.add(head);

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), mat);
  muzzle.scale.set(1, 0.8, 1.3);
  muzzle.position.set(0, 1.03, -0.88);
  g.add(muzzle);

  const earGeo = new THREE.ConeGeometry(0.16, 0.3, 4);
  const earL = new THREE.Mesh(earGeo, mat);
  earL.position.set(-0.28, 1.42, -0.5);
  earL.rotation.z = -0.4;
  g.add(earL);
  const earR = earL.clone();
  earR.position.x = 0.28;
  earR.rotation.z = 0.4;
  g.add(earR);

  const eyeGeo = new THREE.SphereGeometry(0.05, 6, 6);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1410 });
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.15, 1.18, -0.9);
  g.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.15;
  g.add(eyeR);

  return g;
}

const DOOR_COLORS = { croquette: 0x6B8F71, water: 0x5B8FBF, heart: 0xD9607A };

function buildDoorPanel(kind){
  const g = new THREE.Group();
  const color = DOOR_COLORS[kind];
  const width = 1.9, height = 1.6;

  // panneau translucide (la porte elle-même)
  const panelGeo = new THREE.PlaneGeometry(width, height);
  const panelMat = new THREE.MeshStandardMaterial({
    color, transparent:true, opacity:0.3, side: THREE.DoubleSide,
    roughness:0.4, depthWrite:false
  });
  const panel = new THREE.Mesh(panelGeo, panelMat);
  panel.position.y = height/2;
  g.add(panel);

  // contour plein pour garder la porte lisible malgré la faible opacité
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(panelGeo),
    new THREE.LineBasicMaterial({ color, transparent:true, opacity:0.95 })
  );
  edges.position.y = height/2;
  g.add(edges);

  // halo incandescent derrière l'icône, pour repérer la bonne porte de loin
  const haloMat = new THREE.SpriteMaterial({
    map: doorGlowTexture, color, transparent:true, opacity:0.6,
    blending: THREE.AdditiveBlending, depthWrite:false
  });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.set(1.05, 1.05, 1);
  halo.position.set(0, height/2, 0.01);
  halo.renderOrder = 1;
  g.add(halo);

  const spriteMat = new THREE.SpriteMaterial({ map: iconTextures[kind], transparent:true });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(0.6, 0.6, 1);
  sprite.position.set(0, height/2, 0.02); // légèrement devant, évite le z-fighting
  sprite.renderOrder = 2;
  g.add(sprite);

  return g;
}

function buildGateVisual(goodLane, goodKind){
  const group = new THREE.Group();
  [0,1].forEach(i=>{
    const kind = i === goodLane ? goodKind : 'water';
    const door = buildDoorPanel(kind);
    door.position.x = LANES[i];
    group.add(door);
  });
  return group;
}

function disposeGateVisual(group){
  group.traverse(obj=>{
    if(obj.geometry) obj.geometry.dispose();
    if(obj.material) obj.material.dispose(); // ne dispose pas les textures d'icône (partagées)
  });
}

function buildProps(){
  // décor statique (arbres, buissons) le long du chemin pour donner de la
  // profondeur — géométries partagées, aucun impact perf notable.
  const trunkGeo = new THREE.CylinderGeometry(0.07, 0.1, 0.5, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8A6B4A, flatShading:true, roughness:0.9 });
  const foliageGeo = new THREE.ConeGeometry(0.55, 0.95, 7);
  const foliageMatA = new THREE.MeshStandardMaterial({ color: 0x6B8F71, flatShading:true, roughness:0.85 });
  const foliageMatB = new THREE.MeshStandardMaterial({ color: 0x7FA372, flatShading:true, roughness:0.85 });
  const bushGeo = new THREE.SphereGeometry(0.32, 7, 6);
  const canopyGeo = new THREE.IcosahedronGeometry(0.55, 0);
  const rockGeo = new THREE.IcosahedronGeometry(0.32, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x9B9186, flatShading:true, roughness:0.95 });
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x4F7A4A, flatShading:true, roughness:0.9 });
  const petalGeo = new THREE.SphereGeometry(0.045, 5, 4);
  const petalMats = [0xffffff, 0xE8A6C1, 0xC9A3E0].map(c=>
    new THREE.MeshStandardMaterial({ color:c, flatShading:true, roughness:0.7 }));

  function buildTree(){
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.25;
    g.add(trunk);
    const mat = Math.random() < 0.5 ? foliageMatA : foliageMatB;
    const top1 = new THREE.Mesh(foliageGeo, mat);
    top1.position.y = 0.85;
    g.add(top1);
    const top2 = new THREE.Mesh(foliageGeo, mat);
    top2.position.y = 1.2;
    top2.scale.setScalar(0.72);
    g.add(top2);
    return g;
  }

  function buildRoundTree(){
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.scale.y = 1.3;
    trunk.position.y = 0.32;
    g.add(trunk);
    const mat = Math.random() < 0.5 ? foliageMatA : foliageMatB;
    const canopy = new THREE.Mesh(canopyGeo, mat);
    canopy.position.y = 1.05;
    canopy.scale.y = 0.85;
    g.add(canopy);
    return g;
  }

  function buildBush(){
    const g = new THREE.Group();
    const mat = Math.random() < 0.5 ? foliageMatA : foliageMatB;
    for(let i=0;i<3;i++){
      const s = new THREE.Mesh(bushGeo, mat);
      s.position.set((Math.random()-0.5)*0.35, 0.2 + Math.random()*0.1, (Math.random()-0.5)*0.35);
      s.scale.setScalar(0.75 + Math.random()*0.4);
      g.add(s);
    }
    return g;
  }

  function buildRock(){
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.scale.set(0.7 + Math.random()*0.6, 0.5 + Math.random()*0.4, 0.7 + Math.random()*0.6);
    rock.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
    return rock;
  }

  function buildFlowerClump(){
    const g = new THREE.Group();
    for(let i=0;i<4;i++){
      const ang = Math.random()*Math.PI*2, r = Math.random()*0.14;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01,0.015,0.16,4), stemMat);
      stem.position.set(Math.cos(ang)*r, 0.08, Math.sin(ang)*r);
      g.add(stem);
      const bloom = new THREE.Mesh(petalGeo, petalMats[Math.floor(Math.random()*petalMats.length)]);
      bloom.position.set(stem.position.x, 0.17, stem.position.z);
      g.add(bloom);
    }
    return g;
  }

  function randomProp(){
    const r = Math.random();
    if(r < 0.26) return buildTree();
    if(r < 0.44) return buildRoundTree();
    if(r < 0.62) return buildBush();
    if(r < 0.8) return buildRock();
    return buildFlowerClump();
  }

  for(let z = -78; z < 8; z += 5.5){
    [-1, 1].forEach(side=>{
      const x = side * (3.6 + Math.random()*2.2);
      const prop = randomProp();
      prop.position.set(x + (Math.random()-0.5)*0.8, 0, z + (Math.random()-0.5)*2);
      prop.rotation.y = Math.random()*Math.PI*2;
      scene.add(prop);
    });
  }

  // touffes de fleurs en premier plan, près du chemin
  for(let i=0;i<10;i++){
    const side = Math.random() < 0.5 ? -1 : 1;
    const clump = buildFlowerClump();
    clump.position.set(side*(2.0 + Math.random()*0.8), 0, -6 + Math.random()*12);
    clump.rotation.y = Math.random()*Math.PI*2;
    scene.add(clump);
  }

  buildGrass();
}

function buildGrass(){
  // brins d'herbe en premier plan, en instanced mesh (un seul draw call)
  // pour donner de la texture au sol près du joueur, comme sur les refs
  const bladeGeo = new THREE.ConeGeometry(0.022, 0.24, 3);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x6F9A52, flatShading:true, roughness:0.9 });
  const cap = 240;
  const grassInst = new THREE.InstancedMesh(bladeGeo, bladeMat, cap);
  const dummy = new THREE.Object3D();
  let gi = 0;
  for(let z=-16; z<9 && gi<cap; z+=0.55){
    for(let k=0; k<2 && gi<cap; k++){
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side * (1.85 + Math.random()*1.5);
      dummy.position.set(x, 0.1, z + (Math.random()-0.5)*0.5);
      dummy.rotation.y = Math.random()*Math.PI;
      dummy.rotation.z = (Math.random()-0.5)*0.35;
      dummy.scale.setScalar(0.7 + Math.random()*0.6);
      dummy.updateMatrix();
      grassInst.setMatrixAt(gi++, dummy.matrix);
    }
  }
  grassInst.count = gi;
  grassInst.instanceMatrix.needsUpdate = true;
  scene.add(grassInst);
}

function initScene(){
  if(!webglSupported) return;

  scene = new THREE.Scene();
  const skyColor = 0xF6E9CF;
  scene.background = createSkyTexture();
  scene.fog = new THREE.FogExp2(skyColor, 0.026);

  camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  camera.position.set(0, 4.1, 7.2);
  camera.lookAt(0, 0.9, -10);

  renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const hemi = new THREE.HemisphereLight(0xfff6e0, 0x74926f, 1.0);
  scene.add(hemi);
  sunLight = new THREE.DirectionalLight(0xfff1d8, 1.0);
  sunLight.position.set(4, 8, 4);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 24;
  sunLight.shadow.camera.left = -8;
  sunLight.shadow.camera.right = 8;
  sunLight.shadow.camera.top = 8;
  sunLight.shadow.camera.bottom = -14;
  sunLight.shadow.bias = -0.003;
  scene.add(sunLight);
  scene.add(sunLight.target); // la cible suit le joueur (voir syncLight)

  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createSunGlowTexture(), transparent:true, depthWrite:false, fog:false
  }));
  sunGlow.scale.set(20, 20, 1);
  sunGlow.position.set(9, 11, -55);
  scene.add(sunGlow);

  buildMountainRange();

  // matériaux partagés
  catMaterial = new THREE.MeshStandardMaterial({ color: 0xC97B4F, flatShading:true, roughness:0.8 });
  followerMaterial = new THREE.MeshStandardMaterial({ color: 0xD9A066, flatShading:true, roughness:0.8 });
  bossMaterial = new THREE.MeshStandardMaterial({ color: BOSS_TINT, flatShading:true, roughness:0.8 });
  enemyMaterial = new THREE.MeshStandardMaterial({ color: ENEMY_TINT, flatShading:true, roughness:0.8 });
  shadowMaterial = new THREE.MeshBasicMaterial({ color:0x000000, transparent:true, opacity:0.18 });

  iconTextures.croquette = createIconTexture('croquette');
  iconTextures.water = createIconTexture('water');
  iconTextures.heart = createIconTexture('heart');
  doorGlowTexture = createGlowTexture();
  particleGeometry = new THREE.SphereGeometry(0.07, 6, 6);
  projectileGeometry = new THREE.SphereGeometry(0.11, 8, 6);

  // sol
  const groundGeo = new THREE.PlaneGeometry(12, 90);
  const groundMat = new THREE.MeshStandardMaterial({ map: createGroundTexture(), roughness:1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI/2;
  ground.position.set(0, 0, -35);
  ground.receiveShadow = true;
  scene.add(ground);

  buildProps();

  // leader (le chat du joueur) — ombre portée dynamique (peu de casters, coût négligeable)
  leaderGroup = buildCatGroup(0xC97B4F, true);
  leaderGroup.scale.setScalar(1.15);
  leaderGroup.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
  scene.add(leaderGroup);

  // boss (unique, apparaît en fin de parcours)
  bossGroup = buildBossGroup(bossMaterial);
  bossGroup.visible = false;
  bossGroup.scale.setScalar(1);
  bossGroup.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
  scene.add(bossGroup);

  // ennemis réguliers : pool de visuels réutilisés (perf), plus léger que le
  // boss (pas d'ombre portée — trop d'ennemis simultanés pour que ça vaille
  // le coup), index-alignés avec le tableau de données enemyPool (state.js)
  enemyVisuals = [];
  enemyPool = [];
  for(let i=0;i<MAX_ENEMIES;i++){
    const g = buildBossGroup(enemyMaterial);
    g.scale.setScalar(0.6);
    g.visible = false;
    scene.add(g);
    enemyVisuals.push(g);
    enemyPool.push({ active:false, hp:0, maxHp:0, x:0, z:0, speed:0 });
  }

  // suiveurs de la horde, en instanced mesh pour rester léger sur mobile
  const followerBodyGeo = new THREE.SphereGeometry(0.32, 8, 6);
  followerBodyInst = new THREE.InstancedMesh(followerBodyGeo, followerMaterial, MAX_INSTANCED_CATS);
  followerBodyInst.count = 0;
  scene.add(followerBodyInst);

  const followerHeadGeo = new THREE.SphereGeometry(0.22, 8, 6);
  followerHeadInst = new THREE.InstancedMesh(followerHeadGeo, followerMaterial, MAX_INSTANCED_CATS);
  followerHeadInst.count = 0;
  scene.add(followerHeadInst);

  const shadowGeo = new THREE.CircleGeometry(0.3, 8);
  shadowGeo.rotateX(-Math.PI/2);
  followerShadowInst = new THREE.InstancedMesh(shadowGeo, shadowMaterial, MAX_INSTANCED_CATS);
  followerShadowInst.count = 0;
  scene.add(followerShadowInst);

  onResize();
}

function onResize(){
  if(!webglSupported || !renderer) return;
  const w = canvas.clientWidth || 400;
  const h = canvas.clientHeight || 700;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
