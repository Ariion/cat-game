// Contrôles : selon le mode actif (voir gameMode dans modes.js). En Bataille,
// déplacement continu (pas de couloirs binaires) — on glisse le doigt et le
// chat suit, ou on maintient les flèches du clavier. En Chatteau Fort, un
// tap pose une tourelle sur l'emplacement libre visé (pas de glissement).
let keyLeft = false;
let keyRight = false;
let dragging = false;

function setTargetFromClientX(clientX){
  const rect = canvas.getBoundingClientRect();
  const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  playerTargetX = PLAYER_X_MIN + t * (PLAYER_X_MAX - PLAYER_X_MIN);
}

canvas.addEventListener('pointerdown', (e)=>{
  if(gameMode === 'battle'){
    if(state !== 'playing') return;
    dragging = true;
    setTargetFromClientX(e.clientX);
  } else if(gameMode === 'tower'){
    if(towerState !== 'playing' || towerPaused || inChapterBreak) return;
    startStick(e.clientX, e.clientY);
  } else if(gameMode === 'mill'){
    if(millState !== 'playing' || millPaused) return;
    startStick(e.clientX, e.clientY);
  } else if(gameMode === 'puzzle'){
    if(puzzleState !== 'playing' || puzzlePaused) return;
    dragging = true;
    setPuzzleTargetFromClientX(e.clientX);
  }
});
canvas.addEventListener('pointermove', (e)=>{
  if(gameMode === 'battle'){
    if(dragging) setTargetFromClientX(e.clientX);
  } else if(gameMode === 'tower' || gameMode === 'mill'){
    moveStick(e.clientX, e.clientY);
  } else if(gameMode === 'puzzle'){
    if(dragging) setPuzzleTargetFromClientX(e.clientX);
  }
});
window.addEventListener('pointerup', ()=>{ dragging = false; endStick(); });
window.addEventListener('pointercancel', ()=>{ dragging = false; endStick(); });

// --- Palais des Chats : glissement latéral ---------------------------------
// Le chat avance TOUT SEUL, le doigt ne sert qu'à choisir la voie. C'est le
// contrôle du mode Bataille (glisser pour se placer) plutôt que la manette
// des deux autres : ici il n'y a rien à explorer, juste une décision
// gauche/droite à prendre avant chaque carrefour, et une manette obligerait
// à pousser en permanence pour rester en ligne droite.
// Le doigt DÉSIGNE UNE VOIE, il ne pointe pas une position : l'écran est
// découpé en trois bandes égales. C'est la même leçon que la manette du
// Chatteau Fort ("je suis obligé de viser") — sur un téléphone, trois grandes
// cibles valent toujours mieux qu'un curseur continu. Et ça colle exactement
// à la règle de résolution : on est toujours DANS une voie, jamais entre.
function setPuzzleTargetFromClientX(clientX){
  const rect = canvas.getBoundingClientRect();
  const f = Math.max(0, Math.min(0.999, (clientX - rect.left) / rect.width));
  puzzleHero.targetX = PUZZLE_LANE_X[Math.floor(f * PUZZLE_LANE_X.length)];
  updateLaneButtons();
}

// --- manette virtuelle (Chatteau Fort et Scierie) --------------------------
// Le déplacement se faisait en TAPANT une destination : il fallait viser, et
// rejoindre une tourelle précise pour l'améliorer tenait de l'adresse plus que
// de la stratégie. Ici le contrôle est direct : la manette naît sous le pouce,
// on pousse, le chat va dans cette direction.
//
// La caméra du mode n'a AUCUN lacet (elle est posée en +Z et regarde vers -Z),
// donc la correspondance écran -> monde est directe : droite = +X, haut = -Z.
// Si la caméra venait à pivoter, il faudrait projeter la direction dans son
// repère au lieu de cette équivalence.
// Les deux modes à chat pilotable ont chacun LEUR objet de personnage
// (hero pour le Chatteau Fort, millHero pour la Scierie) : la manette écrit
// dans celui du mode actif plutôt que dans une variable partagée, sinon les
// deux mini-jeux se remettraient à partager de l'état, ce qu'on a justement
// évité partout ailleurs.
let stickActive = false, stickOx = 0, stickOy = 0;

