// Scène 3D du mode "Chatteau Fort" : caméra fixe en plongée oblique sur un
// plateau statique (contrairement au couloir qui défile du mode Bataille),
// avec son propre THREE.Scene/Camera — le WebGLRenderer, lui, reste unique
// et partagé (voir renderTower() dans towerRender3d.js), pas besoin d'un
// second canvas.
// Réutilise volontairement les mêmes fonctions/matériaux de dessin que le
// mode Bataille (buildCatGroup, buildBossGroup, catMaterial, enemyMaterial —
// tous définis dans scene3d.js) pour que les deux modes se ressemblent,
// plutôt que de recréer des chats/chiens spécifiques à ce mode.
let towerScene, towerCamera, towerRaycaster, towerPointerNDC;
let towerSunLight, towerHemiLight, towerGroundMat, towerCastleBanners = [];

// --- ciel du mode Chatteau Fort -------------------------------------------
// ATTENTION : createSkyTexture()/redrawSky() (scene3d.js) écrivent dans des
// variables de module PARTAGÉES (skyCanvas/skyCtx/skyTexture/skyClouds) qui
// appartiennent au ciel du mode Bataille. Les réutiliser ici écraserait ces
// références, et le fondu de biome du mode Bataille se mettrait à redessiner
// le ciel de CE mode-ci. D'où ce jeu de fonctions/variables séparé, même si
// la technique (dégradé + nuages sur un canvas) est la même.
let towerSkyCanvas, towerSkyCtx, towerSkyTexture, towerSkyClouds = [];

// Décalage de la maison par rapport à l'arrivée du chemin. Constante partagée
// (et non deux nombres recopiés) : elle sert à la fois à POSER la maison et à
// interdire au décor de pousser dessus — les deux doivent rester d'accord.
const TOWER_HOUSE_OFFSET = { x: 1.5, z: -1.2 };

function buildTowerSkyClouds(w, h){
  const layout = [[0.14,0.13],[0.62,0.09],[0.38,0.21],[0.86,0.24],[0.08,0.29],[0.52,0.31],[0.74,0.17]];
  return layout.map(([cxr,cyr])=>{
    const px = cxr*w, py = cyr*h;
    const puffs = [];
    for(let i=0;i<4;i++){
      puffs.push({
        x: px + (Math.random()-0.5)*44,
        y: py + (Math.random()-0.5)*10,
        rx: 24+Math.random()*16,
        ry: 12+Math.random()*6
      });
    }
    return puffs;
  });
}

// Éclaircit une couleur vers le blanc (t=0 : couleur d'origine, t=1 : blanc)
// et renvoie une chaîne CSS rgba() prête pour le canvas.
function lightenHexToCss(hex, t, alpha){
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const mix = c => Math.round(c + (255 - c) * t);
  return 'rgba(' + mix(r) + ',' + mix(g) + ',' + mix(b) + ',' + alpha + ')';
}

function redrawTowerSky(stepsHex){
  const w = towerSkyCanvas.width, h = towerSkyCanvas.height;
  const grad = towerSkyCtx.createLinearGradient(0, 0, 0, h);
  const stops = [0, 0.4, 0.72, 1];
  stepsHex.forEach((hex, i)=>{
    grad.addColorStop(stops[i], '#' + hex.toString(16).padStart(6,'0'));
  });
  towerSkyCtx.fillStyle = grad;
  towerSkyCtx.fillRect(0, 0, w, h);

  // Nuages TEINTÉS par le ciel du moment, pas d'un blanc fixe : au
  // crépuscule un blanc pur est bien plus lumineux que le ciel sombre
  // derrière, donc il franchissait le seuil du bloom et ressortait en gros
  // pâtés blancs baveux (repéré en capture). Les teinter les recale sur
  // l'ambiance — et c'est de toute façon plus juste : des nuages au couchant
  // prennent la couleur du soleil, ils ne restent pas blancs.
  towerSkyCtx.fillStyle = lightenHexToCss(stepsHex[2], 0.42, 0.8);
  towerSkyClouds.forEach(puffs=>{
    puffs.forEach(p=>{
      towerSkyCtx.beginPath();
      towerSkyCtx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI*2);
      towerSkyCtx.fill();
    });
  });
  towerSkyTexture.needsUpdate = true;
}

function createTowerSkyTexture(stepsHex){
  towerSkyCanvas = document.createElement('canvas');
  towerSkyCanvas.width = 300; towerSkyCanvas.height = 600;
  towerSkyCtx = towerSkyCanvas.getContext('2d');
  towerSkyClouds = buildTowerSkyClouds(300, 600);
  towerSkyTexture = new THREE.CanvasTexture(towerSkyCanvas);
  redrawTowerSky(stepsHex);
  return towerSkyTexture;
}

// Texture d'un cercle en pointillés — l'emplacement de tourelle libre, posé
// à plat sur le sol (même technique que createGlowTexture()/createPickupTexture()
// dans scene3d.js : un canvas dessiné une fois, transformé en CanvasTexture).
function createSlotMarkerTexture(){
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const cx = c.getContext('2d');
  cx.strokeStyle = 'rgba(255,248,225,0.85)';
  cx.lineWidth = 9;
  cx.setLineDash([12, 10]);
  cx.beginPath();
  cx.arc(size/2, size/2, size/2 - 7, 0, Math.PI*2);
  cx.stroke();
  return new THREE.CanvasTexture(c);
}

