// Décor du mode "Palais des Chats". Quatrième scène indépendante, même
// principe que les trois autres : sa scène et sa caméra n'appartiennent qu'à
// ce mode, le renderer WebGL reste partagé.
//
// Le palais est reconstruit à CHAQUE NIVEAU (buildPuzzleLevel) plutôt que
// recyclé segment par segment : un niveau fait 9 carrefours, donc une
// cinquantaine d'objets — le reconstruire coûte quelques millisecondes une
// fois toutes les deux minutes de jeu, là où un recyclage glissant aurait
// demandé une gestion de pool bien plus fragile pour un gain invisible.
let puzzleScene, puzzleCamera;
let puzzleLevelGroup = null;   // tout le décor du niveau courant, jeté d'un bloc
let puzzleMarbleTex = null;

// createStoneTexture() (celle du Chatteau Fort) donnait un moellon gris-sable
// uniforme : le sol du palais ressemblait à une plage, pas à du marbre. Les
// dalles de createMarbleTexture() apportent en prime un repère de vitesse —
// leurs joints défilent, ce qu'un aplat ne pouvait pas faire.
function puzzleMarbleTexture(){
  if(!puzzleMarbleTex) puzzleMarbleTex = createMarbleTexture();
  return puzzleMarbleTex;
}

// AMBIANCE DU NIVEAU. Le couloir était rigoureusement identique du niveau 1 au
// niveau 20 : rien ne marquait la progression, et parcourir le dixième niveau
// donnait exactement la même image que le premier. Trois décors alternent
// désormais — palais de marbre, ponton de bois au-dessus de l'eau turquoise,
// allée de jardin — et chacun change sol, eau, ciel, brume, poteaux et
// rambardes d'un seul coup.
function puzzleAmbiance(){
  return PUZZLE_AMBIANCES[(puzzleLevel - 1) % PUZZLE_AMBIANCES.length];
}

// Affichage compact. Les multiplicateurs font grossir la puissance de façon
// exponentielle — c'est tout l'intérêt du genre — mais un nombre à neuf
// chiffres (mesuré : 1 057 676 903 au niveau 1 avant recalibrage) ne se lit
// pas sur une pastille de 2 cm. Au-delà du millier on passe donc en notation
// courte, et on garde une décimale tant qu'elle apporte quelque chose.
function puzzleFormat(n){
  // L'échelle monte jusqu'à 10^24 : une bonne partie atteint le niveau 12 et
  // la puissance y dépasse le millier de milliards. S'arrêter à "T" aurait
  // réaffiché des nombres à dix-huit chiffres exactement là où le jeu devient
  // intéressant.
  const units = [
    { v: 1e21, s: 'Sx' }, { v: 1e18, s: 'Qi' }, { v: 1e15, s: 'Qa' },
    { v: 1e12, s: 'T' },  { v: 1e9,  s: 'Md' }, { v: 1e6, s: 'M' }, { v: 1e3, s: 'K' }
  ];
  for(const u of units){
    if(n >= u.v){
      const x = n / u.v;
      return (x < 10 ? x.toFixed(1).replace('.', ',') : String(Math.round(x))) + ' ' + u.s;
    }
  }
  return String(Math.round(n));
}

// --- badges de nombres -----------------------------------------------------
// LE signal du mode : chaque chien porte sa puissance, chaque coffre son
// gain. Tout se joue sur la comparaison de deux nombres, donc ils doivent
// être lisibles à bout de bras sur un téléphone — d'où le contour épais et
// la pastille pleine derrière le texte.
function buildNumberBadge(text, kind){
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent:true, depthWrite:false, fog:false
  }));
  sprite.userData = { canvas: c, ctx: c.getContext('2d'), tex, kind, text: null };
  sprite.scale.set(1.5, 0.75, 1);
  sprite.renderOrder = 5;
  sprite.material.opacity = 1; // modulée à la distance, voir fadeDistantBadge()
  redrawNumberBadge(sprite, text);
  return sprite;
}

