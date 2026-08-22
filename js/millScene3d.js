// Décor du mode "Chat-Scierie". Comme towerScene3d.js pour le Chatteau Fort :
// une scène et une caméra qui n'appartiennent qu'à ce mode, construites une
// seule fois au démarrage. Le renderer WebGL, lui, reste partagé (un seul
// contexte pour les trois modes — voir scene3d.js).
let millScene, millCamera;
let millSunLight, millHemiLight;
let millBeltTopMat, millBeltTex, millSawBlade;

// --- textures --------------------------------------------------------------
// Bande du tapis : des chevrons peints qui défilent. C'est le SEUL signal qui
// dit au joueur, avant même qu'une planche n'y soit posée, que ce ruban gris
// bouge et dans quel sens.
function createBeltTexture(){
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = '#4A4640';
  x.fillRect(0, 0, 64, 32);
  x.fillStyle = '#5E594F';
  for(let i=0; i<2; i++){
    x.beginPath();
    x.moveTo(i*32 + 4, 0); x.lineTo(i*32 + 18, 16); x.lineTo(i*32 + 4, 32);
    x.lineTo(i*32 + 12, 32); x.lineTo(i*32 + 26, 16); x.lineTo(i*32 + 12, 0);
    x.closePath(); x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 1);
  return tex;
}

function createWoodEndTexture(){
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#E0C28E';
  x.fillRect(0, 0, 64, 64);
  x.strokeStyle = 'rgba(150,110,64,0.55)';
  for(let r=6; r<32; r+=6){
    x.lineWidth = 1.6;
    x.beginPath(); x.arc(32, 32, r, 0, Math.PI*2); x.stroke();
  }
  return new THREE.CanvasTexture(c);
}

// Étiquette d'une dalle d'amélioration : icône, prix, niveau atteint. Rendue
// dans un canvas plutôt qu'en HTML parce qu'elle doit être POSÉE AU SOL, à
// l'endroit exact où le chat doit aller — un panneau d'interface en surcouche
// obligerait à faire le lien de tête entre un bouton et une dalle.
let millPadCanvasSize = 192;
function buildMillPadLabel(){
  const c = document.createElement('canvas');
  c.width = c.height = millPadCanvasSize;
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(MILL_PAD_RADIUS, 28),
    new THREE.MeshBasicMaterial({ map: tex, transparent:true })
  );
  mesh.rotation.x = -Math.PI/2;
  mesh.userData = { canvas: c, ctx: c.getContext('2d'), tex, lastKey: null };
  return mesh;
}

function redrawMillPadLabel(pad){
  const ud = pad.visual.userData;
  const affordable = millCoins >= pad.cost;
  const key = pad.level + '/' + pad.cost + '/' + (affordable ? 1 : 0);
  if(key === ud.lastKey) return; // ne redessine que quand l'affichage change vraiment
  ud.lastKey = key;
  const x = ud.ctx, S = millPadCanvasSize;
  x.clearRect(0, 0, S, S);
  x.beginPath(); x.arc(S/2, S/2, S/2 - 4, 0, Math.PI*2);
  x.fillStyle = affordable ? 'rgba(227,168,87,0.92)' : 'rgba(120,112,98,0.75)';
  x.fill();
  x.lineWidth = 8;
  x.strokeStyle = affordable ? '#FFF3DA' : 'rgba(255,243,218,0.45)';
  x.stroke();
  x.textAlign = 'center';
  x.fillStyle = '#3B3226';
  x.font = '58px sans-serif';
  x.fillText(pad.icon, S/2, S/2 - 6);
  x.font = 'bold 34px sans-serif';
  x.fillText('\u{1F4B0}' + pad.cost, S/2, S/2 + 44);
  if(pad.level > 0){
    x.font = 'bold 26px sans-serif';
    x.fillStyle = '#FFF3DA';
    x.fillText('Nv ' + pad.level, S/2, 40);
  }
  ud.tex.needsUpdate = true;
}

