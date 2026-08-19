// Point d'entrée : boucle de jeu principale.
function loop(){
  update();
  render();
  requestAnimationFrame(loop);
}

loop();