// Texture de pierre pour le chemin et les murs — bruit doux + joints, pour
// que les grandes surfaces ne soient pas des aplats de couleur morts.
function createStoneTexture(baseHex, jointHex){
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const cx = c.getContext('2d');
  cx.fillStyle = '#' + baseHex.toString(16).padStart(6,'0');
  cx.fillRect(0, 0, 128, 128);
  cx.fillStyle = '#' + jointHex.toString(16).padStart(6,'0');
  for(let i=0;i<70;i++){
    const x = Math.random()*128, y = Math.random()*128;
    cx.globalAlpha = 0.1 + Math.random()*0.22;
    cx.beginPath();
    cx.ellipse(x, y, 5+Math.random()*11, 4+Math.random()*7, Math.random()*Math.PI, 0, Math.PI*2);
    cx.fill();
  }
  cx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
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

// Chemin pavé : un pavé fin par segment (BoxGeometry plutôt qu'un
// PlaneGeometry pivoté — évite d'avoir à jongler avec deux rotations pour
// orienter le segment, un seul rotation.y suffit) + un disque à chaque
// virage pour que les segments se raccordent sans trou, et des pierres de
// bordure qui longent le tracé.
function buildTowerPath(){
  const stoneTex = createStoneTexture(0xC2A578, 0x8A7048);
  stoneTex.repeat.set(2, 6);
  const pathMat = new THREE.MeshStandardMaterial({ map: stoneTex, color: 0xD9BC8E, flatShading:true, roughness:0.95 });
  const kerbMat = new THREE.MeshStandardMaterial({ color: 0x9B9186, flatShading:true, roughness:0.95 });
  const pathWidth = 1.05, pathThickness = 0.08;
  const kerbGeo = new THREE.DodecahedronGeometry(0.15, 0);
  const kerbs = []; // transformations collectées, posées en une fois après la boucle

  for(let i=0;i<TOWER_PATH.length-1;i++){
    const a = TOWER_PATH[i], b = TOWER_PATH[i+1];
    const dx = b.x-a.x, dz = b.z-a.z;
    const len = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(pathWidth, pathThickness, len), pathMat);
    seg.position.set((a.x+b.x)/2, pathThickness/2, (a.z+b.z)/2);
    seg.rotation.y = angle;
    seg.receiveShadow = true;
    towerScene.add(seg);

    // pierres de bordure : leurs transformations sont seulement COLLECTÉES
    // ici, puis posées d'un coup en instanced mesh après la boucle (voir
    // plus bas) — une par maillage, c'était 132 appels de rendu pour du pur
    // décor, soit 28 % du coût de la scène (mesuré).
    const nx = Math.cos(angle), nz = -Math.sin(angle); // perpendiculaire au segment
    const count = Math.max(2, Math.round(len / 0.55));
    for(let k=0;k<=count;k++){
      const t = k/count;
      const cx = a.x + dx*t, cz = a.z + dz*t;
      [-1, 1].forEach(side=>{
        kerbs.push({
          x: cx + nx*(pathWidth/2 + 0.1)*side + (Math.random()-0.5)*0.06,
          y: 0.07 + Math.random()*0.03,
          z: cz + nz*(pathWidth/2 + 0.1)*side + (Math.random()-0.5)*0.06,
          rx: Math.random()*Math.PI, ry: Math.random()*Math.PI, rz: Math.random()*Math.PI,
          s: 0.7 + Math.random()*0.5
        });
      });
    }
  }

  // Un seul objet pour toutes les pierres de bordure : elles sont identiques,
  // statiques et jamais animées, donc exactement le cas d'usage d'un
  // InstancedMesh. 132 appels de rendu deviennent 1.
  const kerbMesh = new THREE.InstancedMesh(kerbGeo, kerbMat, kerbs.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const pos = new THREE.Vector3(), scl = new THREE.Vector3();
  kerbs.forEach((k, i)=>{
    e.set(k.rx, k.ry, k.rz);
    q.setFromEuler(e);
    pos.set(k.x, k.y, k.z);
    scl.setScalar(k.s);
    m.compose(pos, q, scl);
    kerbMesh.setMatrixAt(i, m);
  });
  kerbMesh.instanceMatrix.needsUpdate = true;
  kerbMesh.castShadow = true;
  towerScene.add(kerbMesh);
  for(let i=1;i<TOWER_PATH.length-1;i++){
    const p = TOWER_PATH[i];
    const join = new THREE.Mesh(new THREE.CylinderGeometry(pathWidth/2, pathWidth/2, pathThickness, 14), pathMat);
    join.position.set(p.x, pathThickness/2, p.z);
    join.receiveShadow = true;
    towerScene.add(join);
  }
}

// La gamelle, aux portes du chatteau — couleur chaude, bien distincte de la
// pierre du chemin, pour qu'on repère tout de suite l'objectif à protéger.
function buildFoodBowl(){
  const g = new THREE.Group();
  const bowlMat = new THREE.MeshStandardMaterial({ color: 0xE3A857, flatShading:true, roughness:0.55, metalness:0.15 });
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

  // Croquettes en tas dans l'écuelle : sans elles la gamelle n'était qu'un
  // disque rose, et rien à l'écran ne disait ce que les chiens viennent
  // voler. C'est l'enjeu du niveau, il doit se voir.
  const kibbleMat = new THREE.MeshStandardMaterial({ color: 0xA9713F, flatShading:true, roughness:0.95 });
  const kibbleGeo = new THREE.DodecahedronGeometry(0.075, 0);
  for(let i=0;i<16;i++){
    const ang = Math.random()*Math.PI*2, rad = Math.random()*0.3;
    const k = new THREE.Mesh(kibbleGeo, kibbleMat);
    k.position.set(Math.cos(ang)*rad, 0.31 + Math.random()*0.06, Math.sin(ang)*rad);
    k.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
    k.scale.setScalar(0.75 + Math.random()*0.5);
    g.add(k);
  }
  // un poisson planté dans le tas, clin d'oeil à la ressource du mode
  const fishBody = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshStandardMaterial({ color: 0x7FB8D9, flatShading:true, roughness:0.6 }));
  fishBody.scale.set(1.5, 0.75, 0.5);
  fishBody.position.set(0.06, 0.42, 0.02);
  fishBody.rotation.z = 0.5;
  g.add(fishBody);
  const fishTail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 4), new THREE.MeshStandardMaterial({ color: 0x7FB8D9, flatShading:true, roughness:0.6 }));
  fishTail.scale.set(1, 1, 0.4);
  fishTail.position.set(-0.16, 0.36, 0.02);
  fishTail.rotation.z = 1.9;
  g.add(fishTail);

  g.traverse(o=>{ if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Une bannière = un mât + une toile. Gardée dans towerCastleBanners pour
// être animée (ondulation) et révélée progressivement vague après vague
// (voir setTowerBannerCount()).
function buildBanner(clothHex){
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x6B5335, flatShading:true, roughness:0.9 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 6), poleMat);
  pole.position.y = 0.55;
  g.add(pole);
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.55, 4, 1),
    new THREE.MeshStandardMaterial({ color: clothHex, side: THREE.DoubleSide, flatShading:true, roughness:0.8 })
  );
  cloth.position.set(0.21, 0.82, 0);
  g.add(cloth);
  g.userData.cloth = cloth;
  g.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
  return g;
}

