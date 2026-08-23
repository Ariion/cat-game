// Logique du mode "Palais des Chats".
//
// LE PROBLÈME CENTRAL de ce genre, c'est l'équilibrage des nombres : si les
// chiens sont dimensionnés en valeurs absolues, le jeu devient trivial dès
// que le joueur a eu de la chance sur deux multiplicateurs, et impossible
// s'il en a manqué un. Tout est donc dimensionné en FRACTION d'une puissance
// de référence (`expected`), recalculée carrefour par carrefour en simulant
// le choix médian — ni le meilleur ni le pire. Un chien "battable" vaut
// toujours 45-80 % de ce que le joueur devrait avoir à ce moment-là, un piège
// toujours 135-230 % : les nombres changent, le rapport de force jamais.

function puzzleRand(range){ return range[0] + Math.random() * (range[1] - range[0]); }

// Fabrique un carrefour : trois voies, dont AU MOINS UNE survivable. Cette
// garantie n'est pas une facilité, c'est ce qui rend le jeu honnête — sinon
// une mort peut arriver sans qu'aucun choix ne l'ait causée.
function puzzleMakeSegment(expected, level, index){
  const trapBoost = 1 + level * 0.05;
  // Les deux premiers carrefours de la toute première partie ne contiennent
  // aucun piège : on y apprend la règle (le nombre du chien contre le sien)
  // sans être puni avant de l'avoir comprise.
  const safe = (level === 1 && index < PUZZLE_SAFE_SEGMENTS);
  const lanes = [null, null, null];
  const gold = ()=>({ type:'gold', value: Math.max(1, Math.round(expected * puzzleRand(PUZZLE_GOLD_RATIO))) });
  const mult = ()=>({ type:'mult', value: 2 });
  const easyFoe = ()=>({ type:'foe', value: Math.max(1, Math.round(expected * puzzleRand(PUZZLE_FOE_EASY))) });
  const trapFoe = ()=>({ type:'foe', value: Math.max(2, Math.round(expected * puzzleRand(PUZZLE_FOE_TRAP) * trapBoost)) });

  const trap = safe ? easyFoe : trapFoe;
  const roll = Math.random();
  if(roll < 0.30){        // deux butins, un piège
    lanes[0] = gold(); lanes[1] = gold(); lanes[2] = trap();
  } else if(roll < 0.45){ // un multiplicateur, deux butins ordinaires
    lanes[0] = mult(); lanes[1] = gold(); lanes[2] = gold();
  } else if(roll < 0.72){ // combattre, contourner, ou se tromper
    lanes[0] = easyFoe(); lanes[1] = gold(); lanes[2] = trap();
  } else if(roll < 0.90){ // trois chiens : un seul est à ta portée
    lanes[0] = trap(); lanes[1] = easyFoe(); lanes[2] = trap();
  } else {                // le multiplicateur est gardé : gros gain, gros risque
    lanes[0] = mult(); lanes[1] = easyFoe(); lanes[2] = trap();
  }
  // mélange des voies : sinon le multiplicateur serait toujours à gauche
  for(let i = lanes.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = lanes[i]; lanes[i] = lanes[j]; lanes[j] = tmp;
  }

  // Puissance attendue après ce carrefour = résultat du choix MÉDIAN parmi
  // les voies survivables. Prendre le meilleur ferait exploser la courbe et
  // rendrait les pièges inoffensifs ; prendre le pire la ferait stagner et
  // les rendrait mortels.
  const outcomes = lanes
    .map(l=>{
      if(l.type === 'gold') return expected + l.value;
      if(l.type === 'mult') return expected * l.value;
      if(l.type === 'foe' && l.value <= expected) return expected + l.value * PUZZLE_FOE_REWARD;
      return null; // voie mortelle : elle ne compte pas dans la médiane
    })
    .filter(v=>v !== null)
    .sort((a,b)=>a-b);
  const expectedAfter = outcomes.length
    ? outcomes[Math.floor(outcomes.length/2)]
    : expected; // ne devrait jamais arriver (voir la garantie plus haut)

  return { lanes, expectedAfter };
}

