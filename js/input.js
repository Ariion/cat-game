// Contrôles : déplacement continu (pas de couloirs binaires) — on glisse le
// doigt et le chat suit, ou on maintient les flèches du clavier.
let keyLeft = false;
let keyRight = false;
let dragging = false;

function setTargetFromClientX(clientX){
  const rect = canvas.getBoundingClientRect();
  const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  playerTargetX = PLAYER_X_MIN + t * (PLAYER_X_MAX - PLAYER_X_MIN);
}

canvas.addEventListener('pointerdown', (e)=>{
  if(state !== 'playing') return;
  dragging = true;
  setTargetFromClientX(e.clientX);
});
canvas.addEventListener('pointermove', (e)=>{
  if(!dragging) return;
  setTargetFromClientX(e.clientX);
});
window.addEventListener('pointerup', ()=>{ dragging = false; });
window.addEventListener('pointercancel', ()=>{ dragging = false; });

document.addEventListener('keydown', (e)=>{
  if(e.key==='ArrowLeft' || e.key==='a') keyLeft = true;
  if(e.key==='ArrowRight' || e.key==='d') keyRight = true;
});
document.addEventListener('keyup', (e)=>{
  if(e.key==='ArrowLeft' || e.key==='a') keyLeft = false;
  if(e.key==='ArrowRight' || e.key==='d') keyRight = false;
});
