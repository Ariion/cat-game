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
function millStockMax(){ return MILL_STOCK_BASE + millLevels.shop * MILL_STOCK_PER_LEVEL; }
function millProcessPerSec(){ return MILL_PROCESS_BASE + millLevels.shop * MILL_PROCESS_PER_LEVEL; }
function millIsJammed(){ return millJamTimer > MILL_JAM_GRACE; }
function millYardMax(){ return MILL_YARD_BASE + millLevels.yard * MILL_YARD_PER_LEVEL; }
function millYardFull(){ return millBundles >= millYardMax(); }
function millTruckCapacity(){ return MILL_TRUCK_CAPACITY_BASE + millLevels.dock * MILL_TRUCK_CAPACITY_PER_LEVEL; }
function millBundlePrice(){ return MILL_TRUCK_PRICE_BASE + millLevels.dock * MILL_TRUCK_PRICE_PER_LEVEL; }
function millTruckInterval(){
  return Math.max(MILL_TRUCK_INTERVAL_MIN, MILL_TRUCK_INTERVAL - millLevels.dock * MILL_TRUCK_INTERVAL_PER_LEVEL);
}
function millDockCount(){ return millLevels.dock >= 2 ? 2 : 1; } // le 2e quai s'ouvre au niveau 2
function millLogCount(){ return Math.min(MILL_LOG_COUNT_MAX, MILL_LOG_COUNT + millLevels.clearing * MILL_LOG_PER_LEVEL); }
function millSalaryPerPay(){ return millWorkers.length * MILL_WAGE_WORKER + millLoaders.length * MILL_WAGE_LOADER; }
function millChopFrames(){
  return Math.max(MILL_CHOP_FRAMES_MIN, Math.round(MILL_CHOP_FRAMES - millLevels.chop * MILL_CHOP_STEP));
}
function millBeltSpeed(){ return MILL_BELT_SPEED_BASE * (1 + millLevels.belt * MILL_BELT_STEP); }
// Le prix d'une planche n'existe plus en tant que tel : une planche ne vaut
// RIEN tant qu'elle n'est pas assemblée en paquet, chargée et emportée. C'est
// tout l'objet du nouveau circuit — on garde la fonction pour le calcul du
// rendement, exprimée en pièces par planche une fois la chaîne bouclée.
function millPlankValue(){ return millBundlePrice() / MILL_PLANKS_PER_BUNDLE; }
function millTotalLevels(){
  return millLevels.carry + millLevels.chop + millLevels.belt + millLevels.shop
       + millLevels.yard + millLevels.dock + millLevels.clearing
       + millWorkers.length + millLoaders.length;
}

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
  const entree = millWorkers.length * parVoyage / cycleSec;      // planches/seconde livrées
  const sciage = millProcessPerSec();                            // planches/seconde sciées
  // Le CHARGEMENT est le dernier maillon, et il est le seul qui transforme
  // vraiment la production en argent. Sans chargeur, rien ne part en
  // l'absence du joueur — de la même façon que sans bûcheron rien n'est
  // coupé. Le débit hors ligne est donc le MINIMUM des trois maillons : c'est
  // ce qui empêche de sur-investir d'un seul côté et de partir en croyant que
  // la chaîne tourne.
  const chargement = millLoaders.length
    ? millLoaders.length * MILL_LOADER_CARRY / 7.5 * MILL_PLANKS_PER_BUNDLE
    : 0;
  const debit = Math.min(entree, sciage, chargement);
  // les salaires courent aussi pendant l'absence
  const charges = millSalaryPerPay() / (MILL_SALARY_INTERVAL / 60);
  return Math.max(0, debit * millPlankValue() - charges);
}
function millChapter(){ return Math.floor(millTotalLevels() / MILL_LEVELS_PER_CHAPTER); }

// --- déplacement -----------------------------------------------------------
function updateMillHeroMove(){
  // Même intégrateur que le Chatteau Fort (moveWithStick, dans input.js) :
  // inertie et virage progressif. L'allure renvoyée pilote l'animation, si
  // bien que les pattes ralentissent avec le chat au lieu de s'arrêter net.
  const allure = moveWithStick(millHero, MILL_HERO_SPEED, MILL_BOUNDS);

  const v = millHero.visual;
  if(!v) return;
  v.position.set(millHero.x, 0, millHero.z);
  v.rotation.y = millHero.facing;
  animateLegs(v.userData.legs, millFrame * 0.32, allure * 0.55);
  v.position.y = Math.abs(Math.sin(millFrame*0.32)) * 0.035 * allure;
}

