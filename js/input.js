// Contrôles : selon le mode actif (voir gameMode dans modes.js). En Bataille,
// déplacement continu (pas de couloirs binaires) — on glisse le doigt et le
// chat suit, ou on maintient les flèches du clavier. En Chatteau Fort, un
// tap pose une tourelle sur l'emplacement libre visé (pas de glissement).
let keyLeft = false;
let keyRight = false;
let dragging = false;

function setTargetFromClientX(clientX){
  const rect = canvas.getBoundingClientRect();
  const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  playerTargetX = PLAYER_X_MIN + t * (PLAYER_X_MAX - PLAYER_X_MIN);
}

canvas.addEventListener('pointerdown', (e)=>{
  if(gameMode === 'battle'){
    if(state !== 'playing') return;
    dragging = true;
    setTargetFromClientX(e.clientX);
  } else if(gameMode === 'tower'){
    if(towerState !== 'playing' || towerPaused) return;
    handleTowerTap(e.clientX, e.clientY);
  }
});
canvas.addEventListener('pointermove', (e)=>{
  if(gameMode !== 'battle' || !dragging) return;
  setTargetFromClientX(e.clientX);
});
window.addEventListener('pointerup', ()=>{ dragging = false; });
window.addEventListener('pointercancel', ()=>{ dragging = false; });

document.addEventListener('keydown', (e)=>{
  if(gameMode !== 'battle') return;
  if(e.key==='ArrowLeft' || e.key==='a') keyLeft = true;
  if(e.key==='ArrowRight' || e.key==='d') keyRight = true;
});
document.addEventListener('keyup', (e)=>{
  if(e.key==='ArrowLeft' || e.key==='a') keyLeft = false;
  if(e.key==='ArrowRight' || e.key==='d') keyRight = false;
});