// --- pièces du décor -------------------------------------------------------
function buildMillLog(barkMat, endTex){
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.05, 9), barkMat);
  body.rotation.z = Math.PI/2;
  body.position.y = 0.24;
  body.castShadow = true;
  body.userData.bark = true; // repéré pour la dorure (voir setMillLogGolden)
  g.add(body);
  const endMat = new THREE.MeshStandardMaterial({ map: endTex, flatShading:true, roughness:0.85 });
  [-1, 1].forEach(side=>{
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.24, 12), endMat);
    cap.position.set(side*0.53, 0.24, 0);
    cap.rotation.y = side*Math.PI/2;
    g.add(cap);
  });
  return g;
}

// Géométrie et matériau PARTAGÉS par toutes les planches du tapis. Une
// partie longue en fait défiler des milliers : en créer un jeu neuf à chaque
// dépose accumulerait autant de matériaux et de tampons GPU jamais libérés
// (disposeProceduralGroup() ne rend que les géométries). Ici rien n'est créé
// ni détruit — on ajoute et on retire un maillage, c'est tout.
let millPlankGeo, millPlankMat;
function buildPlank(){
  if(!millPlankGeo){
    millPlankGeo = new THREE.BoxGeometry(0.42, 0.09, 0.6);
    millPlankMat = new THREE.MeshStandardMaterial({ color: 0xD9B57C, flatShading:true, roughness:0.85 });
  }
  const p = new THREE.Mesh(millPlankGeo, millPlankMat);
  p.castShadow = true;
  return p;
}

// Pile de planches portée sur le dos. Les planches sont créées une fois pour
// toutes et simplement montrées/cachées : en créer/détruire à chaque coup de
// hache ferait un ramassage mémoire en pleine partie, à 60 ticks/s.
const MILL_CARRY_VISIBLE_MAX = 10;
function buildCarryStack(){
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xD9B57C, flatShading:true, roughness:0.85 });
  const geo = new THREE.BoxGeometry(0.4, 0.07, 0.5);
  for(let i=0; i<MILL_CARRY_VISIBLE_MAX; i++){
    const p = new THREE.Mesh(geo, mat);
    // 0.72 et non 0.62 : plus bas, la pile disparaissait DANS le corps du
    // chat (dont le dos culmine à ~0.65) et on ne voyait pas ce qu'il porte
    p.position.set(0, 0.72 + i*0.075, -0.05);
    p.rotation.y = (i % 2) * 0.12 - 0.06; // pile pas parfaitement alignée : ça vit
    p.castShadow = true;
    p.visible = false;
    g.add(p);
  }
  return g;
}

// Un employé porte sa charge comme le patron, mais en plus petit — on doit
// voir d'un coup d'oeil lequel revient chargé et lequel repart les pattes
// vides, sinon la scierie n'a l'air que d'un ballet sans objet.
function buildWorkerCat(colorHex){
  const g = buildHeroCat(colorHex, 0x6B5F4F);
  g.scale.setScalar(0.95);
  const load = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xD9B57C, flatShading:true, roughness:0.85 });
  const geo = new THREE.BoxGeometry(0.34, 0.07, 0.44);
  for(let i=0; i<MILL_WORKER_CARRY; i++){
    const p = new THREE.Mesh(geo, mat);
    p.position.set(0, 0.72 + i*0.075, -0.05);
    p.castShadow = true;
    p.visible = false;
    load.add(p);
  }
  g.add(load);
  g.userData.load = load;
  return g;
}

function syncWorkerLoad(w){
  const load = w.visual && w.visual.userData.load;
  if(!load) return;
  load.children.forEach((p, i)=>{ p.visible = i < w.carry; });
}

