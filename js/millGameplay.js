// Logique du mode "Chat-Scierie". Comme pour le Chatteau Fort, ce fichier
// écrit DIRECTEMENT la position des objets 3D (le mode n'a pas besoin
// d'interpolation), et millRender3d.js ne fait plus que la caméra et le rendu.
//
// La boucle tient en cinq gestes enchaînés, tous déclenchés par la seule
// présence du chat — aucun bouton :
//   couper -> porter -> déposer -> le tapis livre -> acheter une amélioration.

// --- valeurs dérivées des niveaux ------------------------------------------
function millCarryCapacity(){ return MILL_CARRY_BASE + millLevels.carry * MILL_CARRY_STEP; }
function millWorkerCount(){ return millWorkers.length; }
function millChopFrames(){
  return Math.max(MILL_CHOP_FRAMES_MIN, Math.round(MILL_CHOP_FRAMES - millLevels.chop * MILL_CHOP_STEP));
}
function millBeltSpeed(){ return MILL_BELT_SPEED_BASE * (1 + millLevels.belt * MILL_BELT_STEP); }
function millPlankValue(){ return MILL_PLANK_VALUE_BASE + millLevels.value * MILL_VALUE_STEP; }
function millTotalLevels(){ return millLevels.carry + millLevels.chop + millLevels.belt + millLevels.value + millWorkers.length; }

// Rendement estimé de la scierie, en pièces par seconde, employés compris.
// Sert à CALCULER LA PRODUCTION HORS LIGNE : c'est une estimation, pas une
// simulation — faire tourner deux heures de jeu au chargement serait absurde.
// Volontairement prudente (MILL_OFFLINE_RATE), pour que revenir jouer reste
// toujours plus rentable que revenir tout court.
function millCoinsPerSecond(){
  if(millWorkers.length === 0) return 0; // sans employé, rien ne tourne en l'absence du joueur
  const chopSec = (millChopFrames() * MILL_WORKER_CHOP_MULT) / 60;
  const trajetSec = 4.5; // aller-retour clairière -> tapis, à la louche
  const parVoyage = MILL_WORKER_CARRY;
  const cycleSec = chopSec * Math.ceil(parVoyage / MILL_PLANKS_PER_LOG) + trajetSec;
  return millWorkers.length * (parVoyage * millPlankValue()) / cycleSec;
}
function millChapter(){ return Math.floor(millTotalLevels() / MILL_LEVELS_PER_CHAPTER); }

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
    const gain = near.gold ? MILL_GOLD_LOG_VALUE : MILL_PLANKS_PER_LOG;
    if(near.gold) setMillLogGolden(near, false);
    millHero.carry = Math.min(millCarryCapacity(), millHero.carry + gain);
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
    if(l.ready){
      // le rondin d'or ne reste pas : c'est ce qui en fait une occasion
      if(l.gold && --l.goldTimer <= 0) setMillLogGolden(l, false);
      return;
    }
    if(--l.regrow <= 0){
      l.ready = true;
      l.visual.visible = true;
    }
  });

  if(++millGoldTimer < MILL_GOLD_LOG_INTERVAL) return;
  millGoldTimer = 0;
  if(Math.random() > MILL_GOLD_LOG_CHANCE) return;
  const libres = millLogs.filter(l=>l.ready && !l.gold);
  if(!libres.length) return;
  const l = libres[Math.floor(Math.random()*libres.length)];
  setMillLogGolden(l, true);
  showToast(t('mill_gold_log'));
  sfx.croquette();
}

// --- les employés ----------------------------------------------------------
// Chaque chat embauché refait la boucle du joueur, en plus lent : rejoindre
// un rondin, le débiter, porter jusqu'au tapis, recommencer. Ils réservent
// leur rondin (log.claimedBy) pour ne pas se retrouver à trois sur le même
// pendant que les autres attendent.
function millWorkerTarget(w){
  let best = null, bestD = Infinity;
  for(const l of millLogs){
    if(!l.ready) continue;
    if(l.claimedBy !== null && l.claimedBy !== w.id) continue;
    const d = Math.hypot(w.x - l.x, w.z - l.z);
    if(d < bestD){ bestD = d; best = l; }
  }
  return best;
}

function millWalk(w, tx, tz, speed){
  const dx = tx - w.x, dz = tz - w.z;
  const d = Math.hypot(dx, dz);
  if(d < 0.28) return true;
  w.x += dx/d * speed;
  w.z += dz/d * speed;
  w.facing = Math.atan2(dx, dz);
  return false;
}

