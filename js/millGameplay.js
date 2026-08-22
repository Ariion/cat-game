// Logique du mode "Chat-Scierie". Comme pour le Chatteau Fort, ce fichier
// écrit DIRECTEMENT la position des objets 3D (le mode n'a pas besoin
// d'interpolation), et millRender3d.js ne fait plus que la caméra et le rendu.
//
// La boucle tient en cinq gestes enchaînés, tous déclenchés par la seule
// présence du chat — aucun bouton :
//   couper -> porter -> déposer -> le tapis livre -> acheter une amélioration.

// --- valeurs dérivées des niveaux ------------------------------------------
function millCarryCapacity(){ return MILL_CARRY_BASE + millLevels.carry * MILL_CARRY_STEP; }
function millChopFrames(){
  return Math.max(MILL_CHOP_FRAMES_MIN, Math.round(MILL_CHOP_FRAMES - millLevels.chop * MILL_CHOP_STEP));
}
function millBeltSpeed(){ return MILL_BELT_SPEED_BASE * (1 + millLevels.belt * MILL_BELT_STEP); }
function millPlankValue(){ return MILL_PLANK_VALUE_BASE + millLevels.value * MILL_VALUE_STEP; }

// --- déplacement -----------------------------------------------------------
function updateMillHeroMove(){
  const mag = Math.hypot(millHero.stickX, millHero.stickZ);
  if(mag > 0.001){
    millHero.x += millHero.stickX * MILL_HERO_SPEED;
    millHero.z += millHero.stickZ * MILL_HERO_SPEED;
    millHero.facing = Math.atan2(millHero.stickX, millHero.stickZ);
  }
  millHero.x = Math.max(MILL_BOUNDS.xMin, Math.min(MILL_BOUNDS.xMax, millHero.x));
  millHero.z = Math.max(MILL_BOUNDS.zMin, Math.min(MILL_BOUNDS.zMax, millHero.z));

  const v = millHero.visual;
  if(!v) return;
  v.position.set(millHero.x, 0, millHero.z);
  v.rotation.y = millHero.facing;
  // pattes animées seulement quand il avance, et un rebond de marche léger
  animateLegs(v.userData.legs, millFrame * 0.32, mag > 0.001 ? 0.55 : 0);
  v.position.y = mag > 0.001 ? Math.abs(Math.sin(millFrame*0.32)) * 0.035 : 0;
}

// --- couper ----------------------------------------------------------------
// Le chat coupe dès qu'il est contre un rondin prêt ET qu'il lui reste de la
// place sur le dos. Le sac plein arrête la coupe : c'est ce qui donne son
// sens à l'amélioration "capacité", sinon on n'aurait jamais à revenir.
function updateMillChop(){
  if(millHero.carry >= millCarryCapacity()){
    if(millHero.chopLog){ millHero.chopLog = null; millHero.chopTimer = 0; setMillHeroProgress(0); }
    return false;
  }
  let near = null, bestD = Infinity;
  for(const l of millLogs){
    if(!l.ready) continue;
    const d = Math.hypot(millHero.x - l.x, millHero.z - l.z);
    if(d < 0.95 && d < bestD){ bestD = d; near = l; }
  }
  if(!near){
    if(millHero.chopLog){ millHero.chopLog = null; millHero.chopTimer = 0; setMillHeroProgress(0); }
    return false;
  }
  if(millHero.chopLog !== near){ millHero.chopLog = near; millHero.chopTimer = 0; }
  millHero.chopTimer++;
  const need = millChopFrames();
  setMillHeroProgress(millHero.chopTimer / need);
  // le rondin tremble sous les coups : le retour visuel du travail en cours
  near.visual.rotation.z = Math.sin(millHero.chopTimer * 0.9) * 0.09;

  if(millHero.chopTimer >= need){
    near.ready = false;
    near.regrow = MILL_LOG_REGROW_FRAMES;
    near.visual.visible = false;
    near.visual.rotation.z = 0;
    millHero.carry = Math.min(millCarryCapacity(), millHero.carry + MILL_PLANKS_PER_LOG);
    millHero.chopLog = null;
    millHero.chopTimer = 0;
    setMillHeroProgress(0);
    syncCarryStack();
    updateMillHud();
    sfx.croquette();
    vibrate(12);
  }
  return true;
}