const PUZZLE_BADGE_STYLE = {
  foe:   { fill: '#C94868', ring: '#FFE3EA' }, // rouge : ça peut te tuer
  gain:  { fill: '#3E7BC4', ring: '#DCEBFF' }, // bleu : ça t'ajoute
  mult:  { fill: '#E3A857', ring: '#FFF3DA' }, // doré : ça te multiplie
  hero:  { fill: '#3B7A4E', ring: '#E4F5E6' }, // vert : c'est toi
  guard: { fill: '#8E2F4C', ring: '#FFD9E3' }, // pourpre : le gardien
  barrier:{ fill: '#B84A3A', ring: '#FFDCCF' }  // brique : ça se défonce, et ça coûte
};

function redrawNumberBadge(sprite, text){
  const ud = sprite.userData;
  if(ud.text === text) return;
  ud.text = text;
  const cx = ud.ctx, W = 256, H = 128;
  const st = PUZZLE_BADGE_STYLE[ud.kind] || PUZZLE_BADGE_STYLE.gain;
  cx.clearRect(0, 0, W, H);
  // pastille arrondie
  const rw = Math.min(W - 12, 90 + text.length * 40), rh = 84;
  const rx = (W - rw)/2, ry = (H - rh)/2, r = rh/2;
  cx.beginPath();
  cx.moveTo(rx + r, ry);
  cx.lineTo(rx + rw - r, ry);
  cx.arcTo(rx + rw, ry, rx + rw, ry + r, r);
  cx.lineTo(rx + rw, ry + rh - r);
  cx.arcTo(rx + rw, ry + rh, rx + rw - r, ry + rh, r);
  cx.lineTo(rx + r, ry + rh);
  cx.arcTo(rx, ry + rh, rx, ry + rh - r, r);
  cx.lineTo(rx, ry + r);
  cx.arcTo(rx, ry, rx + r, ry, r);
  cx.closePath();
  cx.fillStyle = st.fill;
  cx.fill();
  cx.lineWidth = 7;
  cx.strokeStyle = st.ring;
  cx.stroke();
  cx.font = '800 56px Fredoka, Nunito, sans-serif';
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.fillStyle = '#FFFFFF';
  cx.fillText(text, W/2, H/2 + 2);
  ud.tex.needsUpdate = true;
}

// --- LA TROUPE -------------------------------------------------------------
// Vingt-six chats derrière le meneur, et pourtant quatre appels de dessin :
// chaque partie du corps est un InstancedMesh unique dont on repositionne les
// instances à chaque frame. En maillages séparés, la même foule en aurait
// coûté plus de deux cents — impossible par-dessus les 264 déjà consommés par
// le mode.
//
// Les pattes sont volontairement absentes : à la taille où ces chats
// apparaissent, on ne distingue qu'une silhouette qui rebondit, et animer
// quatre pattes par instance aurait quadruplé le travail par frame pour un
// détail que personne ne voit.
let puzzleCrowdParts = null;   // { body, head, earL, earR }
let puzzleCrowdSlots = [];     // position visée de chaque suiveur
let puzzleCrowdCats = [];      // position réelle, qui rattrape la visée

