// Contrôles : selon le mode actif (voir gameMode dans modes.js). En Bataille,
// déplacement continu (pas de couloirs binaires) — on glisse le doigt et le
// chat suit, ou on maintient les flèches du clavier. En Chatteau Fort et à la
// Scierie, on pilote un chat à la manette (plus bas). Au Palais, le doigt ne
// choisit qu'une voie parmi trois.
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
  } else if(gameMode === 'tower' || gameMode === 'mill'){
    stickBegin(e.clientX, e.clientY, e.pointerId);
    // capture : le doigt peut sortir du canvas sans que la commande se coupe
    if(canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
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
    stickMove(e.clientX, e.clientY, e.pointerId);
  } else if(gameMode === 'puzzle'){
    if(dragging) setPuzzleTargetFromClientX(e.clientX);
  }
});
window.addEventListener('pointerup', (e)=>{ dragging = false; stickEnd(e.pointerId); });
window.addEventListener('pointercancel', (e)=>{ dragging = false; stickEnd(e.pointerId); });

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

// ===========================================================================
// LA MANETTE — une seule, mobile, qui se prend n'importe où
// ===========================================================================
// Il y en avait DEUX en concurrence : un joystick fixe en bas à gauche et une
// manette flottante sur le reste du décor. Le pouce posé sur l'anneau donnait
// un comportement, le même pouce un centimètre plus loin en donnait un autre.
// C'est la première raison pour laquelle le chat était "une horreur à
// contrôler" : le contrôle changeait de nature selon l'endroit touché.
//
// Il n'en reste qu'une. L'anneau est TOUJOURS VISIBLE, posé au repos en bas à
// gauche pour qu'on sache qu'il existe — mais toucher N'IMPORTE OÙ sur le jeu
// l'amène sous le pouce. On ne vise donc jamais rien, et on garde quand même
// un repère. L'anneau ne capte aucun événement (pointer-events: none) : c'est
// un retour visuel, pas une cible.
//
// Trois réglages font la sensation, et aucun n'était là :
//   1. ORIGINE MOBILE  — au-delà du rayon, l'origine suit le pouce, sinon un
//      long glissement finit par pointer dans une direction qu'on n'a pas
//      choisie ;
//   2. INERTIE         — la vitesse rattrape sa cible au lieu de sauter (voir
//      moveWithStick, plus bas) ;
//   3. VIRAGE PROGRESSIF — le chat tourne vers sa direction au lieu de pivoter
//      d'un bloc à chaque frémissement du pouce.
let stickPointerId = null;
let stickOx = 0, stickOy = 0;   // origine courante, en coordonnées écran

function stickTarget(){
  return gameMode === 'mill' ? millHero : hero;
}

function stickUsable(){
  if(gameMode === 'tower') return towerState === 'playing' && !towerPaused && !inChapterBreak;
  if(gameMode === 'mill')  return millState === 'playing' && !millPaused && !inChapterBreak;
  return false;
}

function stickEl(){ return document.getElementById('towerStick'); }

// Position de repos, calculée depuis le cadre : il est mis à l'échelle selon
// l'écran, une constante en pixels ne suffirait pas.
function stickHomeXY(){
  const frame = document.getElementById('frame');
  const r = frame.getBoundingClientRect();
  return { x: STICK_HOME_X, y: r.height - STICK_HOME_Y };
}

function stickPlace(x, y){
  const el = stickEl();
  if(!el) return;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
}

function stickGoHome(){
  const h = stickHomeXY();
  stickPlace(h.x, h.y);
}

function stickKnob(dx, dy){
  const k = document.getElementById('towerStickKnob');
  if(k) k.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
}

function stickBegin(clientX, clientY, pointerId){
  if(!stickUsable()) return;
  const el = stickEl();
  if(!el) return;
  stickPointerId = pointerId;
  stickOx = clientX; stickOy = clientY;
  const r = document.getElementById('frame').getBoundingClientRect();
  el.classList.add('held', 'grabbed'); // `grabbed` coupe la transition : sous
                                       // le pouce, l'anneau doit être INSTANTANÉ
  stickPlace(clientX - r.left, clientY - r.top);
  stickKnob(0, 0);
  const h = stickTarget();
  h.stickX = 0; h.stickZ = 0;
}