function updateMillWorkers(){
  millWorkers.forEach(w=>{
    let moving = true;
    if(w.state === 'toLog'){
      const log = w.log && w.log.ready ? w.log : millWorkerTarget(w);
      if(!log){ moving = false; }
      else {
        if(w.log !== log){
          if(w.log) w.log.claimedBy = null;
          w.log = log;
          log.claimedBy = w.id;
        }
        if(millWalk(w, log.x, log.z, MILL_WORKER_SPEED)){
          w.state = 'chopping';
          w.chopTimer = 0;
          moving = false;
        }
      }
    } else if(w.state === 'chopping'){
      moving = false;
      const log = w.log;
      if(!log || !log.ready){ w.state = 'toLog'; w.log = null; }
      else {
        w.chopTimer++;
        log.visual.rotation.z = Math.sin(w.chopTimer * 0.9) * 0.07;
        if(w.chopTimer >= millChopFrames() * MILL_WORKER_CHOP_MULT){
          log.ready = false;
          log.regrow = MILL_LOG_REGROW_FRAMES;
          log.claimedBy = null;
          log.visual.visible = false;
          log.visual.rotation.z = 0;
          w.carry = Math.min(MILL_WORKER_CARRY, w.carry + (log.gold ? MILL_GOLD_LOG_VALUE : MILL_PLANKS_PER_LOG));
          if(log.gold) setMillLogGolden(log, false);
          w.log = null;
          w.state = w.carry >= MILL_WORKER_CARRY ? 'toBelt' : 'toLog';
        }
      }
    } else { // toBelt
      // Chacun a SON point de dépose : sans décalage, tous les employés et le
      // joueur se superposaient exactement au même endroit et on voyait un
      // seul chat au lieu de quatre (vu en capture).
      const ox = ((w.id % 3) - 1) * 0.5;
      const oz = (w.id % 2) * 0.45;
      if(millWalk(w, MILL_BELT_START_X + ox, MILL_DROP_Z + oz, MILL_WORKER_SPEED)){
        moving = false;
        if(--w.dropTimer <= 0){
          w.dropTimer = MILL_DROP_INTERVAL;
          if(w.carry > 0){ millDropPlank(); w.carry--; }
        }
        if(w.carry <= 0){ w.state = 'toLog'; w.dropTimer = 0; }
      }
    }
    const v = w.visual;
    v.position.set(w.x, moving ? Math.abs(Math.sin(millFrame*0.3)) * 0.03 : 0, w.z);
    v.rotation.y = w.facing;
    animateLegs(v.userData.legs, millFrame * 0.3 + w.id, moving ? 0.5 : 0);
    syncWorkerLoad(w);
  });
}

// --- déposer sur le tapis --------------------------------------------------
function updateMillDrop(){
  if(millHero.carry <= 0) return;
  const d = Math.hypot(millHero.x - MILL_BELT_START_X, millHero.z - MILL_DROP_Z);
  if(d > MILL_DROP_RADIUS){ millHero.dropTimer = 0; return; }
  if(--millHero.dropTimer > 0) return;
  millHero.dropTimer = MILL_DROP_INTERVAL;

  millDropPlank();
  millHero.carry--;
  syncCarryStack();
  updateMillHud();
}

// Posée sur le tapis par le joueur OU par un employé : une seule fonction,
// donc une planche d'employé vaut exactement une planche du patron.
function millDropPlank(){
  const mesh = buildPlank();
  mesh.position.set(MILL_BELT_START_X, 0.49, MILL_BELT_Z);
  millScene.add(mesh);
  millBeltItems.push({ x: MILL_BELT_START_X, mesh });
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
      millTotalEarned += gain;
      reportMission('mill_coins', millEarned);
      updateMillHud();
      if(millFrame % 300 === 0) syncPlankPiles(); // le tas grossit sans redessiner à chaque planche
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
  if(pad.id === 'worker'){
    hireMillWorker();
  } else {
    millLevels[pad.id]++;
  }
  pad.level++;
  const growth = pad.id === 'worker' ? MILL_WORKER_COST_GROWTH : MILL_PAD_COST_GROWTH;
  pad.cost = Math.round(pad.baseCost * Math.pow(growth, pad.level));
  redrawMillPadLabel(pad);
  millPads.forEach(redrawMillPadLabel);
  const totalLevels = millTotalLevels();
  reportMission('mill_upgrade', totalLevels);
  addXp(6 + totalLevels);
  showToast(t('mill_up_' + pad.id, { n: pad.level }));
  sfx.win();
  vibrate(30);
  updateMillHud();
  millSave(); // une scierie qui progresse doit survivre à la fermeture de l'onglet
  if(totalLevels % MILL_LEVELS_PER_CHAPTER === 0){
    addGems(1, true);
    showChapterBreak('mill');
  }
}

function updateMillPads(busyChopping){
  if(busyChopping){ // on ne peut pas couper et acheter en même temps
    millHero.padId = null; millHero.padTimer = 0;
    return;
  }
  const pad = millPadAt(millHero.x, millHero.z);
  // l'embauche a un plafond : au-delà, la clairière ne suivrait plus et les
  // employés se marcheraient dessus en attendant des rondins
  if(pad && pad.id === 'worker' && millWorkers.length >= MILL_WORKER_MAX){
    if(millHero.padId){ millHero.padId = null; millHero.padTimer = 0; setMillHeroProgress(0); }
    return;
  }
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
  updateMillWorkers();
  updateMillBelt();
  updateMillPads(chopping);
  updateMillDecor();
}
