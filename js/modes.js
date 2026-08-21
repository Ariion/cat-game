// Point de jonction entre les deux mini-jeux (Bataille / Chatteau Fort) :
// écran de menu principal, choix du mode, et aiguillage d'update()/render()/
// pauseGame()/resumeGame() vers la bonne implémentation selon le mode actif.
// Chaque mode garde son état et sa logique complètement séparés (state.js +
// gameplay.js pour la Bataille, towerState.js + towerGameplay.js pour le
// Chatteau Fort) — ce fichier ne fait qu'aiguiller, jamais de logique de jeu
// ici.
let gameMode = null; // 'battle' | 'tower' | null (écran de menu)

// --- coupures de chapitre -------------------------------------------------
// Une partie infinie est découpée en chapitres (CHAPTER_PALIERS paliers en
// Bataille, CHAPTER_WAVES vagues en Chatteau Fort). À chaque frontière, le jeu
// marque une pause : récap, emplacement publicitaire, puis on repart avec un
// cran de difficulté en plus et un décor renouvelé.
let inChapterBreak = false;

function showChapterBreak(mode){
  if(inChapterBreak) return;
  inChapterBreak = true;
  const chap = (mode === 'battle' ? currentChapter() : towerChapter()) + 1;
  document.getElementById('chapterTitle').textContent = t('chapter_title', { n: chap });
  document.getElementById('chapterStats').textContent = mode === 'battle'
    ? t('chapter_stats_battle', { horde: hordeCount, cat: catWord(), time: formatTime(runTime) })
    : t('chapter_stats_tower', { n: towerWave, fish });
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
  ['screenStart','screenTowerStart','screenOptions','screenLeaderboard',
   'screenLose','screenAd','screenPause','screenTowerWin','screenTowerLose']
    .forEach(id=>{ const el = document.getElementById(id); if(el) el.classList.add('hidden'); });
  document.getElementById('battleHud').classList.add('hidden');
  document.getElementById('towerHud').classList.add('hidden');
  document.getElementById('pauseBtn').classList.add('hidden');
  document.getElementById('pauseBtnTower').classList.add('hidden');
  document.getElementById('hint').classList.add('hidden');
  document.getElementById('screenMainMenu').classList.remove('hidden');
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
  }
  showMainMenu();
  updateMenuResumeButton();
  updateBestScoreDisplays();
}

function pauseGame(){
  const saveBtn = document.getElementById('saveGameBtn');
  if(saveBtn) saveBtn.classList.toggle('hidden', gameMode !== 'battle'); // pas de sauvegarde en Chatteau Fort (partie finie, pas infinie)
  if(gameMode === 'battle') pauseBattle();
  else if(gameMode === 'tower') pauseTower();
}

function resumeGame(){
  if(gameMode === 'battle') resumeBattle();
  else if(gameMode === 'tower') resumeTower();
}

function update(){
  if(inChapterBreak) return; // le jeu est figé pendant la coupure
  if(gameMode === 'battle') updateBattle();
  else if(gameMode === 'tower') updateTower();
}

function render(){
  if(gameMode === 'battle') renderBattle();
  else if(gameMode === 'tower') renderTower();
}