function buildPuzzleCrowd(){
  const mkInstanced = (geo, count)=>{
    const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({
      flatShading:true, roughness:0.8
    }), count);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = true;
    m.count = 0;
    m.frustumCulled = false; // la foule suit la caméra, la culliser la ferait clignoter
    return m;
  };
  const N = PUZZLE_CROWD_MAX;
  // Proportions "chaton" : une petite masse de corps, une GROSSE tête et des
  // oreilles hautes bien écartées. Au premier essai le corps était presque
  // aussi large que la tête et les oreilles trop courtes : la troupe se lisait
  // comme un tas de tonneaux (vu en capture). À cette taille, seule la
  // silhouette compte, et ce qui dit "chat" c'est le triangle des oreilles.
  puzzleCrowdParts = {
    body: mkInstanced(new THREE.SphereGeometry(0.155, 7, 5), N),
    head: mkInstanced(new THREE.SphereGeometry(0.165, 7, 5), N),
    earL: mkInstanced(new THREE.ConeGeometry(0.072, 0.2, 4), N),
    earR: mkInstanced(new THREE.ConeGeometry(0.072, 0.2, 4), N)
  };
  Object.values(puzzleCrowdParts).forEach(m=>puzzleScene.add(m));

  // Places de la formation : un éventail derrière le meneur, calculé une seule
  // fois. Les rangs s'élargissent vers l'arrière, comme une nuée qui traîne.
  puzzleCrowdSlots = [];
  for(let i = 0; i < N; i++){
    const rang = Math.floor((Math.sqrt(1 + 8*i) - 1) / 2); // 1, 2, 3… par rang
    const dansRang = i - rang*(rang+1)/2;
    const largeur = rang + 1;
    const off = (dansRang - (largeur-1)/2) / Math.max(1, largeur-1 || 1);
    puzzleCrowdSlots.push({
      x: off * PUZZLE_CROWD_SPREAD * 2 + (((i * 53) % 17) / 17 - 0.5) * 0.16,
      z: (rang + 1) * PUZZLE_CROWD_SPACING + (((i * 31) % 13) / 13 - 0.5) * 0.14
    });
  }
  puzzleCrowdCats = puzzleCrowdSlots.map(sl=>({ x:0, z:0, phase: Math.random()*6.28 }));
}

// Nombre de chats affichés pour une puissance donnée. ÉCHELLE LOGARITHMIQUE :
// la puissance est exponentielle (elle passe de 5 à 10^12 en une partie), donc
// toute correspondance linéaire saturerait au premier multiplicateur.
function puzzleCrowdCount(power){
  if(power <= 0) return 0;
  const n = 1 + Math.log10(Math.max(1, power / PUZZLE_START_POWER)) * PUZZLE_CROWD_PER_DECADE;
  return Math.max(0, Math.min(PUZZLE_CROWD_MAX, Math.round(n)));
}

const puzzleCrowdM4 = new THREE.Matrix4();
const puzzleCrowdQ = new THREE.Quaternion();
const puzzleCrowdV = new THREE.Vector3();
const puzzleCrowdS = new THREE.Vector3(1, 1, 1);
const puzzleCrowdColor = new THREE.Color();

function updatePuzzleCrowd(n, leadX, leadZ, frame, fondu){
  if(!puzzleCrowdParts) return;
  const parts = puzzleCrowdParts;
  const visibles = Math.min(n, PUZZLE_CROWD_MAX);
  Object.values(parts).forEach(m=>{ m.count = visibles; });
  if(visibles === 0) return;

  const sk = (typeof currentSkin === 'function') ? currentSkin() : { fur: 0xD98244 };
  for(let i = 0; i < visibles; i++){
    const slot = puzzleCrowdSlots[i], cat = puzzleCrowdCats[i];
    const tx = leadX + slot.x, tz = leadZ + slot.z;
    // rattrapage progressif : la troupe ondule au lieu de se téléporter en
    // bloc quand le meneur change de voie
    cat.x += (tx - cat.x) * PUZZLE_CROWD_LERP;
    cat.z += (tz - cat.z) * PUZZLE_CROWD_LERP;
    const bob = Math.abs(Math.sin(frame*0.3 + cat.phase)) * 0.07;
    const ech = (fondu === undefined ? 1 : fondu);

    puzzleCrowdV.set(cat.x, 0.15 + bob, cat.z);
    puzzleCrowdS.set(ech, ech*0.78, ech*1.3);
    puzzleCrowdM4.compose(puzzleCrowdV, puzzleCrowdQ, puzzleCrowdS);
    parts.body.setMatrixAt(i, puzzleCrowdM4);

    puzzleCrowdV.set(cat.x, 0.36 + bob, cat.z + 0.11);
    puzzleCrowdS.set(ech, ech, ech);
    puzzleCrowdM4.compose(puzzleCrowdV, puzzleCrowdQ, puzzleCrowdS);
    parts.head.setMatrixAt(i, puzzleCrowdM4);

    [[-1, parts.earL], [1, parts.earR]].forEach(([side, m])=>{
      puzzleCrowdV.set(cat.x + side*0.098, 0.53 + bob, cat.z + 0.09);
      puzzleCrowdM4.compose(puzzleCrowdV, puzzleCrowdQ, puzzleCrowdS);
      m.setMatrixAt(i, puzzleCrowdM4);
    });

    // légère variation de teinte : une foule d'un seul ton fait masse morte
    const v = 0.86 + ((i * 37) % 29) / 100;
    puzzleCrowdColor.setHex(sk.fur).multiplyScalar(v);
    Object.values(parts).forEach(m=>m.setColorAt(i, puzzleCrowdColor));
  }
  Object.values(parts).forEach(m=>{
    m.instanceMatrix.needsUpdate = true;
    if(m.instanceColor) m.instanceColor.needsUpdate = true;
  });
}

