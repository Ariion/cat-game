// Logique de jeu : déplacement continu, portes, combat en temps réel
// (ennemis en vagues + tir automatique de la horde + boss final).
// Aucune phase bloquante : tout se passe en même temps pendant que le
// joueur avance et se déplace.
function spawnGate(){
  const goodLane = Math.random() < 0.5 ? 0 : 1;
  const goodKind = Math.random() < GATE_HEART_CHANCE ? 'heart' : 'croquette';
  const gate = { z: GATE_START_Z, goodLane, goodKind, resolved:false, visual:null };
  if(webglSupported){
    gate.visual = buildGateVisual(goodLane, goodKind);
    gate.visual.position.z = gate.z;
    scene.add(gate.visual);
  }
  gates.push(gate);
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
    Math.round(ENEMIES_PER_WAVE_BASE + gatesCleared*ENEMIES_PER_WAVE_PER_GATES)
  );
  let spawned = 0;
  for(let i=0; i<enemyPool.length && spawned<count; i++){
    const e = enemyPool[i];
    if(e.active) continue;
    e.active = true;
    e.maxHp = e.hp = Math.round(ENEMY_HP_BASE + gatesCleared*ENEMY_HP_PER_GATE);
    e.x = PLAYER_X_MIN + Math.random()*(PLAYER_X_MAX - PLAYER_X_MIN);
    e.z = ENEMY_START_Z - Math.random()*10;
    e.speed = ENEMY_SPEED_BASE + gatesCleared*ENEMY_SPEED_PER_WAVE;
    spawned++;
  }
}

function updateEnemies(){
  enemyPool.forEach(e=>{
    if(!e.active) return;
    e.z += e.speed;
    if(e.z >= PLAYER_Z - GATE_RESOLVE_RANGE){
      e.active = false;
      takeDamage(ENEMY_DAMAGE_TO_PLAYER, 'enemy');
    }
  });
}

// --- boss ---------------------------------------------------------------

function spawnBoss(){
  bossSpawned = true;
  boss = { x:0, z:GATE_START_Z, hp:BOSS_HP, maxHp:BOSS_HP, biteTimer:BOSS_BITE_INTERVAL_FRAMES };
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

// --- tir automatique de la horde -----------------------------------------

function pickAttackTarget(){
  let best = null, bestDist = Infinity;
  enemyPool.forEach((e,i)=>{
    if(!e.active) return;
    const d = Math.hypot(e.x-playerX, e.z-PLAYER_Z);
    if(d < bestDist){ bestDist = d; best = { kind:'enemy', idx:i }; }
  });
  if(boss){
    const d = Math.hypot(boss.x-playerX, boss.z-PLAYER_Z);
    if(d < bestDist){ bestDist = d; best = { kind:'boss' }; }
  }
  return (best && bestDist <= ATTACK_RANGE) ? best : null;
}

function targetPosition(t){
  if(t.kind === 'enemy'){
    const e = enemyPool[t.idx];
    return (e && e.active) ? { x:e.x, z:e.z } : null;
  }
  return boss ? { x:boss.x, z:boss.z } : null;
}

function fireProjectile(target){
  if(!webglSupported) return;
  attackPulse = 8;
  const mat = new THREE.MeshBasicMaterial({ color:0xFFD27A, fog:false });
  const mesh = new THREE.Mesh(projectileGeometry, mat);
  mesh.position.set(playerX, 0.55, PLAYER_Z - 0.35);
  scene.add(mesh);
  // un seul projectile, mais ses dégâts = la taille actuelle de la horde
  projectiles.push({ mesh, kind: target.kind, idx: target.idx, damage: hordeCount, life: 180 });
}

function applyProjectileDamage(p){
  sfx.hit();
  if(p.kind === 'enemy'){
    const e = enemyPool[p.idx];
    if(!e || !e.active) return;
    e.hp -= p.damage;
    spawnBurst(e.x, 0.5, e.z, 0xFFD27A);
    if(e.hp <= 0){
      e.active = false;
      spawnBurst(e.x, 0.6, e.z, 0xE0607A);
      sfx.enemyDown();
    }
  } else if(boss){
    boss.hp -= p.damage;
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
}

function updateProjectiles(){
  projectiles.forEach(p=>{
    const tp = targetPosition(p);
    if(!tp){ p.life = 0; return; }
    const dx = tp.x - p.mesh.position.x;
    const dz = tp.z - p.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    if(dist < 0.4){
      applyProjectileDamage(p);
      p.life = 0;
      return;
    }
    p.mesh.position.x += (dx/dist) * PROJECTILE_SPEED;
    p.mesh.position.z += (dz/dist) * PROJECTILE_SPEED;
    p.life--;
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
    const target = pickAttackTarget();
    if(target) fireProjectile(target);
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
    if(gatesCleared < GATES_TO_CLEAR){
      spawnTimer++;
      if(spawnTimer >= spawnInterval){
        spawnTimer = 0;
        spawnGate();
      }
    }
    gates.forEach(g=>{
      g.z += gateSpeed;
      if(!g.resolved && g.z > PLAYER_Z-GATE_RESOLVE_RANGE && g.z < PLAYER_Z+GATE_RESOLVE_RANGE){
        g.resolved = true;
        const playerSide = playerX < 0 ? 0 : 1;
        const good = playerSide === g.goodLane;
        if(good && g.goodKind === 'heart'){ growHp(HEART_GAIN); }
        else if(good){ growHorde(Math.round(hordeCount*0.4)+2); }
        else { growHorde(-Math.round(hordeCount*0.35)-1); }
        gatesCleared++;
        gateSpeed = Math.min(GATE_SPEED_MAX, GATE_SPEED_BASE + gatesCleared*GATE_SPEED_PER_GATE);
        updateHud();
        if(gatesCleared >= GATES_TO_CLEAR && !bossSpawned){
          spawnBoss();
        }
      }
    });
    const passed = gates.filter(g=>g.z >= GATE_REMOVE_Z);
    passed.forEach(g=>{ if(g.visual){ scene.remove(g.visual); disposeGateVisual(g.visual); } });
    gates = gates.filter(g=>g.z < GATE_REMOVE_Z);

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
