// Point d'entrée : initialise la scène 3D puis lance la boucle de jeu principale.
if(!webglSupported){
  const p = document.querySelector('#screenStart p');
  if(p) p.textContent = "Ton navigateur ne supporte pas la 3D (WebGL). Essaie un navigateur plus récent.";
  const btn = document.querySelector('#screenStart .btn');
  if(btn) btn.setAttribute('disabled', 'true');
}

initScene();
updateBestScoreDisplays();
window.addEventListener('resize', onResize);

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