function puzzleGenerateLevel(level, startPower){
  const segs = [];
  let expected = Math.max(1, startPower);
  for(let i = 0; i < PUZZLE_SEGMENTS_PER_LEVEL; i++){
    const seg = puzzleMakeSegment(expected, level, i);
    segs.push(seg);
    expected = seg.expectedAfter;
  }
  // Le gardien se calibre sur ce que le joueur DEVRAIT avoir, pas sur ce
  // qu'il a : un joueur qui a bien choisi passe, un joueur qui a systéma-
  // tiquement pris la voie la plus timide bute — c'est le contrôle de
  // compétence du niveau.
  const ratio = Math.min(1.12, PUZZLE_GUARD_RATIO + level * 0.02);
  segs.push({ guard:true, power: Math.max(3, Math.round(expected * ratio)) });
  return segs;
}

// --- mise en place 3D du plateau -------------------------------------------
function puzzleSegmentZ(i){ return -(i + 1) * PUZZLE_SEG_LEN - 3; }

function buildPuzzleBoard(){
  puzzleItems.forEach(it=>{ if(it.visual) puzzleScene.remove(it.visual); });
  puzzleItems = [];
  puzzleRows = [];
  puzzleGuard = null;

  puzzleSegments = puzzleGenerateLevel(puzzleLevel, puzzlePower);
  // Le défi est tiré APRÈS la génération : "prendre tous les multiplicateurs"
  // n'a de sens que si le niveau en contient, et un défi impossible serait
  // pire que pas de défi du tout.
  puzzleChallenge = pickPuzzleChallenge();
  puzzleChallengeOk = true;
  puzzleMultsTotal = 0;
  puzzleMultsTaken = 0;
  const levelGroup = buildPuzzleLevel(puzzleSegments);

  puzzleSegments.forEach((seg, i)=>{
    const z = puzzleSegmentZ(i);
    if(seg.guard){
      const gate = buildGuardGate();
      gate.position.z = z;
      levelGroup.add(gate);
      const visual = spawnPuzzleDog(seg.power, true);
      visual.position.set(0, 0, z);
      levelGroup.add(visual);
      const badge = buildNumberBadge(puzzleFormat(seg.power), 'guard');
      badge.scale.set(2.1, 1.05, 1);
      badge.position.set(0, 2.6, z);
      levelGroup.add(badge);
      puzzleGuard = { power: seg.power, z, visual, badge, beaten:false };
      return;
    }
    const row = { z, resolved:false, lanes:[null,null,null] };
    puzzleRows.push(row);
    seg.lanes.forEach((lane, li)=>{
      if(!lane) return;
      const x = PUZZLE_LANE_X[li];
      let visual, kind;
      if(lane.type === 'foe'){
        visual = spawnPuzzleDog(lane.value, false);
        kind = 'foe';
      } else {
        visual = buildTreasure(lane.type);
        kind = lane.type === 'mult' ? 'mult' : 'gain';
      }
      visual.position.set(x, 0, z);
      levelGroup.add(visual);
      const text = lane.type === 'mult' ? ('×' + lane.value)
                 : lane.type === 'gold' ? ('+' + puzzleFormat(lane.value))
                 : puzzleFormat(lane.value);
      const badge = buildNumberBadge(text, kind);
      badge.position.set(x, lane.type === 'foe' ? 1.9 : 1.15, z);
      levelGroup.add(badge);
      if(lane.type === 'mult') puzzleMultsTotal++;
      const item = { type: lane.type, value: lane.value, x, z, visual, badge, taken:false };
      row.lanes[li] = item;
      puzzleItems.push(item);
    });
  });
}

