// Point de jonction entre les trois mini-jeux (Bataille / Chatteau Fort /
// Chat-Scierie) : écran de menu principal, choix du mode, et aiguillage
// d'update()/render()/pauseGame()/resumeGame() vers la bonne implémentation
// selon le mode actif. Chaque mode garde son état et sa logique complètement
// séparés (state.js + gameplay.js pour la Bataille, towerState.js +
// towerGameplay.js pour le Chatteau Fort, millState.js + millGameplay.js pour
// la Scierie) — ce fichier ne fait qu'aiguiller, jamais de logique de jeu ici.
let gameMode = null; // 'battle' | 'tower' | 'mill' | 'puzzle' | null (écran de menu)

// --- coupures de chapitre -------------------------------------------------
// Une partie infinie est découpée en chapitres (CHAPTER_PALIERS paliers en
// Bataille, CHAPTER_WAVES vagues en Chatteau Fort). À chaque frontière, le jeu
// marque une pause : récap, emplacement publicitaire, puis on repart avec un
// cran de difficulté en plus et un décor renouvelé.
let inChapterBreak = false;

function showChapterBreak(mode){
  if(inChapterBreak) return;
  inChapterBreak = true;
  const chap = (mode === 'battle' ? currentChapter()
              : mode === 'tower'  ? towerChapter()
              : millChapter()) + 1;
  document.getElementById('chapterTitle').textContent = t('chapter_title', { n: chap });
  document.getElementById('chapterStats').textContent =
      mode === 'battle' ? t('chapter_stats_battle', { horde: hordeCount, cat: catWord(), time: formatTime(runTime) })
    : mode === 'tower'  ? t('chapter_stats_tower', { n: towerWave, fish })
    :                     t('chapter_stats_mill', { n: millTotalLevels(), coins: millCoins });
  // un seul point de décision pour l'emplacement publicitaire des quatre
  // jeux : voir showAdSlot() dans shop.js
  showAdSlot('chapterAdSlot', mode);
  document.getElementById('screenChapter').classList.remove('hidden');
  sfx.win();
  vibrate(40);
}

// C'est ICI qu'il faudra appeler le SDK de pub une fois le jeu empaqueté en
// app (voir le commentaire de l'emplacement dans index.html) : afficher
// l'interstitiel, puis n'appeler endChapterBreak() qu'au callback de fin.
// Tant que le jeu tourne dans un navigateur, l'emplacement reste vide et
// clairement étiqueté comme tel.
function endChapterBreak(){
  inChapterBreak = false;
  document.getElementById('screenChapter').classList.add('hidden');
}

function showMainMenu(){
  gameMode = null;
  // Désarme le gel : il survivait au retour au menu, et la partie lancée
  // ensuite ne répondait plus du tout — update() refusait de tourner sans
  // que rien à l'écran ne l'explique.
  inChapterBreak = false;
  // screenChapter DOIT figurer ici : sans lui, revenir au menu pendant une
  // coupure laissait l'écran de chapitre affiché PAR-DESSUS le menu principal
  // (et voir endChapterBreak() juste en dessous pour le drapeau de gel).
  ['screenStart','screenTowerStart','screenMillStart','screenPuzzleStart',
   'screenOptions','screenLeaderboard','screenLose','screenAd','screenPause',
   'screenTowerWin','screenTowerLose','screenChapter','screenShop',
   'screenPuzzleLevel','screenPuzzleDead']
    .forEach(id=>{ const el = document.getElementById(id); if(el) el.classList.add('hidden'); });
  document.getElementById('battleHud').classList.add('hidden');
  document.getElementById('towerHud').classList.add('hidden');
  document.getElementById('millHud').classList.add('hidden');
  document.getElementById('puzzleHud').classList.add('hidden');
  document.getElementById('pauseBtn').classList.add('hidden');
  document.getElementById('pauseBtnTower').classList.add('hidden');
  document.getElementById('pauseBtnMill').classList.add('hidden');
  document.getElementById('pauseBtnPuzzle').classList.add('hidden');
  document.getElementById('meowBtn').classList.add('hidden');
  document.getElementById('hint').classList.add('hidden');
  document.getElementById('screenMainMenu').classList.remove('hidden');
  updateMetaHud();
}

