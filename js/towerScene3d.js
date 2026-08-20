// Scène 3D du mode "Chatteau Fort" : caméra fixe en plongée sur un plateau
// statique (contrairement au couloir qui défile du mode Bataille), avec son
// propre THREE.Scene/Camera — le WebGLRenderer, lui, reste unique et partagé
// (voir renderTower() dans towerRender3d.js), pas besoin d'un second canvas.
// Réutilise volontairement les mêmes fonctions/matériaux de dessin que le
// mode Bataille (buildCatGroup, buildBossGroup, catMaterial, enemyMaterial —
// tous définis dans scene3d.js) pour que les deux modes se ressemblent,
// plutôt que de recréer des chats/chiens spécifiques à ce mode.
let towerScene, towerCamera, towerRaycaster, towerPointerNDC;

// Texture d'un cercle en pointillés — l'emplacement de tourelle libre, posé
// à plat sur le sol (même technique que createGlowTexture()/createPickupTexture()
// dans scene3d.js : un canvas dessiné une fois, transformé en CanvasTexture).
function createSlotMarkerTexture(){
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const cx = c.getContext('2d');
  cx.strokeStyle = 'rgba(59,50,38,0.55)';
  cx.lineWidth = 8;
  cx.setLineDash([11, 9]);
  cx.beginPath();
  cx.arc(size/2, size/2, size/2 - 6, 0, Math.PI*2);
  cx.stroke();
  return new THREE.CanvasTexture(c);
}

// Un emplacement par SEGMENT du chemin (alterné à gauche/droite), décalé
// perpendiculairement — si on retouche TOWER_PATH (config.js), les
// emplacements suivent automatiquement, jamais besoin de recaler des
// coordonnées à la main.
function computeTowerSlotPositions(){
  const slots = [];
  for(let i=0;i<TOWER_PATH.length-1;i++){
    const a = TOWER_PATH[i], b = TOWER_PATH[i+1];
    const mx = (a.x+b.x)/2, mz = (a.z+b.z)/2;
    const dx = b.x-a.x, dz = b.z-a.z;
    const len = Math.hypot(dx, dz) || 1;
    const px = -dz/len, pz = dx/len; // perpendiculaire normalisée au segment
    const side = (i % 2 === 0) ? 1 : -1;
    slots.push({
      x: mx + px*TOWER_SLOT_OFFSET*side,
      z: mz + pz*TOWER_SLOT_OFFSET*side,
      occupied: false
    });
  }
  return slots;
}

// Trouve le point le plus proche de (x,z) sur l'ensemble du chemin — utilisé
// pour orienter une tourelle fraîchement posée face au chemin qu'elle garde.
function nearestPathPointTo(x, z){
  let best = TOWER_PATH[0], bestDist = Infinity;
  for(let i=0;i<TOWER_PATH.length-1;i++){
    const a = TOWER_PATH[i], b = TOWER_PATH[i+1];
    const dx = b.x-a.x, dz = b.z-a.z;
    const len2 = dx*dx + dz*dz || 1;
    const tt = Math.max(0, Math.min(1, ((x-a.x)*dx + (z-a.z)*dz) / len2));
    const px = a.x + dx*tt, pz = a.z + dz*tt;
    const d = (x-px)*(x-px) + (z-pz)*(z-pz);
    if(d < bestDist){ bestDist = d; best = { x:px, z:pz }; }
  }
  return best;
}

// Chemin en terre battue : un pavé fin par segment (BoxGeometry plutôt qu'un
// PlaneGeometry pivoté — évite d'avoir à jongler avec deux rotations pour
// orienter le segment, un seul rotation.y suffit) + un disque à chaque
// virage pour que les segments se raccordent visuellement sans trou.
function buildTowerPath(){
  const pathMat = new THREE.MeshStandardMaterial({ color: 0xC08635, flatShading:true, roughness:1 });
  const pathWidth = 0.9, pathThickness = 0.03;
  for(let i=0;i<TOWER_PATH.length-1;i++){
    const a = TOWER_PATH[i], b = TOWER_PATH[i+1];
    const dx = b.x-a.x, dz = b.z-a.z;
    const len = Math.hypot(dx, dz);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(pathWidth, pathThickness, len), pathMat);
    seg.position.set((a.x+b.x)/2, pathThickness/2, (a.z+b.z)/2);
    seg.rotation.y = Math.atan2(dx, dz);
    seg.receiveShadow = true;
    towerScene.add(seg);
  }
  for(let i=1;i<TOWER_PATH.length-1;i++){
    const p = TOWER_PATH[i];
    const join = new THREE.Mesh(new THREE.CylinderGeometry(pathWidth/2, pathWidth/2, pathThickness, 12), pathMat);
    join.position.set(p.x, pathThickness/2, p.z);
    join.receiveShadow = true;
    towerScene.add(join);
  }
}