// Bascule un rondin en "rondin d'or". Le matériau est CLONÉ par rondin : tous
// partagent le même à la construction, et le teinter directement les dorerait
// tous les cinq d'un coup.
function setMillLogGolden(log, on){
  log.gold = on;
  log.goldTimer = on ? MILL_GOLD_LOG_LIFE : 0;
  log.visual.traverse(o=>{
    if(!o.isMesh || !o.userData.bark) return;
    if(!o.userData.ownMat){
      o.material = o.material.clone();
      o.userData.ownMat = true;
    }
    o.material.color.setHex(on ? 0xE8B84B : 0x8A6743);
    o.material.metalness = on ? 0.45 : 0;
    o.material.roughness = on ? 0.4 : 0.95;
  });
  if(log.halo) log.halo.visible = on;
}

function syncCarryStack(){
  if(!millHero.carryStack) return;
  const n = Math.min(millHero.carry, MILL_CARRY_VISIBLE_MAX);
  millHero.carryStack.children.forEach((p, i)=>{ p.visible = i < n; });
}

function buildMillBelt(){
  const g = new THREE.Group();
  const len = MILL_BELT_END_X - MILL_BELT_START_X;
  const midX = (MILL_BELT_START_X + MILL_BELT_END_X) / 2;

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x7A6B58, flatShading:true, roughness:0.9 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(len + 0.4, 0.34, 1.0), frameMat);
  frame.position.set(midX, 0.2, MILL_BELT_Z);
  frame.castShadow = true; frame.receiveShadow = true;
  g.add(frame);

  millBeltTex = createBeltTexture();
  millBeltTex.repeat.set(Math.round(len * 1.6), 1);
  millBeltTopMat = new THREE.MeshStandardMaterial({ map: millBeltTex, flatShading:true, roughness:0.95 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(len + 0.4, 0.08, 0.86), millBeltTopMat);
  top.position.set(midX, 0.4, MILL_BELT_Z);
  top.receiveShadow = true;
  g.add(top);

  // pieds : sans eux le tapis a l'air de flotter au-dessus de l'herbe
  const legMat = new THREE.MeshStandardMaterial({ color: 0x5E5346, flatShading:true, roughness:0.95 });
  for(let x = MILL_BELT_START_X; x <= MILL_BELT_END_X + 0.01; x += 1.0){
    [-0.36, 0.36].forEach(off=>{
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.1), legMat);
      leg.position.set(x, 0.12, MILL_BELT_Z + off);
      leg.castShadow = true;
      g.add(leg);
    });
  }

  // rouleaux aux deux bouts, pour lire d'un coup d'œil l'entrée et la sortie
  const rollerMat = new THREE.MeshStandardMaterial({ color: 0xB5A489, flatShading:true, roughness:0.7, metalness:0.25 });
  [MILL_BELT_START_X - 0.2, MILL_BELT_END_X + 0.2].forEach(x=>{
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.96, 10), rollerMat);
    r.rotation.x = Math.PI/2;
    r.position.set(x, 0.36, MILL_BELT_Z);
    r.castShadow = true;
    g.add(r);
  });

  return g;
}

// Zone de dépose : un disque peint autour du départ du tapis. Le joueur n'a
// aucune touche "déposer" — il entre dans ce disque et les planches partent
// toutes seules — donc il faut que le disque se VOIE.
function buildDropZone(){
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.strokeStyle = 'rgba(255,243,218,0.85)';
  x.lineWidth = 8;
  x.setLineDash([14, 12]);
  x.beginPath(); x.arc(64, 64, 56, 0, Math.PI*2); x.stroke();
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(MILL_DROP_RADIUS, 30),
    new THREE.MeshBasicMaterial({ map: tex, transparent:true })
  );
  mesh.rotation.x = -Math.PI/2;
  mesh.position.set(MILL_BELT_START_X, 0.03, MILL_DROP_Z);
  return mesh;
}

