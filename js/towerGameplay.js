// Logique du mode "Chatteau Fort" : pose de tourelles-chats, vagues de
// chiens qui suivent le chemin, tir automatique des tourelles. Séparé du
// mode Bataille (gameplay.js) — aucune variable partagée, seulement des
// fonctions/matériaux de dessin communs (buildCatGroup, buildBossGroup,
// animateLegs, catMaterial/enemyMaterial, disposeProceduralGroup, sfx...).

// --- pose de tourelles ------------------------------------------------

function handleTowerTap(clientX, clientY){
  if(!webglSupported || !towerRaycaster) return;
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
  towerPointerNDC.set(ndcX, ndcY);
  towerRaycaster.setFromCamera(towerPointerNDC, towerCamera);
  const freeMarkers = towerSlots.filter(s=>!s.occupied).map(s=>s.marker);
  const hits = towerRaycaster.intersectObjects(freeMarkers);
  if(hits.length === 0) return;
  const slot = towerSlots.find(s=>s.marker === hits[0].object);
  placeTurret(slot);
}

function placeTurret(slot){
  if(!slot || slot.occupied) return;
  if(fish < towerNextTurretCost){
    showToast(t('tower_not_enough_fish'));
    return;
  }
  fish -= towerNextTurretCost;
  towerNextTurretCost += TOWER_TURRET_COST_INCREMENT;
  slot.occupied = true;
  slot.marker.visible = false;

  // même chat que le meneur du mode Bataille (buildCatGroup(), scene3d.js) —
  // pas de tourelle mécanique, juste un chat posté en garde, immobile (pas
  // d'animation de pattes : on veut une posture assise/vigilante, pas une
  // course sur place). Perché sur le socle de l'emplacement (voir
  // initTowerScene()), comme une vraie tour de guet plutôt que posé au ras
  // du sol.
  const visual = buildCatGroup();
  visual.position.set(slot.x, 0.26, slot.z);
  const facing = nearestPathPointTo(slot.x, slot.z);
  visual.lookAt(facing.x, 0, facing.z);
  visual.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
  towerScene.add(visual);

  const turret = {
    x: slot.x, z: slot.z,
    level: 0,
    kills: 0,
    fireTimer: 0,
    visual,
    insignia: null, // casque/couronne ajouté à la montée en grade
    aura: null,
    rankLabel: buildTurretRankLabel()
  };
  visual.add(turret.rankLabel);
  applyTurretLevel(turret, 0);
  towerTurrets.push(turret);

  sfx.croquette();
  vibrate(15);
  updateTowerHud();
}

// --- montée en grade des tourelles --------------------------------------
// Une tourelle accumule ses propres éliminations et gagne un rang quand elle
// atteint les seuils de TOWER_TURRET_LEVELS (config.js) : plus grosse, plus
// de dégâts/portée/cadence, et un insigne visible (casque puis couronne) +
// une aura au sol de la couleur du rang. C'est la progression individuelle
// de la défense, en plus de la montée d'ambiance par vague.

// Petite étiquette de rang au-dessus de la tourelle (I / II / III) — même
// technique canvas que l'étiquette de puissance du mode Bataille.
function buildTurretRankLabel(){
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent:true, depthWrite:false, fog:false
  }));
  // L'étiquette est enfant du groupe de la tourelle, lui-même agrandi à
  // chaque rang (scale jusqu'à 2.1) : on compense ici pour qu'elle garde à
  // peu près la même taille à l'écran quel que soit le rang.
  sprite.scale.set(0.62, 0.31, 1);
  sprite.position.set(0, 1.25, 0);
  sprite.renderOrder = 3;
  sprite.userData = { canvas: c, ctx, tex };
  return sprite;
}

// Pastille pleine (fond coloré du rang + chiffre romain clair) plutôt qu'un
// simple texte contourné : à la taille où l'étiquette apparaît vue de la
// caméra en plongée, un texte fin ne se lisait pas du tout — il ressortait
// comme une petite tache sombre indistincte.
function redrawTurretRankLabel(sprite, level){
  const ud = sprite.userData, c = ud.canvas, ctx = ud.ctx;
  const accent = TOWER_TURRET_LEVELS[level].accent;
  const hex = '#' + accent.toString(16).padStart(6, '0');
  ctx.clearRect(0, 0, c.width, c.height);

  const w = 96, h = 46, x = (c.width-w)/2, y = (c.height-h)/2, r = h/2;
  ctx.fillStyle = 'rgba(59,50,38,0.9)';
  ctx.beginPath();
  ctx.roundRect(x-4, y-4, w+8, h+8, r+4);
  ctx.fill();
  ctx.fillStyle = hex;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();

  ctx.font = '800 30px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = level === 1 ? '#3B3226' : '#FFF6E2'; // le rang II est argenté : texte sombre pour rester lisible
  ctx.fillText(['I', 'II', 'III'][level] || 'I', c.width/2, c.height/2 + 1);
  ud.tex.needsUpdate = true;
}

