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

function redrawTowerSky(stepsHex){
  const w = towerSkyCanvas.width, h = towerSkyCanvas.height;
  const grad = towerSkyCtx.createLinearGradient(0, 0, 0, h);
  const stops = [0, 0.4, 0.72, 1];
  stepsHex.forEach((hex, i)=>{
    grad.addColorStop(stops[i], '#' + hex.toString(16).padStart(6,'0'));
  });
  towerSkyCtx.fillStyle = grad;
  towerSkyCtx.fillRect(0, 0, w, h);

  towerSkyCtx.fillStyle = 'rgba(255,255,255,0.72)';
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

    // pierres de bordure, de part et d'autre du segment
    const nx = Math.cos(angle), nz = -Math.sin(angle); // perpendiculaire au segment
    const count = Math.max(2, Math.round(len / 0.55));
    for(let k=0;k<=count;k++){
      const t = k/count;
      const cx = a.x + dx*t, cz = a.z + dz*t;
      [-1, 1].forEach(side=>{
        const stone = new THREE.Mesh(kerbGeo, kerbMat);
        stone.position.set(
          cx + nx*(pathWidth/2 + 0.1)*side + (Math.random()-0.5)*0.06,
          0.07 + Math.random()*0.03,
          cz + nz*(pathWidth/2 + 0.1)*side + (Math.random()-0.5)*0.06
        );
        stone.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
        stone.scale.setScalar(0.7 + Math.random()*0.5);
        stone.castShadow = true;
        towerScene.add(stone);
      });
    }
  }
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

// Le chatteau : enceinte crénelée avec porte, donjon central à toit pointu,
// quatre tours d'angle. Bien plus imposant que la maquette de la v1 — c'est
// le point de mire de tout le niveau, il doit se lire comme une vraie
// forteresse à défendre.
function buildCatCastle(){
  const g = new THREE.Group();
  const stoneTex = createStoneTexture(0xBFAE93, 0x8C7B62);
  stoneTex.repeat.set(3, 1);
  const wallMat = new THREE.MeshStandardMaterial({ map: stoneTex, color: 0xE0D2B8, flatShading:true, roughness:0.95 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4E7FA8, flatShading:true, roughness:0.6 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x8A7361, flatShading:true, roughness:0.9 });

  // socle / terrasse
  const base = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.35, 3.6), wallMat);
  base.position.y = 0.175;
  g.add(base);

  // enceinte : deux tronçons de mur de part et d'autre de la porte
  const wallH = 1.15, wallT = 0.36, gateW = 1.1;
  const sideW = (5.4 - gateW) / 2;
  [-1, 1].forEach(side=>{
    const wall = new THREE.Mesh(new THREE.BoxGeometry(sideW, wallH, wallT), wallMat);
    wall.position.set(side*(gateW/2 + sideW/2), 0.35 + wallH/2, 1.62);
    g.add(wall);
    // créneaux sur ce tronçon
    const merlons = Math.max(2, Math.floor(sideW / 0.42));
    for(let i=0;i<merlons;i++){
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, wallT), wallMat);
      const startX = side*(gateW/2) + side*(sideW * (i + 0.5) / merlons);
      m.position.set(startX, 0.35 + wallH + 0.11, 1.62);
      g.add(m);
    }
  });
  // linteau au-dessus de la porte
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(gateW, 0.3, wallT), wallMat);
  lintel.position.set(0, 0.35 + wallH - 0.15, 1.62);
  g.add(lintel);
  // porte en bois, en retrait
  const gate = new THREE.Mesh(new THREE.BoxGeometry(gateW*0.86, wallH - 0.3, 0.1), trimMat);
  gate.position.set(0, 0.35 + (wallH-0.3)/2, 1.5);
  g.add(gate);

  // murs latéraux (profondeur de l'enceinte)
  [-1, 1].forEach(side=>{
    const wall = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, 3.2), wallMat);
    wall.position.set(side*2.52, 0.35 + wallH/2, 0.1);
    g.add(wall);
  });

  // donjon central
  const keep = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.88, 2.5, 10), wallMat);
  keep.position.set(0, 0.35 + 1.25, -0.25);
  g.add(keep);
  const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.5, 10), roofMat);
  keepRoof.position.set(0, 0.35 + 2.5 + 0.75, -0.25);
  g.add(keepRoof);
  // bandeau de fenêtres du donjon
  const windowMat = new THREE.MeshStandardMaterial({ color: 0x4A3B2C, flatShading:true, roughness:1 });
  for(let i=0;i<4;i++){
    const ang = (i/4)*Math.PI*2 + 0.4;
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.12), windowMat);
    w.position.set(Math.sin(ang)*0.8, 0.35 + 1.75, -0.25 + Math.cos(ang)*0.8);
    w.rotation.y = ang;
    g.add(w);
  }

  // quatre tours d'angle
  [[-2.35, 1.5], [2.35, 1.5], [-2.35, -1.3], [2.35, -1.3]].forEach(([tx, tz], i)=>{
    const h = i < 2 ? 1.9 : 2.2; // celles du fond un peu plus hautes, pour la silhouette
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, h, 9), wallMat);
    tower.position.set(tx, 0.35 + h/2, tz);
    g.add(tower);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.85, 9), roofMat);
    roof.position.set(tx, 0.35 + h + 0.42, tz);
    g.add(roof);
  });

  g.traverse(o=>{ if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });

  // Bannières : montées sur les tours et le donjon, masquées au départ et
  // révélées une par une à chaque vague survécue (voir setTowerBannerCount()).
  const bannerSpots = [
    [-2.35, 2.25, 1.5], [2.35, 2.25, 1.5],
    [-2.35, 2.55, -1.3], [2.35, 2.55, -1.3],
    [0, 4.1, -0.25]
  ];
  const bannerColors = [0xD98E8E, 0x5B8FBF, 0xD98E8E, 0x5B8FBF, 0xE3A857];
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
function buildTowerScenery(){
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
    return towerSlots.some(s=>Math.hypot(x-s.x, z-s.z) < 1.5);
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
      tree.scale.setScalar(0.8 + Math.random()*0.7);
      tree.rotation.y = Math.random()*Math.PI*2;
      tree.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
      towerScene.add(tree);
    } else if(r < 0.55){
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(x, 0.14, z);
      rock.scale.set(0.7+Math.random()*0.8, 0.5+Math.random()*0.6, 0.7+Math.random()*0.8);
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
    sunPos: [towerSunLight.position.x, towerSunLight.position.y, towerSunLight.position.z]
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

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 44), (towerGroundMat =
    new THREE.MeshStandardMaterial({ color: amb0.ground, flatShading:true, roughness:1 })));
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
  const castle = buildCatCastle();
  castle.position.set(last.x, 0, last.z - 2.2);
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