function resetPuzzleCrowd(leadX, leadZ){
  puzzleCrowdCats.forEach((cat, i)=>{
    const slot = puzzleCrowdSlots[i];
    cat.x = leadX + slot.x;
    cat.z = leadZ + slot.z;
  });
}

// --- pièces du palais ------------------------------------------------------
function buildMarbleFloor(width, depth){
  const amb = puzzleAmbiance();
  const tex = (amb.id === 'ponton' ? createPlankTexture() : puzzleMarbleTexture()).clone();
  tex.needsUpdate = true;
  // une dalle tous les ~1,9 unité : assez fin pour donner l'échelle du chat,
  // assez large pour ne pas moirer quand le sol s'éloigne
  tex.repeat.set(Math.max(1, Math.round(width/1.9)), Math.max(1, Math.round(depth/1.9)));
  const mat = new THREE.MeshStandardMaterial({ map: tex, color: amb.sol, flatShading:true, roughness:0.85 });
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(width, 0.5, depth), mat);
  slab.position.y = -0.25;
  slab.receiveShadow = true;
  g.add(slab);

  // SÉPARATIONS DE VOIES. Le doigt cale désormais le chat sur l'une des trois
  // voies (voir setPuzzleTargetFromClientX) : encore faut-il que ces voies se
  // VOIENT. Sans ces deux lignes, le sol était une nappe blanche uniforme et
  // rien ne disait au joueur qu'il se déplaçait par crans.
  const lineMat = new THREE.MeshBasicMaterial({ color: amb.accent, transparent:true, opacity:0.5 });
  [-1.175, 1.175].forEach(x=>{
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.07, depth), lineMat);
    line.rotation.x = -Math.PI/2;
    line.position.set(x, 0.005, 0);
    g.add(line);
  });
  return g;
}

// Balustrade grecque : une main courante posée sur de petits balustres. C'est
// elle qui dit "palais" plutôt que "couloir", et elle borde le vide des deux
// côtés pour que le joueur comprenne où finit le terrain jouable.
function buildBalustrade(length, side){
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: puzzleAmbiance().rampe, flatShading:true, roughness:0.8 });
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, length), mat);
  rail.position.y = 0.72;
  rail.castShadow = true;
  g.add(rail);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, length), mat);
  base.position.y = 0.06;
  g.add(base);
  // Un balustre TOUS LES 62 cm sur une soixantaine d'unités, des deux côtés,
  // faisait à lui seul près de 200 maillages, soit la moitié des appels de
  // dessin du mode (403 mesurés). Ils sont identiques et immobiles : un seul
  // InstancedMesh suffit, et sur mobile ce sont les appels de dessin qui
  // coûtent, pas les triangles.
  const count = Math.max(1, Math.floor(length / 0.62));
  const balGeo = new THREE.CylinderGeometry(0.075, 0.1, 0.6, 6);
  const balusters = new THREE.InstancedMesh(balGeo, mat, count);
  balusters.castShadow = true;
  const m4 = new THREE.Matrix4();
  for(let i = 0; i < count; i++){
    m4.makeTranslation(0, 0.4, -length/2 + 0.3 + i * 0.62);
    balusters.setMatrixAt(i, m4);
  }
  balusters.instanceMatrix.needsUpdate = true;
  g.add(balusters);
  g.position.x = side;
  return g;
}

