// État du mode "Chat-Scierie" (tycoon à tapis roulant) — troisième mini-jeu,
// aussi indépendant des deux autres que le Chatteau Fort l'est de la
// Bataille : aucune variable n'est partagée avec state.js ni towerState.js.
// Seuls sont réutilisés le menu (modes.js) et des fonctions de dessin
// communes (buildHeroCat(), setRingProgress(), disposeProceduralGroup()).
let millState = 'idle'; // idle | playing
let millCoins = MILL_COINS_START;
let millEarned = 0;     // total gagné dans la partie en cours (sert de score)
let millBest = 0;
try{ millBest = parseInt(localStorage.getItem('hordeDeChatsMillBest') || '0', 10) || 0; }catch(e){}
let millFrame = 0;
let millPaused = false;

// Le chat de la scierie. Mêmes champs de manette que le chat du Chatteau
// Fort (hero), mais un objet à part : les deux modes peuvent avoir un chat
// posé sur le plateau en même temps sans jamais se marcher dessus.
let millHero = {
  x: -0.4, z: 0.6,
  stickX: 0, stickZ: 0,
  facing: 0,
  carry: 0,           // planches sur le dos
  chopLog: null,      // rondin en cours de débit
  chopTimer: 0,
  dropTimer: 0,       // cadence de dépose sur le tapis
  padId: null,        // dalle d'amélioration en cours d'achat
  padTimer: 0,
  bundles: 0,         // paquets finis portés du dépôt vers un camion
  loadTimer: 0,
  visual: null,
  carryStack: null    // pile de planches visible sur le dos
};

let millWorkers = [];   // chats employés : {id, x, z, state, log, chopTimer, carry, dropTimer, visual, facing}
let millNextWorkerId = 0;
let millGoldTimer = 0;
let millTotalEarned = 0; // pièces produites depuis TOUJOURS (le tas de l'avant-plan s'en sert)
let millLogs = [];      // {x, z, ready, regrow, visual} — visuels créés une fois par initMillScene()
let millBeltItems = []; // {x, mesh} — planches en transit sur le tapis
let millPads = [];      // {id, x, z, level, cost, visual, ...} — idem, créées une fois
let millLevels = { carry:0, chop:0, belt:0, shop:0, yard:0, dock:0, clearing:0 };
let millBundles = 0;      // paquets finis en attente au dépôt
let millBundleAcc = 0;    // planches sciées pas encore assemblées en paquet
let millTrucks = [];      // {dock, x, state, load, timer, visual}
let millDockTimers = [0, 0]; // prochain camion, par quai
let millLoaders = [];     // chargeurs : {id, x, z, state, carry, timer, visual, facing}
let millNextLoaderId = 0;
let millSalaryTimer = 0;
let millSalaryDue = 0;    // montant de la prochaine paie, affiché dans le HUD
let millStock = 0;      // planches en attente de sciage dans l'atelier
let millProcessAcc = 0; // reliquat fractionnaire du sciage entre deux ticks
let millJamTimer = 0;   // depuis combien de ticks le stock est plein

