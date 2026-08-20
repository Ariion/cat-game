// Mise en place de la scène Three.js + construction des modèles 3D
// (chats, chien, portes de bonus/malus) à partir de primitives low-poly.
// Tout est généré par code : aucune bibliothèque de modèles externe.
//
// Illusion de mouvement : le joueur reste fixe en Z (voir PLAYER_Z), c'est
// le DÉCOR qui défile vers la caméra — sol (défilement de texture), props
// (arbres/rochers/fleurs) et herbe sont recyclés en boucle (repositionnés
// loin derrière une fois passés), exactement comme les bonus/malus et les
// ennemis. Les montagnes, elles, restent fixes (voir buildMountainRange) :
// bien trop grosses pour approcher un peu sans finir par envahir l'écran.
// Voir updateDecor(), appelée à chaque tick fixe depuis update()
// (gameplay.js) — jamais depuis render(), sinon le défilement irait trop
// vite sur les écrans à haut taux de rafraîchissement (même piège que le
// bug de vitesse déjà corrigé sur le reste du jeu).

function checkWebGL(){
  try{
    const test = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (test.getContext('webgl') || test.getContext('experimental-webgl')));
  }catch(e){ return false; }
}

const webglSupported = checkWebGL();

let scene, camera, renderer, sunLight, hemiLight;
let leaderGroup, bossGroup;
let enemyVisuals = []; // pool de groupes 3D réutilisés, index-aligné avec enemyPool (state.js)
let doorGlowTexture;
let catMaterial, bossMaterial, enemyMaterial;
let particleGeometry, projectileGeometry;
let projectileGlowMaterial;

// --- décor recyclable (défilement façon tapis roulant) --------------------
let groundMat, groundRepeatV = 22, groundLengthZ = 90;
let mountainMatFar, mountainMatNear;
let foliageMatA, foliageMatB, grassMat;
let decorProps = [];     // {mesh, respawnMinZ, respawnMaxZ, xBase}
let grassInst = null;
let grassData = [];      // {x, z, rotY, rotZ, scale}
const decorDummy = webglSupported ? new THREE.Object3D() : null;

// --- météo d'ambiance (neige/feuilles/sable selon le biome) ---------------
let weatherInst = null, weatherMat = null;
let weatherData = []; // {x, y, z, rot}
let currentWeather = null; // paramètres interpolés (voir applyBiomeInstant/updateBiomeTransition)
// effets de gameplay du biome courant — valeurs neutres par défaut (utile
// même sans WebGL, où applyBiomeInstant() n'est jamais appelé)
let currentGameplayMods = { moveLerpMult: 1, enemySpeedMult: 1, fogDensityMult: 1 };

// --- ciel : redessiné (pas remplacé) pour permettre un fondu de biome -----
let skyCanvas, skyCtx, skyTexture, skyClouds = [];

// --- fondu entre deux biomes ------------------------------------------
let biomeIndex = 0;
let biomeAnimT = 0;
let biomeAnimFrom = null; // snapshot de couleurs au départ du fondu
let biomeAnimTo = null;   // BIOMES[i] ciblé

function drawPickupIcon(cx, kind){
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
  } else if(kind === 'water'){
    cx.fillStyle = '#5B8FBF';
    cx.beginPath();
    cx.moveTo(0,-14);
    cx.quadraticCurveTo(14,6,0,16);
    cx.quadraticCurveTo(-14,6,0,-14);
    cx.fill();
  } else if(kind === 'shield'){
    cx.fillStyle = '#E3A857';
    cx.beginPath();
    cx.moveTo(0,-15);
    cx.lineTo(12,-8);
    cx.lineTo(12,4);
    cx.quadraticCurveTo(12,14,0,18);
    cx.quadraticCurveTo(-12,14,-12,4);
    cx.lineTo(-12,-8);
    cx.closePath();
    cx.fill();
  } else if(kind === 'multishot'){
    cx.strokeStyle = '#9B6FC9';
    cx.lineWidth = 4.5;
    cx.lineCap = 'round';
    [-11, 0, 11].forEach(dx=>{
      cx.beginPath();
      cx.moveTo(dx*0.4, 14);
      cx.lineTo(dx, -14);
      cx.stroke();
      cx.beginPath();
      cx.moveTo(dx, -14);
      cx.lineTo(dx-4, -7);
      cx.moveTo(dx, -14);
      cx.lineTo(dx+4, -7);
      cx.stroke();
    });
  } else if(kind === 'magnet'){
    cx.strokeStyle = '#4FBEBE';
    cx.lineWidth = 7;
    cx.lineCap = 'round';
    cx.beginPath();
    cx.arc(0, -2, 11, Math.PI*0.15, Math.PI*0.85, false);
    cx.stroke();
    cx.beginPath();
    cx.moveTo(-11, -3); cx.lineTo(-11, 13);
    cx.moveTo(11, -3); cx.lineTo(11, 13);
    cx.stroke();
    cx.strokeStyle = '#ffffff';
    cx.lineWidth = 3.5;
    cx.beginPath();
    cx.moveTo(-11, 6); cx.lineTo(-11, 13);
    cx.moveTo(11, 6); cx.lineTo(11, 13);
    cx.stroke();
  }
}

const POWERUP_KINDS = ['shield', 'multishot', 'magnet'];

