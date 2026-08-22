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
  visual: null,
  carryStack: null    // pile de planches visible sur le dos
};

let millLogs = [];      // {x, z, ready, regrow, visual} — visuels créés une fois par initMillScene()
let millBeltItems = []; // {x, mesh} — planches en transit sur le tapis
let millPads = [];      // {id, x, z, level, cost, visual, ...} — idem, créées une fois
let millLevels = { carry:0, chop:0, belt:0, value:0 };

function resetMillGame(){
  millState = 'playing';
  millCoins = MILL_COINS_START;
  millEarned = 0;
  millFrame = 0;
  millPaused = false;
  millLevels = { carry:0, chop:0, belt:0, value:0 };

  if(webglSupported){
    // les planches en transit sont les SEULS objets créés en cours de partie
    millBeltItems.forEach(it=>millScene.remove(it.mesh)); // ressources partagées, rien à libérer
    millLogs.forEach(l=>{ l.ready = true; l.regrow = 0; l.visual.visible = true; l.visual.rotation.z = l.baseRotZ; });
    millPads.forEach(p=>{ p.level = 0; p.cost = p.baseCost; redrawMillPadLabel(p); });
    resetMillHero();
  }
  millBeltItems = [];

  document.getElementById('screenPause').classList.add('hidden');
  document.getElementById('millHud').classList.remove('hidden');
  document.getElementById('battleHud').classList.add('hidden');
  document.getElementById('towerHud').classList.add('hidden');
  document.getElementById('pauseBtnMill').classList.remove('hidden');
  document.getElementById('hint').classList.add('hidden');
  document.getElementById('meowBtn').classList.add('hidden'); // le miaulement est propre au Chatteau Fort
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
  if(!millHero.visual){
    millHero.visual = buildHeroCat(MILL_HERO_FUR, MILL_HERO_SCARF);
    // un cran plus gros qu'au Chatteau Fort : ici la caméra embrasse tout le
    // terrain d'un coup, et à l'échelle d'origine le chat se perdait dedans
    millHero.visual.scale.setScalar(1.35);
    millHero.carryStack = buildCarryStack();
    millHero.visual.add(millHero.carryStack);
    millScene.add(millHero.visual);
  }
  millHero.visual.visible = true;
  millHero.visual.position.set(millHero.x, 0, millHero.z);
  setMillHeroProgress(0);
  syncCarryStack();
}

function startMillGame(){
  initAudio();
  gameMode = 'mill';
  document.getElementById('screenMillStart').classList.add('hidden');
  resetMillGame();
}

function updateMillHud(){
  const coinEl = document.getElementById('millCoins');
  if(coinEl) coinEl.textContent = millCoins;
  const carryEl = document.getElementById('millCarry');
  if(carryEl) carryEl.textContent = millHero.carry + ' / ' + millCarryCapacity();
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