// L'atelier : c'est là que les planches deviennent des pièces. La lame de scie
// tourne en permanence (voir updateMillDecor) pour que le bout de la chaîne
// ait l'air en marche, même quand rien n'arrive.
function buildWorkshop(){
  const g = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xC4A882, flatShading:true, roughness:0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xB0553F, flatShading:true, roughness:0.85 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x5E5346, flatShading:true, roughness:0.9 });

  const hut = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.25, 1.6), wallMat);
  hut.position.y = 0.62;
  hut.castShadow = true; hut.receiveShadow = true;
  g.add(hut);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.8, 4), roofMat);
  roof.position.y = 1.62;
  roof.rotation.y = Math.PI/4;
  roof.castShadow = true;
  g.add(roof);

  // ouverture côté tapis : les planches y entrent
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.9), darkMat);
  mouth.position.set(-0.76, 0.5, 0);
  g.add(mouth);

  millSawBlade = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.05, 14), new THREE.MeshStandardMaterial({
    color: 0xD9D9E0, flatShading:true, roughness:0.35, metalness:0.5
  }));
  millSawBlade.rotation.x = Math.PI/2;
  millSawBlade.position.set(-0.7, 0.92, 0.0);
  millSawBlade.castShadow = true;
  g.add(millSawBlade);

  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.26), darkMat);
  chimney.position.set(0.44, 1.55, -0.36);
  chimney.castShadow = true;
  g.add(chimney);

  // enseigne : un poisson, la monnaie du reste du jeu, pour relier les modes
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.06), roofMat);
  sign.position.set(0, 1.05, 0.83);
  g.add(sign);

  return g;
}

function buildMillTree(x, z, scale){
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, 0.9, 6),
    new THREE.MeshStandardMaterial({ color: 0x7A5C3C, flatShading:true, roughness:0.95 }));
  trunk.position.y = 0.45;
  trunk.castShadow = true;
  g.add(trunk);
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x5C8C4A, flatShading:true, roughness:0.95 });
  for(let i=0; i<3; i++){
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.72 - i*0.17, 0.75, 7), foliageMat);
    cone.position.y = 1.0 + i*0.44;
    cone.castShadow = true;
    g.add(cone);
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  return g;
}

// Décor d'avant-plan : un tas de planches finies (la production qui
// s'accumule) et des buissons. Purement décoratif — aucune interaction, donc
// aucun risque de le confondre avec une dalle ou un rondin.
let millPlankPiles = [];
function syncPlankPiles(){
  // paliers logarithmiques : les premières planches se voient tout de suite,
  // les millièmes n'ont pas à faire une tour de dix mètres
  const t = Math.min(1, Math.log10(1 + millTotalEarned) / 4.2);
  millPlankPiles.forEach(pile=>{
    const n = Math.max(1, Math.round(t * pile.children.length));
    pile.children.forEach((p, i)=>{ p.visible = i < n; });
  });
}

function buildPlankPile(x, z, n){
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xD9B57C, flatShading:true, roughness:0.85 });
  const geo = new THREE.BoxGeometry(1.15, 0.1, 0.5);
  for(let i=0; i<n; i++){
    const p = new THREE.Mesh(geo, mat);
    p.position.set((i%2)*0.05 - 0.025, 0.06 + i*0.105, 0);
    p.rotation.y = (i%2 ? 0.05 : -0.04);
    p.castShadow = true; p.receiveShadow = true;
    g.add(p);
  }
  g.position.set(x, 0, z);
  g.rotation.y = 0.25;
  return g;
}

function buildBush(x, z, scale){
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x6FA352, flatShading:true, roughness:0.95 });
  [[0,0.3,0,0.42],[0.3,0.24,0.12,0.3],[-0.26,0.22,-0.1,0.28]].forEach(([bx,by,bz,r])=>{
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 6), mat);
    b.position.set(bx, by, bz);
    b.castShadow = true;
    g.add(b);
  });
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  return g;
}

