// Logique de jeu : portes, croissance de la horde, boucle d'update,
// chiens intermédiaires + boss final.
// Crée/détruit les visuels 3D correspondants (le rendu par frame est dans render3d.js).
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

function update(){
  frame++;
  playerX += (LANES[lane]-playerX)*0.25;
  if(shakeTimer > 0){ shakeTimer--; shakeIntensity *= 0.88; }

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

  if(state==='playing'){
    spawnTimer++;
    if(spawnTimer>=spawnInterval){
      spawnTimer=0;
      spawnGate();
    }
    gates.forEach(g=>{
      g.z += gateSpeed;
      if(!g.resolved && g.z > PLAYER_Z-GATE_RESOLVE_RANGE && g.z < PLAYER_Z+GATE_RESOLVE_RANGE){
        g.resolved = true;
        const good = (lane === g.goodLane);
        if(good && g.goodKind === 'heart'){ growHp(HEART_GAIN); }
        else if(good){ growHorde(Math.round(hordeCount*0.4)+2); }
        else { growHorde(-Math.round(hordeCount*0.35)-1); }
        gatesCleared++;
        gateSpeed = 0.35 + gatesCleared*0.018;
        updateHud();

        const mobConfig = MOB_ENCOUNTERS.find(m => m.atGate === gatesCleared);
        if(mobConfig){
          triggerEncounter('mob', mobConfig);
        } else if(gatesCleared >= GATES_TO_CLEAR){
          triggerEncounter('boss', { threshold: BOSS_THRESHOLD, scale:1, vz:0.17, tint:0x8A7361 });
        }
      }
    });
    const passed = gates.filter(g=>g.z >= GATE_REMOVE_Z);
    passed.forEach(g=>{ if(g.visual){ scene.remove(g.visual); disposeGateVisual(g.visual); } });
    gates = gates.filter(g=>g.z < GATE_REMOVE_Z);
  }

  if(state==='encounter' && encounter){
    if(!encounter.resolved){
      encounter.z += encounter.vz;
      encounter.x += (playerX - encounter.x) * 0.025; // le chien vise la horde
      if(encounter.z > BOSS_BATTLE_Z){
        encounter.resolved = true;
        encounter.outcome = hordeCount >= encounter.threshold ? 'win' : 'lose';
        encounter.outcomeTimer = 45;
        if(encounter.outcome === 'win'){ sfx.win(); vibrate(60); }
        else { sfx.lose(); vibrate([40,30,40,30,80]); shakeTimer = 20; shakeIntensity = 0.22; }
      }
    } else {
      encounter.outcomeTimer--;
      if(encounter.outcome === 'lose'){
        encounter.z += 0.22; // le chien charge
      } else {
        encounter.z -= 0.1; // le chien recule, impressionné
        bossVisualScale = Math.max(encounter.baseScale*0.3, bossVisualScale - 0.02);
      }
      if(encounter.outcomeTimer <= 0){
        resolveEncounter();
      }
    }
  }
}

function triggerEncounter(kind, config){
  state = 'encounter';
  document.getElementById('hint').classList.add('hidden');
  encounter = {
    kind, x:0, z: GATE_START_Z, vz: config.vz,
    resolved:false, outcome:null, outcomeTimer:0,
    threshold: config.threshold, baseScale: config.scale, damage: config.damage
  };
  bossVisualScale = config.scale;
  if(webglSupported) bossMaterial.color.setHex(config.tint);
  sfx.bossAppear();
  vibrate(kind === 'boss' ? [30,20,30] : [20,15,20]);
  updateHud();
}

function resolveEncounter(){
  if(encounter.outcome === 'win'){
    if(encounter.kind === 'boss'){ showWin(); return; }
    // chien intermédiaire vaincu : petit bonus, la partie continue
    hordeCount = Math.max(1, hordeCount + 2);
    rebuildHordeVisual();
  } else {
    // le chien est passé : il entame la vie, pas le nombre de chats
    const dmg = encounter.kind === 'boss' ? hpMax : encounter.damage;
    hp = Math.max(0, hp - dmg);
    updateHud();
    if(hp <= 0){
      showLose(encounter.kind === 'boss' ? 'boss' : 'mob');
      return;
    }
  }
  encounter = null;
  state = 'playing';
  document.getElementById('hint').classList.remove('hidden');
  spawnTimer = 0;
  updateHud();
}

function showWin(){
  state = 'win';
  document.getElementById('winText').textContent =
    `Ta horde de ${hordeCount} chats a fait fuir le chien !`;
  document.getElementById('screenWin').classList.remove('hidden');
}

function showLose(reason){
  state = 'lose';
  document.getElementById('loseText').textContent = reason === 'mob'
    ? `Un chien t'a mordu au passage — ta horde de ${hordeCount} chats n'a pas survécu.`
    : `${hordeCount} chats, ce n'était pas assez pour repousser le chien du quartier.`;
  document.getElementById('screenLose').classList.remove('hidden');
}
