// Contrôles : flèches clavier + tap/clic gauche-droite sur le canvas.
function moveLane(dir){
  if(state!=='playing' && state!=='boss') return;
  lane = dir < 0 ? 0 : 1;
}

document.addEventListener('keydown', (e)=>{
  if(e.key==='ArrowLeft' || e.key==='a') moveLane(-1);
  if(e.key==='ArrowRight' || e.key==='d') moveLane(1);
});

canvas.addEventListener('pointerdown', (e)=>{
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  moveLane(x < 0.5 ? -1 : 1);
});