function buildColumn(x, z, h){
  const amb = puzzleAmbiance();
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: amb.poteau, flatShading:true, roughness:0.8 });
  const goldMat = new THREE.MeshStandardMaterial({ color: amb.accent, flatShading:true, roughness:0.5, metalness:0.3 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, h, 10), mat);
  shaft.position.y = h/2 + 0.2;
  shaft.castShadow = true;
  g.add(shaft);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.2, 10), mat);
  base.position.y = 0.1;
  g.add(base);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.32, 0.22, 10), goldMat);
  cap.position.y = h + 0.31;
  cap.castShadow = true;
  g.add(cap);
  addContactShadow(g, 0.5, 0.03);
  g.position.set(x, 0, z);
  return g;
}

// Coffre / tas de pièces : le contenant change selon ce qu'il donne, pour que
// le joueur reconnaisse un multiplicateur AVANT de lire son étiquette.
function buildTreasure(kind){
  const g = new THREE.Group();
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xE8B84B, flatShading:true, roughness:0.45, metalness:0.35 });
  if(kind === 'mult'){
    // coffre bombé cerclé d'or : le lot rare
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8E6BA8, flatShading:true, roughness:0.7 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.44, 0.6), woodMat);
    box.position.y = 0.22;
    box.castShadow = true;
    g.add(box);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 10, 1, false, 0, Math.PI), woodMat);
    lid.rotation.z = Math.PI/2;
    lid.position.y = 0.44;
    lid.castShadow = true;
    g.add(lid);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.1, 0.12), goldMat);
    band.position.y = 0.3;
    g.add(band);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), new THREE.MeshStandardMaterial({
      color: 0x59D8C8, flatShading:true, roughness:0.3, metalness:0.4
    }));
    gem.position.set(0, 0.5, 0.31);
    g.add(gem);
  } else {
    // tas de pièces : le lot ordinaire, sans couvercle à ouvrir
    for(let i=0; i<7; i++){
      const a = (i/7)*Math.PI*2;
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 8), goldMat);
      coin.position.set(Math.cos(a)*0.18, 0.03 + (i%3)*0.05, Math.sin(a)*0.18);
      coin.rotation.x = 0.1 * (i%2 ? 1 : -1);
      coin.castShadow = true;
      g.add(coin);
    }
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), goldMat);
    top.scale.y = 0.5;
    top.position.y = 0.16;
    top.castShadow = true;
    g.add(top);
  }
  return g;
}

// PORTIQUE. Le bonus était un petit coffre posé au sol avec une étiquette qui
// flottait au-dessus : on le TOUCHAIT. Ici c'est une arche large comme la
// voie, qu'on TRAVERSE — le geste du genre, et la seule façon de rendre le
// franchissement satisfaisant. La membrane translucide au milieu est ce qui
// donne la sensation de passer au travers.
function buildPuzzleGate(kind, accentHex){
  const g = new THREE.Group();
  const dore = kind === 'mult';
  const teinte = dore ? 0xE3A857 : 0x3E7BC4;
  const posteMat = new THREE.MeshStandardMaterial({
    color: teinte, flatShading:true, roughness:0.5, metalness:0.25 });
  const membraneMat = new THREE.MeshBasicMaterial({
    color: dore ? 0xFFE1A8 : 0xA8D4FF, transparent:true, opacity:0.30,
    side: THREE.DoubleSide, depthWrite:false });

  const L = 2.05; // largeur de la voie
  [-1, 1].forEach(side=>{
    const poste = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.55, 0.16), posteMat);
    poste.position.set(side * L/2, 0.78, 0);
    poste.castShadow = true;
    g.add(poste);
    const socle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.3), posteMat);
    socle.position.set(side * L/2, 0.06, 0);
    g.add(socle);
  });
  const linteau = new THREE.Mesh(new THREE.BoxGeometry(L + 0.3, 0.24, 0.22), posteMat);
  linteau.position.y = 1.6;
  linteau.castShadow = true;
  g.add(linteau);

  const membrane = new THREE.Mesh(new THREE.PlaneGeometry(L, 1.5), membraneMat);
  membrane.position.y = 0.78;
  g.add(membrane);
  g.userData.membrane = membrane;

  addContactShadow(g, 0.8, 0.03);
  return g;
}

