// Logique de jeu : portes, croissance de la horde, boucle d'update, boss.
// Crée/détruit les visuels 3D correspondants (le rendu par frame est dans render3d.js).
function spawnGate(){
  const goodLane = Math.random() < 0.5 ? 0 : 1;
  const gate = { z: GATE_START_Z, goodLane, resolved:false, visual:null };
  if(webglSupported){
    gate.visual = buildGateVisual(goodLane);
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
        if(good){ growHorde(Math.round(hordeCount*0.4)+2); }
        else { growHorde(-Math.round(hordeCount*0.35)-1); }
        gatesCleared++;
        gateSpeed = 0.35 + gatesCleared*0.018;
        updateHud();
        if(gatesCleared>=GATES_TO_CLEAR){
          triggerBoss();
        }
      }
    });
    const passed = gates.filter(g=>g.z >= GATE_REMOVE_Z);
    passed.forEach(g=>{ if(g.visual){ scene.remove(g.visual); disposeGateVisual(g.visual); } });
    gates = gates.filter(g=>g.z < GATE_REMOVE_Z);
  }

  if(state==='boss' && boss){
    if(!boss.resolved){
      boss.z += boss.vz;
      boss.x += (playerX - boss.x) * 0.025; // le chien vise la horde
      if(boss.z > BOSS_BATTLE_Z){
        boss.resolved = true;
        boss.outcome = hordeCount >= BOSS_THRESHOLD ? 'win' : 'lose';
        boss.outcomeTimer = 45;
        if(boss.outcome === 'win'){ sfx.win(); vibrate(60); }
        else { sfx.lose(); vibrate([40,30,40,30,80]); shakeTimer = 20; shakeIntensity = 0.22; }
      }
    } else {
      boss.outcomeTimer--;
      if(boss.outcome === 'lose'){
        boss.z += 0.22; // le chien charge
      } else {
        boss.z -= 0.1; // le chien recule, impressionné
        bossVisualScale = Math.max(0.35, bossVisualScale - 0.02);
      }
      if(boss.outcomeTimer <= 0){
        if(boss.outcome === 'win'){ showWin(); } else { showLose(); }
      }
    }
  }
}

function triggerBoss(){
  state = 'boss';
  document.getElementById('hint').classList.add('hidden');
  boss = { x:0, z: GATE_START_Z, vz: 0.17, resolved:false, outcome:null, outcomeTimer:0 };
  bossVisualScale = 1;
  sfx.bossAppear();
  vibrate([30,20,30]);
  updateHud();
}

function showWin(){
  state = 'win';
  document.getElementById('winText').textContent =
    `Ta horde de ${hordeCount} chats a fait fuir le chien !`;
  document.getElementById('screenWin').classList.remove('hidden');
}

function showLose(){
  state = 'lose';
  document.getElementById('loseText').textContent =
    `${hordeCount} chats, ce n'était pas assez face au chien.`;
  document.getElementById('screenLose').classList.remove('hidden');
}