function stickTarget(){
  return gameMode === 'mill' ? millHero : hero;
}

function startStick(clientX, clientY){
  const el = document.getElementById('stick');
  if(!el) return;
  stickActive = true;
  const rect = canvas.getBoundingClientRect();
  stickOx = clientX; stickOy = clientY;
  el.style.left = (clientX - rect.left) + 'px';
  el.style.top  = (clientY - rect.top) + 'px';
  el.classList.remove('hidden');
  setKnob(0, 0);
  const h = stickTarget();
  h.stickX = 0; h.stickZ = 0;
}

function moveStick(clientX, clientY){
  if(!stickActive) return;
  let dx = clientX - stickOx, dy = clientY - stickOy;
  const dist = Math.hypot(dx, dy);
  const h = stickTarget();
  if(dist < STICK_DEADZONE_PX){ setKnob(0,0); h.stickX = 0; h.stickZ = 0; return; }
  const clamped = Math.min(dist, STICK_RADIUS_PX);
  const nx = dx/dist, ny = dy/dist;
  setKnob(nx*clamped, ny*clamped);
  const power = clamped / STICK_RADIUS_PX; // course partielle = déplacement plus lent
  h.stickX = nx * power;
  h.stickZ = ny * power; // écran vers le bas = +Z monde (la caméra regarde -Z)
}

function endStick(){
  if(!stickActive) return;
  stickActive = false;
  const el = document.getElementById('stick');
  if(el) el.classList.add('hidden');
  // remis à zéro sur LES DEUX personnages : le doigt peut se lever après un
  // retour au menu, et un chat resterait alors à pousser tout seul
  hero.stickX = 0; hero.stickZ = 0;
  millHero.stickX = 0; millHero.stickZ = 0;
}

function setKnob(x, y){
  const k = document.getElementById('stickKnob');
  if(k) k.style.transform = 'translate(' + x + 'px,' + y + 'px)';
}

document.addEventListener('keydown', (e)=>{
  if(gameMode !== 'battle') return;
  if(e.key==='ArrowLeft' || e.key==='a') keyLeft = true;
  if(e.key==='ArrowRight' || e.key==='d') keyRight = true;
});
document.addEventListener('keyup', (e)=>{
  if(e.key==='ArrowLeft' || e.key==='a') keyLeft = false;
  if(e.key==='ArrowRight' || e.key==='d') keyRight = false;
});

// ===========================================================================
// Commandes à l'écran : croix directionnelle (Chatteau Fort) et touches de
// voie (Palais des Chats)
// ===========================================================================
// Elles ne REMPLACENT pas le glissement, elles s'y ajoutent : un joueur qui a
// pris l'habitude de la manette flottante la garde, un joueur qui trouvait ça
// difficile a maintenant des cibles fixes et visibles. Les deux écrivent dans
// les mêmes champs, il n'y a donc aucun code de jeu à dédoubler.

// --- joystick fixe (Chatteau Fort) -----------------------------------------
// Même sortie que la manette flottante (hero.stickX / hero.stickZ), mais une
// base ancrée : on sait toujours où poser le pouce. Le rayon de course est
// celui du cercle affiché, donc ce qu'on voit correspond exactement à ce qui
// est lu — pousser jusqu'au bord donne la vitesse maximale, pas au-delà.
// Il sert au Chatteau Fort ET à la Scierie : les deux font marcher un chat sur
// un plateau, donc les deux ont le même besoin. stickTarget() (plus bas) dit
// dans quel personnage écrire selon le mode actif — c'est la même règle que
// pour la manette flottante, il n'y a pas deux logiques à maintenir.
const FIXED_STICK_RADIUS = 44;
let fixedStickId = null;

function fixedStickUsable(){
  if(gameMode === 'tower') return towerState === 'playing' && !towerPaused && !inChapterBreak;
  if(gameMode === 'mill')  return millState === 'playing' && !millPaused && !inChapterBreak;
  return false;
}