// --- chat-tourelle : chat ASSIS en posture de garde ------------------------
// Ne PAS réutiliser buildCatGroup() (scene3d.js) ici : ce chat-là est taillé
// pour le runner — quadrupède debout, vu de dos et de loin. Repris tel quel
// en vue plongeante et à petite échelle, il ne se lisait plus du tout : deux
// boules orange, oreilles et yeux cachés du mauvais côté, queue en travers
// comme une planche.
//
// ORIENTATION : ce chat regarde vers +Z. C'est imposé par Object3D.lookAt(),
// qui pour un objet ordinaire (≠ caméra/lumière) amène le +Z local sur la
// cible. Le chat du runner, lui, a la tête en -Z : posé ici avec un lookAt()
// vers le chemin, il lui tournait littéralement le dos.
let turretFurMat, turretCreamMat, turretDarkMat, turretPinkMat, turretGlintMat;
function initTurretCatMaterials(){
  if(turretFurMat) return;
  // matériaux partagés par tous les chats-tourelles (jusqu'à 6 en scène)
  turretFurMat   = new THREE.MeshStandardMaterial({ color: 0xC97B4F, flatShading:true, roughness:0.8 });
  turretCreamMat = new THREE.MeshStandardMaterial({ color: 0xF6E3C8, flatShading:true, roughness:0.75 });
  turretDarkMat  = new THREE.MeshBasicMaterial({ color: 0x2A2018 });
  turretPinkMat  = new THREE.MeshStandardMaterial({ color: 0xE09A9A, flatShading:true, roughness:0.7 });
  turretGlintMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
}

function buildTurretCat(){
  initTurretCatMaterials();
  const g = new THREE.Group();

  // arrière-train posé au sol + torse qui se redresse : la silhouette assise
  // se distingue immédiatement des chiens (quadrupèdes) qui longent le chemin
  const haunches = new THREE.Mesh(new THREE.SphereGeometry(0.30, 12, 10), turretFurMat);
  haunches.scale.set(1.15, 0.9, 1.05);
  haunches.position.y = 0.22;
  g.add(haunches);

  // Sommet du torse NETTEMENT plus étroit que la tête (0.17 contre 0.265) :
  // à proportions proches, tête et torse fusionnaient en un seul cône et le
  // chat se lisait comme une quille de bowling.
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.30, 0.42, 12), turretFurMat);
  torso.position.y = 0.47;
  g.add(torso);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), turretCreamMat);
  chest.scale.set(1, 1.25, 0.7);
  chest.position.set(0, 0.45, 0.18);
  g.add(chest);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.265, 12, 10), turretFurMat);
  head.position.y = 0.86;
  g.add(head);

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), turretCreamMat);
  muzzle.scale.set(1.25, 0.85, 1);
  muzzle.position.set(0, 0.79, 0.21);
  g.add(muzzle);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), turretPinkMat);
  nose.position.set(0, 0.825, 0.32);
  g.add(nose);

  // Oreilles VOLONTAIREMENT surdimensionnées, avec un intérieur clair qui
  // tranche : à cette distance c'est le seul signal qui dit "chat" plutôt
  // que "caillou orange".
  [-1, 1].forEach(side=>{
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.125, 0.27, 4), turretFurMat);
    ear.position.set(side*0.16, 1.08, -0.02);
    ear.rotation.z = -side*0.28;
    ear.rotation.x = -0.12;
    g.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.17, 4), turretPinkMat);
    inner.position.set(side*0.155, 1.07, 0.04);
    inner.rotation.z = -side*0.28;
    inner.rotation.x = -0.12;
    g.add(inner);
  });

  [-1, 1].forEach(side=>{
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), turretDarkMat);
    eye.position.set(side*0.105, 0.90, 0.205);
    g.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.013, 5, 4), turretGlintMat);
    glint.position.set(side*0.088, 0.918, 0.232);
    g.add(glint);
    // pattes avant tendues devant, posture de sphinx en alerte
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.30, 8), turretFurMat);
    leg.position.set(side*0.135, 0.15, 0.22);
    g.add(leg);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), turretCreamMat);
    paw.position.set(side*0.135, 0.04, 0.26);
    g.add(paw);
  });

  // MARQUES SUR LE CRÂNE. Vu de la plongée du jeu, on ne voit du chat que le
  // dessus de sa tête : le museau, le nez et les yeux, tous placés à l'avant,
  // sont hors de vue. Sans ces rayures, la tourelle se lit comme une poire
  // orange posée sur un socle (constaté en capture). Elles ne servent qu'à
  // l'angle de caméra réel du jeu, pas à une jolie vue de face.
  [-0.09, 0, 0.09].forEach((off, i)=>{
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.02, 0.20 - Math.abs(off)*0.6), turretDarkMat);
    stripe.position.set(off, 1.09, -0.02 - Math.abs(off)*0.25);
    stripe.rotation.x = -0.25;
    g.add(stripe);
  });
  // dos rayé lui aussi, pour que la silhouette vue de dessus reste "chat"
  [-0.10, 0.10].forEach(off=>{
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.22), turretDarkMat);
    back.position.set(off, 0.63, -0.13);
    back.rotation.x = 0.5;
    g.add(back);
  });

  addContactShadow(g, 0.46);

  // queue enroulée à plat autour du train arrière : lisible vue de dessus,
  // là où une queue dressée se confondait avec un piquet
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.055, 8, 20, Math.PI*1.2), turretFurMat);
  tail.rotation.x = -Math.PI/2;
  tail.rotation.z = -0.5;
  tail.position.set(0.02, 0.07, -0.02);
  g.add(tail);
  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), turretCreamMat);
  tailTip.position.set(0.30, 0.07, 0.10);
  g.add(tailTip);

  return g;
}