// Tire un défi réalisable pour ce niveau, ou null. Le premier niveau n'en a
// jamais : on n'ajoute pas une règle avant d'avoir appris la règle de base.
function pickPuzzleChallenge(){
  if(puzzleLevel < 2) return null;
  const possibles = PUZZLE_CHALLENGES.filter(c=>{
    if(c.id === 'allmult') return puzzleMultsCount() > 0;
    return true;
  });
  if(!possibles.length) return null;
  return possibles[Math.floor(Math.random()*possibles.length)];
}

function puzzleMultsCount(){
  let n = 0;
  puzzleSegments.forEach(seg=>{
    if(seg.guard || !seg.lanes) return;
    seg.lanes.forEach(l=>{ if(l && l.type === 'mult') n++; });
  });
  return n;
}

// Chiens : les vrais modèles GLB dès qu'ils sont chargés, procédural sinon —
// même repli progressif que dans les deux autres modes qui en affichent.
function spawnPuzzleDog(power, isGuard){
  const height = isGuard ? 2.0 : 1.05;
  const gltf = pickDogGltf(puzzleItems.length + (isGuard ? 7 : 0));
  let visual;
  if(gltf){
    visual = buildRealDogGroup(gltf, height, isGuard, isGuard ? 0x8E4A52 : randomFurColor());
    // marque les maillages : clearPuzzleLevel() ne doit PAS libérer leur
    // géométrie, partagée avec tous les autres clones du jeu
    visual.traverse(o=>{ if(o.isMesh) o.userData.sharedModel = true; });
  } else {
    visual = buildBossGroup(enemyMaterial);
    visual.scale.setScalar(isGuard ? 1.5 : 0.75);
  }
  visual.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
  visual.rotation.y = 0; // face à la caméra, donc face au chat qui arrive
  return visual;
}

// --- déroulé ---------------------------------------------------------------
function puzzleSetPower(v){
  puzzlePower = Math.max(0, Math.round(v));
  redrawNumberBadge(puzzleHero.badge, puzzleFormat(puzzlePower));
  updatePuzzleHud();
}

function puzzleRunSpeed(){
  return Math.min(PUZZLE_SPEED_MAX, PUZZLE_RUN_SPEED + (puzzleLevel - 1) * PUZZLE_SPEED_PER_LEVEL);
}

function updatePuzzleHero(){
  puzzleHero.z -= puzzleRunSpeed();
  const dx = puzzleHero.targetX - puzzleHero.x;
  const step = Math.sign(dx) * Math.min(Math.abs(dx), PUZZLE_LATERAL_SPEED);
  puzzleHero.x += step;
  const v = puzzleHero.visual;
  v.position.set(puzzleHero.x, Math.abs(Math.sin(puzzleFrame*0.3)) * 0.05, puzzleHero.z);
  // il se penche dans le virage : le seul retour qui dit que l'appui a été pris
  v.rotation.z = -step * 1.6;
  animateLegs(v.userData.legs, puzzleFrame * 0.36, 0.6);
  if(puzzleHero.hitFlash > 0) puzzleHero.hitFlash--;
}