// La Scierie ne se "rejoue" pas, elle SE REPREND. C'était le vrai défaut du
// mode : on améliorait pendant dix minutes, on fermait l'onglet, et tout
// disparaissait. Un jeu de gestion dont la gestion s'efface n'a aucune raison
// d'exister. `remise` à vrai remet volontairement tout à zéro (bouton dédié
// sur l'écran de départ).
function resetMillGame(remise){
  millState = 'playing';
  millFrame = 0;
  millPaused = false;
  millGoldTimer = 0;
  // Le stock ne se sauvegarde PAS : reprendre une scierie déjà bouchée serait
  // une punition pour avoir fermé l'onglet. On repart atelier vide.
  millStock = 0;
  millProcessAcc = 0;
  millJamTimer = 0;
  // Le dépôt, les camions et le compte à rebours des paies ne se sauvegardent
  // PAS : reprendre une scierie déjà bouchée, ou avec une paie qui tombe dans
  // la seconde, serait une punition pour avoir fermé l'onglet.
  millBundles = 0;
  millBundleAcc = 0;
  millSalaryTimer = MILL_SALARY_INTERVAL;
  millDockTimers = [MILL_TRUCK_TRAVEL, millTruckInterval()];
  clearMillTrucks();

  if(remise){
    millCoins = MILL_COINS_START;
    millEarned = 0;
    millTotalEarned = 0;
    millLevels = { carry:0, chop:0, belt:0, shop:0, yard:0, dock:0, clearing:0 };
    millPads.forEach(p=>{ p.level = 0; p.cost = p.baseCost; });
    clearMillWorkers();
    clearMillLoaders();
    millSave();
  } else {
    millLoad();
  }

  if(webglSupported){
    // les planches en transit sont les SEULS objets créés en cours de partie
    millBeltItems.forEach(it=>millScene.remove(it.mesh)); // ressources partagées, rien à libérer
    millLogs.forEach(l=>{
      l.ready = true; l.regrow = 0; l.claimedBy = null;
      l.visual.visible = true; l.visual.rotation.z = l.baseRotZ;
      setMillLogGolden(l, false);
    });
    millPads.forEach(p=>redrawMillPadLabel(p));
    resetMillHero();
    syncPlankPiles();
    syncMillYard(0);
    growMillClearing();
  }
  millBeltItems = [];

  // le menu principal est un .overlay comme les autres : sans ça il reste
  // affiché PAR-DESSUS la partie quand elle est lancée autrement que par
  // sa carte (bouton "Recommencer", reprise…)
  document.getElementById('screenMainMenu').classList.add('hidden');
  document.getElementById('screenPause').classList.add('hidden');
  document.getElementById('millHud').classList.remove('hidden');
  document.getElementById('battleHud').classList.add('hidden');
  document.getElementById('towerHud').classList.add('hidden');
  document.getElementById('pauseBtnMill').classList.remove('hidden');
  document.getElementById('hint').classList.add('hidden');
  document.getElementById('meowBtn').classList.add('hidden'); // le miaulement est propre au Chatteau Fort
  document.getElementById('towerStick').classList.remove('hidden');
  document.getElementById('lanePad').classList.add('hidden');
  updateMillHud();
}

function resetMillHero(){
  // Point de départ choisi À L'ÉCART des dalles et de la zone de dépose :
  // apparaître dessus lancerait un achat ou une dépose dès la première
  // seconde, sans que le joueur ait rien demandé.
  millHero.x = -0.4; millHero.z = 0.6;
  millHero.stickX = 0; millHero.stickZ = 0;
  millHero.facing = 0;
  millHero.carry = 0;
  millHero.chopLog = null;
  millHero.chopTimer = 0;
  millHero.dropTimer = 0;
  millHero.padId = null;
  millHero.padTimer = 0;
  millHero.bundles = 0;
  millHero.loadTimer = 0;
  if(!millHero.visual){
    const sk = currentSkin();
    millHero.visual = buildHeroCat(sk.fur, sk.accent);
    // un cran plus gros qu'au Chatteau Fort : ici la caméra embrasse tout le
    // terrain d'un coup, et à l'échelle d'origine le chat se perdait dedans
    millHero.visual.scale.setScalar(1.35);
    millHero.carryStack = buildCarryStack();
    millHero.visual.add(millHero.carryStack);
    millHero.bundleStack = buildBundleStack();
    millHero.visual.add(millHero.bundleStack);
    millScene.add(millHero.visual);
  }
  millHero.visual.visible = true;
  millHero.visual.position.set(millHero.x, 0, millHero.z);
  setMillHeroProgress(0);
  syncCarryStack();
  syncHeroBundles();
}

