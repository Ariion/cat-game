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
    boss.z += boss.vz;
    if(boss.z > BOSS_BATTLE_Z && !boss.resolved){
      boss.resolved = true;
      if(hordeCount >= BOSS_THRESHOLD){ showWin(); }
      else { showLose(); }
    }
  }
}

function triggerBoss(){
  state = 'boss';
  document.getElementById('hint').classList.add('hidden');
  boss = { z: GATE_START_Z, vz: 0.17, resolved:false };
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
