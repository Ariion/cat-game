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
  // course sur place). Perché sur le petit socle de l'emplacement (voir
  // initTowerScene()), comme une vraie tour de guet plutôt que posé au ras
  // du sol.
  const visual = buildCatGroup();
  visual.scale.setScalar(1.2);
  visual.position.set(slot.x, 0.16, slot.z);
  const facing = nearestPathPointTo(slot.x, slot.z);
  visual.lookAt(facing.x, 0, facing.z);
  visual.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
  towerScene.add(visual);

  towerTurrets.push({
    x: slot.x, z: slot.z,
    range: TOWER_TURRET_RANGE,
    damage: TOWER_TURRET_DAMAGE,
    fireTimer: 0,
    visual
  });

  sfx.croquette();
  vibrate(15);
  updateTowerHud();
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

function applyTowerDogHit(dog, damage){
  dog.hp -= damage;
  redrawTowerHpBar(dog.hpSprite, Math.max(0, dog.hp/dog.maxHp));
  if(dog.hp <= 0){
    const i = towerDogs.indexOf(dog);
    if(i >= 0) resolveTowerDog(i, 'killed');
  }
}

function fireTowerTurret(tu, dog){
  sfx.hit();
  spawnTowerBurst(tu.x, 0.9, tu.z, 0xFFFFFF, 3);   // petit flash au départ du tir
  spawnTowerBurst(dog.x, 0.5, dog.z, 0xCCFF33, 5); // impact, même citron-vert que le tir du mode Bataille
  applyTowerDogHit(dog, tu.damage);
}

function updateTowerTurrets(){
  towerTurrets.forEach(tu=>{
    if(tu.fireTimer > 0){ tu.fireTimer--; return; }
    const target = findFurthestDogInRange(tu);
    if(!target) return;
    tu.fireTimer = TOWER_TURRET_FIRE_INTERVAL;
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
}