// Pile de paquets portée par le joueur. Distincte de la pile de planches :
// deux marchandises différentes, deux allures différentes, sinon on ne sait
// plus ce qu'on transporte.
function syncHeroBundles(){
  if(!millHero.bundleStack) return;
  millHero.bundleStack.children.forEach((p, i)=>{ p.visible = i < millHero.bundles; });
}

function startMillGame(remise){
  initAudio();
  gameMode = 'mill';
  document.getElementById('screenMillStart').classList.add('hidden');
  resetMillGame(remise);
  if(!remise) collectMillOffline();
}

// --- sauvegarde ------------------------------------------------------------
function millSave(){
  try{
    localStorage.setItem(MILL_SAVE_KEY, JSON.stringify({
      coins: millCoins,
      totalEarned: millTotalEarned,
      levels: millLevels,
      workers: millWorkers.length,
      loaders: millLoaders.length,
      padLevels: millPads.map(p=>p.level),
      seen: Date.now()
    }));
  }catch(e){}
}

function millLoad(){
  let save = null;
  try{ save = JSON.parse(localStorage.getItem(MILL_SAVE_KEY) || 'null'); }catch(e){}
  if(!save){
    // toute première visite
    millCoins = MILL_COINS_START;
    millEarned = 0;
    millTotalEarned = 0;
    millLevels = { carry:0, chop:0, belt:0, shop:0, yard:0, dock:0, clearing:0 };
    clearMillWorkers();
    clearMillLoaders();
    return;
  }
  millCoins = save.coins || 0;
  millTotalEarned = save.totalEarned || 0;
  millEarned = 0; // "gagné cette session", remis à zéro à chaque reprise
  ['carry','chop','belt','shop','yard','dock','clearing']
    .forEach(k=>{ millLevels[k] = (save.levels && save.levels[k]) || 0; });
  if(Array.isArray(save.padLevels)){
    millPads.forEach((p, i)=>{
      p.level = save.padLevels[i] || 0;
      const growth = p.id === 'worker' ? MILL_WORKER_COST_GROWTH : MILL_PAD_COST_GROWTH;
      p.cost = Math.round(p.baseCost * Math.pow(growth, p.level));
    });
  }
  clearMillWorkers();
  clearMillLoaders();
  for(let i = 0; i < Math.min(MILL_WORKER_MAX, save.workers || 0); i++) hireMillWorker(true);
  for(let i = 0; i < Math.min(MILL_LOADER_MAX, save.loaders || 0); i++) hireMillLoader(true);
}

// --- production hors ligne -------------------------------------------------
// Le rendez-vous du lendemain. Sans employé il ne se passe RIEN en l'absence
// du joueur : c'est ce qui donne à la première embauche son poids, elle ne
// fait pas qu'accélérer, elle change la nature du jeu.
function collectMillOffline(){
  let save = null;
  try{ save = JSON.parse(localStorage.getItem(MILL_SAVE_KEY) || 'null'); }catch(e){}
  if(!save || !save.seen) return;
  const elapsed = Math.min(MILL_OFFLINE_CAP_MS, Date.now() - save.seen);
  if(elapsed < 60000) return; // moins d'une minute : on ne dérange pas le joueur
  const gain = Math.floor(millCoinsPerSecond() * (elapsed/1000) * MILL_OFFLINE_RATE);
  if(gain <= 0) return;
  millCoins += gain;
  millTotalEarned += gain;
  millSave();
  updateMillHud();
  syncPlankPiles();
  document.getElementById('millOfflineText').textContent =
    t('mill_offline_text', { coins: gain, time: formatMillDuration(elapsed) });
  document.getElementById('screenMillOffline').classList.remove('hidden');
}

function formatMillDuration(ms){
  const min = Math.round(ms/60000);
  if(min < 60) return t('mill_dur_min', { n: min });
  return t('mill_dur_hour', { n: Math.floor(min/60), m: min%60 });
}

function closeMillOffline(){
  document.getElementById('screenMillOffline').classList.add('hidden');
}