// --- chat JOUEUR + butin ---------------------------------------------------
// Le chat du joueur doit se distinguer d'un coup d'oeil des chats-tourelles,
// sinon on perd son propre personnage dans la mêlée : robe grise (les
// tourelles sont rousses), écharpe rouge, et il reste DEBOUT sur ses quatre
// pattes là où les tourelles sont assises.
// Les deux couleurs sont paramétrables : le mode Scierie réutilise ce chat
// tel quel, mais il lui faut une robe distincte de celle du Chatteau Fort —
// sinon on croirait jouer le même personnage dans deux jeux différents. Les
// valeurs par défaut sont EXACTEMENT celles d'avant, le Chatteau Fort est
// donc inchangé.
function buildHeroCat(furHex, scarfHex){
  initTurretCatMaterials();
  const g = new THREE.Group();
  const furMat = new THREE.MeshStandardMaterial({ color: furHex === undefined ? 0x8C8F9A : furHex, flatShading:true, roughness:0.8 });
  const scarfMat = new THREE.MeshStandardMaterial({ color: scarfHex === undefined ? 0xC94868 : scarfHex, flatShading:true, roughness:0.75 });

  // Les deux matériaux sont mémorisés sur le groupe : c'est ce qui permet de
  // changer la robe du chat APRÈS coup (collection de skins, voir
  // recolorHeroCat) sans avoir à reconstruire tout le personnage — les héros
  // des trois modes sont créés une seule fois et gardés en mémoire.
  g.userData.furMat = furMat;
  g.userData.scarfMat = scarfMat;

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), furMat);
  body.scale.set(1, 0.84, 1.35);
  body.position.y = 0.42;
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.245, 12, 10), furMat);
  head.position.set(0, 0.62, 0.3);
  g.add(head);

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), turretCreamMat);
  muzzle.scale.set(1.2, 0.85, 1);
  muzzle.position.set(0, 0.56, 0.47);
  g.add(muzzle);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), turretPinkMat);
  nose.position.set(0, 0.585, 0.57);
  g.add(nose);

  [-1, 1].forEach(side=>{
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.23, 4), furMat);
    ear.position.set(side*0.145, 0.82, 0.26);
    ear.rotation.z = -side*0.26;
    g.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.062, 0.14, 4), turretPinkMat);
    inner.position.set(side*0.14, 0.81, 0.31);
    inner.rotation.z = -side*0.26;
    g.add(inner);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), turretDarkMat);
    eye.position.set(side*0.095, 0.665, 0.47);
    g.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.013, 5, 4), turretGlintMat);
    glint.position.set(side*0.079, 0.682, 0.497);
    g.add(glint);
  });

  // écharpe : la touche de couleur qui le rend repérable en pleine mêlée
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.055, 8, 14), scarfMat);
  scarf.rotation.x = Math.PI/2 - 0.2;
  scarf.position.set(0, 0.5, 0.16);
  g.add(scarf);
  const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.3, 0.05), scarfMat);
  scarfTail.position.set(0.16, 0.38, 0.06);
  scarfTail.rotation.z = 0.35;
  g.add(scarfTail);

  // pattes animables, comme les chiens (voir animateLegs dans render3d.js)
  const legPositions = [
    [-0.145, 0.2, 0.2], [0.145, 0.2, 0.2],
    [-0.145, 0.2, -0.2], [0.145, 0.2, -0.2]
  ];
  g.userData.legs = legPositions.map(([x,y,z])=>{
    const leg = buildLeg(furMat, 0.2, 0.05, 0.035);
    leg.position.set(x, y, z);
    g.add(leg);
    return leg;
  });

  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.46, 6), furMat);
  tail.position.set(0, 0.55, -0.42);
  tail.rotation.x = 0.9;
  g.add(tail);

  g.traverse(o=>{ if(o.isMesh) o.castShadow = true; });

  addContactShadow(g, 0.42);

  // anneau de progression de construction, au-dessus de la tête
  const ring = buildHeroBuildRing();
  g.add(ring);
  g.userData.buildRing = ring;

  g.scale.setScalar(1.15);
  return g;
}

// Change la robe d'un chat déjà construit. Les matériaux étant propres à
// chaque chat (créés dans buildHeroCat), recolorer l'un ne touche pas les
// autres — un employé de la scierie garde sa couleur quand le joueur change
// la sienne.
function recolorHeroCat(g, furHex, accentHex){
  if(!g || !g.userData.furMat) return;
  g.userData.furMat.color.setHex(furHex);
  if(g.userData.scarfMat) g.userData.scarfMat.color.setHex(accentHex);
}

// Anneau qui se remplit pendant que le chat érige une tourelle. Texture
// canvas redessinée seulement quand le pourcentage affiché change vraiment
// (par pas de 5 %), pas à chaque frame.
// Chaque anneau porte SON canvas dans userData plutôt que dans des variables
// de module : sinon un second chat construit ailleurs (le mode Scierie
// réutilise buildHeroCat()) écraserait ces références, et l'anneau du
// Chatteau Fort se mettrait à dessiner dans le canvas de l'autre mode.
function buildHeroBuildRing(){
  const canvas2 = document.createElement('canvas');
  canvas2.width = 96; canvas2.height = 96;
  const ctx2 = canvas2.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas2);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent:true, depthWrite:false, fog:false
  }));
  sprite.userData = { canvas: canvas2, ctx: ctx2, tex, lastStep: -1 };
  sprite.scale.set(0.62, 0.62, 1);
  sprite.position.set(0, 1.25, 0);
  sprite.renderOrder = 4;
  sprite.visible = false;
  return sprite;
}

// Remplit l'anneau d'un chat donné. Sert au Chatteau Fort (construction) comme
// à la Scierie (achat sur une dalle) — d'où le paramètre plutôt qu'un accès
// direct à un héros particulier.
function setRingProgress(ring, ratio){
  if(!ring) return;
  const ud = ring.userData;
  if(ratio <= 0){ ring.visible = false; ud.lastStep = -1; return; }
  ring.visible = true;
  const step = Math.round(ratio*20); // 20 paliers = 5 % — inutile de redessiner plus fin
  if(step === ud.lastStep) return;
  ud.lastStep = step;
  const c = ud.canvas, cx = ud.ctx, R = 38;
  cx.clearRect(0,0,c.width,c.height);
  cx.lineWidth = 10;
  cx.strokeStyle = 'rgba(59,50,38,0.55)';
  cx.beginPath(); cx.arc(48, 48, R, 0, Math.PI*2); cx.stroke();
  cx.strokeStyle = '#E3A857';
  cx.lineCap = 'round';
  cx.beginPath(); cx.arc(48, 48, R, -Math.PI/2, -Math.PI/2 + Math.PI*2*Math.min(1, ratio)); cx.stroke();
  ud.tex.needsUpdate = true;
}