// Icône + montant ("+3", "+22", "-4") en GRAS, bien visible — c'est
// l'information principale de la porte, le reste n'est que décor. Les
// power-ups (durée temporaire, pas de "montant") affichent juste l'icône
// en plus grand, sans nombre.
function createPickupTexture(kind, amount){
  const w = 200, h = 340;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d');
  const isPowerup = POWERUP_KINDS.includes(kind);

  cx.save();
  cx.translate(w/2, isPowerup ? h*0.42 : h*0.2);
  cx.scale(isPowerup ? 3.2 : 1.9, isPowerup ? 3.2 : 1.9);
  drawPickupIcon(cx, kind);
  cx.restore();

  if(!isPowerup){
    const label = (amount >= 0 ? '+' : '') + amount;
    cx.font = '800 92px Fredoka, sans-serif';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.lineWidth = 14;
    cx.strokeStyle = 'rgba(59,50,38,0.9)';
    cx.strokeText(label, w/2, h*0.62);
    cx.fillStyle = '#ffffff';
    cx.fillText(label, w/2, h*0.62);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

// Texture de sol NEUTRE (nuances de gris) : la couleur vient uniquement du
// matériau (groundMat.color), ce qui permet de changer de biome en douceur
// par un simple fondu de couleur, sans jamais régénérer cette texture.
function createGroundTexture(){
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const cx = c.getContext('2d');
  cx.fillStyle = '#c9c9c9';
  cx.fillRect(0,0,256,256);
  // allée centrale plus claire
  cx.fillStyle = '#eeeeee';
  cx.fillRect(96, 0, 64, 256);
  // touffes décoratives, plus sombres
  cx.fillStyle = 'rgba(40,40,40,0.28)';
  for(let i=0;i<40;i++){
    const x = Math.random()*256, y = Math.random()*256;
    cx.beginPath();
    cx.ellipse(x, y, 5, 3, Math.random()*Math.PI, 0, Math.PI*2);
    cx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, groundRepeatV);
  return tex;
}

// Nuages générés une seule fois (position stable) puis réutilisés à chaque
// redessin du ciel — sinon ils "sauteraient" à chaque fondu de biome.
function buildSkyClouds(w, h){
  const layout = [[0.18,0.14],[0.68,0.10],[0.42,0.24],[0.85,0.27],[0.1,0.32],[0.55,0.33]];
  return layout.map(([cxr,cyr])=>{
    const px = cxr*w, py = cyr*h;
    const puffs = [];
    for(let i=0;i<4;i++){
      puffs.push({
        x: px + (Math.random()-0.5)*36,
        y: py + (Math.random()-0.5)*8,
        rx: 20+Math.random()*12,
        ry: 11+Math.random()*5
      });
    }
    return puffs;
  });
}

// Redessine le ciel avec les couleurs fournies (4 arrêts de dégradé), sur le
// MÊME canvas/texture — appelé une fois au départ puis, à débit réduit,
// pendant un fondu de biome (les nuages, eux, ne bougent pas).
function redrawSky(stepsHex){
  const w = skyCanvas.width, h = skyCanvas.height;
  const grad = skyCtx.createLinearGradient(0, 0, 0, h);
  const stops = [0, 0.42, 0.72, 1];
  stepsHex.forEach((hex, i)=>{
    grad.addColorStop(stops[i], '#' + hex.toString(16).padStart(6,'0'));
  });
  skyCtx.fillStyle = grad;
  skyCtx.fillRect(0, 0, w, h);

  skyCtx.fillStyle = 'rgba(255,255,255,0.8)';
  skyClouds.forEach(puffs=>{
    puffs.forEach(p=>{
      skyCtx.beginPath();
      skyCtx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI*2);
      skyCtx.fill();
    });
  });
  skyTexture.needsUpdate = true;
}

function createSkyTexture(stepsHex){
  const w = 300, h = 600;
  skyCanvas = document.createElement('canvas');
  skyCanvas.width = w; skyCanvas.height = h;
  skyCtx = skyCanvas.getContext('2d');
  skyClouds = buildSkyClouds(w, h);
  skyTexture = new THREE.CanvasTexture(skyCanvas);
  redrawSky(stepsHex);
  return skyTexture;
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

// --- montagnes : décor de fond FIXE, ne défile jamais (voir updateDecor()) —
// seuls les matériaux (mountainMatFar/mountainMatNear) suivent le fondu de
// biome, la géométrie ne bouge plus une fois posée.
function buildMountainRange(){
  mountainMatFar = new THREE.MeshStandardMaterial({ color: 0x7E9C9C, flatShading:true, roughness:1 });
  mountainMatNear = new THREE.MeshStandardMaterial({ color: 0x5F8778, flatShading:true, roughness:1 });
  for(let i=0;i<9;i++){
    const x = -34 + i*8.5 + (Math.random()-0.5)*3;
    const height = 9 + Math.random()*7;
    const radius = 7 + Math.random()*4;
    const near = i % 2 !== 0;
    const geo = new THREE.ConeGeometry(radius, height, 5);
    const mesh = new THREE.Mesh(geo, near ? mountainMatNear : mountainMatFar);
    mesh.position.set(x, height/2 - 0.6, -40 - Math.random()*10);
    mesh.rotation.y = Math.random()*Math.PI;
    scene.add(mesh);
  }
}

// Une "patte" = un pivot (la hanche) contenant un cylindre légèrement
// effilé qui pend vers le bas + une petite boule (le coussinet) au bout.
// Faire tourner pivot.rotation.x fait balancer toute la patte d'avant en
// arrière, comme une articulation — c'est ce qu'anime animateLegs()
// (render3d.js) pour donner un vrai cycle de course, là où avant les
// personnages se contentaient de rebondir sans membres.
function buildLeg(mat, length, radiusTop, radiusBottom){
  const pivot = new THREE.Group();
  const legGeo = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 5);
  const mesh = new THREE.Mesh(legGeo, mat);
  mesh.position.y = -length/2;
  pivot.add(mesh);
  const paw = new THREE.Mesh(new THREE.SphereGeometry(radiusBottom*1.2, 5, 4), mat);
  paw.position.y = -length;
  pivot.add(paw);
  return pivot;
}

// Le chat meneur — désormais le SEUL chat du jeu (plus de horde de
// suiveurs, voir buildPowerLabel() pour comment sa puissance grandissante
// se voit à la place). Proportions "chaton" (tête large, grands yeux) pour
// rester mignon même une fois agrandi par leaderScale().
function buildCatGroup(){
  const g = new THREE.Group();
  const mat = catMaterial;

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.29, 10, 8), mat);
  body.scale.set(1, 0.82, 1.35);
  body.position.y = 0.34;
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.30, 10, 8), mat);
  head.position.set(0, 0.56, -0.28);
  g.add(head);

  const legPositions = [
    [-0.15, 0.16, -0.2], [0.15, 0.16, -0.2],   // avant gauche/droite
    [-0.15, 0.16, 0.22], [0.15, 0.16, 0.22]    // arrière gauche/droite
  ];
  g.userData.legs = legPositions.map(([x,y,z])=>{
    const leg = buildLeg(mat, 0.16, 0.04, 0.028);
    leg.position.set(x, y, z);
    g.add(leg);
    return leg;
  });

  // oreilles plus grandes, proportionnées à la tête agrandie
  const earGeo = new THREE.ConeGeometry(0.105, 0.19, 4);
  const earL = new THREE.Mesh(earGeo, mat);
  earL.position.set(-0.15, 0.78, -0.3);
  earL.rotation.z = -0.3;
  g.add(earL);
  const earR = earL.clone();
  earR.position.x = 0.15;
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

  // grands yeux ronds, bien espacés — l'essentiel du charme "chaton"
  const eyeGeo = new THREE.SphereGeometry(0.05, 8, 6);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2a2018 });
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.11, 0.58, -0.5);
  g.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.11;
  g.add(eyeR);
  // petit reflet blanc dans chaque œil, pour un regard vivant
  const glintGeo = new THREE.SphereGeometry(0.016, 5, 4);
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const glintL = new THREE.Mesh(glintGeo, glintMat);
  glintL.position.set(-0.085, 0.6, -0.535);
  g.add(glintL);
  const glintR = glintL.clone();
  glintR.position.x = 0.085;
  g.add(glintR);

  return g;
}