// --- couper ----------------------------------------------------------------
// Le chat coupe dès qu'il est contre un rondin prêt ET qu'il lui reste de la
// place sur le dos. Le sac plein arrête la coupe : c'est ce qui donne son
// sens à l'amélioration "capacité", sinon on n'aurait jamais à revenir.
// Une dalle ACTIONNABLE sous les pattes l'emporte sur la coupe.
//
// C'était l'inverse, et ça rendait inatteignable toute dalle posée à moins de
// 1,72 d'un rondin : se poster dessus déclenchait un coup de hache au lieu de
// l'achat. J'ai déjà déplacé des dalles deux fois pour contourner ça, et
// l'agrandissement de la clairière — qui ajoute un second anneau de rondins —
// a reproduit le problème une troisième fois. La contrainte géométrique
// disparaît en changeant la règle : une dalle est une chose sur laquelle on
// se poste EXPRÈS, un rondin est là où l'on passe.
// "Actionnable" et pas seulement "présente" : sur une dalle trop chère ou
// déjà au maximum, on doit pouvoir continuer à couper normalement.
function millUsablePadHere(){
  const pad = millPadAt(millHero.x, millHero.z);
  if(!pad) return null;
  if(pad.id === 'worker' && millWorkers.length >= MILL_WORKER_MAX) return null;
  if(pad.id === 'loader' && millLoaders.length >= MILL_LOADER_MAX) return null;
  if(pad.id === 'clearing' && millLogCount() >= MILL_LOG_COUNT_MAX) return null;
  if(millCoins < pad.cost) return null;
  return pad;
}