function setHeroBuildProgress(ratio){
  if(!hero.visual) return;
  setRingProgress(hero.visual.userData.buildRing, ratio);
}

// Onde du miaulement : un anneau au sol qui s'élargit puis s'efface, pour que
// le joueur voie exactement quelle portée il vient de couvrir.
let meowRings = [];
let meowRingGeo, meowRingMat;
function spawnMeowRing(x, z){
  if(!webglSupported) return;
  if(!meowRingGeo){
    meowRingGeo = new THREE.RingGeometry(0.86, 1, 40);
    meowRingMat = new THREE.MeshBasicMaterial({ color:0xFFF2C8, transparent:true, side:THREE.DoubleSide, depthWrite:false });
  }
  const mesh = new THREE.Mesh(meowRingGeo, meowRingMat.clone());
  mesh.rotation.x = -Math.PI/2;
  mesh.position.set(x, 0.09, z);
  mesh.scale.setScalar(0.4);
  towerScene.add(mesh);
  meowRings.push({ mesh, life: 34 });
}

function updateMeowRings(){
  for(let i=meowRings.length-1; i>=0; i--){
    const r = meowRings[i];
    r.life--;
    const t = 1 - r.life/34;
    r.mesh.scale.setScalar(0.4 + t*MEOW_RADIUS);
    r.mesh.material.opacity = 0.75 * (1-t);
    if(r.life <= 0){
      towerScene.remove(r.mesh);
      r.mesh.material.dispose();
      meowRings.splice(i,1);
    }
  }
}

// Poisson lâché par un chien abattu : le joueur doit aller le chercher.
let lootFishMat, lootFishGeo, lootTailGeo;
function buildLootFish(){
  if(!lootFishMat){
    lootFishMat = new THREE.MeshStandardMaterial({ color: 0x7FB8D9, flatShading:true, roughness:0.55 });
    lootFishGeo = new THREE.SphereGeometry(0.14, 8, 6);
    lootTailGeo = new THREE.ConeGeometry(0.1, 0.16, 4);
  }
  const g = new THREE.Group();
  const body = new THREE.Mesh(lootFishGeo, lootFishMat);
  body.scale.set(1.5, 0.8, 0.55);
  g.add(body);
  const tail = new THREE.Mesh(lootTailGeo, lootFishMat);
  tail.scale.set(1, 1, 0.4);
  tail.position.set(-0.22, 0, 0);
  tail.rotation.z = 1.9;
  g.add(tail);
  g.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
  return g;
}

// --- la maison du chat : l'objectif que les chiens veulent piller ----------
// Remplace le château médiéval : ce que les chiens convoitent, ce n'est pas
// une forteresse, c'est le foyer du chat et sa gamelle. Toute la mise en
// scène raconte ça — niche, coussin, griffoir, écuelle d'eau, croquettes.
function buildCatHouse(){
  const g = new THREE.Group();
  const woodMat  = new THREE.MeshStandardMaterial({ color: 0xC08E5E, flatShading:true, roughness:0.9 });
  const wallMat  = new THREE.MeshStandardMaterial({ color: 0xF2DFC0, flatShading:true, roughness:0.85 });
  const roofMat  = new THREE.MeshStandardMaterial({ color: 0xD98E8E, flatShading:true, roughness:0.7 });
  const darkMat  = new THREE.MeshStandardMaterial({ color: 0x3B2E22, flatShading:true, roughness:1 });
  const accentMat= new THREE.MeshStandardMaterial({ color: 0x5B8FBF, flatShading:true, roughness:0.7 });

  // terrasse en bois
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.26, 2.7), woodMat);
  deck.position.y = 0.13;
  g.add(deck);

  // petite palissade sur les côtés et l'arrière — délimite "chez lui"
  const postGeo = new THREE.BoxGeometry(0.12, 0.5, 0.12);
  const railGeo = new THREE.BoxGeometry(0.08, 0.08, 2.5);
  [-1, 1].forEach(side=>{
    for(let i=0;i<4;i++){
      const post = new THREE.Mesh(postGeo, woodMat);
      post.position.set(side*1.6, 0.26+0.25, -1.15 + i*0.78);
      g.add(post);
    }
    const rail = new THREE.Mesh(railGeo, woodMat);
    rail.position.set(side*1.6, 0.26+0.36, 0);
    g.add(rail);
  });

  // corps de la niche
  const bodyW = 2.2, bodyH = 1.25, bodyD = 1.8;
  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyD), wallMat);
  body.position.set(0, 0.26 + bodyH/2, -0.15);
  g.add(body);

  // toit à deux pentes : prisme triangulaire extrudé le long de Z — plus
  // "maison" qu'une pyramide, et géométriquement plus simple à poser droit
  // qu'un assemblage de deux boîtes inclinées à recaler à la main.
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-1.35, 0); roofShape.lineTo(1.35, 0); roofShape.lineTo(0, 0.9); roofShape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 2.05, bevelEnabled: false });
  roofGeo.translate(0, 0, -2.05/2);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(0, 0.26 + bodyH, -0.15);
  g.add(roof);

  // deux oreilles de chat sur le faîte : signe le lieu au premier coup d'œil
  [-1, 1].forEach(side=>{
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.36, 4), roofMat);
    ear.position.set(side*0.52, 0.26 + bodyH + 0.78, -0.15);
    ear.rotation.z = -side*0.2;
    g.add(ear);
  });

  // entrée : arche sombre (disque + bas carré) encadrée de bois
  const holeR = 0.36;
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(holeR, holeR, 0.16, 16), darkMat);
  arch.rotation.x = Math.PI/2;
  arch.position.set(0, 0.26 + 0.62, 0.73);
  g.add(arch);
  const archBase = new THREE.Mesh(new THREE.BoxGeometry(holeR*2, 0.62, 0.16), darkMat);
  archBase.position.set(0, 0.26 + 0.31, 0.73);
  g.add(archBase);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(holeR + 0.05, 0.055, 8, 18), woodMat);
  frame.position.set(0, 0.26 + 0.62, 0.77);
  g.add(frame);

  // plaque au-dessus de la porte
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.24, 0.08), woodMat);
  plaque.position.set(0, 0.26 + 1.08, 0.78);
  g.add(plaque);

  // coussin du chat, à gauche de la porte
  const cushion = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), accentMat);
  cushion.scale.set(1, 0.34, 1);
  cushion.position.set(-1.15, 0.26 + 0.1, 0.95);
  g.add(cushion);

  // griffoir : poteau entouré de corde + plateforme
  const postScr = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 1.0, 10), woodMat);
  postScr.position.set(1.2, 0.26 + 0.5, 0.85);
  g.add(postScr);
  // géométrie ET matériau partagés par les sept anneaux : ils étaient créés
  // à neuf à chaque tour de boucle, pour un rendu strictement identique
  const ringGeo = new THREE.TorusGeometry(0.14, 0.022, 6, 12);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xD9C08A, flatShading:true, roughness:1 });
  for(let i=0;i<7;i++){
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI/2;
    ring.position.set(1.2, 0.26 + 0.14 + i*0.12, 0.85);
    g.add(ring);
  }
  const platform = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.62), woodMat);
  platform.position.set(1.2, 0.26 + 1.03, 0.85);
  g.add(platform);

  // écuelle d'eau, à côté de la gamelle principale (placée séparément à
  // l'arrivée du chemin — c'est elle, l'objectif)
  const waterOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.16, 14), accentMat);
  waterOuter.position.set(-0.5, 0.26 + 0.08, 1.15);
  g.add(waterOuter);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.05, 14), new THREE.MeshStandardMaterial({ color: 0x8FCBE8, flatShading:true, roughness:0.3 }));
  water.position.set(-0.5, 0.26 + 0.15, 1.15);
  g.add(water);

  g.traverse(o=>{ if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });

  // Fanions révélés un par vague survécue — même mécanique que les anciennes
  // bannières du château (setTowerBannerCount()), juste transposée en
  // guirlande de fête sur la maison.
  const bannerSpots = [
    [-1.6, 0.76, -1.15], [1.6, 0.76, -1.15],
    [-1.6, 0.76, 1.15],  [1.6, 0.76, 1.15],
    [0, 0.26 + bodyH + 1.0, -0.15]
  ];
  const bannerColors = [0xD98E8E, 0x5B8FBF, 0xE3A857, 0x6B8F71, 0xE3A857];
  towerCastleBanners = bannerSpots.map(([bx, by, bz], i)=>{
    const banner = buildBanner(bannerColors[i]);
    banner.position.set(bx, by, bz);
    banner.visible = false;
    g.add(banner);
    return banner;
  });

  return g;
}


