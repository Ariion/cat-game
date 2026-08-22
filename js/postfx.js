// Post-traitement partagé par les deux modes : un halo lumineux (bloom) sur
// ce qui est vraiment brillant — soleil couchant, projectiles néon, auras
// des tourelles, éclats d'impact. C'est l'effet qui fait passer une scène de
// "propre" à "cinématique", et c'est exactement celui d'Unreal Engine
// (UnrealBloomPass porte ce nom pour ça).
//
// UN SEUL EffectComposer pour les deux scènes : ses cibles de rendu font la
// taille de l'écran, en avoir deux doublerait la mémoire vidéo pour rien
// alors qu'une seule scène est visible à la fois. On échange donc la scène
// et la caméra du RenderPass avant chaque rendu (voir renderWithBloom()).
let composer = null, bloomRenderPass = null, bloomPass = null;
let postFXReady = false;

// Réglages par mode. Le SEUIL est le paramètre délicat ici : la palette du
// jeu est très claire (crème, vert tendre, sable), donc un seuil bas ferait
// baver TOUT l'écran en bouillie laiteuse au lieu de ne souligner que les
// sources lumineuses. Il reste volontairement haut.
const BLOOM_SETTINGS = {
  // PAS de bloom en mode Bataille — décision assumée, pas un oubli.
  // Sa palette est claire du sol au ciel, et le biome Neige est carrément
  // BLANC : la luminance y frôle 1.0 partout, donc aucun seuil < 1.0 ne peut
  // épargner le décor (essayé à 0.86 puis 0.975, l'écran partait en blanc
  // dans les deux cas — vérifié en capture). Et ce mode n'en a pas besoin :
  // son seul élément vraiment lumineux, le projectile néon, porte déjà son
  // propre halo additif (voir spawnOneProjectile() dans gameplay.js).
  // Le bloom reste donc réservé au Chatteau Fort, dont l'ambiance descend
  // jusqu'au crépuscule et s'y prête vraiment.
  battle: null,
  tower:  { strength: 0.62, radius: 0.42, threshold: 0.82 },
  // Scierie : pas de bloom non plus. Sa scène est en plein jour du début à la
  // fin (herbe claire, planches crème) et ne contient aucune vraie source
  // lumineuse — le bloom n'y aurait rien à souligner, juste du décor à laver.
  mill: null
};

function initPostFX(){
  if(!webglSupported || !renderer) return;
  // Si le bundle de post-traitement n'a pas chargé (hébergeur qui ne sert
  // pas le fichier, cache…), on ne bloque rien : le jeu rend simplement
  // sans bloom, comme avant (voir renderWithBloom()).
  if(typeof THREE.EffectComposer !== 'function' || typeof THREE.UnrealBloomPass !== 'function'){
    console.warn('Post-traitement indisponible, rendu sans bloom.');
    return;
  }
  const w = canvas.clientWidth || 400, h = canvas.clientHeight || 700;

  composer = new THREE.EffectComposer(renderer);
  composer.setSize(w, h);

  // scène/caméra provisoires : elles sont remplacées à chaque rendu
  bloomRenderPass = new THREE.RenderPass(scene, camera);
  composer.addPass(bloomRenderPass);

  // valeurs de départ prises sur un mode qui A du bloom : BLOOM_SETTINGS.battle
  // vaut null (mode sans bloom, voir plus haut) et lire .strength dessus
  // faisait planter toute l'initialisation du post-traitement
  const s = BLOOM_SETTINGS.tower;
  bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), s.strength, s.radius, s.threshold);
  composer.addPass(bloomPass);

  postFXReady = true;
}

let currentBloomMode = null;
function applyBloomSettings(mode){
  if(!postFXReady || mode === currentBloomMode) return;
  const s = BLOOM_SETTINGS[mode];
  if(!s) return;
  currentBloomMode = mode;
  bloomPass.strength = s.strength;
  bloomPass.radius = s.radius;
  bloomPass.threshold = s.threshold;
}

// Rendu final d'un mode. Repli automatique sur le rendu direct si le
// post-traitement n'est pas disponible — jamais bloquant.
function renderWithBloom(targetScene, targetCamera, mode){
  if(!postFXReady || !BLOOM_SETTINGS[mode]){
    renderer.render(targetScene, targetCamera);
    return;
  }
  applyBloomSettings(mode);
  bloomRenderPass.scene = targetScene;
  bloomRenderPass.camera = targetCamera;
  composer.render();
}

// Réglage explicite du bloom, utilisé par le mode Chatteau Fort dont la
// luminosité change énormément au fil des vagues (plein jour -> crépuscule).
// Un seuil FIXE ne peut pas convenir aux deux : réglé pour le crépuscule il
// noyait le plein jour dans une bouillie blanche (repéré en capture), réglé
// pour le plein jour il ne faisait plus rien au crépuscule.
function setBloomParams(strength, threshold){
  if(!postFXReady) return;
  bloomPass.strength = strength;
  bloomPass.threshold = threshold;
}

function onResizePostFX(){
  if(!postFXReady) return;
  const w = canvas.clientWidth || 400, h = canvas.clientHeight || 700;
  composer.setSize(w, h);
  bloomPass.setSize(w, h);
}
