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

let scene, camera, renderer;
let leaderGroup, bossGroup;
let followerBodyInst, followerHeadInst, followerShadowInst;
let iconTextures = {};
let catMaterial, followerMaterial, bossMaterial, shadowMaterial;
let particleGeometry;
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

function buildBossGroup(){
  const g = new THREE.Group();

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), bossMaterial);
  body.scale.set(1.05, 0.85, 1.3);
  body.position.y = 0.68;
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), bossMaterial);
  head.position.set(0, 1.15, -0.55);
  g.add(head);

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), bossMaterial);
  muzzle.scale.set(1, 0.8, 1.3);
  muzzle.position.set(0, 1.03, -0.88);
  g.add(muzzle);

  const earGeo = new THREE.ConeGeometry(0.16, 0.3, 4);
  const earL = new THREE.Mesh(earGeo, bossMaterial);
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

function buildDoorPanel(good){
  const g = new THREE.Group();
  const color = good ? 0x6B8F71 : 0x5B8FBF;
  const width = 1.5, height = 1.6;

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

  const iconTex = good ? iconTextures.croquette : iconTextures.water;
  const spriteMat = new THREE.SpriteMaterial({ map: iconTex, transparent:true });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(0.6, 0.6, 1);
  sprite.position.set(0, height/2, 0.02); // légèrement devant, évite le z-fighting
  g.add(sprite);

  return g;
}

function buildGateVisual(goodLane){
  const group = new THREE.Group();
  [0,1].forEach(i=>{
    const door = buildDoorPanel(i === goodLane);
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

function makeBlobShadow(radius){
  const geo = new THREE.CircleGeometry(radius, 12);
  geo.rotateX(-Math.PI/2);
  return new THREE.Mesh(geo, shadowMaterial);
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

  for(let z = -78; z < 8; z += 5.5){
    [-1, 1].forEach(side=>{
      const x = side * (3.6 + Math.random()*2.2);
      const prop = Math.random() < 0.55 ? buildTree() : buildBush();
      prop.position.set(x + (Math.random()-0.5)*0.8, 0, z + (Math.random()-0.5)*2);
      prop.rotation.y = Math.random()*Math.PI*2;
      scene.add(prop);
    });
  }
}

function initScene(){
  if(!webglSupported) return;

  scene = new THREE.Scene();
  const skyColor = 0xF6E9CF;
  scene.background = new THREE.Color(skyColor);
  scene.fog = new THREE.Fog(skyColor, 18, 60);

  camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  camera.position.set(0, 4.1, 7.2);
  camera.lookAt(0, 0.9, -10);

  renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const hemi = new THREE.HemisphereLight(0xfff3df, 0x6b8f71, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(4, 8, 4);
  scene.add(sun);

  // matériaux partagés
  catMaterial = new THREE.MeshStandardMaterial({ color: 0xC97B4F, flatShading:true, roughness:0.8 });
  followerMaterial = new THREE.MeshStandardMaterial({ color: 0xD9A066, flatShading:true, roughness:0.8 });
  bossMaterial = new THREE.MeshStandardMaterial({ color: 0x8A7361, flatShading:true, roughness:0.8 });
  shadowMaterial = new THREE.MeshBasicMaterial({ color:0x000000, transparent:true, opacity:0.18 });

  iconTextures.croquette = createIconTexture('croquette');
  iconTextures.water = createIconTexture('water');
  particleGeometry = new THREE.SphereGeometry(0.07, 6, 6);

  // sol
  const groundGeo = new THREE.PlaneGeometry(12, 90);
  const groundMat = new THREE.MeshStandardMaterial({ map: createGroundTexture(), roughness:1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI/2;
  ground.position.set(0, 0, -35);
  scene.add(ground);

  buildProps();

  // leader (le chat du joueur)
  leaderGroup = buildCatGroup(0xC97B4F, true);
  leaderGroup.scale.setScalar(1.15);
  const leaderShadow = makeBlobShadow(0.42);
  leaderShadow.position.y = 0.01;
  leaderGroup.add(leaderShadow);
  scene.add(leaderGroup);

  // boss (le chien)
  bossGroup = buildBossGroup();
  bossGroup.visible = false;
  const bossShadow = makeBlobShadow(0.8);
  bossShadow.position.y = 0.01;
  bossGroup.add(bossShadow);
  scene.add(bossGroup);

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