// Révèle les N premières bannières — appelé à chaque vague pour que le
// chatteau se pavoise au fil du siège (progression visible du "grade" de la
// défense, en plus de la montée en grade des tourelles elles-mêmes).
function setTowerBannerCount(n){
  towerCastleBanners.forEach((b, i)=>{ b.visible = i < n; });
}

// Fait onduler les toiles de bannière — appelé à chaque tick (pas fixe).
function animateTowerBanners(frame){
  towerCastleBanners.forEach((b, i)=>{
    if(!b.visible) return;
    const cloth = b.userData.cloth;
    cloth.rotation.y = Math.sin(frame*0.05 + i*1.7) * 0.35;
    cloth.position.z = Math.sin(frame*0.05 + i*1.7) * 0.06;
  });
}

// Arbres, rochers et touffes qui bordent le chemin, façon petite vallée —
// purement décoratif (aucune incidence sur portée/collision), mais c'est ce
// qui remplit le cadre autour du tracé.
let towerSceneryShadowSpots = [];
function buildTowerScenery(){
  towerSceneryShadowSpots = [];
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x9B9186, flatShading:true, roughness:0.95 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7A5C3E, flatShading:true, roughness:0.9 });
  const leafMatA = new THREE.MeshStandardMaterial({ color: 0x5E8A56, flatShading:true, roughness:0.85 });
  const leafMatB = new THREE.MeshStandardMaterial({ color: 0x74A063, flatShading:true, roughness:0.85 });
  const tuftMat = new THREE.MeshStandardMaterial({ color: 0x6F9560, flatShading:true, roughness:0.85 });
  const rockGeo = new THREE.IcosahedronGeometry(0.34, 0);
  const tuftGeo = new THREE.ConeGeometry(0.14, 0.34, 5);
  const trunkGeo = new THREE.CylinderGeometry(0.09, 0.13, 0.75, 6);
  const leafGeo = new THREE.IcosahedronGeometry(0.62, 0);

  function tooCloseToPlay(x, z){
    // ne jamais planter un décor sur le chemin ni sur un emplacement de
    // tourelle : le décor ne doit rien masquer de jouable
    const p = nearestPathPointTo(x, z);
    if(Math.hypot(x-p.x, z-p.z) < 1.9) return true;
    if(towerSlots.some(s=>Math.hypot(x-s.x, z-s.z) < 1.5)) return true;
    // ... ni sur la gamelle (l'objectif) ni sur la maison : un arbre planté
    // là masquait purement et simplement ce que le joueur doit défendre
    const last = TOWER_PATH[TOWER_PATH.length-1];
    if(Math.hypot(x-last.x, z-last.z) < 2.3) return true;
    return Math.hypot(x-(last.x+TOWER_HOUSE_OFFSET.x), z-(last.z+TOWER_HOUSE_OFFSET.z)) < 3.0;
  }

  let placed = 0, guard = 0;
  while(placed < 46 && guard++ < 600){
    const x = -8 + Math.random()*16;
    const z = -14 + Math.random()*18;
    if(tooCloseToPlay(x, z)) continue;
    const r = Math.random();
    if(r < 0.28){
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 0.37;
      tree.add(trunk);
      const leaves = new THREE.Mesh(leafGeo, Math.random() < 0.5 ? leafMatA : leafMatB);
      leaves.position.y = 1.05;
      leaves.scale.set(1, 0.85 + Math.random()*0.3, 1);
      tree.add(leaves);
      tree.position.set(x, 0, z);
      const treeScale = 0.8 + Math.random()*0.7;
      tree.scale.setScalar(treeScale);
      towerSceneryShadowSpots.push([x, z, 0.55 * treeScale]);
      tree.rotation.y = Math.random()*Math.PI*2;
      tree.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
      towerScene.add(tree);
    } else if(r < 0.55){
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(x, 0.14, z);
      const rw = 0.7+Math.random()*0.8;
      rock.scale.set(rw, 0.5+Math.random()*0.6, 0.7+Math.random()*0.8);
      towerSceneryShadowSpots.push([x, z, 0.32 * rw]);
      rock.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
      rock.castShadow = true;
      towerScene.add(rock);
    } else {
      const tuft = new THREE.Mesh(tuftGeo, tuftMat);
      tuft.position.set(x, 0.17, z);
      tuft.scale.setScalar(0.8 + Math.random()*0.7);
      tuft.rotation.y = Math.random()*Math.PI;
      towerScene.add(tuft);
    }
    placed++;
  }
}