// --- employés --------------------------------------------------------------
function clearMillWorkers(){
  if(webglSupported){
    millWorkers.forEach(w=>{ millScene.remove(w.visual); disposeProceduralGroup(w.visual); });
  }
  millWorkers = [];
  millNextWorkerId = 0;
  millLogs.forEach(l=>{ l.claimedBy = null; });
}

function clearMillTrucks(){
  if(webglSupported){
    millTrucks.forEach(tr=>{
      if(tr.visual){ millScene.remove(tr.visual); disposeProceduralGroup(tr.visual); }
    });
  }
  millTrucks = [];
}

function clearMillLoaders(){
  if(webglSupported){
    millLoaders.forEach(w=>{ millScene.remove(w.visual); disposeProceduralGroup(w.visual); });
  }
  millLoaders = [];
  millNextLoaderId = 0;
}

function hireMillLoader(silencieux){
  if(millLoaders.length >= MILL_LOADER_MAX) return;
  const id = millNextLoaderId++;
  const w = {
    id, x: MILL_DOCK_X[0] - 2.4 + (id % 4) * 0.7, z: MILL_DOCK_Z - 2.2,
    state: 'versDepot', carry: 0, timer: 0, facing: 0, visual: null
  };
  if(webglSupported){
    w.visual = buildWorkerCat(MILL_LOADER_COLORS[id % MILL_LOADER_COLORS.length]);
    w.visual.position.set(w.x, 0, w.z);
    millScene.add(w.visual);
  }
  millLoaders.push(w);
  if(!silencieux) showToast(t('mill_loader_hired', { n: millLoaders.length }));
}

function fireMillLoader(){
  const w = millLoaders.pop();
  if(!w) return;
  if(w.visual){ millScene.remove(w.visual); disposeProceduralGroup(w.visual); }
}

function fireMillWorker(){
  const w = millWorkers.pop();
  if(!w) return;
  if(w.log) w.log.claimedBy = null;
  if(w.visual){ millScene.remove(w.visual); disposeProceduralGroup(w.visual); }
}

// La clairière s'agrandit : les rondins supplémentaires existent déjà en 3D
// (créés une fois pour toutes par initMillScene), on ne fait que les rendre
// exploitables. Créer un rondin en cours de partie aurait demandé de gérer sa
// géométrie et son halo à chaud, pour un résultat identique.
function growMillClearing(){
  const n = millLogCount();
  millLogs.forEach((l, i)=>{
    l.actif = i < n;
    if(!l.actif){
      l.ready = false;
      l.claimedBy = null;
      l.visual.visible = false;
    } else if(!l.ready && l.regrow <= 0){
      l.ready = true;
      l.visual.visible = true;
    }
  });
}

function hireMillWorker(silencieux){
  if(millWorkers.length >= MILL_WORKER_MAX) return;
  const id = millNextWorkerId++;
  const color = MILL_WORKER_COLORS[id % MILL_WORKER_COLORS.length];
  const w = {
    id, x: MILL_BELT_START_X + (id%3 - 1) * 0.7, z: MILL_DROP_Z + 0.9,
    state: 'toLog', log: null, chopTimer: 0, carry: 0, dropTimer: 0,
    facing: 0, visual: null
  };
  if(webglSupported){
    w.visual = buildWorkerCat(color);
    w.visual.position.set(w.x, 0, w.z);
    millScene.add(w.visual);
  }
  millWorkers.push(w);
  if(!silencieux) showToast(t('mill_worker_hired', { n: millWorkers.length }));
}

