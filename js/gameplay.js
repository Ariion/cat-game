// Logique de jeu : déplacement continu, bonus/malus flottants (avec parfois
// un dilemme à 2 objets), combat en temps réel (vagues d'ennemis + tir
// automatique en ligne droite, sans visée) + boss final.
// Aucune phase bloquante : tout se passe en même temps pendant que le
// joueur avance et se déplace.

// --- bonus / malus flottants ----------------------------------------------

function pickPickupKindAndAmount(){
  if(Math.random() < PICKUP_WATER_CHANCE){
    const amount = -(WATER_BASE + Math.round(hordeCount*WATER_RATIO) + Math.floor(Math.random()*3));
    return { kind:'water', amount };
  }
  if(Math.random() < PICKUP_HEART_CHANCE){
    const amount = HEART_MIN + Math.floor(Math.random()*(HEART_MAX-HEART_MIN+1));
    return { kind:'heart', amount };
  }
  const amount = CROQUETTE_BASE + Math.round(hordeCount*CROQUETTE_RATIO) + Math.floor(Math.random()*3);
  return { kind:'croquette', amount };
}

function spawnPickupAt(x, kind, amount){
  if(kind === undefined){
    const picked = pickPickupKindAndAmount();
    kind = picked.kind; amount = picked.amount;
  }
  const pickup = { kind, amount, x, z: PICKUP_START_Z, resolved:false, visual:null };
  if(webglSupported){
    pickup.visual = buildPickupVisual(kind, amount);
    pickup.visual.position.set(x, 0.9, pickup.z);
    scene.add(pickup.visual);
  }
  pickups.push(pickup);
}

function spawnDilemma(){
  // deux objets rapprochés, difficile de prendre/éviter les deux — un vrai
  // choix ("mieux vaut perdre 1 que 5"). Le plus souvent 2 malus de tailles
  // très différentes, parfois 2 bonus (choisir le meilleur).
  const bothMalus = Math.random() < 0.65;
  const gap = 1.1 + Math.random()*0.7;
  const center = (Math.random()-0.5) * 1.5;
  const xA = center - gap/2;
  const xB = center + gap/2;
  if(bothMalus){
    const small = -(WATER_BASE + Math.floor(Math.random()*2));
    const big = -(WATER_BASE + Math.round(hordeCount*WATER_RATIO) + 3 + Math.floor(Math.random()*3));
    spawnPickupAt(xA, 'water', small);
    spawnPickupAt(xB, 'water', big);
  } else {
    const small = CROQUETTE_BASE + Math.floor(Math.random()*2);
    const big = CROQUETTE_BASE + Math.round(hordeCount*CROQUETTE_RATIO) + 4 + Math.floor(Math.random()*3);
    spawnPickupAt(xA, 'croquette', small);
    spawnPickupAt(xB, 'croquette', big);
  }
}

function spawnPickupEvent(){
  if(Math.random() < DILEMMA_CHANCE){
    spawnDilemma();
  } else {
    spawnPickupAt(PLAYER_X_MIN + Math.random()*(PLAYER_X_MAX-PLAYER_X_MIN));
  }
}

function growHorde(amount){
  hordeCount = Math.max(1, hordeCount + amount);
  rebuildHordeVisual();
  spawnBurst(playerX, 0.6, PLAYER_Z, amount >= 0 ? 0x6B8F71 : 0x5B8FBF);
  if(amount >= 0){
    sfx.croquette();
    vibrate(15);
  } else {
    sfx.water();
    vibrate([20,15,20]);
    shakeTimer = 12;
    shakeIntensity = 0.16;
  }
}

function growHp(amount){
  hp = Math.max(0, Math.min(hpMax, hp + amount));
  spawnBurst(playerX, 0.6, PLAYER_Z, 0xE0607A);
  sfx.heart();
  vibrate(15);
  updateHud();
}

function takeDamage(amount, reason){
  if(invulnTimer > 0) return; // grâce en cours (juste touché, ou reprise sur pub)
  hp = Math.max(0, hp - amount);
  spawnBurst(playerX, 0.5, PLAYER_Z, 0x8A2E3B);
  sfx.hurt();
  vibrate([25,15,25]);
  shakeTimer = 14;
  shakeIntensity = 0.18;
  updateHud();
  if(hp <= 0){ showLose(reason); return; }
  // brève invulnérabilité après CHAQUE coup, sinon plusieurs ennemis qui
  // arrivent groupés peuvent tuer d'un coup sans la moindre chance de réagir
  invulnTimer = HIT_INVULN_FRAMES;
}

