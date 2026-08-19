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
  hp = Math.max(0, hp - amount);
  spawnBurst(playerX, 0.5, PLAYER_Z, 0x8A2E3B);
  sfx.hurt();
  vibrate([25,15,25]);
  shakeTimer = 14;
  shakeIntensity = 0.18;
  updateHud();
  if(hp <= 0){ showLose(reason); }
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
    e.maxHp = e.hp = Math.round(ENEMY_HP_BASE + pickupsCleared*ENEMY_HP_PER_ITEM);
    e.x = PLAYER_X_MIN + Math.random()*(PLAYER_X_MAX - PLAYER_X_MIN);
    e.z = ENEMY_START_Z - Math.random()*10;
    e.speed = ENEMY_SPEED_BASE + pickupsCleared*ENEMY_SPEED_PER_ITEM;
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

function spawnBoss(){
  bossSpawned = true;
  boss = { x:0, z:PICKUP_START_Z, hp:BOSS_HP, maxHp:BOSS_HP, biteTimer:BOSS_BITE_INTERVAL_FRAMES };
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

function fireProjectile(){
  if(!webglSupported) return;
  attackPulse = 8;
  const mat = new THREE.MeshBasicMaterial({ color:0xFFD27A, fog:false });
  const mesh = new THREE.Mesh(projectileGeometry, mat);
  mesh.position.set(playerX, 0.55, PLAYER_Z - 0.35);
  scene.add(mesh);
  // un seul projectile, mais ses dégâts = la taille actuelle de la horde
  projectiles.push({ mesh, damage: hordeCount, life: 140 });
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

function applyBossHit(damage){
  sfx.hit();
  boss.hp -= damage;
  spawnBurst(boss.x, 0.9, boss.z, 0xFFD27A);
  updateHud();
  if(boss.hp <= 0){
    sfx.win();
    vibrate(60);
    if(webglSupported) bossGroup.visible = false;
    boss = null;
    showWin();
  }
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
  frame++;

  if(keyLeft) playerTargetX -= PLAYER_KEY_SPEED;
  if(keyRight) playerTargetX += PLAYER_KEY_SPEED;
  playerTargetX = Math.max(PLAYER_X_MIN, Math.min(PLAYER_X_MAX, playerTargetX));
  playerX += (playerTargetX - playerX) * PLAYER_MOVE_LERP;

  if(shakeTimer > 0){ shakeTimer--; shakeIntensity *= 0.88; }

  updateParticles();

  if(state === 'playing'){
    if(pickupsCleared < PICKUPS_TO_CLEAR){
      pickupTimer++;
      if(pickupTimer >= PICKUP_SPAWN_INTERVAL_FRAMES){
        pickupTimer = 0;
        spawnPickupEvent();
      }
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
        if(pickupsCleared >= PICKUPS_TO_CLEAR && !bossSpawned){
          spawnBoss();
        }
      }
    });
    const passed = pickups.filter(p=>p.z >= PICKUP_REMOVE_Z);
    passed.forEach(p=>{ if(p.visual){ scene.remove(p.visual); disposePickupVisual(p.visual); } });
    pickups = pickups.filter(p=>p.z < PICKUP_REMOVE_Z);

    if(!boss){
      enemySpawnTimer++;
      if(enemySpawnTimer >= ENEMY_SPAWN_INTERVAL_FRAMES){
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

function showWin(){
  state = 'win';
  document.getElementById('winText').textContent =
    `Ta horde de ${hordeCount} ${catWord()} a fait fuir le chien !`;
  document.getElementById('screenWin').classList.remove('hidden');
}

function showLose(reason){
  state = 'lose';
  const text = reason === 'boss'
    ? `${hordeCount} ${catWord()}, ce n'était pas assez pour repousser le chien du quartier.`
    : `Un chien t'a rattrapé — ta horde de ${hordeCount} ${catWord()} n'a pas survécu.`;
  document.getElementById('loseText').textContent = text;
  document.getElementById('screenLose').classList.remove('hidden');
}