// Barre de vie flottante au-dessus d'un chien — même technique que
// buildPowerLabel()/redrawPowerLabel() dans scene3d.js (texture canvas,
// redessinée seulement quand la valeur affichée change).
// Ancre au sol tout ce qui est posé : socles des emplacements, gamelle,
// maison, tours de garde, et chaque élément de décor. Un seul appel de dessin
// pour l'ensemble (voir buildContactShadowField).
function buildTowerContactShadows(){
  const spots = [];
  towerSlots.forEach(s=>spots.push([s.x, s.z, 0.62]));
  const last = TOWER_PATH[TOWER_PATH.length - 1];
  spots.push([last.x, last.z, 0.8]);
  spots.push([last.x + TOWER_HOUSE_OFFSET.x, last.z + TOWER_HOUSE_OFFSET.z, 1.5]);
  const first = TOWER_PATH[0];
  [-0.95, 0.95].forEach(off=>spots.push([first.x + off, first.z, 0.5]));
  towerSceneryShadowSpots.forEach(sp=>spots.push(sp));
  const field = buildContactShadowField(spots);
  if(field) towerScene.add(field);
}

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

// --- ambiance : fondu d'un palier de vague au suivant ----------------------
// Même principe que le fondu de biome du mode Bataille (scene3d.js) : on
// interpole les couleurs/intensités entre deux paliers de TOWER_AMBIANCE
// plutôt que de basculer d'un coup.
let towerBloomS = TOWER_AMBIANCE[0].bloomS, towerBloomT = TOWER_AMBIANCE[0].bloomT;
let towerAmbIndex = 0;
let towerAmbT = 0;
let towerAmbFrom = null, towerAmbTo = null;
let towerAmbSkyCounter = 0;
let towerCurrentSkySteps = null;

function applyTowerAmbianceInstant(index){
  const a = TOWER_AMBIANCE[Math.min(index, TOWER_AMBIANCE.length-1)];
  towerAmbIndex = index;
  towerAmbFrom = towerAmbTo = null;
  towerCurrentSkySteps = a.skySteps.slice();
  redrawTowerSky(towerCurrentSkySteps);
  towerScene.fog.color.setHex(a.fog);
  towerGroundMat.color.setHex(a.ground);
  towerSunLight.color.setHex(a.sun);
  towerSunLight.intensity = a.sunInt;
  towerHemiLight.intensity = a.hemiInt;
  towerSunLight.position.set(a.sunPos[0], a.sunPos[1], a.sunPos[2]);
  towerBloomS = a.bloomS; towerBloomT = a.bloomT;
}

function startTowerAmbianceTransition(index){
  const clamped = Math.min(index, TOWER_AMBIANCE.length-1);
  if(clamped === towerAmbIndex) return;
  towerAmbFrom = {
    skySteps: towerCurrentSkySteps.slice(),
    fog: towerScene.fog.color.getHex(),
    ground: towerGroundMat.color.getHex(),
    sun: towerSunLight.color.getHex(),
    sunInt: towerSunLight.intensity,
    hemiInt: towerHemiLight.intensity,
    sunPos: [towerSunLight.position.x, towerSunLight.position.y, towerSunLight.position.z],
    bloomS: towerBloomS, bloomT: towerBloomT
  };
  towerAmbTo = TOWER_AMBIANCE[clamped];
  towerAmbIndex = clamped;
  towerAmbT = 0;
}

function updateTowerAmbiance(){
  if(!towerAmbTo) return;
  towerAmbT += 1/60; // pas de temps fixe (voir updateTower())
  const t = Math.min(1, towerAmbT / TOWER_AMBIANCE_TRANSITION_SECONDS);
  const from = towerAmbFrom, to = towerAmbTo;

  towerScene.fog.color.setHex(lerpHex(from.fog, to.fog, t));
  towerGroundMat.color.setHex(lerpHex(from.ground, to.ground, t));
  towerSunLight.color.setHex(lerpHex(from.sun, to.sun, t));
  towerSunLight.intensity = lerpNum(from.sunInt, to.sunInt, t);
  towerHemiLight.intensity = lerpNum(from.hemiInt, to.hemiInt, t);
  towerSunLight.position.set(
    lerpNum(from.sunPos[0], to.sunPos[0], t),
    lerpNum(from.sunPos[1], to.sunPos[1], t),
    lerpNum(from.sunPos[2], to.sunPos[2], t)
  );
  towerBloomS = lerpNum(from.bloomS, to.bloomS, t);
  towerBloomT = lerpNum(from.bloomT, to.bloomT, t);

  // Le ciel est un canvas : le redessiner à chaque frame coûterait cher pour
  // rien (le dégradé bouge très lentement) — une frame sur 6 suffit, comme
  // pour le fondu de biome du mode Bataille.
  towerAmbSkyCounter++;
  if(towerAmbSkyCounter % 6 === 0 || t >= 1){
    towerCurrentSkySteps = from.skySteps.map((hex, i)=>lerpHex(hex, to.skySteps[i], t));
    redrawTowerSky(towerCurrentSkySteps);
  }

  if(t >= 1){ towerAmbFrom = towerAmbTo = null; }
}

