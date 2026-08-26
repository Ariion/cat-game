// Rendu du mode "Chat-Scierie". Comme towerRender3d.js : les positions sont
// déjà écrites par updateMill() (millGameplay.js), il ne reste que la caméra
// et le rendu.
//
// La caméra suit le chat en X seulement, et partiellement. La chaîne de
// production est un objet FIXE que le joueur doit garder en tête (clairière
// au fond, tapis au milieu, dalles devant) : la recentrer sur le chat à
// chaque pas ferait glisser tout le décor sous ses pieds. En revanche le
// plateau est plus large que haut à l'écran, donc un accompagnement latéral
// évite que le chat ne colle au bord en allant chercher un rondin.
// Suivi latéral un peu plus marqué qu'avant : le site fait désormais huit
// unités de large et treize de profondeur, le chat s'éloigne donc bien plus
// du centre qu'à l'époque où tout tenait autour du tapis.
const MILL_CAM_FOLLOW = 0.16;
const MILL_CAM_LERP = 0.07;
let millCamBaseX = null, millCamLookX = 0;

function syncMillCamera(){
  if(millCamBaseX === null) millCamBaseX = millCamera.position.x;
  const tx = millCamBaseX + millHero.x * MILL_CAM_FOLLOW;
  millCamera.position.x += (tx - millCamera.position.x) * MILL_CAM_LERP;
  const lx = millHero.x * MILL_CAM_FOLLOW;
  millCamLookX += (lx - millCamLookX) * MILL_CAM_LERP;
  // MÊME point de visée qu'à la construction de la scène (initMillScene).
  // Ils avaient divergé : la caméra était réglée pour le site agrandi mais
  // cette ligne, exécutée à chaque frame, la ramenait sur l'ancien cadrage —
  // le quai et le dépôt tombaient sous le bas de l'écran.
  millCamera.lookAt(millCamLookX, 0.8, -0.6);
}

function renderMill(){
  if(!webglSupported) return;
  syncMillCamera();
  renderWithBloom(millScene, millCamera, 'mill');
}
