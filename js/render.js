// Tout le dessin canvas : fond, portes, chats, boss, particules.
function drawBackground(){
  ctx.fillStyle = '#FBF3E4';
  ctx.fillRect(0,0,W,H);
  ctx.fillStyle = '#F3E6CE';
  for(let i=0;i<3;i++){
    ctx.beginPath();
    const y = ((frame*1.5 + i*260) % (H+200)) - 100;
    ctx.ellipse(70 + i*140, y, 60, 26, 0, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(107,95,79,0.15)';
  ctx.lineWidth = 2;
  ctx.setLineDash([14,18]);
  ctx.beginPath();
  ctx.moveTo(LANES[0]+70,0); ctx.lineTo(LANES[0]+70,H);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawGateShape(x,y,good){
  ctx.save();
  ctx.translate(x,y);
  ctx.beginPath();
  ctx.arc(0,0,34,Math.PI,0);
  ctx.lineWidth = 6;
  ctx.strokeStyle = good ? '#6B8F71' : '#5B8FBF';
  ctx.stroke();

  if(good){
    ctx.fillStyle = '#E3A857';
    for(const off of [[-8,4],[8,4],[0,-6]]){
      ctx.beginPath();
      ctx.ellipse(off[0], off[1], 9, 7, 0.3, 0, Math.PI*2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = '#5B8FBF';
    ctx.beginPath();
    ctx.moveTo(0,-14);
    ctx.quadraticCurveTo(14,6,0,16);
    ctx.quadraticCurveTo(-14,6,0,-14);
    ctx.fill();
  }
  ctx.restore();
}

function drawCat(x,y,scale,tone){
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(scale,scale);
  ctx.fillStyle = tone;
  // queue
  ctx.beginPath();
  ctx.moveTo(14,4);
  ctx.quadraticCurveTo(30,-6,24,-20);
  ctx.lineWidth = 6;
  ctx.strokeStyle = tone;
  ctx.lineCap='round';
  ctx.stroke();
  // corps
  ctx.beginPath();
  ctx.ellipse(0,6,15,12,0,0,Math.PI*2);
  ctx.fill();
  // tête
  ctx.beginPath();
  ctx.arc(0,-10,11,0,Math.PI*2);
  ctx.fill();
  // oreilles
  ctx.beginPath();
  ctx.moveTo(-9,-16); ctx.lineTo(-13,-27); ctx.lineTo(-2,-19); ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(9,-16); ctx.lineTo(13,-27); ctx.lineTo(2,-19); ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPlayerAndHorde(){
  cats.forEach((c,i)=>{
    if(i===0) return;
    const wob = Math.sin((frame+c.bob)*0.05)*4;
    const x = laneVisual + Math.cos(c.angle + frame*0.01) * c.radius*0.5;
    const y = PLAYER_Y + Math.sin(c.angle + frame*0.013) * (c.radius*0.35) + 30 + wob;
    drawCat(x,y,c.size*0.8,'#D9A066');
  });
  drawCat(laneVisual, PLAYER_Y, 1.15, '#C97B4F');
}

function drawBoss(){
  if(!boss) return;
  ctx.save();
  ctx.translate(W/2, boss.y);
  ctx.fillStyle = '#8A7361';
  ctx.beginPath();
  ctx.ellipse(0,0,50,34,0,0,Math.PI*2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0,-30,26,0,Math.PI*2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-24,-46); ctx.lineTo(-32,-64); ctx.lineTo(-10,-48); ctx.closePath();
  ctx.moveTo(24,-46); ctx.lineTo(32,-64); ctx.lineTo(10,-48); ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawParticles(){
  particles.forEach(p=>{
    ctx.globalAlpha = Math.max(p.life/30,0);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x,p.y,4,0,Math.PI*2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function render(){
  drawBackground();
  gates.forEach(g=>{
    drawGateShape(LANES[0], g.y, g.goodLane===0);
    drawGateShape(LANES[1], g.y, g.goodLane===1);
  });
  drawPlayerAndHorde();
  drawBoss();
  drawParticles();
}