// --- construction de la scène ---------------------------------------------
function initMillScene(){
  if(!webglSupported) return;

  millScene = new THREE.Scene();
  millScene.background = new THREE.Color(0xAEDCE8);
  millScene.fog = new THREE.FogExp2(0xBFE0E8, 0.026);

  // Même plongée oblique que le Chatteau Fort : la chaîne se lit du fond
  // (clairière) vers l'avant (dalles), et le chat garde du volume.
  millCamera = new THREE.PerspectiveCamera(52, 1, 0.1, 120);
  millCamera.position.set(0, 9.6, 10.6);
  millCamera.lookAt(0, 0.8, -1.9);

  millHemiLight = new THREE.HemisphereLight(0xE9F3D8, 0xC9A063, 0.62);
  millScene.add(millHemiLight);
  millSunLight = new THREE.DirectionalLight(0xFFF0D2, 0.85);
  millSunLight.position.set(-6, 12, 4);
  millSunLight.castShadow = true;
  millSunLight.shadow.mapSize.set(2048, 2048);
  millSunLight.shadow.camera.near = 1;
  millSunLight.shadow.camera.far = 34;
  millSunLight.shadow.camera.left = -9;
  millSunLight.shadow.camera.right = 9;
  millSunLight.shadow.camera.top = 9;
  millSunLight.shadow.camera.bottom = -9;
  millSunLight.shadow.bias = -0.0025;
  millScene.add(millSunLight);
  millScene.add(millSunLight.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 44),
    new THREE.MeshStandardMaterial({ color: 0x8FBF6A, flatShading:true, roughness:1 }));
  ground.rotation.x = -Math.PI/2;
  ground.position.set(0, 0, -4);
  ground.receiveShadow = true;
  millScene.add(ground);

  // clairière : une tache de terre battue, pour que la zone de coupe soit un
  // LIEU et pas juste un rayon invisible autour de rondins posés sur l'herbe
  const clearing = new THREE.Mesh(new THREE.CircleGeometry(MILL_CHOP_ZONE.r + 0.5, 26),
    new THREE.MeshStandardMaterial({ color: 0xC9A063, flatShading:true, roughness:1 }));
  clearing.rotation.x = -Math.PI/2;
  clearing.position.set(MILL_CHOP_ZONE.x, 0.015, MILL_CHOP_ZONE.z);
  clearing.receiveShadow = true;
  millScene.add(clearing);

  millScene.add(buildMillBelt());
  millScene.add(buildDropZone());

  const shop = buildWorkshop();
  shop.position.set(MILL_WORKSHOP_X, 0, MILL_BELT_Z);
  millScene.add(shop);

  // rondins : disposés en cercle dans la clairière, position fixe (ils
  // repoussent au même endroit — le joueur mémorise son circuit)
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x8A6743, flatShading:true, roughness:0.95 });
  const endTex = createWoodEndTexture();
  millLogs = [];
  for(let i=0; i<MILL_LOG_COUNT; i++){
    const a = (i / MILL_LOG_COUNT) * Math.PI * 2 + 0.4;
    const rr = MILL_CHOP_ZONE.r * 0.62;
    const lx = MILL_CHOP_ZONE.x + Math.cos(a) * rr;
    const lz = MILL_CHOP_ZONE.z + Math.sin(a) * rr;
    const visual = buildMillLog(barkMat, endTex);
    visual.position.set(lx, 0, lz);
    visual.rotation.y = a;
    // halo du rondin d'or, masqué tant qu'il n'est pas doré
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.85, 20),
      new THREE.MeshBasicMaterial({ color: 0xFFD98A, transparent:true, opacity:0.7, side:THREE.DoubleSide })
    );
    halo.rotation.x = -Math.PI/2;
    halo.position.y = 0.02;
    halo.visible = false;
    visual.add(halo);
    millScene.add(visual);
    millLogs.push({ x: lx, z: lz, ready: true, regrow: 0, visual, halo,
                    baseRotZ: 0, claimedBy: null, gold: false, goldTimer: 0 });
  }

  // dalles d'amélioration, alignées devant le joueur
  millPads = MILL_PADS.map(def=>{
    const visual = buildMillPadLabel();
    visual.position.set(def.x, 0.03, def.z);
    millScene.add(visual);
    const pad = { id: def.id, x: def.x, z: def.z, icon: def.icon, baseCost: def.cost, cost: def.cost, level: 0, visual };
    redrawMillPadLabel(pad);
    return pad;
  });

  // Bois tout autour : ferme le cadre et justifie la scierie. La rangée du
  // fond est plantée LOIN derrière la clairière (z ≈ -8) pour que l'horizon
  // soit une forêt et pas une ligne de ciel posée sur de l'herbe.
  const treeSpots = [
    [-3.6,-8.4,1.15], [-1.2,-8.8,1.0], [1.0,-8.4,1.1], [3.2,-7.8,1.05],
    [-4.4,-6.4,1.0], [4.0,-5.6,0.95], [-4.6,-3.2,0.9], [4.4,-2.8,0.9],
    [-4.6,0.4,0.85], [4.4,0.8,0.85]
  ];
  treeSpots.forEach(([x,z,sc])=>millScene.add(buildMillTree(x, z, sc)));

  // AVANT-PLAN. Sans lui le tiers bas de l'écran était une nappe d'herbe vide
  // (vérifié en capture) : le format portrait donne beaucoup de hauteur, et
  // la chaîne de production, elle, se lit en largeur. On la borde donc de
  // décor proche plutôt que d'écarter les postes de travail, ce qui aurait
  // rallongé chaque aller-retour du chat.
  // Ces deux tas GRANDISSENT avec la production totale (voir syncPlankPiles) :
  // c'est la seule trace visible, dans le décor lui-même, de tout ce qui a été
  // fabriqué depuis le début. Un compteur en haut de l'écran ne donne pas ça.
  millPlankPiles = [buildPlankPile(1.0, 2.4, 9), buildPlankPile(-1.0, 2.5, 7)];
  millPlankPiles.forEach(pile=>millScene.add(pile));
  const bushSpots = [[-3.4,2.3,1.0],[-3.9,1.0,0.8],[3.0,2.4,0.95],[3.4,1.2,0.85],[-0.2,2.6,0.7]];
  bushSpots.forEach(([x,z,sc])=>millScene.add(buildBush(x, z, sc)));
  millScene.add(buildMillTree(-4.0, 2.6, 0.75));
  millScene.add(buildMillTree(3.9, 2.7, 0.7));
  // Bande la plus proche, HORS de la zone où le chat peut aller (MILL_BOUNDS
  // s'arrête à z = 2.6) : elle ne sert qu'à occuper le bas du cadre, que le
  // format portrait laissait en herbe nue sur près d'un quart de la hauteur.
  const closeSpots = [[-3.2,4.0,1.05],[-1.4,4.6,0.9],[0.9,4.4,1.0],[2.8,4.1,0.95]];
  closeSpots.forEach(([x,z,sc])=>millScene.add(buildMillTree(x, z, sc)));
  [[-2.3,3.5,1.1],[-0.3,3.7,0.95],[1.9,3.5,1.0],[3.4,3.6,0.9],[-4.0,3.6,0.9]]
    .forEach(([x,z,sc])=>millScene.add(buildBush(x, z, sc)));

  onResizeMill();
}

// Animation continue du décor : chevrons du tapis qui défilent, lame qui
// tourne. Appelée depuis updateMill() (le tick à pas fixe) et non depuis le
// rendu, pour que la vitesse ne dépende pas du taux de rafraîchissement.
function updateMillDecor(){
  if(millBeltTex) millBeltTex.offset.x -= millBeltSpeed() * 0.5;
  if(millSawBlade) millSawBlade.rotation.y += 0.25;
}

function setMillHeroProgress(ratio){
  if(!millHero.visual) return;
  setRingProgress(millHero.visual.userData.buildRing, ratio);
}

function onResizeMill(){
  if(!webglSupported || !millCamera) return;
  const w = canvas.clientWidth || 400, h = canvas.clientHeight || 700;
  millCamera.aspect = w / h;
  millCamera.updateProjectionMatrix();
}