// UN CARREFOUR SE FRANCHIT, IL NE SE TRAVERSE PAS.
//
// La première version testait, à chaque tick, la distance du chat à CHAQUE
// objet : une boîte de ±0,62 en profondeur, soit 16 ticks passés "dans" le
// carrefour, pendant lesquels un chat en train de changer de voie balayait
// les trois voies et se faisait happer par n'importe laquelle. Résultat
// mesuré : 14 morts sur 14 survenaient en plein transit (x ≈ ±0,88 ou ±1,47,
// jamais sur un centre de voie), c'est-à-dire sur une voie que le joueur
// n'avait pas choisie. Aucun réglage de vitesse ne pouvait corriger ça.
//
// Désormais un carrefour est une LIGNE : à l'instant précis où le chat la
// franchit, on regarde dans quelle voie il se trouve — la plus proche — et on
// ne résout que celle-là. Une mort redevient donc toujours la conséquence
// d'un choix, ce qui est la seule chose que ce jeu demande au joueur.
function updatePuzzleItems(){
  for(const it of puzzleItems){
    if(it.taken) continue;
    if(it.badge) it.badge.position.y += Math.sin((puzzleFrame + it.z*7) * 0.06) * 0.002;
    if(it.type !== 'foe') it.visual.rotation.y += 0.02;
  }
  for(const row of puzzleRows){
    if(row.resolved || puzzleHero.z > row.z) continue;
    row.resolved = true;
    let lane = null, best = Infinity;
    for(const it of row.lanes){
      if(!it || it.taken) continue;
      const d = Math.abs(puzzleHero.x - it.x);
      if(d < best){ best = d; lane = it; }
    }
    trackPuzzleChallenge(lane);
    if(lane) resolvePuzzleHit(lane);
    updateLaneButtons();
    if(puzzleState !== 'playing') return; // mort : on ne résout pas les suivants
  }
  if(puzzleGuard && !puzzleGuard.beaten && puzzleHero.z <= puzzleGuard.z + 0.9){
    if(puzzlePower >= puzzleGuard.power){
      puzzleGuard.beaten = true;
      puzzleGuard.visual.visible = false;
      puzzleGuard.badge.visible = false;
      puzzleSetPower(puzzlePower + puzzleGuard.power * PUZZLE_GUARD_REWARD);
      showPuzzleLevelWin();
    } else {
      showPuzzleDead(String(puzzleGuard.power));
    }
  }
}

// Un défi ne se vérifie qu'ICI, au franchissement : c'est le seul instant où
// l'on sait ce que le joueur a réellement choisi.
function trackPuzzleChallenge(lane){
  if(!puzzleChallenge || !puzzleChallengeOk) return;
  const id = puzzleChallenge.id;
  if(id === 'flawless' && !lane) puzzleChallengeOk = false;
  if(!lane) return;
  if(id === 'nofight' && lane.type === 'foe') puzzleChallengeOk = false;
  if(id === 'nogold' && lane.type === 'gold') puzzleChallengeOk = false;
  if(id === 'allmult' && lane.type === 'mult') puzzleMultsTaken++;
}

function puzzleChallengeMet(){
  if(!puzzleChallenge) return false;
  if(!puzzleChallengeOk) return false;
  if(puzzleChallenge.id === 'allmult') return puzzleMultsTaken >= puzzleMultsTotal && puzzleMultsTotal > 0;
  return true;
}

function resolvePuzzleHit(it){
  it.taken = true;
  if(it.type === 'gold'){
    puzzleSetPower(puzzlePower + it.value);
    sfx.croquette();
  } else if(it.type === 'mult'){
    puzzleSetPower(puzzlePower * it.value);
    sfx.win();
    vibrate(25);
    showToast(t('puzzle_mult_toast', { n: it.value }));
  } else { // chien
    if(puzzlePower >= it.value){
      puzzleSetPower(puzzlePower + it.value * PUZZLE_FOE_REWARD);
      sfx.croquette();
      vibrate(15);
    } else {
      it.taken = false; // il reste debout : c'est lui qui a gagné
      showPuzzleDead(String(it.value));
      return;
    }
  }
  it.visual.visible = false;
  if(it.badge) it.badge.visible = false;
}