// Insigne de grade posé sur la tête du chat : rien au rang I, un casque au
// rang II, une couronne au rang III.
function buildTurretInsignia(level, accentHex){
  if(level === 0) return null;
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: accentHex, flatShading:true, roughness:0.45, metalness:0.35 });
  if(level === 1){
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8, 0, Math.PI*2, 0, Math.PI/2), mat);
    helm.position.set(0, 0.72, -0.28);
    g.add(helm);
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.3), mat);
    crest.position.set(0, 0.85, -0.28);
    g.add(crest);
  } else {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.1, 10), mat);
    band.position.set(0, 0.76, -0.28);
    g.add(band);
    for(let i=0;i<6;i++){
      const ang = (i/6)*Math.PI*2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), mat);
      spike.position.set(Math.sin(ang)*0.2, 0.88, -0.28 + Math.cos(ang)*0.2);
      g.add(spike);
    }
  }
  g.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
  return g;
}

function applyTurretLevel(turret, level){
  const def = TOWER_TURRET_LEVELS[level];
  turret.level = level;
  turret.damage = def.damage;
  turret.range = def.range;
  turret.fireInterval = def.fireInterval;
  turret.visual.scale.setScalar(def.scale);

  if(turret.insignia){ turret.visual.remove(turret.insignia); disposeProceduralGroup(turret.insignia); }
  turret.insignia = buildTurretInsignia(level, def.accent);
  if(turret.insignia) turret.visual.add(turret.insignia);

  // aura au sol : matérialise la portée ET le rang d'un coup d'œil
  if(turret.aura){ towerScene.remove(turret.aura); turret.aura.geometry.dispose(); turret.aura.material.dispose(); }
  const aura = new THREE.Mesh(
    new THREE.RingGeometry(def.range - 0.06, def.range, 40),
    new THREE.MeshBasicMaterial({ color: def.accent, transparent:true, opacity: 0.16 + level*0.06, side: THREE.DoubleSide, depthWrite:false })
  );
  aura.rotation.x = -Math.PI/2;
  aura.position.set(turret.x, 0.05, turret.z);
  towerScene.add(aura);
  turret.aura = aura;

  // L'étiquette est enfant du groupe, donc sa taille à l'écran = échelle
  // locale × échelle du groupe. On vise donc une taille MONDE constante
  // (~1 unité de large) en divisant par l'échelle du rang : sinon soit elle
  // grossit avec la tourelle jusqu'à la masquer, soit — en compensant trop —
  // le chiffre devient un pâté de quelques pixels illisible.
  const inv = 1 / def.scale;
  turret.rankLabel.scale.set(1.0 * inv, 0.5 * inv, 1);
  // idem pour la hauteur : on veut la pastille juste au-dessus de la tête,
  // pas flottant de plus en plus haut à mesure que le chat grandit
  turret.rankLabel.position.y = 0.78 + 0.42 * inv;
  redrawTurretRankLabel(turret.rankLabel, level);
}

function registerTurretKill(turret){
  turret.kills++;
  const next = turret.level + 1;
  if(next < TOWER_TURRET_LEVELS.length && turret.kills >= TOWER_TURRET_LEVELS[next].killsNeeded){
    applyTurretLevel(turret, next);
    spawnTowerBurst(turret.x, 0.9, turret.z, TOWER_TURRET_LEVELS[next].accent, 14);
    sfx.win();
    vibrate(30);
    showToast(t('tower_rank_up', { n: next + 1 }));
  }
}

// --- vagues de chiens ---------------------------------------------------