function updateMillHud(){
  const coinEl = document.getElementById('millCoins');
  if(coinEl) coinEl.textContent = millCoins;
  const carryEl = document.getElementById('millCarry');
  if(carryEl) carryEl.textContent = millHero.carry + ' / ' + millCarryCapacity();
  const wEl = document.getElementById('millWorkers');
  if(wEl){
    wEl.textContent = millWorkers.length;
    wEl.parentElement.classList.toggle('hidden', millWorkers.length === 0);
  }
  updateMillStockGauge();
  const bEl = document.getElementById('millBundles');
  if(bEl) bEl.textContent = millBundles + ' / ' + millYardMax();
  const yWrap = document.getElementById('millBundleWrap');
  if(yWrap) yWrap.classList.toggle('jam', millYardFull());
  const sEl = document.getElementById('millSalary');
  const sWrap = document.getElementById('millSalaryWrap');
  if(sEl && sWrap){
    const du = millSalaryPerPay();
    sWrap.classList.toggle('hidden', du === 0);
    sEl.textContent = du;
    // alerte quand la trésorerie ne couvre plus une paie et demie : la
    // démission doit se voir venir, pas tomber sans prévenir
    sWrap.classList.toggle('warn', du > 0 && millCoins < du * MILL_SALARY_WARN_COINS);
  }
  const cEl = document.getElementById('millHeroBundles');
  const cWrap = document.getElementById('millHeroBundleWrap');
  if(cEl && cWrap){
    cWrap.classList.toggle('hidden', millHero.bundles === 0);
    cEl.textContent = millHero.bundles;
  }
}

// Jauge de stock de l'atelier. C'est LE cadran du mode : il dit, avant la
// panne, que l'entrée dépasse la sortie. Sans lui l'embouteillage serait une
// sanction sortie de nulle part.
function updateMillStockGauge(){
  const wrap = document.getElementById('millStockWrap');
  if(!wrap) return;
  const max = millStockMax();
  const ratio = Math.min(1, millStock / max);
  const fill = document.getElementById('millStockFill');
  if(fill) fill.style.width = Math.round(ratio*100) + '%';
  const label = document.getElementById('millStockLabel');
  if(label) label.textContent = Math.floor(millStock) + ' / ' + max;
  // trois états lisibles d'un coup d'oeil : ça passe, ça sature, c'est bouché
  wrap.classList.toggle('warn', ratio >= 0.7 && ratio < 1);
  wrap.classList.toggle('jam', millJamTimer > MILL_JAM_GRACE);
}

// Pas de défaite dans ce mode : on quitte par le menu. Le score conservé est
// le total gagné, pas le solde — sinon dépenser (le geste que le jeu demande
// justement) ferait baisser son propre record.
function saveMillBest(){
  addXp(Math.round(millEarned * 0.05));
  reportMission('mill_coins', millEarned);
  if(millEarned > millBest){
    millBest = millEarned;
    try{ localStorage.setItem('hordeDeChatsMillBest', String(millBest)); }catch(e){}
  }
  millSave(); // horodate la sortie : c'est ce "seen" qui alimente le hors-ligne
}

function pauseMill(){
  if(millState !== 'playing' || millPaused) return;
  millPaused = true;
  document.getElementById('pauseStats').textContent = t('mill_pause_stats', { coins: millCoins, earned: millEarned });
  document.getElementById('screenPause').classList.remove('hidden');
}

function resumeMill(){
  millPaused = false;
  document.getElementById('screenPause').classList.add('hidden');
}

// Remettre une scierie à zéro efface des heures de progression : ça ne peut
// pas tenir en un seul appui. Deuxième appui dans les cinq secondes = confirmé.
let millResetArmed = 0;
function confirmMillReset(){
  const btn = document.querySelector('#screenMillStart [data-i18n="btn_mill_reset"]');
  if(Date.now() - millResetArmed > 5000){
    millResetArmed = Date.now();
    if(btn) btn.textContent = t('btn_mill_reset_confirm');
    showToast(t('mill_reset_warn'));
    return;
  }
  millResetArmed = 0;
  if(btn) btn.textContent = t('btn_mill_reset');
  try{ localStorage.removeItem(MILL_SAVE_KEY); }catch(e){}
  startMillGame(true);
}