function spawnBurst(x,y,z,color){
  if(!webglSupported) return;
  for(let i=0;i<10;i++){
    const mat = new THREE.MeshBasicMaterial({ color, transparent:true, opacity:1 });
    const mesh = new THREE.Mesh(particleGeometry, mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    particles.push({
      mesh,
      vx: (Math.random()-0.5)*0.12,
      vy: Math.random()*0.11 + 0.03,
      vz: (Math.random()-0.5)*0.09,
      life: 30
    });
  }
}

function updateParticles(){
  particles.forEach(p=>{
    p.mesh.position.x += p.vx;
    p.mesh.position.y += p.vy;
    p.mesh.position.z += p.vz;
    p.vy -= 0.004; // légère gravité
    p.life--;
    p.mesh.material.opacity = Math.max(p.life/30, 0);
  });
  const expired = particles.filter(p=>p.life<=0);
  expired.forEach(p=>{
    scene.remove(p.mesh);
    p.mesh.material.dispose();
  });
  particles = particles.filter(p=>p.life>0);
}

// --- ennemis en vagues -------------------------------------------------

// Démarre lent et se resserre avec la progression — sans ça, la difficulté
// est déjà à son maximum dès la 1ère seconde et la partie est injouable
// avant même que la horde ait eu le temps de grossir un minimum.
function enemySpawnInterval(){
  const t = Math.min(1, pickupsCleared / ENEMY_SPAWN_INTERVAL_RAMP_ITEMS);
  return Math.round(ENEMY_SPAWN_INTERVAL_START + (ENEMY_SPAWN_INTERVAL_MIN - ENEMY_SPAWN_INTERVAL_START) * t);
}

// PV = un nombre de tirs à encaisser au régime de dégâts ACTUEL du joueur,
// pas une valeur fixe — voir le commentaire dans config.js.
function shotsToKillEnemy(){
  return Math.min(SHOTS_TO_KILL_ENEMY_CAP, SHOTS_TO_KILL_ENEMY_BASE + pickupsCleared*SHOTS_TO_KILL_ENEMY_GROWTH);
}

function spawnWave(){
  const count = Math.min(
    ENEMIES_PER_WAVE_MAX,
    Math.round(ENEMIES_PER_WAVE_BASE + pickupsCleared*ENEMIES_PER_WAVE_PER_ITEM)
  );
  let spawned = 0;
  for(let i=0; i<enemyPool.length && spawned<count; i++){
    const e = enemyPool[i];
    if(e.active) continue;
    e.active = true;
    e.maxHp = e.hp = Math.max(1, Math.round(attackDamage() * shotsToKillEnemy()));
    e.x = PLAYER_X_MIN + Math.random()*(PLAYER_X_MAX - PLAYER_X_MIN);
    e.z = ENEMY_START_Z - Math.random()*10;
    e.speed = Math.min(ENEMY_SPEED_CAP, ENEMY_SPEED_BASE + pickupsCleared*ENEMY_SPEED_PER_ITEM);
    spawned++;
  }
}

function updateEnemies(){
  enemyPool.forEach(e=>{
    if(!e.active) return;
    e.z += e.speed;
    e.x += (playerX - e.x) * ENEMY_DRIFT_SPEED; // dérive lente : ils vous traquent
    e.x = Math.max(PLAYER_X_MIN, Math.min(PLAYER_X_MAX, e.x));
    if(e.z >= PLAYER_Z - PICKUP_RESOLVE_RANGE){
      e.active = false;
      takeDamage(ENEMY_DAMAGE_TO_PLAYER, 'enemy');
    }
  });
}

// --- boss ---------------------------------------------------------------

function shotsToKillBoss(){
  return Math.min(SHOTS_TO_KILL_BOSS_CAP, SHOTS_TO_KILL_BOSS_BASE + bossesDefeated*SHOTS_TO_KILL_BOSS_GROWTH);
}

function spawnBoss(){
  const maxHp = Math.max(1, Math.round(attackDamage() * shotsToKillBoss()));
  boss = { x:0, z:PICKUP_START_Z, hp:maxHp, maxHp, biteTimer:BOSS_BITE_INTERVAL_FRAMES };
  if(webglSupported){ bossGroup.visible = true; bossGroup.position.z = boss.z; }
  sfx.bossAppear();
  vibrate([30,20,30]);
  updateHud();
}

function updateBoss(){
  if(!boss) return;
  if(boss.z < BOSS_BATTLE_Z){
    boss.z += BOSS_SPEED;
    boss.x += (playerX - boss.x) * 0.02;
  } else {
    boss.biteTimer--;
    if(boss.biteTimer <= 0){
      boss.biteTimer = BOSS_BITE_INTERVAL_FRAMES;
      takeDamage(BOSS_BITE_DAMAGE, 'boss');
    }
  }
}

// --- tir automatique de la horde, en ligne droite (sans visée) -----------

// Dégâts adoucis : hordeCount^0.62 plutôt que hordeCount brut, sinon une
// horde en croissance exponentielle one-shot tout (voir commentaire dans
// config.js). La horde reste plus forte en grossissant, juste pas de façon
// démesurée.
function attackDamage(){
  return Math.max(1, Math.round(Math.pow(hordeCount, ATTACK_POWER_EXPONENT) * ATTACK_POWER_FACTOR));
}

function fireProjectile(){
  if(!webglSupported) return;
  attackPulse = 8;
  const mat = new THREE.MeshBasicMaterial({ color:0xFFD27A, fog:false });
  const mesh = new THREE.Mesh(projectileGeometry, mat);
  mesh.position.set(playerX, 0.55, PLAYER_Z - 0.35);
  scene.add(mesh);
  projectiles.push({ mesh, damage: attackDamage(), life: 140 });
}

function applyEnemyHit(i, damage){
  sfx.hit();
  const e = enemyPool[i];
  e.hp -= damage;
  spawnBurst(e.x, 0.5, e.z, 0xFFD27A);
  if(e.hp <= 0){
    e.active = false;
    spawnBurst(e.x, 0.6, e.z, 0xE0607A);
    sfx.enemyDown();
  }
}

function defeatBoss(){
  bossesDefeated++;
  if(webglSupported) bossGroup.visible = false;
  boss = null;
  // le boss vaincu offre une récompense et la partie continue — jeu infini,
  // il n'y a pas d'écran de victoire qui met fin à la partie
  growHorde(BOSS_REWARD_BASE + bossesDefeated*BOSS_REWARD_GROWTH);
  sfx.win();
  vibrate(60);
  updateHud();
}

function applyBossHit(damage){
  sfx.hit();
  boss.hp -= damage;
  spawnBurst(boss.x, 0.9, boss.z, 0xFFD27A);
  updateHud();
  if(boss.hp <= 0){ defeatBoss(); }
}

function updateProjectiles(){
  projectiles.forEach(p=>{
    if(p.life <= 0) return;
    p.mesh.position.z -= PROJECTILE_SPEED;
    p.life--;
    const px = p.mesh.position.x, pz = p.mesh.position.z;

    for(let i=0;i<enemyPool.length;i++){
      const e = enemyPool[i];
      if(!e.active) continue;
      if(Math.abs(e.x-px) < PROJECTILE_HIT_RADIUS_X && Math.abs(e.z-pz) < 0.5){
        applyEnemyHit(i, p.damage);
        p.life = 0;
        break;
      }
    }
    if(p.life > 0 && boss){
      if(Math.abs(boss.x-px) < PROJECTILE_HIT_RADIUS_X+0.3 && Math.abs(boss.z-pz) < 0.6){
        applyBossHit(p.damage);
        p.life = 0;
      }
    }
  });
  const dead = projectiles.filter(p=>p.life<=0);
  dead.forEach(p=>{ scene.remove(p.mesh); p.mesh.material.dispose(); });
  projectiles = projectiles.filter(p=>p.life>0);
}

function updateAttacks(){
  if(attackPulse > 0) attackPulse--;
  attackTimer++;
  if(attackTimer >= ATTACK_INTERVAL_FRAMES){
    attackTimer = 0;
    fireProjectile();
  }
  updateProjectiles();
}

// --- boucle principale ----------------------------------------------------

function update(){
  if(paused) return;
  frame++;

  if(keyLeft) playerTargetX -= PLAYER_KEY_SPEED;
  if(keyRight) playerTargetX += PLAYER_KEY_SPEED;
  playerTargetX = Math.max(PLAYER_X_MIN, Math.min(PLAYER_X_MAX, playerTargetX));
  playerX += (playerTargetX - playerX) * PLAYER_MOVE_LERP;

  if(shakeTimer > 0){ shakeTimer--; shakeIntensity *= 0.88; }
  if(invulnTimer > 0) invulnTimer--;

  updateParticles();

  if(state === 'playing'){
    runTime += 1/60; // le pas de temps fixe (main.js) garantit ~60 ticks/s réels

    pickupTimer++;
    if(pickupTimer >= PICKUP_SPAWN_INTERVAL_FRAMES){
      pickupTimer = 0;
      spawnPickupEvent();
    }
    pickups.forEach(p=>{
      p.z += pickupSpeed;
      if(!p.resolved && p.z > PLAYER_Z-PICKUP_RESOLVE_RANGE && p.z < PLAYER_Z+PICKUP_RESOLVE_RANGE){
        p.resolved = true;
        const hit = Math.abs(playerX - p.x) < PICKUP_RADIUS;
        if(hit){
          if(p.kind === 'heart'){ growHp(p.amount); }
          else { growHorde(p.amount); }
        }
        pickupsCleared++;
        pickupSpeed = Math.min(PICKUP_SPEED_MAX, PICKUP_SPEED_BASE + pickupsCleared*PICKUP_SPEED_PER_ITEM);
        updateHud();
        if(pickupsCleared % BOSS_INTERVAL_PICKUPS === 0 && !boss){
          spawnBoss();
        }
      }
    });
    const passed = pickups.filter(p=>p.z >= PICKUP_REMOVE_Z);
    passed.forEach(p=>{ if(p.visual){ scene.remove(p.visual); disposePickupVisual(p.visual); } });
    pickups = pickups.filter(p=>p.z < PICKUP_REMOVE_Z);

    if(!boss){
      enemySpawnTimer++;
      if(enemySpawnTimer >= enemySpawnInterval()){
        enemySpawnTimer = 0;
        spawnWave();
      }
    }
    updateEnemies();
    updateBoss();
    updateAttacks();
  }
}

function catWord(){
  return hordeCount > 1 ? 'chats' : 'chat';
}

function bossWord(){
  return bossesDefeated > 1 ? 'chiens du quartier vaincus' : 'chien du quartier vaincu';
}

function showLose(reason){
  state = 'lose';
  const cause = reason === 'boss' ? "Le chien du quartier t'a eu" : "Un chien t'a rattrapé";
  document.getElementById('loseText').textContent =
    `${cause} — ${hordeCount} ${catWord()}, ${formatTime(runTime)} de survie, ${bossesDefeated} ${bossWord()}.`;
  document.getElementById('screenLose').classList.remove('hidden');
  document.getElementById('pauseBtn').classList.add('hidden');
  updateHud(); // met à jour le record de temps si dépassé, avant l'affichage du bouton Record
}

function pauseGame(){
  if(state !== 'playing' || paused) return;
  paused = true;
  document.getElementById('pauseStats').textContent =
    `${hordeCount} ${catWord()} · ${formatTime(runTime)}`;
  document.getElementById('screenPause').classList.remove('hidden');
}

function resumeGame(){
  paused = false;
  document.getElementById('screenPause').classList.add('hidden');
}

// Reprise sur pub : flux complet (écran de mort -> "pub" -> reprise sur
// place), mais la pub elle-même est simulée (délai fixe). Pour une vraie
// pub récompensée, il faut empaqueter le jeu en app (Capacitor/Cordova) et
// intégrer un SDK (AdMob, Unity Ads...) — c'est ICI qu'il faudrait appeler
// le SDK, puis n'appeler continueRun() que si la pub a bien été regardée
// jusqu'au bout (callback "reward").
function watchAdAndContinue(){
  document.getElementById('screenLose').classList.add('hidden');
  document.getElementById('screenAd').classList.remove('hidden');
  setTimeout(()=>{
    document.getElementById('screenAd').classList.add('hidden');
    continueRun();
  }, AD_SIMULATION_MS);
}

function continueRun(){
  hp = CONTINUE_HP_RESTORE;
  invulnTimer = CONTINUE_INVULN_FRAMES;
  state = 'playing';
  document.getElementById('hint').classList.remove('hidden');
  document.getElementById('pauseBtn').classList.remove('hidden');
  updateHud();
}