function spawnTowerDog(){
  const growth = towerWave - 1; // vague 1 = pas de croissance
  const hp = Math.round(TOWER_DOG_HP_BASE * Math.pow(TOWER_WAVE_HP_GROWTH, growth));
  const speed = TOWER_DOG_SPEED_BASE * Math.pow(TOWER_WAVE_SPEED_GROWTH, growth);

  const visual = buildBossGroup(enemyMaterial); // même chien procédural que le mode Bataille
  visual.scale.setScalar(0.68);
  visual.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
  const start = TOWER_PATH[0];
  visual.position.set(start.x, 0, start.z);
  towerScene.add(visual);

  const hpSprite = buildTowerDogHpBar();
  visual.add(hpSprite);

  towerDogs.push({
    active: true, hp, maxHp: hp, speed,
    wp: 0, x: start.x, z: start.z,
    visual, hpSprite
  });
}

function dogProgress(d){
  const target = TOWER_PATH[d.wp+1] || TOWER_PATH[TOWER_PATH.length-1];
  const distToNext = Math.hypot(target.x - d.x, target.z - d.z);
  return d.wp * 1000 - distToNext; // plus grand = plus avancé sur le chemin
}

function updateTowerDogs(){
  for(let i=towerDogs.length-1; i>=0; i--){
    const d = towerDogs[i];
    const target = TOWER_PATH[d.wp+1];
    if(!target){ resolveTowerDog(i, 'arrived'); continue; }
    const dx = target.x - d.x, dz = target.z - d.z;
    const dist = Math.hypot(dx, dz);
    if(dist < d.speed){
      d.x = target.x; d.z = target.z; d.wp++;
      if(d.wp >= TOWER_PATH.length - 1){ resolveTowerDog(i, 'arrived'); continue; }
    } else {
      d.x += dx/dist * d.speed;
      d.z += dz/dist * d.speed;
    }
    d.visual.position.set(d.x, 0, d.z);
    animateLegs(d.visual.userData.legs, towerFrame*0.3 + i*1.3, 0.4);
  }
}

function resolveTowerDog(i, reason){
  const d = towerDogs[i];
  towerScene.remove(d.visual);
  disposeProceduralGroup(d.visual);
  towerDogs.splice(i, 1);
  towerWaveDogsLeft--;

  if(reason === 'arrived'){
    towerLives = Math.max(0, towerLives - 1);
    sfx.hurt();
    vibrate([20,15,20]);
    updateTowerHud();
    if(towerLives <= 0){ showTowerLose(); return; }
  } else if(reason === 'killed'){
    fish += TOWER_FISH_PER_KILL;
    sfx.enemyDown();
    updateTowerHud();
  }
  checkTowerWaveEnd();
}

// --- tourelles : ciblage + tir ------------------------------------------

function findFurthestDogInRange(tu){
  // bestProgress DOIT démarrer à -Infinity, pas à une petite valeur négative :
  // dogProgress() vaut wp*1000 - distanceAuProchainPoint, qui est largement
  // négatif pour un chien qui vient d'entrer sur un segment (loin du point
  // suivant) — avec un seuil de départ à -1, ces chiens ne battaient jamais
  // le seuil et étaient ignorés comme cible jusqu'à être presque arrivés au
  // virage suivant, réduisant une tourelle isolée à 1-2 tirs au lieu de
  // toute la fenêtre de portée (repéré : un chien traversant restait à 60
  // PV pendant l'essentiel de son passage en portée, touché seulement dans
  // les derniers instants).
  let best = null, bestProgress = -Infinity;
  towerDogs.forEach(d=>{
    const dist = Math.hypot(d.x - tu.x, d.z - tu.z);
    if(dist > tu.range) return;
    const progress = dogProgress(d);
    if(progress > bestProgress){ bestProgress = progress; best = d; }
  });
  return best;
}

function spawnTowerBurst(x, y, z, color, count){
  if(!webglSupported) return;
  for(let i=0; i<(count||6); i++){
    const mat = new THREE.MeshBasicMaterial({ color, transparent:true, opacity:1 });
    const mesh = new THREE.Mesh(particleGeometry, mat);
    mesh.position.set(x, y, z);
    towerScene.add(mesh);
    towerParticles.push({
      mesh,
      vx: (Math.random()-0.5)*0.1,
      vy: Math.random()*0.09 + 0.02,
      vz: (Math.random()-0.5)*0.1,
      life: 22
    });
  }
}