// BARRAGE. Un mur qu'on défonce : il se franchit toujours si l'on est assez
// fort, mais il COÛTE sa valeur — là où un chien vaincu en rapporte. C'est
// donc parfois la voie la moins mauvaise, jamais la meilleure.
function buildPuzzleBarrier(){
  const g = new THREE.Group();
  const boisMat = new THREE.MeshStandardMaterial({ color: 0xB84A3A, flatShading:true, roughness:0.8 });
  const ferMat = new THREE.MeshStandardMaterial({ color: 0x6E6A62, flatShading:true, roughness:0.6, metalness:0.35 });
  const L = 1.9;
  for(let i = 0; i < 3; i++){
    const planche = new THREE.Mesh(new THREE.BoxGeometry(L, 0.3, 0.18), boisMat);
    planche.position.y = 0.22 + i * 0.34;
    planche.castShadow = true;
    g.add(planche);
  }
  [-1, 1].forEach(side=>{
    const montant = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.1, 0.22), ferMat);
    montant.position.set(side * (L/2 - 0.05), 0.55, 0);
    montant.castShadow = true;
    g.add(montant);
  });
  addContactShadow(g, 0.75, 0.03);
  return g;
}

// Porte du gardien : deux piliers et un linteau en travers du couloir. Elle
// coupe VISUELLEMENT la route, pour qu'on voie de loin qu'il n'y a pas
// d'échappatoire — contrairement aux carrefours, où il y a toujours une voie.
function buildGuardGate(){
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xC8B79A, flatShading:true, roughness:0.85 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xE3A857, flatShading:true, roughness:0.5, metalness:0.3 });
  [-3.4, 3.4].forEach(x=>{
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.2, 0.7), mat);
    pil.position.set(x, 1.6, 0);
    pil.castShadow = true;
    g.add(pil);
  });
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.6, 0.9), mat);
  lintel.position.y = 3.5;
  lintel.castShadow = true;
  g.add(lintel);
  const frieze = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.16, 1.0), goldMat);
  frieze.position.y = 3.1;
  g.add(frieze);
  return g;
}

function buildPuzzleWater(length){
  const mat = new THREE.MeshStandardMaterial({
    color: puzzleAmbiance().eau, flatShading:true, roughness:0.25, metalness:0.15,
    transparent:true, opacity:0.9
  });
  const w = new THREE.Mesh(new THREE.PlaneGeometry(46, length + 40), mat);
  w.rotation.x = -Math.PI/2;
  w.position.y = -0.9;
  return w;
}