function showPuzzleLevelWin(){
  puzzleState = 'levelWin';
  savePuzzleBest();
  addXp(12 + puzzleLevel * PUZZLE_XP_PER_LEVEL);
  addGems(PUZZLE_GEMS_PER_LEVEL, true);
  reportMission('puzzle_level', puzzleLevel);
  reportMission('puzzle_power', puzzlePower);
  document.getElementById('puzzleLevelTitle').textContent = t('puzzle_level_done', { n: puzzleLevel });
  let gems = PUZZLE_GEMS_PER_LEVEL;
  let defi = '';
  if(puzzleChallenge){
    const ok = puzzleChallengeMet();
    if(ok){ gems += puzzleChallenge.gems; addGems(puzzleChallenge.gems, true); }
    defi = '\n' + (ok ? '\u2713 ' : '\u2717 ') + t('chal_' + puzzleChallenge.id);
  }
  document.getElementById('puzzleLevelStats').textContent =
    t('puzzle_level_reward', { power: puzzleFormat(puzzlePower), gems }) + defi;
  // L'emplacement publicitaire ne s'affiche que si le joueur n'a pas payé
  // pour s'en débarrasser — c'est le seul endroit du mode qui consulte meta.
  showAdSlot('puzzleAdSlot', 'puzzle');
  document.getElementById('screenPuzzleLevel').classList.remove('hidden');
  document.getElementById('pauseBtnPuzzle').classList.add('hidden');
  document.getElementById('lanePad').classList.add('hidden');
  sfx.win();
  vibrate(50);
}

// Bandeau du défi, affiché en jeu : un objectif qu'on découvre à la fin
// n'est pas un objectif, c'est une surprise.
function updatePuzzleChallengeBanner(){
  const el = document.getElementById('puzzleChallenge');
  if(!el) return;
  if(!puzzleChallenge || puzzleState !== 'playing'){ el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.classList.toggle('failed', !puzzleChallengeOk);
  const suffix = (puzzleChallenge.id === 'allmult' && puzzleMultsTotal > 0)
    ? ' (' + puzzleMultsTaken + '/' + puzzleMultsTotal + ')' : '';
  el.textContent = (puzzleChallengeOk ? '\uD83C\uDFAF ' : '\u2717 ')
                 + t('chal_' + puzzleChallenge.id) + suffix;
}

function puzzleNextLevel(){
  puzzleLevel++;
  document.getElementById('screenPuzzleLevel').classList.add('hidden');
  resetPuzzleRun(true);
}

// Résurrection : on repart quelques mètres en arrière, le chien fautif retiré.
// Reculer (plutôt que reprendre pile au point de mort) laisse le temps de
// relire le carrefour : réapparaître collé à l'obstacle donnerait
// l'impression d'avoir payé pour rien.
function puzzleRevive(){
  const cost = puzzleReviveCost();
  if(!spendGems(cost)){ showToast(t('meta_not_enough_gems')); return; }
  puzzleRevivesUsed++;
  puzzleState = 'playing';
  puzzleHero.z += 2.2;
  puzzleHero.hitFlash = 90;
  // tout ce qui se trouve autour du point de mort est désamorcé, sinon on
  // ressuscite dans le même chien
  puzzleRows.forEach(row=>{
    if(Math.abs(row.z - puzzleHero.z) >= PUZZLE_SEG_LEN * 1.2) return;
    // le carrefour fatal est neutralisé ET remis à "non franchi" : sinon le
    // recul en arrière le laisserait marqué comme déjà résolu et le joueur
    // repasserait dessus sans rien ramasser
    row.resolved = false;
    row.lanes.forEach(it=>{
      if(!it || it.taken || it.type !== 'foe') return;
      it.taken = true;
      it.visual.visible = false;
      if(it.badge) it.badge.visible = false;
    });
  });
  if(puzzleGuard && !puzzleGuard.beaten && Math.abs(puzzleGuard.z - puzzleHero.z) < PUZZLE_SEG_LEN){
    // le gardien ne se désamorce pas : on recule pour reprendre de l'élan
    puzzleHero.z = puzzleGuard.z + PUZZLE_SEG_LEN * 1.4;
  }
  document.getElementById('screenPuzzleDead').classList.add('hidden');
  document.getElementById('pauseBtnPuzzle').classList.remove('hidden');
  document.getElementById('lanePad').classList.remove('hidden');
}

function updatePuzzle(){
  if(puzzleState !== 'playing' || puzzlePaused) return;
  puzzleFrame++;
  updatePuzzleHero();
  updatePuzzleItems();
  if(puzzleFrame % 15 === 0) updatePuzzleChallengeBanner();
}