function updateTowerParticles(){
  towerParticles.forEach(p=>{
    p.mesh.position.x += p.vx;
    p.mesh.position.y += p.vy;
    p.mesh.position.z += p.vz;
    p.vy -= 0.005;
    p.life--;
    p.mesh.material.opacity = Math.max(p.life/22, 0);
  });
  const expired = towerParticles.filter(p=>p.life<=0);
  expired.forEach(p=>{ towerScene.remove(p.mesh); p.mesh.material.dispose(); });
  towerParticles = towerParticles.filter(p=>p.life>0);
}

// killer = la tourelle qui a porté le coup, pour lui créditer l'élimination
// (montée en grade) — absente si les dégâts viennent d'ailleurs.
function applyTowerDogHit(dog, damage, killer){
  dog.hp -= damage;
  redrawTowerHpBar(dog.hpSprite, Math.max(0, dog.hp/dog.maxHp));
  if(dog.hp <= 0){
    const i = towerDogs.indexOf(dog);
    if(i >= 0){
      resolveTowerDog(i, 'killed');
      if(killer) registerTurretKill(killer);
    }
  }
}

function fireTowerTurret(tu, dog){
  sfx.hit();
  const accent = TOWER_TURRET_LEVELS[tu.level].accent;
  spawnTowerBurst(tu.x, 0.9, tu.z, accent, 3);     // flash au départ, à la couleur du rang
  spawnTowerBurst(dog.x, 0.5, dog.z, 0xCCFF33, 5); // impact, même citron-vert que le tir du mode Bataille
  applyTowerDogHit(dog, tu.damage, tu);
}

function updateTowerTurrets(){
  towerTurrets.forEach(tu=>{
    // léger balancement de l'aura : montre que la tourelle est "en éveil"
    if(tu.aura) tu.aura.rotation.z += 0.004;
    if(tu.fireTimer > 0){ tu.fireTimer--; return; }
    const target = findFurthestDogInRange(tu);
    if(!target) return;
    tu.fireTimer = tu.fireInterval;
    fireTowerTurret(tu, target);
  });
}

// --- vagues : lancement + fin --------------------------------------------

function startNextTowerWave(){
  towerWave++;
  towerWaveSpawned = 0;
  towerWaveDogsLeft = TOWER_DOGS_PER_WAVE;
  towerWaveSpawnTimer = 0;
  updateTowerHud();
  // le siège s'assombrit et le chatteau se pavoise d'une bannière de plus à
  // chaque vague — la partie ne se joue pas sous le même ciel du début à la fin
  if(webglSupported){
    startTowerAmbianceTransition(towerWave);
    setTowerBannerCount(towerWave);
  }
  showToast(t('tower_wave_toast', { n: towerWave, max: TOWER_WAVE_COUNT }));
}

function checkTowerWaveEnd(){
  if(towerState !== 'playing') return; // une défaite peut avoir déjà été déclenchée par ce même appel
  if(towerWaveDogsLeft > 0 || towerWaveSpawned < TOWER_DOGS_PER_WAVE) return;
  if(towerWave >= TOWER_WAVE_COUNT){
    if(towerLives > 0) showTowerWin();
    return;
  }
  towerWaveDelayTimer = TOWER_WAVE_DELAY_FRAMES;
}

function updateTowerWaves(){
  const waveFullyResolved = towerWaveSpawned >= TOWER_DOGS_PER_WAVE && towerWaveDogsLeft === 0;
  if(towerWave === 0 || waveFullyResolved){
    if(towerWaveDelayTimer > 0){
      towerWaveDelayTimer--;
      if(towerWaveDelayTimer === 0 && towerState === 'playing') startNextTowerWave();
    }
    return;
  }
  if(towerWaveSpawned < TOWER_DOGS_PER_WAVE){
    towerWaveSpawnTimer++;
    if(towerWaveSpawnTimer >= TOWER_DOG_SPAWN_INTERVAL_FRAMES){
      towerWaveSpawnTimer = 0;
      spawnTowerDog();
      towerWaveSpawned++;
    }
  }
}

// --- boucle principale ----------------------------------------------------

function updateTower(){
  if(towerState !== 'playing' || towerPaused) return;
  towerFrame++;
  updateTowerWaves();
  updateTowerTurrets();
  updateTowerDogs();
  updateTowerParticles();
  if(webglSupported){
    updateTowerAmbiance();       // fondu d'ambiance entre deux vagues
    animateTowerBanners(towerFrame);
  }
}