// Étiquette flottante au-dessus du chat, affichant sa puissance (les
// dégâts de son tir — voir attackDamage() dans gameplay.js) en toutes
// lettres, mise à jour uniquement quand la valeur affichée change (pas de
// redessin de canvas à chaque frame). Remplace la horde de suiveurs comme
// façon de "voir" la puissance grandir.
let powerLabelCanvas, powerLabelCtx, powerLabelTexture, lastDisplayedPower = -1;

function buildPowerLabel(){
  powerLabelCanvas = document.createElement('canvas');
  powerLabelCanvas.width = 220; powerLabelCanvas.height = 90;
  powerLabelCtx = powerLabelCanvas.getContext('2d');
  powerLabelTexture = new THREE.CanvasTexture(powerLabelCanvas);
  const mat = new THREE.SpriteMaterial({ map: powerLabelTexture, transparent:true, depthWrite:false, fog:false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.3, 0.53, 1);
  sprite.position.set(0, 1.15, 0);
  sprite.renderOrder = 3;
  return sprite;
}

function redrawPowerLabel(value){
  const c = powerLabelCanvas, cx = powerLabelCtx;
  cx.clearRect(0, 0, c.width, c.height);
  cx.font = '800 44px Fredoka, sans-serif';
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  const label = '⚡ ' + value;
  cx.lineWidth = 8;
  cx.strokeStyle = 'rgba(59,50,38,0.85)';
  cx.strokeText(label, c.width/2, c.height/2);
  cx.fillStyle = '#ffffff';
  cx.fillText(label, c.width/2, c.height/2);
  powerLabelTexture.needsUpdate = true;
}

function updateLeaderPowerLabel(value){
  if(value === lastDisplayedPower) return;
  lastDisplayedPower = value;
  redrawPowerLabel(value);
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

  const legPositions = [
    [-0.28, 0.42, -0.35], [0.28, 0.42, -0.35], // avant gauche/droite
    [-0.28, 0.42, 0.35], [0.28, 0.42, 0.35]    // arrière gauche/droite
  ];
  g.userData.legs = legPositions.map(([x,y,z])=>{
    const leg = buildLeg(mat, 0.42, 0.09, 0.06);
    leg.position.set(x, y, z);
    g.add(leg);
    return leg;
  });

  return g;
}

// --- chiens en vrais modèles 3D (CC0, Quaternius) --------------------
// Chargés en ARRIÈRE-PLAN au démarrage — le jeu reste jouable immédiatement
// avec les chiens procéduraux (buildBossGroup ci-dessus) le temps que ça
// charge, puis chaque emplacement du pool est "mis à niveau" une fois le
// modèle prêt (voir upgradeDogsToRealModels). Si le chargement échoue
// (réseau, hébergement qui ne sert pas les .glb...), le jeu continue
// simplement avec les chiens procéduraux — jamais bloquant.
let dogModels = { husky: null, shiba: null }; // { scene, animations, naturalHeight } une fois chargés
const DOG_MODEL_URLS = { husky: 'assets/models/dog-husky.glb', shiba: 'assets/models/dog-shiba.glb' };

function loadDogModels(){
  if(!webglSupported || typeof THREE.GLTFLoader !== 'function') return;
  const loader = new THREE.GLTFLoader();
  let pending = 2;
  function settle(){ pending--; if(pending === 0) upgradeDogsToRealModels(); }
  ['husky','shiba'].forEach(kind=>{
    loader.load(DOG_MODEL_URLS[kind], gltf=>{
      const box = new THREE.Box3().setFromObject(gltf.scene);
      gltf.naturalHeight = Math.max(0.01, box.max.y - box.min.y);
      gltf.scene.traverse(o=>{
        if(o.isMesh){
          // PAS d'ombre portée ici (contrairement au chat meneur/boss) :
          // jusqu'à MAX_ENEMIES clones simultanés, ça ne vaudrait pas le
          // coût. buildRealDogGroup() l'active explicitement pour le boss.
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(m=>{
            if(!m) return;
            m.flatShading = true;
            // Le glTF encode ses couleurs en espace LINÉAIRE ; notre renderer
            // n'a pas d'encodage de sortie sRGB (retiré plus tôt — ça
            // délavait notre propre palette pastel codée en dur). Sans
            // conversion manuelle ici, ces modèles ressortent bien trop
            // sombres (couleur brute ~0x10 au lieu de ~0x48 une fois
            // corrigée) alors que nos propres matériaux restent inchangés.
            if(m.color) m.color.convertLinearToSRGB();
            if(m.emissive) m.emissive.convertLinearToSRGB();
            m.needsUpdate = true;
          });
        }
      });
      gltf.kind = kind;
      dogModels[kind] = gltf;
      settle();
    }, undefined, err=>{
      console.warn('Modèle 3D "' + kind + '" indisponible, chien procédural conservé.', err);
      settle();
    });
  });
}

function pickDogGltf(index){
  const preferHusky = index % 2 === 0;
  if(preferHusky && dogModels.husky) return dogModels.husky;
  if(!preferHusky && dogModels.shiba) return dogModels.shiba;
  return dogModels.husky || dogModels.shiba || null;
}

// Le matériau "pelage principal" n'a pas le même nom selon la race (voir
// l'inspection des .glb) — les autres matériaux (yeux, truffe...) restent
// tels quels, seul celui-ci est teinté pour varier les chiens entre eux.
const DOG_MAIN_FUR_MATERIAL = { husky: 'Material', shiba: 'Main' };
const DOG_FUR_COLORS = [0x2b2b2b, 0x5c4a35, 0xC9A063, 0x8a8a8a, 0x9c5b3c, 0xe8ddc9, 0x6b4a2f];
function randomFurColor(){ return DOG_FUR_COLORS[Math.floor(Math.random()*DOG_FUR_COLORS.length)]; }

function buildRealDogGroup(gltf, targetHeight, withShadow, furColor){
  const root = THREE.SkeletonUtils.clone(gltf.scene);
  const scale = targetHeight / gltf.naturalHeight;
  root.scale.setScalar(scale);
  if(withShadow) root.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
  // SkeletonUtils.clone() partage les matériaux avec l'original (et donc
  // avec tous les autres clones) — il faut les cloner nous-mêmes pour
  // pouvoir teinter le pelage d'un chien sans changer tous les autres.
  if(furColor !== undefined){
    const mainName = DOG_MAIN_FUR_MATERIAL[gltf.kind];
    root.traverse(o=>{
      if(!o.isMesh || !o.material) return;
      const clone = o.material.clone();
      if(clone.name === mainName) clone.color.setHex(furColor);
      o.material = clone;
    });
  }
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  gltf.animations.forEach(clip=>{ actions[clip.name] = mixer.clipAction(clip); });
  const run = actions['Gallop'] || actions['Walk'];
  if(run) run.play();

  const g = new THREE.Group();
  g.add(root);
  g.userData.mixer = mixer;
  g.userData.actions = actions;
  g.userData.isRealModel = true;
  return g;
}

function disposeProceduralGroup(g){
  g.traverse(o=>{ if(o.isMesh && o.geometry) o.geometry.dispose(); });
}

// Remplace les chiens procéduraux par les vrais modèles, une fois chargés —
// appelé une seule fois (voir settle() dans loadDogModels), jamais pendant
// une partie en cours normalement (le chargement démarre à initScene(),
// bien avant que le joueur ait cliqué "Jouer"), mais on préserve quand
// même position/visibilité par sécurité si jamais ça arrive plus tard.
function upgradeDogsToRealModels(){
  if(!dogModels.husky && !dogModels.shiba) return; // rien n'a chargé : on garde le procédural

  const bossGltf = dogModels.husky || dogModels.shiba; // le husky, plus imposant, pour le boss
  const bossVisible = bossGroup.visible, bossPos = bossGroup.position.clone();
  scene.remove(bossGroup);
  disposeProceduralGroup(bossGroup);
  bossGroup = buildRealDogGroup(bossGltf, DOG_HEIGHT_BOSS, true, randomFurColor());
  bossGroup.position.copy(bossPos);
  bossGroup.visible = bossVisible;
  scene.add(bossGroup);

  for(let i=0;i<enemyVisuals.length;i++){
    const gltf = pickDogGltf(i);
    if(!gltf) continue;
    const old = enemyVisuals[i];
    const wasVisible = old.visible, pos = old.position.clone();
    scene.remove(old);
    disposeProceduralGroup(old);
    const g = buildRealDogGroup(gltf, DOG_HEIGHT_ENEMY, false, randomFurColor());
    g.position.copy(pos);
    g.visible = wasVisible;
    scene.add(g);
    enemyVisuals[i] = g;
  }
}

// Fait avancer l'animation (mixer) de chaque chien réel — pas fixe, comme
// tout le reste du décor (voir updateDecor()), sinon l'animation irait trop
// vite sur les écrans à haut taux de rafraîchissement.
function updateDogAnimations(){
  if(!webglSupported) return;
  if(bossGroup.userData.mixer) bossGroup.userData.mixer.update(1/60);
  for(let i=0;i<enemyVisuals.length;i++){
    const v = enemyVisuals[i];
    if(v.userData.mixer && v.visible) v.userData.mixer.update(1/60);
  }
}

// --- chat meneur en vrai modèle 3D (statique — le format .obj ne permet
// aucun rig/animation, contrairement aux chiens en .glb) ------------------
// Chargé en arrière-plan comme les chiens : le chat procédural (avec ses
// pattes animées) reste affiché tant que ça charge, remplacé une fois prêt.
const CAT_MODEL_URL = 'assets/models/cat-kitten.obj';
const CAT_MODEL_BASE_HEIGHT = 0.85; // hauteur cible à leaderScale()=1, proche de la taille du modèle procédural
let catModelMesh = null; // mesh normalisé (centré, pattes à y=0, orienté vers -Z), prêt à cloner

function loadCatModel(){
  if(!webglSupported || typeof THREE.OBJLoader !== 'function') return;
  const loader = new THREE.OBJLoader();
  loader.load(CAT_MODEL_URL, group=>{
    const gato = group.children.find(c => c.name === 'Gato');
    if(!gato){ console.warn('Objet "Gato" introuvable dans ' + CAT_MODEL_URL + ', chat procédural conservé.'); return; }
    const box = new THREE.Box3().setFromObject(gato);
    const center = box.getCenter(new THREE.Vector3());
    // recentre la géométrie elle-même (pas juste la position), pattes au
    // sol — ainsi la rotation ci-dessous (préservée par mesh.clone()) pivote
    // bien autour du centre du chat, pas d'un coin de sa boîte englobante
    gato.geometry.translate(-center.x, -box.min.y, -center.z);
    gato.rotation.y = Math.PI; // le modèle regarde vers +Z, il nous faut -Z
    gato.material = new THREE.MeshStandardMaterial({ color: 0xC97B4F, roughness: 0.75 });
    gato.castShadow = true;
    const naturalHeight = box.max.y - box.min.y;
    gato.userData.scaleToBaseHeight = CAT_MODEL_BASE_HEIGHT / naturalHeight;
    catModelMesh = gato;
    upgradeCatToRealModel();
  }, undefined, err=>{
    console.warn('Modèle 3D du chat indisponible, chat procédural conservé.', err);
  });
}

function upgradeCatToRealModel(){
  if(!catModelMesh || !leaderGroup) return;
  const old = leaderGroup.userData.catVisual;
  leaderGroup.remove(old);
  disposeProceduralGroup(old);
  const mesh = catModelMesh.clone(); // partage géométrie/matériau (une seule instance affichée, pas de pool)
  mesh.scale.setScalar(catModelMesh.userData.scaleToBaseHeight);
  leaderGroup.add(mesh);
  leaderGroup.userData.catVisual = mesh;
  leaderGroup.userData.legs = null; // pas de rig — animateLegs() ne fait rien sur null, déjà géré
}

const PICKUP_COLORS = {
  croquette: 0x6B8F71, water: 0x5B8FBF, heart: 0xD9607A,
  shield: 0xE3A857, multishot: 0x9B6FC9, magnet: 0x4FBEBE
};

// Portes DROITES (pas d'arche, pas de rotation continue) en faible opacité
// et colorées, avec le montant en gros et en gras — le joueur doit pouvoir
// lire "+12" ou "-6" d'un coup d'œil en approchant.
function buildPickupVisual(kind, amount){
  const g = new THREE.Group();
  const color = PICKUP_COLORS[kind];
  const width = 1.5, height = 2.3;

  const panelGeo = new THREE.PlaneGeometry(width, height);
  const panelMat = new THREE.MeshStandardMaterial({
    color, transparent:true, opacity:0.28, side: THREE.DoubleSide,
    roughness:0.4, depthWrite:false
  });
  const panel = new THREE.Mesh(panelGeo, panelMat);
  panel.position.y = height/2;
  g.add(panel);

  // cadre plein (montants + linteau) : lit clairement comme une porte,
  // même à faible opacité sur le panneau
  const frameMat = new THREE.MeshStandardMaterial({ color, transparent:true, opacity:0.85, roughness:0.5 });
  const postGeo = new THREE.BoxGeometry(0.08, height, 0.08);
  const postL = new THREE.Mesh(postGeo, frameMat);
  postL.position.set(-width/2, height/2, 0);
  g.add(postL);
  const postR = postL.clone();
  postR.position.x = width/2;
  g.add(postR);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(width+0.16, 0.08, 0.08), frameMat);
  lintel.position.set(0, height, 0);
  g.add(lintel);

  // halo, pour repérer la porte de loin
  const haloMat = new THREE.SpriteMaterial({
    map: doorGlowTexture, color, transparent:true, opacity:0.55,
    blending: THREE.AdditiveBlending, depthWrite:false
  });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.set(width*1.3, height*1.05, 1);
  halo.position.set(0, height/2, 0.01);
  halo.renderOrder = 1;
  g.add(halo);

  // icône + montant en gras, texture générée pour ce pickup précis
  const tex = createPickupTexture(kind, amount);
  const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent:true });
  const sprite = new THREE.Sprite(spriteMat);
  const aspect = 200/340;
  const spriteW = width*0.92;
  sprite.scale.set(spriteW, spriteW/aspect, 1);
  sprite.position.set(0, height*0.56, 0.02);
  sprite.renderOrder = 2;
  g.add(sprite);
  g.userData.uniqueTexture = tex;

  return g;
}