function updateMillLogs(){
  millLogs.forEach(l=>{
    if(l.ready) return;
    if(--l.regrow <= 0){
      l.ready = true;
      l.visual.visible = true;
    }
  });
}

// --- déposer sur le tapis --------------------------------------------------
function updateMillDrop(){
  if(millHero.carry <= 0) return;
  const d = Math.hypot(millHero.x - MILL_BELT_START_X, millHero.z - MILL_DROP_Z);
  if(d > MILL_DROP_RADIUS){ millHero.dropTimer = 0; return; }
  if(--millHero.dropTimer > 0) return;
  millHero.dropTimer = MILL_DROP_INTERVAL;

  const mesh = buildPlank();
  mesh.position.set(MILL_BELT_START_X, 0.49, MILL_BELT_Z);
  millScene.add(mesh);
  millBeltItems.push({ x: MILL_BELT_START_X, mesh });
  millHero.carry--;
  syncCarryStack();
  updateMillHud();
}

// --- le tapis livre --------------------------------------------------------
function updateMillBelt(){
  const speed = millBeltSpeed();
  for(let i = millBeltItems.length - 1; i >= 0; i--){
    const it = millBeltItems[i];
    it.x += speed;
    it.mesh.position.x = it.x;
    it.mesh.rotation.y = Math.sin(it.x * 3) * 0.05; // léger ballottement
    if(it.x >= MILL_BELT_END_X){
      // pas de dispose() : géométrie et matériau sont partagés (voir buildPlank)
      millScene.remove(it.mesh);
      millBeltItems.splice(i, 1);
      const gain = millPlankValue();
      millCoins += gain;
      millEarned += gain;
      updateMillHud();
      millPads.forEach(redrawMillPadLabel); // le prix passe en doré dès qu'il devient payable
      sfx.croquette();
    }
  }
}

// --- acheter une amélioration ----------------------------------------------
// Même geste que bâtir une tourelle au Chatteau Fort : se poster et attendre
// que l'anneau se remplisse. Un achat instantané au contact ferait dépenser
// tout le magot en traversant la rangée de dalles.
function millPadAt(x, z){
  for(const p of millPads){
    if(Math.hypot(x - p.x, z - p.z) < MILL_PAD_RADIUS + 0.25) return p;
  }
  return null;
}

function applyMillUpgrade(pad){
  millLevels[pad.id]++;
  pad.level++;
  pad.cost = Math.round(pad.baseCost * Math.pow(MILL_PAD_COST_GROWTH, pad.level));
  redrawMillPadLabel(pad);
  millPads.forEach(redrawMillPadLabel);
  showToast(t('mill_up_' + pad.id, { n: pad.level }));
  sfx.win();
  vibrate(30);
  updateMillHud();
}

function updateMillPads(busyChopping){
  if(busyChopping){ // on ne peut pas couper et acheter en même temps
    millHero.padId = null; millHero.padTimer = 0;
    return;
  }
  const pad = millPadAt(millHero.x, millHero.z);
  if(!pad || millCoins < pad.cost){
    if(millHero.padId){ millHero.padId = null; millHero.padTimer = 0; setMillHeroProgress(0); }
    return;
  }
  if(millHero.padId !== pad.id){ millHero.padId = pad.id; millHero.padTimer = 0; }
  millHero.padTimer++;
  setMillHeroProgress(millHero.padTimer / MILL_PAD_FRAMES);
  if(millHero.padTimer >= MILL_PAD_FRAMES){
    millCoins -= pad.cost;
    millHero.padId = null;
    millHero.padTimer = 0;
    setMillHeroProgress(0);
    applyMillUpgrade(pad);
  }
}

// --- tick ------------------------------------------------------------------
function updateMill(){
  if(millState !== 'playing' || millPaused) return;
  millFrame++;
  updateMillHeroMove();
  const chopping = updateMillChop();
  updateMillLogs();
  updateMillDrop();
  updateMillBelt();
  updateMillPads(chopping);
  updateMillDecor();
}
