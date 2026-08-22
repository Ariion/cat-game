// Point d'entrée : initialise les trois scènes 3D (un mini-jeu chacune) puis
// lance la boucle de jeu principale, commune aux trois modes (voir modes.js).
if(!webglSupported){
  const msg = "Ton navigateur ne supporte pas la 3D (WebGL). Essaie un navigateur plus récent.";
  ['#screenStart p', '#screenTowerStart p', '#screenMillStart p'].forEach(sel=>{
    const p = document.querySelector(sel);
    if(p) p.textContent = msg;
  });
  document.querySelectorAll('#screenStart .btn, #screenTowerStart .btn, #screenMillStart .btn, .mode-card').forEach(btn=>{
    btn.setAttribute('disabled', 'true');
  });
}

initScene();
initTowerScene();
initMillScene();
initPostFX(); // après les trois scènes : a besoin du renderer créé par initScene()
applyTranslations();
updateBestScoreDisplays();
updateMenuResumeButton();
showMainMenu();
window.addEventListener('resize', ()=>{ onResize(); onResizeTower(); onResizeMill(); onResizePostFX(); });

// Pas de temps fixe : update() tourne toujours à un rythme stable
// (~60 ticks/s) quel que soit le taux de rafraîchissement de l'écran.
// Sans ça, un téléphone en 90Hz/120Hz fait tourner tout le jeu 1.5x à 2x
// trop vite, puisque le code historique fait avancer chaque chose d'une
// quantité fixe "par frame" plutôt que par seconde.
const FIXED_STEP_MS = 1000 / 60;
const MAX_CATCHUP_MS = 250; // évite l'effet tunnel après une pause/onglet en arrière-plan
let lastTime = null;
let accumulator = 0;

function loop(now){
  if(lastTime === null) lastTime = now;
  const elapsed = Math.min(now - lastTime, MAX_CATCHUP_MS);
  lastTime = now;
  accumulator += elapsed;

  while(accumulator >= FIXED_STEP_MS){
    update();
    accumulator -= FIXED_STEP_MS;
  }

  render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
