// État du mode "Palais des Chats" (4e mini-jeu). Comme les trois autres, il
// ne partage aucune variable de partie : tout ce qui suit lui appartient.
let puzzleState = 'idle';   // idle | playing | dead | levelWin
let puzzlePower = PUZZLE_START_POWER;
let puzzleLevel = 1;
let puzzleFrame = 0;
let puzzlePaused = false;
let puzzleBestPower = 0, puzzleBestLevel = 0;
try{
  puzzleBestPower = parseInt(localStorage.getItem('hordeDeChatsPuzzlePower') || '0', 10) || 0;
  puzzleBestLevel = parseInt(localStorage.getItem('hordeDeChatsPuzzleLevel') || '0', 10) || 0;
}catch(e){}

let puzzleHero = {
  x: 0, z: 0,
  targetX: 0,
  visual: null,
  badge: null,
  hitFlash: 0
};
let puzzleItems = [];     // {type, x, z, value, visual, badge, taken}
let puzzleRows = [];      // {z, resolved, lanes:[item|null x3]} — un carrefour = une LIGNE à franchir
let puzzleShadowField = null; // toutes les ombres de contact du niveau, en un seul maillage instancié
let puzzleGuard = null;   // {power, z, visual, badge, beaten}
let puzzleSegments = [];
let puzzleRevivesUsed = 0; // pour renchérir la 2e résurrection d'une même course
// Défi du niveau en cours : tiré au moment où le plateau est construit, suivi
// pendant la traversée, payé (ou non) au gardien.
let puzzleChallenge = null;
let puzzleChallengeOk = true;
let puzzleMultsTotal = 0, puzzleMultsTaken = 0;
let puzzleMeleeTimer = 0;     // ralentissement au contact
let puzzleClashes = [];       // éclats de la mêlée
let puzzleDefeatTimer = 0;    // la troupe se fait dévorer avant l'écran de défaite
let puzzleDefeatFoe = null;

function resetPuzzleRun(keepPower){
  puzzleState = 'playing';
  puzzleFrame = 0;
  puzzlePaused = false;
  if(!keepPower){
    puzzlePower = perkPuzzleStartPower(); // progression permanente (meta.js)
    puzzleLevel = 1;
    puzzleRevivesUsed = 0;
    meta.totals.puzzle++;
    metaSave();
  }
  puzzleHero.x = 0; puzzleHero.z = 0;
  puzzleHero.targetX = 0;
  puzzleHero.hitFlash = 0;
  puzzleMeleeTimer = 0;
  puzzleDefeatTimer = 0;
  puzzleDefeatFoe = null;
  puzzleClashes = [];

  if(webglSupported){
    if(!puzzleHero.visual){
      // Robe ROUSSE et non crème : sur un sol de marbre blanc, un chat crème
      // se confondait avec le décor (vu en capture) alors qu'il est la seule
      // chose que le joueur doit suivre des yeux.
      const sk = currentSkin();
      puzzleHero.visual = buildHeroCat(sk.fur, sk.accent);
      puzzleHero.visual.scale.setScalar(1.25);
      puzzleHero.badge = buildNumberBadge(puzzleFormat(puzzlePower), 'hero');
      puzzleHero.badge.position.set(0, 1.5, 0);
      puzzleHero.visual.add(puzzleHero.badge);
      puzzleScene.add(puzzleHero.visual);
    }
    puzzleHero.visual.visible = true;
    puzzleHero.visual.position.set(0, 0, 0);
    puzzleHero.visual.rotation.y = Math.PI; // il court vers -Z, dos à la caméra
    redrawNumberBadge(puzzleHero.badge, puzzleFormat(puzzlePower));
    resetPuzzleCrowd(0, 0);
    updatePuzzleCrowd(puzzleCrowdCount(puzzlePower), 0, 0, 0);
    buildPuzzleBoard();
  }

  // ceinture et bretelles : une partie lancée sans passer par la carte du
  // menu (bouton "Recommencer" de l'écran de mort) laissait sinon le menu
  // principal affiché DERRIÈRE l'écran de fin de niveau
  document.getElementById('screenMainMenu').classList.add('hidden');
  document.getElementById('screenPause').classList.add('hidden');
  document.getElementById('screenPuzzleDead').classList.add('hidden');
  document.getElementById('screenPuzzleLevel').classList.add('hidden');
  document.getElementById('puzzleHud').classList.remove('hidden');
  ['battleHud','towerHud','millHud'].forEach(id=>document.getElementById(id).classList.add('hidden'));
  document.getElementById('pauseBtnPuzzle').classList.remove('hidden');
  document.getElementById('hint').classList.add('hidden');
  document.getElementById('meowBtn').classList.add('hidden');
  document.getElementById('towerStick').classList.add('hidden');
  document.getElementById('lanePad').classList.remove('hidden');
  updateLaneButtons();
  updatePuzzleHud();
}