// Le pointerId est FILTRÉ : un deuxième doigt posé ailleurs (pour appuyer sur
// un bouton d'interface, ou simplement posé sur l'écran) envoyait ses propres
// pointermove, qui pilotaient la manette à la place du pouce. Le chat partait
// alors dans une direction que personne n'avait demandée.
function stickMove(clientX, clientY, pointerId){
  if(stickPointerId === null) return;
  if(pointerId !== undefined && pointerId !== stickPointerId) return;
  if(!stickUsable()){ stickEnd(stickPointerId); return; }
  let dx = clientX - stickOx, dy = clientY - stickOy;
  let dist = Math.hypot(dx, dy);
  const h = stickTarget();

  if(dist < STICK_DEADZONE_PX){
    stickKnob(0, 0);
    h.stickX = 0; h.stickZ = 0;
    return;
  }

  const nx = dx/dist, ny = dy/dist;
  // ORIGINE MOBILE : au-delà du rayon, l'origine se fait tirer par le pouce.
  // Sans ça, un glissement de trois centimètres finit par désigner une
  // direction très différente de celle du geste — le doigt part loin de son
  // point de départ et c'est ce vecteur-là qui compte, pas le mouvement.
  if(dist > STICK_RADIUS_PX){
    stickOx = clientX - nx * STICK_RADIUS_PX;
    stickOy = clientY - ny * STICK_RADIUS_PX;
    const r = document.getElementById('frame').getBoundingClientRect();
    stickPlace(stickOx - r.left, stickOy - r.top);
    dist = STICK_RADIUS_PX;
  }

  const kt = STICK_KNOB_TRAVEL_PX / STICK_RADIUS_PX;
  stickKnob(nx*dist*kt, ny*dist*kt);
  const power = dist / STICK_RADIUS_PX; // course partielle = déplacement plus lent
  h.stickX = nx * power;
  h.stickZ = ny * power; // écran vers le bas = +Z monde (la caméra regarde -Z)
}

function stickEnd(pointerId){
  if(stickPointerId === null) return;
  if(pointerId !== undefined && pointerId !== stickPointerId) return;
  stickPointerId = null;
  const el = stickEl();
  if(el){
    el.classList.remove('held', 'grabbed'); // la transition reprend : l'anneau
    stickGoHome();                          // glisse doucement à sa place
  }
  stickKnob(0, 0);
  // remis à zéro sur LES DEUX personnages : le doigt peut se lever après un
  // changement de mode, et un chat resterait alors à pousser tout seul
  hero.stickX = 0; hero.stickZ = 0;
  millHero.stickX = 0; millHero.stickZ = 0;
}

// ---------------------------------------------------------------------------
// Intégration du déplacement, commune aux deux modes à chat pilotable.
// C'est ICI que se joue la sensation, pas dans la lecture du doigt.
//
// La poussée ne s'applique plus à la POSITION mais à la VITESSE, qui rattrape
// progressivement sa cible : le chat démarre avec un peu de poids et glisse
// une fraction de seconde au relâchement, au lieu de s'allumer et s'éteindre.
// Et il tourne VERS sa direction par le chemin le plus court, au lieu d'y
// sauter — c'est ce qui faisait qu'il tournoyait sur place au moindre
// tremblement du pouce.
//
// Renvoie la fraction de vitesse atteinte (0 à 1), dont les modes se servent
// pour animer les pattes et le rebond de marche.
function moveWithStick(h, speed, bounds){
  const cibleVx = h.stickX * speed;
  const cibleVz = h.stickZ * speed;
  h.vx = (h.vx || 0) + (cibleVx - (h.vx || 0)) * HERO_ACCEL;
  h.vz = (h.vz || 0) + (cibleVz - (h.vz || 0)) * HERO_ACCEL;
  // sous le millième d'unité par tick, on est à l'arrêt : sans ce plancher le
  // chat dériverait indéfiniment d'un cheveu
  if(Math.abs(h.vx) < 0.0004) h.vx = 0;
  if(Math.abs(h.vz) < 0.0004) h.vz = 0;

  h.x += h.vx;
  h.z += h.vz;
  h.x = Math.max(bounds.xMin, Math.min(bounds.xMax, h.x));
  h.z = Math.max(bounds.zMin, Math.min(bounds.zMax, h.z));
  // Puis le resserrement en perspective (voir TOWER_BOUNDS dans config.js) :
  // au premier plan le cadre est bien plus étroit en unités monde qu'au fond,
  // et le rectangle seul laissait le chat sortir de l'écran par le côté.
  if(bounds.halfW0){
    const lim = bounds.halfW0 - bounds.halfWSlope * h.z;
    if(h.x >  lim){ h.x =  lim; h.vx = 0; }
    if(h.x < -lim){ h.x = -lim; h.vx = 0; }
  }

  const v = Math.hypot(h.vx, h.vz);
  if(v > 0.0006){
    const cible = Math.atan2(h.vx, h.vz);
    let d = cible - h.facing;
    while(d > Math.PI) d -= Math.PI*2;   // par le chemin le plus court : sans
    while(d < -Math.PI) d += Math.PI*2;  // ça, un demi-tour part à l'envers
    h.facing += d * HERO_TURN_RATE;
  }
  return Math.min(1, v / speed);
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

stickGoHome();
bindLanePad();
window.addEventListener('resize', stickGoHome);
