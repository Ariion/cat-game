// Rendu du mode "Chatteau Fort". Contrairement au mode Bataille, où
// render3d.js synchronise les objets Three.js avec l'état de jeu à chaque
// frame (voir syncLeader() etc.), ici les tourelles/chiens/particules
// écrivent DIRECTEMENT leur position dans updateTower() (towerGameplay.js,
// le tick à pas fixe) — une simplification délibérée pour ce mode plus
// simple (caméra fixe, pas d'interpolation à faire), pas une incohérence.
// Il ne reste donc qu'à faire le rendu.
function renderTower(){
  if(!webglSupported) return;
  renderer.render(towerScene, towerCamera);
}