function selectBattleMode(){
  gameMode = 'battle';
  document.getElementById('screenMainMenu').classList.add('hidden');
  document.getElementById('screenStart').classList.remove('hidden');
}

function selectTowerMode(){
  gameMode = 'tower';
  const best = document.getElementById('towerBestLabel');
  if(best) best.textContent = towerBestWave > 0 ? t('tower_best_label', { n: towerBestWave }) : '';
  document.getElementById('screenMainMenu').classList.add('hidden');
  document.getElementById('screenTowerStart').classList.remove('hidden');
}

function selectMillMode(){
  gameMode = 'mill';
  const best = document.getElementById('millBestLabel');
  if(best) best.textContent = millBest > 0 ? t('mill_best_label', { n: millBest }) : '';
  document.getElementById('screenMainMenu').classList.add('hidden');
  document.getElementById('screenMillStart').classList.remove('hidden');
}

function selectPuzzleMode(){
  gameMode = 'puzzle';
  const best = document.getElementById('puzzleBestLabel');
  if(best) best.textContent = puzzleBestLevel > 0
    ? t('puzzle_best_label', { level: puzzleBestLevel, power: puzzleFormat(puzzleBestPower) }) : '';
  document.getElementById('screenMainMenu').classList.add('hidden');
  document.getElementById('screenPuzzleStart').classList.remove('hidden');
}

// Abandonne la partie en cours dans n'importe quel mode (sans la
// sauvegarder — en mode Bataille, si le joueur voulait la garder, il devait
// cliquer "Sauvegarder" avant) et revient à l'écran de menu principal.
function goToMenu(){
  if(inChapterBreak) endChapterBreak();
  if(gameMode === 'battle'){
    paused = false;
    state = 'start';
  } else if(gameMode === 'tower'){
    towerPaused = false;
    towerState = 'idle';
    // le chat joueur reste sinon planté au milieu du plateau, visible en
    // arrière-plan des écrans de menu
    if(hero.visual) hero.visual.visible = false;
  } else if(gameMode === 'mill'){
    millPaused = false;
    millState = 'idle';
    // le score de la Scierie n'est enregistré qu'ici : ce mode n'a pas de
    // défaite, quitter par le menu EST la fin de partie
    saveMillBest();
    if(millHero.visual) millHero.visual.visible = false;
  } else if(gameMode === 'puzzle'){
    puzzlePaused = false;
    if(puzzleState === 'playing') savePuzzleBest();
    puzzleState = 'idle';
    if(puzzleHero.visual) puzzleHero.visual.visible = false;
  }
  showMainMenu();
  updateMenuResumeButton();
  updateBestScoreDisplays();
}

function pauseGame(){
  // Pendant une coupure de chapitre, le jeu est déjà figé et l'écran de
  // chapitre couvre le bouton pause : superposer la pause par-dessus n'aurait
  // aucun sens et empilerait deux écrans.
  if(inChapterBreak) return;
  const saveBtn = document.getElementById('saveGameBtn');
  if(saveBtn) saveBtn.classList.toggle('hidden', gameMode !== 'battle'); // pas de sauvegarde en Chatteau Fort (partie finie, pas infinie)
  if(gameMode === 'battle') pauseBattle();
  else if(gameMode === 'tower') pauseTower();
  else if(gameMode === 'mill') pauseMill();
  else if(gameMode === 'puzzle') pausePuzzle();
}

function resumeGame(){
  if(gameMode === 'battle') resumeBattle();
  else if(gameMode === 'tower') resumeTower();
  else if(gameMode === 'mill') resumeMill();
  else if(gameMode === 'puzzle') resumePuzzle();
}

function update(){
  if(inChapterBreak) return; // le jeu est figé pendant la coupure
  if(gameMode === 'battle') updateBattle();
  else if(gameMode === 'tower') updateTower();
  else if(gameMode === 'mill') updateMill();
  else if(gameMode === 'puzzle') updatePuzzle();
}

function render(){
  if(gameMode === 'battle') renderBattle();
  else if(gameMode === 'tower') renderTower();
  else if(gameMode === 'mill') renderMill();
  else if(gameMode === 'puzzle') renderPuzzle();
}