function disposePickupVisual(group){
  if(group.userData.uniqueTexture) group.userData.uniqueTexture.dispose();
  group.traverse(obj=>{
    if(obj.geometry) obj.geometry.dispose();
    if(obj.material) obj.material.dispose();
  });
}

function buildProps(){
  // décor recyclé (arbres, buissons, rochers, fleurs) le long du chemin —
  // géométries/matériaux partagés, chaque instance défile puis revient loin
  // derrière une fois passée (voir updateDecor()).
  const trunkGeo = new THREE.CylinderGeometry(0.07, 0.1, 0.5, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8A6B4A, flatShading:true, roughness:0.9 });
  const foliageGeo = new THREE.ConeGeometry(0.55, 0.95, 7);
  foliageMatA = new THREE.MeshStandardMaterial({ color: 0x6B8F71, flatShading:true, roughness:0.85 });
  foliageMatB = new THREE.MeshStandardMaterial({ color: 0x7FA372, flatShading:true, roughness:0.85 });
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

  decorProps = [];
  for(let z = -78; z < 8; z += 5.5){
    [-1, 1].forEach(side=>{
      const xBase = side * (3.6 + Math.random()*2.2);
      const prop = randomProp();
      prop.position.set(xBase + (Math.random()-0.5)*0.8, 0, z + (Math.random()-0.5)*2);
      prop.rotation.y = Math.random()*Math.PI*2;
      scene.add(prop);
      decorProps.push({ mesh: prop, xBase });
    });
  }

  // touffes de fleurs en premier plan, près du chemin
  for(let i=0;i<10;i++){
    const side = Math.random() < 0.5 ? -1 : 1;
    const xBase = side*(2.0 + Math.random()*0.8);
    const clump = buildFlowerClump();
    clump.position.set(xBase, 0, -6 + Math.random()*12);
    clump.rotation.y = Math.random()*Math.PI*2;
    scene.add(clump);
    decorProps.push({ mesh: clump, xBase });
  }

  buildGrass();
}

