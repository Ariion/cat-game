// Rendu du mode "Chatteau Fort". Contrairement au mode Bataille, où
// render3d.js synchronise les objets Three.js avec l'état de jeu à chaque
// frame (voir syncLeader() etc.), ici les tourelles/chiens/particules
// écrivent DIRECTEMENT leur position dans updateTower() (towerGameplay.js,
// le tick à pas fixe) — une simplification délibérée pour ce mode plus
// simple (caméra fixe, pas d'interpolation à faire), pas une incohérence.
// Il ne reste donc qu'à faire le rendu.
// La caméra suit le chat, mais PARTIELLEMENT (TOWER_CAM_FOLLOW) : le centrer
// ferait perdre la vue d'ensemble du chemin, qui est précisément ce qu'il faut
// lire dans un tower defense. On garde donc le plateau lisible tout en
// accompagnant le joueur.
let towerCamBaseX = null, towerCamBaseZ = null, towerCamLookX = 0;
function syncTowerCamera(){
  if(towerCamBaseX === null){ towerCamBaseX = towerCamera.position.x; towerCamBaseZ = towerCamera.position.z; }
  const tx = towerCamBaseX + hero.x * TOWER_CAM_FOLLOW;
  const tz = towerCamBaseZ + hero.z * TOWER_CAM_FOLLOW;
  towerCamera.position.x += (tx - towerCamera.position.x) * TOWER_CAM_LERP;
  towerCamera.position.z += (tz - towerCamera.position.z) * TOWER_CAM_LERP;
  const lx = hero.x * TOWER_CAM_FOLLOW;
  towerCamLookX += (lx - towerCamLookX) * TOWER_CAM_LERP;
  towerCamera.lookAt(towerCamLookX, 0.9, -5.5);
}

function renderTower(){
  if(!webglSupported) return;
  syncTowerCamera();
  // poussé à chaque frame plutôt qu'au seul changement de vague : garantit
  // le bon réglage même après un aller-retour par l'autre mode, qui remet
  // les réglages de bloom par défaut
  setBloomParams(towerBloomS, towerBloomT);
  renderWithBloom(towerScene, towerCamera, 'tower');
}