function startPuzzleGame(){
  initAudio();
  gameMode = 'puzzle';
  document.getElementById('screenPuzzleStart').classList.add('hidden');
  resetPuzzleRun(false);
}

function updatePuzzleHud(){
  const p = document.getElementById('puzzlePower');
  if(p) p.textContent = puzzleFormat(puzzlePower);
  const l = document.getElementById('puzzleLevelLabel');
  if(l) l.textContent = t('puzzle_level_label', { n: puzzleLevel });
}

function savePuzzleBest(){
  let changed = false;
  if(puzzlePower > puzzleBestPower){ puzzleBestPower = puzzlePower; changed = true; }
  if(puzzleLevel > puzzleBestLevel){ puzzleBestLevel = puzzleLevel; changed = true; }
  if(changed){
    try{
      localStorage.setItem('hordeDeChatsPuzzlePower', String(puzzleBestPower));
      localStorage.setItem('hordeDeChatsPuzzleLevel', String(puzzleBestLevel));
    }catch(e){}
  }
}

function showPuzzleDead(cause){
  puzzleState = 'dead';
  savePuzzleBest();
  addXp(Math.round(puzzleLevel * PUZZLE_XP_PER_LEVEL * 0.6));
  reportMission('puzzle_level', puzzleLevel);
  reportMission('puzzle_power', puzzlePower);
  document.getElementById('puzzleDeadText').textContent =
    t('puzzle_dead_text', { foe: cause, power: puzzleFormat(puzzlePower), level: puzzleLevel });
  // Le prix de la résurrection double à chaque fois dans la MÊME course :
  // sans ça, une course pourrait durer indéfiniment tant qu'il reste des
  // gemmes, et le score cesserait de vouloir dire quelque chose.
  const cost = puzzleReviveCost();
  const btn = document.getElementById('puzzleReviveBtn');
  btn.textContent = t('puzzle_revive_btn', { n: cost });
  btn.classList.toggle('disabled', meta.gems < cost);
  document.getElementById('screenPuzzleDead').classList.remove('hidden');
  document.getElementById('pauseBtnPuzzle').classList.add('hidden');
  document.getElementById('lanePad').classList.add('hidden');
  sfx.lose();
  vibrate([25,15,25]);
}

function puzzleReviveCost(){
  return PUZZLE_REVIVE_GEMS * Math.pow(2, puzzleRevivesUsed);
}

function pausePuzzle(){
  if(puzzleState !== 'playing' || puzzlePaused) return;
  puzzlePaused = true;
  document.getElementById('pauseStats').textContent =
    t('puzzle_pause_stats', { power: puzzleFormat(puzzlePower), level: puzzleLevel });
  document.getElementById('screenPause').classList.remove('hidden');
}

function resumePuzzle(){
  puzzlePaused = false;
  document.getElementById('screenPause').classList.add('hidden');
}