// --- construction / destruction d'un niveau --------------------------------
function clearPuzzleLevel(){
  if(!puzzleLevelGroup) return;
  puzzleScene.remove(puzzleLevelGroup);
  disposeClonedSkeletons(puzzleLevelGroup); // les chiens du niveau qu'on jette
  // Les modèles de chiens sont des clones qui PARTAGENT leur géométrie avec
  // l'original (SkeletonUtils.clone) : détruire la géométrie ici tuerait tous
  // les chiens du jeu, y compris ceux des autres modes. On ne libère donc que
  // les matériaux clonés par instance et les textures de badges.
  // La première version ne libérait QUE les géométries : chaque niveau
  // laissait derrière lui ses matériaux et les textures de ses pastilles
  // (mesuré : +69 textures et +28 géométries après dix niveaux, sur une
  // partie qui peut en enchaîner une douzaine). On libère donc les trois,
  // avec une exception nette pour les modèles de chiens.
  puzzleLevelGroup.traverse(o=>{
    if(o.isSprite){
      if(o.material.map) o.material.map.dispose();
      o.material.dispose();
      return;
    }
    if(!o.isMesh && !o.isInstancedMesh) return;
    if(o.userData.sharedResource) return; // ressources communes aux quatre jeux
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if(o.userData.sharedModel){
      // Géométrie ET textures appartiennent au GLB d'origine, partagé avec
      // tous les autres chiens du jeu (SkeletonUtils.clone) : les libérer
      // ferait disparaître les chiens des trois autres modes. Seul le
      // matériau, cloné par instance pour la teinte, est à nous.
      mats.forEach(m=>m && m.dispose());
      return;
    }
    if(o.geometry) o.geometry.dispose();
    mats.forEach(m=>{
      if(!m) return;
      if(m.map) m.map.dispose(); // clone de texture propre à ce niveau
      m.dispose();
    });
  });
  puzzleLevelGroup = null;
}

// Décor propre à chaque ambiance, sur les côtés, au-delà des rambardes : des
// palmiers et un phare pour le ponton, des haies pour le jardin. C'est ce qui
// distingue les trois d'un coup d'œil, bien avant qu'on ait lu la couleur du
// sol.
function buildPuzzleSideProps(g, totalDepth, midZ){
  const amb = puzzleAmbiance();
  if(amb.id === 'palais') return;

  if(amb.id === 'ponton'){
    const troncMat = new THREE.MeshStandardMaterial({ color: 0x9A7B4F, flatShading:true, roughness:0.9 });
    const palmeMat = new THREE.MeshStandardMaterial({ color: 0x4E9C5A, flatShading:true, roughness:0.85 });
    const ilotMat = new THREE.MeshStandardMaterial({ color: 0xE0CC9A, flatShading:true, roughness:1 });
    for(let i = 0; i < 7; i++){
      const side = i % 2 ? 1 : -1;
      const z = midZ + (i - 3) * (totalDepth / 8);
      const x = side * (7.5 + (i % 3) * 1.6);
      const ilot = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 0.5, 9), ilotMat);
      ilot.position.set(x, -0.7, z);
      g.add(ilot);
      const tronc = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 2.6, 6), troncMat);
      tronc.position.set(x, 0.85, z);
      tronc.rotation.z = side * 0.14;
      g.add(tronc);
      for(let k = 0; k < 5; k++){
        const palme = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.5, 4), palmeMat);
        const a = (k / 5) * Math.PI * 2;
        palme.position.set(x + Math.cos(a)*0.62, 2.05, z + Math.sin(a)*0.62);
        palme.rotation.set(Math.cos(a)*0.9, 0, -Math.sin(a)*0.9);
        g.add(palme);
      }
    }
    // le phare, tout au fond : il donne un but visible au couloir
    const phareMat = new THREE.MeshStandardMaterial({ color: 0xF2ECE0, flatShading:true, roughness:0.85 });
    const bandeMat = new THREE.MeshStandardMaterial({ color: 0xC0392B, flatShading:true, roughness:0.85 });
    const px = 9.5, pz = midZ - totalDepth/2 - 4;
    const corps = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.15, 5.5, 10), phareMat);
    corps.position.set(px, 2.75, pz);
    g.add(corps);
    [1.5, 3.2].forEach(y=>{
      const bande = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.05, 0.8, 10), bandeMat);
      bande.position.set(px, y, pz);
      g.add(bande);
    });
    const lanterne = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.9, 8), bandeMat);
    lanterne.position.set(px, 5.85, pz);
    g.add(lanterne);
    const toit = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.7, 8), bandeMat);
    toit.position.set(px, 6.6, pz);
    g.add(toit);
    return;
  }

  // jardin : des haies taillées et des cyprès
  const haieMat = new THREE.MeshStandardMaterial({ color: 0x5E8C4E, flatShading:true, roughness:0.95 });
  const cypresMat = new THREE.MeshStandardMaterial({ color: 0x476E3E, flatShading:true, roughness:0.95 });
  for(let i = 0; i < 9; i++){
    const side = i % 2 ? 1 : -1;
    const z = midZ + (i - 4) * (totalDepth / 10);
    const x = side * 5.9;
    const haie = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 2.6), haieMat);
    haie.position.set(x, 0.35, z);
    g.add(haie);
    if(i % 3 === 0){
      const cypres = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.4, 7), cypresMat);
      cypres.position.set(x + side * 1.6, 1.5, z);
      g.add(cypres);
    }
  }
}