function buildGrass(){
  // brins d'herbe en premier plan, en instanced mesh (un seul draw call) —
  // recyclés individuellement (voir updateDecor()), donc les transformations
  // sont gardées côté JS (grassData) et réappliquées à la matrice d'instance
  // à chaque tick.
  const bladeGeo = new THREE.ConeGeometry(0.022, 0.24, 3);
  grassMat = new THREE.MeshStandardMaterial({ color: 0x6F9A52, flatShading:true, roughness:0.9 });
  const cap = 240;
  grassInst = new THREE.InstancedMesh(bladeGeo, grassMat, cap);
  grassData = [];
  let gi = 0;
  for(let z=-16; z<9 && gi<cap; z+=0.55){
    for(let k=0; k<2 && gi<cap; k++){
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side * (1.85 + Math.random()*1.5);
      grassData.push({
        x, z: z + (Math.random()-0.5)*0.5,
        rotY: Math.random()*Math.PI,
        rotZ: (Math.random()-0.5)*0.35,
        scale: 0.7 + Math.random()*0.6
      });
      gi++;
    }
  }
  grassInst.count = gi;
  applyGrassMatrices();
  scene.add(grassInst);
}

function applyGrassMatrices(){
  for(let i=0;i<grassData.length;i++){
    const b = grassData[i];
    decorDummy.position.set(b.x, 0.1, b.z);
    decorDummy.rotation.set(0, b.rotY, b.rotZ);
    decorDummy.scale.setScalar(b.scale);
    decorDummy.updateMatrix();
    grassInst.setMatrixAt(i, decorDummy.matrix);
  }
  grassInst.instanceMatrix.needsUpdate = true;
}