// La gamelle, à l'arrivée du chemin — couleur chaude (doré), bien distincte
// de la terre battue du chemin et du sol crème, pour qu'on repère tout de
// suite l'objectif à protéger.
function buildFoodBowl(){
  const g = new THREE.Group();
  // Doré à l'extérieur (comme le chemin, pour rester dans la palette) mais
  // un intérieur rose/rouge chaud (--rose du thème) plutôt que le même
  // doré-brun que le chemin — sinon la gamelle se fondait visuellement dans
  // le chemin juste avant elle, alors qu'elle doit être l'objectif qu'on
  // repère du premier coup d'œil.
  const bowlMat = new THREE.MeshStandardMaterial({ color: 0xE3A857, flatShading:true, roughness:0.6 });
  const innerMat = new THREE.MeshStandardMaterial({ color: 0xD98E8E, flatShading:true, roughness:0.7 });
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.28, 16), bowlMat);
  outer.position.y = 0.14;
  g.add(outer);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.34, 0.16, 16), innerMat);
  inner.position.y = 0.24;
  g.add(inner);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 8, 16), bowlMat);
  rim.rotation.x = Math.PI/2;
  rim.position.y = 0.28;
  g.add(rim);
  g.traverse(o=>{ if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Barre de vie flottante au-dessus d'un chien — même technique que
// buildPowerLabel()/redrawPowerLabel() dans scene3d.js (texture canvas,
// redessinée seulement quand la valeur affichée change).
function buildTowerDogHpBar(){
  const c = document.createElement('canvas');
  c.width = 64; c.height = 10;
  const cx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent:true, depthWrite:false, fog:false });
  const sprite = new THREE.Sprite(mat);
  // La barre est enfant du groupe du chien, lui-même réduit à l'échelle
  // 0.68 (voir spawnTowerDog()) — sans compenser ici, elle hérite de cette
  // réduction et devient illisible vue de haut. On la surdimensionne donc
  // par rapport à ce qu'elle "devrait" faire à l'échelle 1.
  sprite.scale.set(0.95, 0.16, 1);
  sprite.position.set(0, 1.55, 0);
  sprite.renderOrder = 3;
  sprite.userData = { canvas: c, ctx: cx, tex, lastRatio: -1 };
  redrawTowerHpBar(sprite, 1);
  return sprite;
}

function redrawTowerHpBar(sprite, ratio){
  const ud = sprite.userData;
  if(ud.lastRatio === ratio) return;
  ud.lastRatio = ratio;
  const c = ud.canvas, cx = ud.ctx;
  cx.clearRect(0, 0, c.width, c.height);
  cx.fillStyle = 'rgba(59,50,38,0.55)';
  cx.fillRect(0, 0, c.width, c.height);
  const fillColor = ratio > 0.5 ? '#6B8F71' : (ratio > 0.25 ? '#E3A857' : '#C94868');
  cx.fillStyle = fillColor;
  cx.fillRect(2, 2, Math.max(0, (c.width-4)*ratio), c.height-4);
  ud.tex.needsUpdate = true;
}

function initTowerScene(){
  if(!webglSupported) return;

  towerScene = new THREE.Scene();
  towerScene.background = new THREE.Color(0xF6E2BE);
  towerScene.fog = new THREE.FogExp2(0xF6E2BE, 0.018);

  // Vue en plongée, légèrement en angle plutôt que purement zénithale — garde
  // un peu de relief/profondeur (ombres, hauteur des chats/chiens) tout en
  // montrant l'ensemble du plateau, de l'entrée (loin) à la gamelle (près).
  towerCamera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  towerCamera.position.set(0, 15.5, 6.5);
  towerCamera.lookAt(0, 0, -4);

  // Intensités plus basses qu'en mode Bataille : la caméra est ici presque à
  // la verticale du sol (vue en plongée) au lieu de le voir en rasant, donc
  // la lumière le frappe presque de face — sans tone mapping sur le
  // renderer, ça sature direct vers le blanc si on garde des intensités
  // "plein soleil rasant" (repéré : sol/chemin passaient au blanc-jaune, la
  // gamelle disparaissait dans le chemin).
  const hemi = new THREE.HemisphereLight(0xFFF6E0, 0xC9A063, 0.7);
  towerScene.add(hemi);
  const sun = new THREE.DirectionalLight(0xFFEBC2, 0.55);
  sun.position.set(4, 12, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 30;
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -14;
  sun.shadow.bias = -0.003;
  towerScene.add(sun);

  const groundMat = new THREE.MeshStandardMaterial({ color: 0xEBCFA0, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 18), groundMat);
  ground.rotation.x = -Math.PI/2;
  ground.position.set(0, 0, -4);
  ground.receiveShadow = true;
  towerScene.add(ground);

  buildTowerPath();

  const bowl = buildFoodBowl();
  const last = TOWER_PATH[TOWER_PATH.length - 1];
  bowl.position.set(last.x, 0, last.z);
  towerScene.add(bowl);

  // petit repère à l'entrée du chemin (deux piquets), pour marquer d'où
  // viennent les chiens
  const postMat = new THREE.MeshStandardMaterial({ color: 0x8A6B4A, flatShading:true, roughness:0.9 });
  const first = TOWER_PATH[0];
  [-0.6, 0.6].forEach(off=>{
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.5, 6), postMat);
    post.position.set(first.x + off, 0.25, first.z);
    post.castShadow = true;
    towerScene.add(post);
  });

  towerSlots = computeTowerSlotPositions();
  const markerTex = createSlotMarkerTexture();
  towerSlots.forEach(slot=>{
    const marker = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 24),
      new THREE.MeshBasicMaterial({ map: markerTex, transparent: true })
    );
    marker.rotation.x = -Math.PI/2;
    marker.position.set(slot.x, 0.02, slot.z);
    towerScene.add(marker);
    slot.marker = marker;
  });

  towerRaycaster = new THREE.Raycaster();
  towerPointerNDC = new THREE.Vector2();

  onResizeTower();
}

function onResizeTower(){
  if(!webglSupported || !towerCamera) return;
  const w = canvas.clientWidth || 400, h = canvas.clientHeight || 700;
  towerCamera.aspect = w / h;
  towerCamera.updateProjectionMatrix();
}
