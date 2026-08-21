// Rendu du mode "Chatteau Fort". Contrairement au mode Bataille, où
// render3d.js synchronise les objets Three.js avec l'état de jeu à chaque
// frame (voir syncLeader() etc.), ici les tourelles/chiens/particules
// écrivent DIRECTEMENT leur position dans updateTower() (towerGameplay.js,
// le tick à pas fixe) — une simplification délibérée pour ce mode plus
// simple (caméra fixe, pas d'interpolation à faire), pas une incohérence.
// Il ne reste donc qu'à faire le rendu.
function renderTower(){
  if(!webglSupported) return;
  // poussé à chaque frame plutôt qu'au seul changement de vague : garantit
  // le bon réglage même après un aller-retour par l'autre mode, qui remet
  // les réglages de bloom par défaut
  setBloomParams(towerBloomS, towerBloomT);
  renderWithBloom(towerScene, towerCamera, 'tower');
}