// Nuage de particules d'ambiance (neige/feuilles/sable selon le biome) —
// un seul système réutilisé, dont la couleur/opacité/vitesse suivent le
// fondu de biome comme le reste du décor. Toujours recentré autour du
// joueur (voir updateDecor()), donc visible quelle que soit la position.
function buildWeather(){
  const geo = new THREE.IcosahedronGeometry(1, 0);
  weatherMat = new THREE.MeshBasicMaterial({
    color: BIOMES[0].weather.color, transparent:true, opacity: BIOMES[0].weather.opacity,
    depthWrite:false, fog:false
  });
  const cap = 55;
  weatherInst = new THREE.InstancedMesh(geo, weatherMat, cap);
  weatherData = [];
  for(let i=0;i<cap;i++){
    weatherData.push({
      x: (Math.random()-0.5)*9,
      y: Math.random()*5.5,
      z: PLAYER_Z + (Math.random()-0.5)*9,
      rot: Math.random()*Math.PI
    });
  }
  weatherInst.count = cap;
  applyWeatherMatrices(BIOMES[0].weather.size);
  scene.add(weatherInst);
}

function applyWeatherMatrices(size){
  for(let i=0;i<weatherData.length;i++){
    const p = weatherData[i];
    decorDummy.position.set(p.x, p.y, p.z);
    decorDummy.rotation.set(p.rot, p.rot*0.7, 0);
    decorDummy.scale.setScalar(size);
    decorDummy.updateMatrix();
    weatherInst.setMatrixAt(i, decorDummy.matrix);
  }
  weatherInst.instanceMatrix.needsUpdate = true;
}

// --- défilement du décor (appelé à chaque tick fixe depuis update()) ------

function updateDecor(){
  if(!webglSupported) return;
  const speed = DECOR_SCROLL_SPEED;

  // sol : on ne déplace rien, on fait défiler la texture — pas cher, et
  // marche quelle que soit la longueur du plan
  groundMat.map.offset.y += speed * (groundRepeatV / groundLengthZ);

  // props (arbres, buissons, rochers, fleurs) : recyclés loin derrière une
  // fois passés la caméra, avec une nouvelle position/rotation aléatoire
  for(let i=0;i<decorProps.length;i++){
    const p = decorProps[i];
    p.mesh.position.z += speed;
    if(p.mesh.position.z > PICKUP_REMOVE_Z){
      p.mesh.position.z = -80 - Math.random()*10;
      p.mesh.position.x = p.xBase + (Math.random()-0.5)*0.8;
      p.mesh.rotation.y = Math.random()*Math.PI*2;
    }
  }

  // montagnes : PAS de défilement — elles restent au fond, immobiles.
  // Elles sont trop grosses pour approcher un tant soit peu sans finir par
  // envahir l'écran (déjà vu deux fois : d'abord un recyclage trop proche,
  // puis même une parallaxe très lente finissait par s'en rapprocher sur
  // une longue partie). L'illusion d'avancer est déjà bien portée par le
  // sol/les props/l'herbe, qui sont assez proches pour qu'on voie leur
  // mouvement — les montagnes, elles, jouent juste un décor de fond fixe.

  // météo d'ambiance : chute + léger vent latéral, recentrée sur le joueur
  for(let i=0;i<weatherData.length;i++){
    const p = weatherData[i];
    p.y -= currentWeather.fallSpeed;
    p.x += Math.sin(frame*0.01 + i) * currentWeather.driftSpeed * 0.3;
    p.z += currentWeather.driftSpeed;
    p.rot += 0.01;
    if(p.y < -0.2 || p.z > PLAYER_Z + 5){
      p.y = 5 + Math.random()*1.5;
      p.x = playerX + (Math.random()-0.5)*9;
      p.z = PLAYER_Z - 4 - Math.random()*5;
    }
  }
  applyWeatherMatrices(currentWeather.size);
  weatherMat.opacity = currentWeather.opacity;
  weatherMat.color.setHex(currentWeather.color);

  // herbe : recyclage individuel des brins (proche du chemin, cycle rapide)
  for(let i=0;i<grassData.length;i++){
    const b = grassData[i];
    b.z += speed;
    if(b.z > PICKUP_REMOVE_Z){
      b.z = -16 - Math.random()*2;
      b.x = (Math.random()<0.5?-1:1) * (1.85 + Math.random()*1.5);
      b.rotY = Math.random()*Math.PI;
      b.rotZ = (Math.random()-0.5)*0.35;
    }
  }
  applyGrassMatrices();

  updateBiomeTransition();
}

