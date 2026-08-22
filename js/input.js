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

// --- croix directionnelle --------------------------------------------------
const DPAD_VECTORS = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] };
let dpadHeld = {}; // plusieurs touches à la fois = diagonale

function dpadApply(){
  let x = 0, z = 0;
  Object.keys(dpadHeld).forEach(dir=>{
    if(!dpadHeld[dir]) return;
    x += DPAD_VECTORS[dir][0];
    z += DPAD_VECTORS[dir][1];
  });
  const mag = Math.hypot(x, z);
  // normalisée : sans ça une diagonale irait 1,41 fois plus vite qu'une
  // ligne droite, et le chat filerait en biais sans qu'on comprenne pourquoi
  hero.stickX = mag > 0 ? x/mag : 0;
  hero.stickZ = mag > 0 ? z/mag : 0;
}

function bindDpad(){
  const pad = document.getElementById('dpad');
  if(!pad) return;
  pad.querySelectorAll('.dpad-btn').forEach(btn=>{
    const dir = btn.dataset.dir;
    const press = (e)=>{
      e.preventDefault();
      if(gameMode !== 'tower' || towerState !== 'playing' || towerPaused || inChapterBreak) return;
      dpadHeld[dir] = true;
      btn.classList.add('held');
      dpadApply();
    };
    const release = ()=>{
      if(!dpadHeld[dir]) return;
      dpadHeld[dir] = false;
      btn.classList.remove('held');
      dpadApply();
    };
    btn.addEventListener('pointerdown', press);
    // pointerup ET pointerleave : sans le second, un doigt qui glisse hors de
    // la touche la laisserait "enfoncée" et le chat partirait tout seul
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('pointercancel', release);
  });
  // filet de sécurité : un doigt relâché n'importe où libère tout
  window.addEventListener('pointerup', ()=>{
    let any = false;
    Object.keys(dpadHeld).forEach(d=>{ if(dpadHeld[d]) any = true; });
    if(!any) return;
    dpadHeld = {};
    pad.querySelectorAll('.dpad-btn').forEach(b=>b.classList.remove('held'));
    dpadApply();
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

bindDpad();
bindLanePad();