function fixedStickSet(clientX, clientY){
  const el = document.getElementById('towerStick');
  const knob = document.getElementById('towerStickKnob');
  if(!el || !knob) return;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width/2, cy = r.top + r.height/2;
  let dx = clientX - cx, dy = clientY - cy;
  const dist = Math.hypot(dx, dy);
  const h = stickTarget();
  if(dist < 6){
    knob.style.transform = 'translate(0,0)';
    h.stickX = 0; h.stickZ = 0;
    return;
  }
  const clamped = Math.min(dist, FIXED_STICK_RADIUS);
  const nx = dx/dist, ny = dy/dist;
  knob.style.transform = 'translate(' + (nx*clamped) + 'px,' + (ny*clamped) + 'px)';
  const power = clamped / FIXED_STICK_RADIUS; // course partielle = déplacement plus lent
  h.stickX = nx * power;
  h.stickZ = ny * power; // écran vers le bas = +Z monde (la caméra regarde -Z)
}

function fixedStickRelease(){
  fixedStickId = null;
  const el = document.getElementById('towerStick');
  const knob = document.getElementById('towerStickKnob');
  if(el) el.classList.remove('held');
  if(knob) knob.style.transform = 'translate(0,0)';
  // les DEUX personnages : le doigt peut se lever après un changement de mode
  hero.stickX = 0; hero.stickZ = 0;
  millHero.stickX = 0; millHero.stickZ = 0;
}

function bindFixedStick(){
  const el = document.getElementById('towerStick');
  if(!el) return;
  el.addEventListener('pointerdown', (e)=>{
    e.preventDefault();
    if(!fixedStickUsable()) return;
    fixedStickId = e.pointerId;
    el.classList.add('held');
    // capture : le doigt peut sortir du cercle sans que la commande se coupe,
    // ce qui est exactement ce qu'on attend d'un joystick
    if(el.setPointerCapture) el.setPointerCapture(e.pointerId);
    fixedStickSet(e.clientX, e.clientY);
  });
  el.addEventListener('pointermove', (e)=>{
    if(fixedStickId !== e.pointerId) return;
    e.preventDefault();
    fixedStickSet(e.clientX, e.clientY);
  });
  ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>{
    el.addEventListener(ev, (e)=>{ if(fixedStickId === e.pointerId) fixedStickRelease(); });
  });
}

// --- touches de voie -------------------------------------------------------
function puzzleLaneIndex(){
  let best = 0, bestD = Infinity;
  PUZZLE_LANE_X.forEach((x, i)=>{
    const d = Math.abs(puzzleHero.targetX - x);
    if(d < bestD){ bestD = d; best = i; }
  });
  return best;
}

function puzzleStep(delta){
  if(gameMode !== 'puzzle' || puzzleState !== 'playing' || puzzlePaused) return;
  const i = Math.max(0, Math.min(PUZZLE_LANE_X.length - 1, puzzleLaneIndex() + delta));
  puzzleHero.targetX = PUZZLE_LANE_X[i];
  updateLaneButtons();
}

// Les touches se grisent au bord du plateau : appuyer sans effet donne
// l'impression que la commande ne répond pas.
function updateLaneButtons(){
  const l = document.getElementById('laneLeft'), r = document.getElementById('laneRight');
  if(!l || !r) return;
  const i = puzzleLaneIndex();
  l.disabled = (i === 0);
  r.disabled = (i === PUZZLE_LANE_X.length - 1);
}

function bindLanePad(){
  [['laneLeft', -1], ['laneRight', 1]].forEach(([id, delta])=>{
    const btn = document.getElementById(id);
    if(!btn) return;
    btn.addEventListener('pointerdown', (e)=>{
      e.preventDefault();
      btn.classList.add('held');
      puzzleStep(delta);
    });
    const release = ()=>btn.classList.remove('held');
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('pointercancel', release);
  });
}

bindFixedStick();
bindLanePad();
