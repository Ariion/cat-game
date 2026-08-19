// Point d'entrée : initialise la scène 3D puis lance la boucle de jeu principale.
if(!webglSupported){
  const p = document.querySelector('#screenStart p');
  if(p) p.textContent = "Ton navigateur ne supporte pas la 3D (WebGL). Essaie un navigateur plus récent.";
  const btn = document.querySelector('#screenStart .btn');
  if(btn) btn.setAttribute('disabled', 'true');
}

initScene();
window.addEventListener('resize', onResize);

function loop(){
  update();
  render();
  requestAnimationFrame(loop);
}

loop();
