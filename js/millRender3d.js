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
const MILL_CAM_FOLLOW = 0.12;
const MILL_CAM_LERP = 0.07;
let millCamBaseX = null, millCamLookX = 0;

function syncMillCamera(){
  if(millCamBaseX === null) millCamBaseX = millCamera.position.x;
  const tx = millCamBaseX + millHero.x * MILL_CAM_FOLLOW;
  millCamera.position.x += (tx - millCamera.position.x) * MILL_CAM_LERP;
  const lx = millHero.x * MILL_CAM_FOLLOW;
  millCamLookX += (lx - millCamLookX) * MILL_CAM_LERP;
  millCamera.lookAt(millCamLookX, 0.8, -1.9);
}

function renderMill(){
  if(!webglSupported) return;
  syncMillCamera();
  renderWithBloom(millScene, millCamera, 'mill');
}