function updateMillChop(){
  if(millUsablePadHere()){
    if(millHero.chopLog){ millHero.chopLog = null; millHero.chopTimer = 0; setMillHeroProgress(0); }
    return false;
  }
  if(millHero.carry >= millCarryCapacity()){
    if(millHero.chopLog){ millHero.chopLog = null; millHero.chopTimer = 0; setMillHeroProgress(0); }
    return false;
  }
  let near = null, bestD = Infinity;
  for(const l of millLogs){
    if(!l.ready || !l.actif) continue;
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
    if(!l.actif) return; // rondin hors de la clairière achetée
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
    if(!l.ready || !l.actif) continue;
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
        if(millWalk(w, log.x, log.z, MILL_WORKER_SPEED * perkMillCrewSpeed())){
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
      if(millWalk(w, MILL_BELT_START_X + ox, MILL_DROP_Z + oz, MILL_WORKER_SPEED * perkMillCrewSpeed())){
        moving = false;
        if(millBeltFull()){
          w.dropTimer = 0; // il attend que ça se débloque, planches sur le dos
        } else if(--w.dropTimer <= 0){
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
// Tapis plein à ras bord : plus personne ne peut y poser quoi que ce soit.
// La chaîne remonte donc jusqu'aux porteurs, qui attendent, planches sur le
// dos — l'embouteillage se lit sur tout le terrain, pas seulement dans une
// jauge.
function millBeltFull(){
  return millBeltItems.length >= MILL_JAM_BELT_CAPACITY;
}

function updateMillDrop(){
  if(millHero.carry <= 0) return;
  if(millBeltFull()){ millHero.dropTimer = 0; return; }
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
  const max = millStockMax();
  const bloque = millStock >= max;
  let immobiles = 0;

  for(let i = millBeltItems.length - 1; i >= 0; i--){
    const it = millBeltItems[i];
    // Tapis BLOQUÉ : les planches ne disparaissent pas, elles s'entassent
    // contre l'atelier. C'est ce qu'on doit VOIR quand la chaîne sature — un
    // simple arrêt de compteur ne dirait rien.
    if(bloque){
      const butoir = MILL_BELT_END_X - immobiles * 0.62;
      if(it.x >= butoir - 0.01){ it.x = butoir; immobiles++; }
      else it.x = Math.min(butoir, it.x + speed);
      it.mesh.position.x = it.x;
      continue;
    }
    it.x += speed;
    it.mesh.position.x = it.x;
    it.mesh.rotation.y = Math.sin(it.x * 3) * 0.05; // léger ballottement
    if(it.x >= MILL_BELT_END_X){
      // pas de dispose() : géométrie et matériau sont partagés (voir buildPlank)
      millScene.remove(it.mesh);
      millBeltItems.splice(i, 1);
      millStock++;
    }
  }

  // L'ATELIER SCIE, et il assemble des PAQUETS — il n'encaisse plus rien.
  // Une planche sciée ne vaut de l'argent qu'une fois empaquetée, chargée et
  // emportée par un camion : c'est le maillon qui manquait, et c'est lui qui
  // fait qu'une belle production peut ne RIEN rapporter si elle dort au dépôt.
  // Le dépôt plein arrête la scie, exactement comme le stock plein arrête le
  // tapis : chaque maillon bloque celui d'avant.
  if(!millYardFull()){
    millProcessAcc += millProcessPerSec() / 60;
    while(millProcessAcc >= 1 && millStock > 0){
      millProcessAcc -= 1;
      millStock--;
      millBundleAcc++;
      if(millSawBlade) millSawBlade.rotation.y += 0.6; // un tour de lame par planche
      if(millBundleAcc >= MILL_PLANKS_PER_BUNDLE){
        millBundleAcc -= MILL_PLANKS_PER_BUNDLE;
        millBundles++;
        syncMillYard(millBundles);
        if(millYardFull()){
          showToast(t('mill_yard_full'));
          vibrate([25, 30, 25]);
          break;
        }
      }
    }
    if(millStock === 0) millProcessAcc = Math.min(millProcessAcc, 1);
  }

  // SUIVI DE L'EMBOUTEILLAGE. Ce bloc avait disparu en réécrivant le sciage :
  // la jauge de l'atelier ne passait donc plus jamais au rouge et l'alerte ne
  // se déclenchait plus, alors que la chaîne se bloquait bel et bien (le test
  // rapportait "bouchon : jamais" pour six bûcheros sur un atelier d'origine).
  // Un délai de grâce évite qu'un pic d'une demi-seconde ne sonne l'alarme :
  // ce qui compte, c'est la saturation qui DURE.
  if(millStock >= millStockMax()){
    millJamTimer++;
    if(millJamTimer === MILL_JAM_GRACE + 1){
      showToast(t('mill_jam'));
      vibrate([30, 40, 30]);
      sfx.water();
    }
  } else if(millJamTimer > 0){
    if(millJamTimer > MILL_JAM_GRACE) showToast(t('mill_jam_over'));
    millJamTimer = 0;
  }

  updateMillHud();

  reportMission('mill_coins', millEarned);
  updateMillHud();
  if(millFrame % 300 === 0) syncPlankPiles(); // le tas grossit sans redessiner à chaque planche
}

// --- camions ---------------------------------------------------------------
// Un camion vit en quatre temps : il arrive par la route, il attend à quai le
// temps qu'on le charge, il repart, il disparaît. Il ne repart JAMAIS les
// mains vides sans raison : soit il est plein, soit son temps d'attente est
// écoulé — et dans ce second cas on n'est payé que pour ce qu'on a réussi à
// charger. C'est ce qui rend un dépôt bien alimenté rentable et une chaîne
// bloquée coûteuse.
function millDockX(dock){ return MILL_DOCK_X[dock]; }

function spawnMillTruck(dock){
  const truck = {
    dock,
    x: -MILL_TRUCK_ROAD_X,
    state: 'arrive',
    load: 0,
    capacity: millTruckCapacity(),
    timer: 0,
    visual: null
  };
  if(webglSupported){
    truck.visual = buildMillTruck();
    truck.visual.position.set(truck.x, 0, MILL_DOCK_Z);
    millScene.add(truck.visual);
    syncTruckLoad(truck);
  }
  millTrucks.push(truck);
}

function removeMillTruck(i){
  const truck = millTrucks[i];
  if(truck.visual){
    millScene.remove(truck.visual);
    disposeProceduralGroup(truck.visual);
  }
  millTrucks.splice(i, 1);
}

// Camion prêt à recevoir un paquet : à quai et pas encore plein. Sert au
// joueur comme aux chargeurs, donc une seule règle pour les deux.
function millTruckWaiting(){
  return millTrucks.find(tr=>tr.state === 'quai' && tr.load < tr.capacity) || null;
}

function updateMillTrucks(){
  // arrivées : un compte à rebours par quai, indépendants
  for(let d = 0; d < millDockCount(); d++){
    if(millTrucks.some(tr=>tr.dock === d)) continue;
    if(--millDockTimers[d] > 0) continue;
    millDockTimers[d] = millTruckInterval();
    spawnMillTruck(d);
  }

  for(let i = millTrucks.length - 1; i >= 0; i--){
    const tr = millTrucks[i];
    const cible = millDockX(tr.dock);
    if(tr.state === 'arrive'){
      tr.x += (cible - tr.x) / MILL_TRUCK_TRAVEL * 3;
      if(Math.abs(cible - tr.x) < 0.06){
        tr.x = cible;
        tr.state = 'quai';
        tr.timer = MILL_TRUCK_WAIT;
      }
    } else if(tr.state === 'quai'){
      if(--tr.timer <= 0 || tr.load >= tr.capacity) departMillTruck(tr);
    } else { // part
      tr.x += 0.09;
      if(tr.x > MILL_TRUCK_ROAD_X){ removeMillTruck(i); continue; }
    }
    if(tr.visual) tr.visual.position.x = tr.x;
  }
}

function departMillTruck(tr){
  tr.state = 'part';
  if(tr.load <= 0){
    showToast(t('mill_truck_empty'));
    return;
  }
  const gain = tr.load * millBundlePrice();
  millCoins += gain;
  millEarned += gain;
  millTotalEarned += gain;
  reportMission('mill_coins', millEarned);
  showToast(t('mill_truck_paid', { n: tr.load, coins: gain }));
  sfx.win();
  vibrate(30);
  updateMillHud();
  millSave();
  if(millFrame % 300 === 0) syncPlankPiles();
}

// --- charger un paquet -----------------------------------------------------
// Un seul geste, partagé par le joueur et les chargeurs : prendre un paquet au
// dépôt, le porter au camion, recommencer.
function millYardPoint(){ return { x: 0.4, z: MILL_YARD_Z }; }

function updateMillHeroLoading(){
  // prise au dépôt
  const yard = millYardPoint();
  if(millHero.bundles < MILL_LOADER_CARRY + millLevels.carry
     && millBundles > 0
     && Math.hypot(millHero.x - yard.x, millHero.z - yard.z) < 1.5){
    if(--millHero.loadTimer <= 0){
      millHero.loadTimer = MILL_LOAD_INTERVAL;
      millBundles--;
      millHero.bundles++;
      syncMillYard(millBundles);
      syncHeroBundles();
      updateMillHud();
    }
  } else if(millHero.bundles > 0){
    // dépose dans un camion à quai
    const tr = millTruckWaiting();
    if(tr && Math.hypot(millHero.x - tr.x, millHero.z - MILL_DOCK_Z) < 2.0){
      if(--millHero.loadTimer <= 0){
        millHero.loadTimer = MILL_LOAD_INTERVAL;
        tr.load++;
        millHero.bundles--;
        syncTruckLoad(tr);
        syncHeroBundles();
        updateMillHud();
      }
    } else millHero.loadTimer = 0;
  } else millHero.loadTimer = 0;
}

function updateMillLoaders(){
  const yard = millYardPoint();
  millLoaders.forEach(w=>{
    let moving = true;
    if(w.state === 'versDepot'){
      const ox = ((w.id % 3) - 1) * 0.6;
      if(millWalk(w, yard.x + ox, yard.z + 0.9, MILL_LOADER_SPEED * perkMillCrewSpeed())){
        moving = false;
        if(millBundles > 0 && w.carry < MILL_LOADER_CARRY){
          if(--w.timer <= 0){
            w.timer = MILL_LOAD_INTERVAL;
            millBundles--;
            w.carry++;
            syncMillYard(millBundles);
            updateMillHud();
          }
        } else if(w.carry > 0){
          w.state = 'versCamion';
          w.timer = 0;
        }
      }
    } else {
      const tr = millTruckWaiting();
      if(!tr){
        // aucun camion : il patiente au bord du quai, chargé. C'est la file
        // d'attente visible d'une chaîne qui produit plus vite qu'elle ne livre.
        moving = !millWalk(w, MILL_DOCK_X[0] - 2.6 + (w.id % 4) * 0.7, MILL_DOCK_Z - 2.0,
                           MILL_LOADER_SPEED * perkMillCrewSpeed());
      } else if(millWalk(w, tr.x - 0.4, MILL_DOCK_Z - 1.5, MILL_LOADER_SPEED * perkMillCrewSpeed())){
        moving = false;
        if(--w.timer <= 0){
          w.timer = MILL_LOAD_INTERVAL;
          tr.load++;
          w.carry--;
          syncTruckLoad(tr);
          if(w.carry <= 0) w.state = 'versDepot';
        }
      }
    }
    const v = w.visual;
    if(!v) return;
    v.position.set(w.x, moving ? Math.abs(Math.sin(millFrame*0.3)) * 0.03 : 0, w.z);
    v.rotation.y = w.facing;
    animateLegs(v.userData.legs, millFrame * 0.3 + w.id, moving ? 0.5 : 0);
    syncWorkerLoad({ visual: v, carry: w.carry });
  });
}

// --- salaires --------------------------------------------------------------
// Prélevés à intervalle fixe, que la chaîne tourne ou non. Faute de trésorerie,
// un employé démissionne : une règle unique, immédiatement lisible, qui ramène
// l'exploitation à la taille qu'elle peut financer au lieu de laisser le joueur
// s'enfoncer dans une dette dont il ne sortirait pas.
function updateMillSalaries(){
  millSalaryDue = millSalaryPerPay();
  if(millSalaryDue <= 0){ millSalaryTimer = MILL_SALARY_INTERVAL; return; }
  if(--millSalaryTimer > 0) return;
  millSalaryTimer = MILL_SALARY_INTERVAL;

  if(millCoins >= millSalaryDue){
    millCoins -= millSalaryDue;
    showToast(t('mill_payday', { n: millSalaryDue }));
    updateMillHud();
    millSave();
    return;
  }
  // impayé : le dernier embauché s'en va
  millCoins = 0;
  if(millLoaders.length) fireMillLoader();
  else if(millWorkers.length) fireMillWorker();
  showToast(t('mill_quit'));
  sfx.lose();
  vibrate([40, 40, 40]);
  updateMillHud();
  millSave();
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
  } else if(pad.id === 'loader'){
    hireMillLoader();
  } else {
    millLevels[pad.id]++;
    if(pad.id === 'clearing') growMillClearing();
  }
  pad.level++;
  const growth = (pad.id === 'worker' || pad.id === 'loader')
    ? MILL_WORKER_COST_GROWTH : MILL_PAD_COST_GROWTH;
  pad.cost = Math.round(pad.baseCost * Math.pow(growth, pad.level));
  redrawMillPadLabel(pad);
  millPads.forEach(redrawMillPadLabel);
  if(pad.id === 'shop'){
    showToast(t('mill_up_shop', { n: millLevels.shop, rate: millProcessPerSec().toFixed(1) }));
  }
  const totalLevels = millTotalLevels();
  reportMission('mill_upgrade', totalLevels);
  addXp(6 + totalLevels);
  // Ni pour l'atelier ni pour les embauches : ces trois-là annoncent déjà
  // leur effet eux-mêmes, et deux bandeaux d'affilée se recouvrent.
  if(pad.id !== 'shop' && pad.id !== 'worker' && pad.id !== 'loader'){
    showToast(t('mill_up_' + pad.id, { n: pad.level }));
  }
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
  const pad = millUsablePadHere();
  if(!pad){
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
  updateMillTrucks();
  updateMillHeroLoading();
  updateMillLoaders();
  updateMillSalaries();
  updateMillPads(chopping);
  updateMillDecor();
}
