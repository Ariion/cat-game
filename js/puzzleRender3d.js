// Rendu du mode "Palais des Chats" : caméra de poursuite + rendu.
// Les positions sont écrites par updatePuzzle() (pas fixe), comme dans les
// deux autres modes récents.
function syncPuzzleCamera(){
  // Suivi total en Z (c'est une course, la caméra DOIT rester au même endroit
  // par rapport au chat) mais PARTIEL en X : suivre latéralement à 100 %
  // recentrerait le chat en permanence et effacerait la sensation de changer
  // de voie, qui est le seul geste du jeu.
  const tz = puzzleHero.z + 9.0;
  puzzleCamera.position.z += (tz - puzzleCamera.position.z) * 0.22;
  const tx = puzzleHero.x * 0.42;
  puzzleCamera.position.x += (tx - puzzleCamera.position.x) * 0.1;
  puzzleCamera.lookAt(puzzleCamera.position.x * 0.6, 1.0, puzzleHero.z - 4.5);
  if(puzzleSun){
    // l'ombre porte doit suivre le joueur, sinon elle sort de la caméra
    // d'ombre au bout de quelques carrefours et tout le décor s'aplatit
    puzzleSun.position.set(puzzleHero.x - 7, 14, puzzleHero.z + 6);
    puzzleSun.target.position.set(puzzleHero.x, 0, puzzleHero.z - 3);
    puzzleSun.target.updateMatrixWorld();
  }
}

function renderPuzzle(){
  if(!webglSupported) return;
  syncPuzzleCamera();
  renderWithBloom(puzzleScene, puzzleCamera, 'puzzle');
}