// --- fondu entre deux biomes -----------------------------------------

// On ne peut pas relire les 4 arrêts de dégradé depuis la texture déjà
// dessinée : on les garde donc à part, mis à jour à chaque fondu.
let currentSkySteps = null;

function applyBiomeInstant(index){
  const b = BIOMES[index];
  biomeIndex = index;
  currentSkySteps = b.skySteps.slice();
  redrawSky(currentSkySteps);
  scene.fog.color.setHex(b.fog);
  groundMat.color.setHex(b.ground);
  mountainMatFar.color.setHex(b.mountainFar);
  mountainMatNear.color.setHex(b.mountainNear);
  foliageMatA.color.setHex(b.foliageA);
  foliageMatB.color.setHex(b.foliageB);
  grassMat.color.setHex(b.grass);
  hemiLight.color.setHex(b.hemiSky);
  hemiLight.groundColor.setHex(b.hemiGround);
  sunLight.color.setHex(b.sun);
  currentWeather = Object.assign({}, b.weather);
  currentGameplayMods = Object.assign({}, b.gameplayMods);
  scene.fog.density = FOG_DENSITY_BASE * currentGameplayMods.fogDensityMult;
  biomeAnimTo = null;
}

function startBiomeTransition(index){
  if(!webglSupported || index === biomeIndex) return;
  biomeAnimFrom = {
    skySteps: currentSkySteps ? currentSkySteps.slice() : BIOMES[biomeIndex].skySteps.slice(),
    fog: scene.fog.color.getHex(),
    ground: groundMat.color.getHex(),
    mountainFar: mountainMatFar.color.getHex(),
    mountainNear: mountainMatNear.color.getHex(),
    foliageA: foliageMatA.color.getHex(),
    foliageB: foliageMatB.color.getHex(),
    grass: grassMat.color.getHex(),
    hemiSky: hemiLight.color.getHex(),
    hemiGround: hemiLight.groundColor.getHex(),
    sun: sunLight.color.getHex(),
    weather: Object.assign({}, currentWeather),
    gameplayMods: Object.assign({}, currentGameplayMods)
  };
  biomeAnimTo = BIOMES[index];
  biomeAnimT = 0;
  biomeIndex = index;
}

const scratchColorA = webglSupported ? new THREE.Color() : null;
const scratchColorB = webglSupported ? new THREE.Color() : null;
function lerpHex(fromHex, toHex, t){
  scratchColorA.setHex(fromHex);
  scratchColorB.setHex(toHex);
  scratchColorA.lerp(scratchColorB, t);
  return scratchColorA.getHex();
}
function lerpNum(a, b, t){ return a + (b-a)*t; }

let skyRedrawCounter = 0;
function updateBiomeTransition(){
  if(!biomeAnimTo) return;
  biomeAnimT += 1/60; // pas fixe (voir gameplay.js update())
  const t = Math.min(1, biomeAnimT / BIOME_TRANSITION_SECONDS);

  scene.fog.color.setHex(lerpHex(biomeAnimFrom.fog, biomeAnimTo.fog, t));
  groundMat.color.setHex(lerpHex(biomeAnimFrom.ground, biomeAnimTo.ground, t));
  mountainMatFar.color.setHex(lerpHex(biomeAnimFrom.mountainFar, biomeAnimTo.mountainFar, t));
  mountainMatNear.color.setHex(lerpHex(biomeAnimFrom.mountainNear, biomeAnimTo.mountainNear, t));
  foliageMatA.color.setHex(lerpHex(biomeAnimFrom.foliageA, biomeAnimTo.foliageA, t));
  foliageMatB.color.setHex(lerpHex(biomeAnimFrom.foliageB, biomeAnimTo.foliageB, t));
  grassMat.color.setHex(lerpHex(biomeAnimFrom.grass, biomeAnimTo.grass, t));
  hemiLight.color.setHex(lerpHex(biomeAnimFrom.hemiSky, biomeAnimTo.hemiSky, t));
  hemiLight.groundColor.setHex(lerpHex(biomeAnimFrom.hemiGround, biomeAnimTo.hemiGround, t));
  sunLight.color.setHex(lerpHex(biomeAnimFrom.sun, biomeAnimTo.sun, t));
  currentWeather = {
    color: lerpHex(biomeAnimFrom.weather.color, biomeAnimTo.weather.color, t),
    opacity: lerpNum(biomeAnimFrom.weather.opacity, biomeAnimTo.weather.opacity, t),
    fallSpeed: lerpNum(biomeAnimFrom.weather.fallSpeed, biomeAnimTo.weather.fallSpeed, t),
    driftSpeed: lerpNum(biomeAnimFrom.weather.driftSpeed, biomeAnimTo.weather.driftSpeed, t),
    size: lerpNum(biomeAnimFrom.weather.size, biomeAnimTo.weather.size, t)
  };
  currentGameplayMods = {
    moveLerpMult: lerpNum(biomeAnimFrom.gameplayMods.moveLerpMult, biomeAnimTo.gameplayMods.moveLerpMult, t),
    enemySpeedMult: lerpNum(biomeAnimFrom.gameplayMods.enemySpeedMult, biomeAnimTo.gameplayMods.enemySpeedMult, t),
    fogDensityMult: lerpNum(biomeAnimFrom.gameplayMods.fogDensityMult, biomeAnimTo.gameplayMods.fogDensityMult, t)
  };
  scene.fog.density = FOG_DENSITY_BASE * currentGameplayMods.fogDensityMult;

  currentSkySteps = biomeAnimFrom.skySteps.map((from,i)=>lerpHex(from, biomeAnimTo.skySteps[i], t));
  // redessiner le ciel (dégradé + nuages figés) coûte un peu plus cher que
  // les autres couleurs (matériaux) : on le fait à débit réduit, invisible
  // sur un fondu de plusieurs secondes
  skyRedrawCounter++;
  if(skyRedrawCounter % 3 === 0 || t >= 1){
    redrawSky(currentSkySteps);
  }

  if(t >= 1) biomeAnimTo = null;
}