function initTowerScene(){
  if(!webglSupported) return;

  const amb0 = TOWER_AMBIANCE[0];
  towerScene = new THREE.Scene();
  towerScene.background = createTowerSkyTexture(amb0.skySteps);
  towerCurrentSkySteps = amb0.skySteps.slice();
  towerScene.fog = new THREE.FogExp2(amb0.fog, 0.022);

  // Caméra en plongée oblique (façon 3/4 cinématique) plutôt que quasi
  // zénithale : le chemin s'enfonce dans le cadre et le chatteau se dresse
  // au fond, au lieu d'un plateau vu à plat comme un plan de jeu de société.
  towerCamera = new THREE.PerspectiveCamera(52, 1, 0.1, 120);
  towerCamera.position.set(0, 12, 14.2);
  towerCamera.lookAt(0, 0.9, -5.5);

  // Intensités plus basses qu'en mode Bataille : même en plongée oblique, la
  // caméra reste plus verticale que la vue rasante du mode Bataille, donc la
  // lumière frappe le sol plus de face — sans tone mapping sur le renderer,
  // ça sature vite vers le blanc à intensités égales (repéré : sol/chemin
  // quasi invisibles, blanchis).
  towerHemiLight = new THREE.HemisphereLight(0xE9F3D8, 0xC9A063, amb0.hemiInt);
  towerScene.add(towerHemiLight);
  towerSunLight = new THREE.DirectionalLight(amb0.sun, amb0.sunInt);
  towerSunLight.position.set(amb0.sunPos[0], amb0.sunPos[1], amb0.sunPos[2]);
  towerSunLight.castShadow = true;
  towerSunLight.shadow.mapSize.set(2048, 2048);
  towerSunLight.shadow.camera.near = 1;
  towerSunLight.shadow.camera.far = 40;
  towerSunLight.shadow.camera.left = -11;
  towerSunLight.shadow.camera.right = 11;
  towerSunLight.shadow.camera.top = 11;
  towerSunLight.shadow.camera.bottom = -18;
  towerSunLight.shadow.bias = -0.0025;
  towerScene.add(towerSunLight);
  towerScene.add(towerSunLight.target);

  // halo de soleil bas sur l'horizon — c'est lui qui donne le côté
  // "golden hour" une fois l'ambiance descendue vers le crépuscule
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createSunGlowTexture(), transparent:true, depthWrite:false, fog:false
  }));
  sunGlow.scale.set(26, 26, 1);
  sunGlow.position.set(7, 6, -34);
  towerScene.add(sunGlow);

  // Sol TEXTURÉ et non plus un aplat : c'est la plus grande surface de
  // l'écran, et elle était vide. La teinte d'ambiance (qui change au fil des
  // vagues, du plein jour au crépuscule) est appliquée PAR-DESSUS la texture
  // via .color — le fondu d'ambiance continue donc de fonctionner tel quel.
  const grassTex = createGrassTexture().clone();
  grassTex.needsUpdate = true;
  grassTex.repeat.set(11, 12);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 44), (towerGroundMat =
    new THREE.MeshStandardMaterial({ map: grassTex, color: amb0.ground, flatShading:true, roughness:1 })));
  ground.rotation.x = -Math.PI/2;
  ground.position.set(0, 0, -6);
  ground.receiveShadow = true;
  towerScene.add(ground);

  buildTowerPath();

  const last = TOWER_PATH[TOWER_PATH.length - 1];
  const bowl = buildFoodBowl();
  bowl.position.set(last.x, 0, last.z);
  towerScene.add(bowl);

  // Le chatteau se loge dans l'espace libre entre les deux derniers tronçons
  // du chemin (z ≈ -3 et z ≈ 1.5), porte tournée vers la caméra et vers la
  // gamelle qui se trouve juste devant elle : les chiens remontent donc le
  // chemin jusqu'aux portes du chatteau.
  // Les deux placements essayés avant ne marchaient pas : plus loin que le
  // chemin (z plus petit), le chatteau se plantait AU MILIEU du tracé et
  // chevauchait les segments ; plus près que la gamelle (z plus grand), il
  // masquait complètement la gamelle, l'objectif devenant invisible.
  // La maison se pose À CÔTÉ de l'arrivée, pas dans la boucle finale du
  // chemin : cette boucle contient déjà deux emplacements de tourelle (elle
  // est calculée depuis TOWER_PATH, voir computeTowerSlotPositions()), et une
  // maison centrée dedans se retrouvait littéralement sous les pattes d'un
  // chat-tourelle, terrasse et chat encastrés (repéré en capture). Décalée
  // ici, elle borde la gamelle sans empiéter sur aucun emplacement — et
  // déplacer le décor coûte moins cher que déformer le terrain de jeu.
  const castle = buildCatHouse();
  castle.position.set(last.x + TOWER_HOUSE_OFFSET.x, 0, last.z + TOWER_HOUSE_OFFSET.z);
  castle.rotation.y = -0.5; // porte tournée vers la gamelle et le chemin
  castle.scale.setScalar(0.85);
  towerScene.add(castle);
  setTowerBannerCount(0);

  // porte d'entrée du chemin : deux tours de garde en ruine, pour marquer
  // d'où débouchent les chiens
  const ruinMat = new THREE.MeshStandardMaterial({ color: 0x9B8F80, flatShading:true, roughness:0.95 });
  const first = TOWER_PATH[0];
  [-0.95, 0.95].forEach(off=>{
    const ruin = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 1.25, 8), ruinMat);
    ruin.position.set(first.x + off, 0.62, first.z);
    ruin.castShadow = true;
    towerScene.add(ruin);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.32, 0.16, 8), ruinMat);
    cap.position.set(first.x + off, 1.32, first.z);
    cap.castShadow = true;
    towerScene.add(cap);
  });

  // Chaque emplacement repose sur un socle de pierre — même vide, ça se lit
  // comme une base de tour de guet plutôt qu'un rond posé sur l'herbe.
  const pedestalMat = new THREE.MeshStandardMaterial({ color: 0xB5A489, flatShading:true, roughness:0.9 });
  towerSlots = computeTowerSlotPositions();
  const markerTex = createSlotMarkerTexture();
  towerSlots.forEach(slot=>{
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.54, 0.26, 10), pedestalMat);
    pedestal.position.set(slot.x, 0.13, slot.z);
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    towerScene.add(pedestal);
    slot.pedestal = pedestal;

    const marker = new THREE.Mesh(
      new THREE.CircleGeometry(0.38, 24),
      new THREE.MeshBasicMaterial({ map: markerTex, transparent: true })
    );
    marker.rotation.x = -Math.PI/2;
    marker.position.set(slot.x, 0.27, slot.z);
    towerScene.add(marker);
    slot.marker = marker;
  });

  buildTowerScenery(); // après les slots : le décor s'écarte du chemin ET des emplacements
  buildTowerContactShadows();
  // remplit la bande de ciel vide du haut de l'écran (voir textures.js)
  addHorizonTreelines(towerScene, -27.4, 64, 0x93B3A4, 0x63896F); // le sol s'arrête à z = -28

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