function buildPuzzleLevel(segments){
  clearPuzzleLevel();
  const amb = puzzleAmbiance();
  puzzleScene.background = new THREE.Color(amb.ciel);
  puzzleScene.fog.color.setHex(amb.brume);
  const g = new THREE.Group();
  const totalDepth = (segments.length + 3) * PUZZLE_SEG_LEN;
  const midZ = -totalDepth/2 + PUZZLE_SEG_LEN;

  g.add(buildPuzzleWater(totalDepth));

  const floor = buildMarbleFloor(7.6, totalDepth);
  floor.position.z = midZ;
  g.add(floor);

  [-3.9, 3.9].forEach(side=>{
    const bal = buildBalustrade(totalDepth, side);
    bal.position.z = midZ;
    g.add(bal);
  });

  // colonnes espacées d'un carrefour sur deux : elles rythment la marche sans
  // masquer les badges de nombres, qui priment sur tout le reste
  for(let i = 0; i < segments.length + 2; i += 2){
    const z = -i * PUZZLE_SEG_LEN - PUZZLE_SEG_LEN;
    g.add(buildColumn(-4.6, z, 3.2));
    g.add(buildColumn(4.6, z, 3.2));
  }

  buildPuzzleSideProps(g, totalDepth, midZ);

  puzzleLevelGroup = g;
  puzzleScene.add(g);
  return g;
}

function initPuzzleScene(){
  if(!webglSupported) return;

  puzzleScene = new THREE.Scene();
  puzzleScene.background = new THREE.Color(0x8FD3E8);
  puzzleScene.fog = new THREE.FogExp2(0xBFE6F0, 0.018);

  // Caméra de suivi, derrière et au-dessus : c'est une course en avant, il
  // faut voir loin DEVANT (les nombres à venir sont la seule information qui
  // compte) et très peu derrière.
  puzzleCamera = new THREE.PerspectiveCamera(56, 1, 0.1, 140);
  puzzleCamera.position.set(0, 7.2, 9.0);
  puzzleCamera.lookAt(0, 1.0, -3);

  // Intensités contenues : le sol est du marbre presque blanc, et aux valeurs
  // du mode Scierie (0,62 / 0,85) il partait en blanc pur, avalant les ombres
  // portées qui donnent leur assise aux chiens.
  puzzleScene.add(new THREE.HemisphereLight(0xEAF6FF, 0xC9A063, 0.55));
  const sun = new THREE.DirectionalLight(0xFFF4DE, 0.72);
  sun.position.set(-7, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 46;
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -14;
  sun.shadow.bias = -0.0025;
  puzzleScene.add(sun);
  puzzleScene.add(sun.target);
  puzzleSun = sun;

  buildPuzzleCrowd();
  onResizePuzzle();
}
let puzzleSun = null;

function onResizePuzzle(){
  if(!webglSupported || !puzzleCamera) return;
  const w = canvas.clientWidth || 400, h = canvas.clientHeight || 700;
  puzzleCamera.aspect = w / h;
  puzzleCamera.updateProjectionMatrix();
}