function initScene(){
  if(!webglSupported) return;

  scene = new THREE.Scene();
  scene.background = createSkyTexture(BIOMES[0].skySteps);
  currentSkySteps = BIOMES[0].skySteps.slice();
  scene.fog = new THREE.FogExp2(BIOMES[0].fog, FOG_DENSITY_BASE);

  camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  camera.position.set(0, 4.1, 7.2);
  camera.lookAt(0, 0.9, -10);

  renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  hemiLight = new THREE.HemisphereLight(BIOMES[0].hemiSky, BIOMES[0].hemiGround, 1.0);
  scene.add(hemiLight);
  sunLight = new THREE.DirectionalLight(BIOMES[0].sun, 1.0);
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
  bossMaterial = new THREE.MeshStandardMaterial({ color: BOSS_TINT, flatShading:true, roughness:0.8 });
  enemyMaterial = new THREE.MeshStandardMaterial({ color: ENEMY_TINT, flatShading:true, roughness:0.8 });

  doorGlowTexture = createGlowTexture();
  particleGeometry = new THREE.SphereGeometry(0.07, 6, 6);
  projectileGeometry = new THREE.SphereGeometry(0.11, 8, 6);
  projectileGlowMaterial = new THREE.SpriteMaterial({
    map: doorGlowTexture, color: PROJECTILE_COLOR, transparent:true, opacity:0.8,
    blending: THREE.AdditiveBlending, depthWrite:false, fog:false
  });

  // sol
  const groundGeo = new THREE.PlaneGeometry(12, groundLengthZ);
  groundMat = new THREE.MeshStandardMaterial({ map: createGroundTexture(), color: BIOMES[0].ground, roughness:1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI/2;
  ground.position.set(0, 0, -35);
  ground.receiveShadow = true;
  scene.add(ground);

  buildProps();
  buildWeather();
  applyBiomeInstant(0); // fixe currentWeather (et recale tout le reste sur le biome 0, sans effet ici)

  // leader (le chat du joueur) — ombre portée dynamique (peu de casters, coût négligeable).
  // leaderGroup est un simple conteneur (position/rotation/échelle globale +
  // halo bouclier) ; le chat lui-même est un enfant remplaçable
  // (userData.catVisual) — voir upgradeCatToRealModel(), même logique que
  // pour les chiens : procédural tout de suite, vrai modèle une fois chargé.
  leaderGroup = new THREE.Group();
  const catVisual = buildCatGroup();
  leaderGroup.add(catVisual);
  leaderGroup.userData.catVisual = catVisual;
  leaderGroup.userData.legs = catVisual.userData.legs;
  leaderGroup.scale.setScalar(leaderScale()); // petit chaton au départ — voir syncLeader() pour la croissance
  leaderGroup.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
  scene.add(leaderGroup);
  loadCatModel();

  // halo du power-up bouclier — masqué par défaut, affiché/tourné dans
  // syncLeader() (render3d.js) tant que shieldTimer > 0
  const shieldMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 12, 10),
    new THREE.MeshBasicMaterial({ color: PICKUP_COLORS.shield, transparent:true, opacity:0.3, depthWrite:false })
  );
  shieldMesh.position.y = 0.4;
  shieldMesh.visible = false;
  leaderGroup.add(shieldMesh);
  leaderGroup.userData.shieldMesh = shieldMesh;

  // boss (unique, apparaît en fin de parcours)
  bossGroup = buildBossGroup(bossMaterial);
  bossGroup.visible = false;
  bossGroup.scale.setScalar(1.25); // même proportion agrandie que DOG_HEIGHT_BOSS pour le vrai modèle
  bossGroup.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
  scene.add(bossGroup);

  // ennemis réguliers : pool de visuels réutilisés (perf), plus léger que le
  // boss (pas d'ombre portée — trop d'ennemis simultanés pour que ça vaille
  // le coup), index-alignés avec le tableau de données enemyPool (state.js)
  enemyVisuals = [];
  enemyPool = [];
  for(let i=0;i<MAX_ENEMIES;i++){
    const g = buildBossGroup(enemyMaterial);
    g.scale.setScalar(0.8); // même proportion agrandie que DOG_HEIGHT_ENEMY pour le vrai modèle
    g.visible = false;
    scene.add(g);
    enemyVisuals.push(g);
    enemyPool.push({ active:false, hp:0, maxHp:0, x:0, z:0, speed:0 });
  }

  // lance en arrière-plan le chargement des vrais modèles 3D de chien —
  // n'empêche jamais de jouer : les chiens procéduraux ci-dessus restent en
  // place jusqu'à ce que ça charge (voir upgradeDogsToRealModels)
  loadDogModels();

  // Suiveurs de la horde, en instanced mesh pour rester léger sur mobile.
  // Un seul chat, pas de horde visuelle (la foule de suiveurs — essayée,
  // retouchée deux fois — ne convainquait pas). Sa puissance grandissante
  // s'affiche à la place via une étiquette flottante au-dessus de sa tête
  // (voir buildPowerLabel()/updateLeaderPowerLabel()) plutôt que par un
  // nombre de modèles 3D à l'écran.
  const powerLabel = buildPowerLabel();
  leaderGroup.add(powerLabel);
  leaderGroup.userData.powerLabel = powerLabel;

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
