// Logique de jeu : portes, croissance de la horde, boucle d'update, boss.
function spawnGate(){
  const goodLane = Math.random() < 0.5 ? 0 : 1;
  gates.push({ y: GATE_START_Y, goodLane, resolved:false });
}

function growHorde(amount){
  hordeCount = Math.max(1, hordeCount + amount);
  rebuildHordeVisual();
  spawnBurst(laneVisual, PLAYER_Y, amount >= 0 ? '#6B8F71' : '#5B8FBF');
}

function spawnBurst(x,y,color){
  for(let i=0;i<10;i++){
    particles.push({
      x, y,
      vx: (Math.random()-0.5)*4,
      vy: -Math.random()*4-1,
      life: 30,
      color
    });
  }
}

function update(){
  frame++;
  laneVisual += (LANES[lane]-laneVisual)*0.25;

  particles.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.life--; });
  particles = particles.filter(p=>p.life>0);

  if(state==='playing'){
    spawnTimer++;
    if(spawnTimer>=spawnInterval){
      spawnTimer=0;
      spawnGate();
    }
    gates.forEach(g=>{
      g.y += gateSpeed;
      if(!g.resolved && g.y > PLAYER_Y-10 && g.y < PLAYER_Y+10){
        g.resolved = true;
        const good = (lane === g.goodLane);
        if(good){ growHorde(Math.round(hordeCount*0.4)+2); }
        else { growHorde(-Math.round(hordeCount*0.35)-1); }
        gatesCleared++;
        gateSpeed = 2.6 + gatesCleared*0.12;
        updateHud();
        if(gatesCleared>=GATES_TO_CLEAR){
          triggerBoss();
        }
      }
    });
    gates = gates.filter(g=>g.y < H+60);
  }

  if(state==='boss' && boss){
    boss.y += boss.vy;
    if(boss.y > PLAYER_Y-20 && !boss.resolved){
      boss.resolved = true;
      if(hordeCount >= BOSS_THRESHOLD){ showWin(); }
      else { showLose(); }
    }
  }
}

function triggerBoss(){
  state = 'boss';
  document.getElementById('hint').classList.add('hidden');
  boss = { y: -80, vy: 1.6, resolved:false };
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
