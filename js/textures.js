// ===========================================================================
// Textures et ombres de contact partagées par les quatre jeux
// ===========================================================================
// Deux constats tirés d'un examen en capture des quatre modes :
//
// 1. LES SOLS ÉTAIENT DES APLATS. La plus grande surface de l'écran, dans
//    trois jeux sur quatre, était un MeshStandardMaterial avec une couleur et
//    rien d'autre. Aucune texture, donc aucune profondeur, aucune échelle,
//    aucun mouvement quand la caméra bouge. C'est ce qui donnait cette
//    impression de maquette en carton.
// 2. RIEN NE TOUCHAIT LE SOL. Les ombres portées du soleil existent, mais
//    elles sont trop douces et trop claires pour ancrer un objet : arbres,
//    coffres, rondins et chats semblaient flotter à un centimètre du sol.
//
// Tout est procédural (canvas) : aucun fichier à charger, aucune latence, et
// les motifs se règlent en une valeur au lieu d'un aller-retour dans un
// logiciel de dessin.

// --- herbe -----------------------------------------------------------------
// Trois couches, dans cet ordre : un fond uni, un semis de taches (c'est lui
// qui casse l'aplat), puis des touffes dessinées au trait (c'est elle qui
// donne l'échelle — sans elles on ne sait pas si le terrain fait dix mètres
// ou cent).
//
// La texture est en LUMINANCE (gris clair, détails plus sombres), pas en
// vert. Premier essai fait en vert : le Chatteau Fort applique par-dessus une
// teinte de sol qui change avec les vagues (plein jour -> crépuscule), et
// three.js MULTIPLIE .color par la texture — le vert se multipliait donc par
// du vert et le motif disparaissait presque entièrement (vu en capture, le
// sol restait un aplat). En luminance, la teinte de chaque scène pilote la
// couleur et la texture ne fournit que le relief.
let grassTextureCache = null;
function createGrassTexture(){
  if(grassTextureCache) return grassTextureCache;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#E2E2E2';
  x.fillRect(0, 0, 256, 256);

  for(let i = 0; i < 1500; i++){
    const px = Math.random()*256, py = Math.random()*256, t = Math.random();
    x.fillStyle = t < 0.40 ? 'rgba(150,150,150,0.55)'
                : t < 0.75 ? 'rgba(255,255,255,0.55)'
                           : 'rgba(110,110,110,0.45)';
    x.fillRect(px, py, 2 + Math.random()*4, 3 + Math.random()*6);
  }
  for(let i = 0; i < 130; i++){
    const px = Math.random()*256, py = Math.random()*256;
    x.strokeStyle = 'rgba(95,95,95,0.55)';
    x.lineWidth = 1.6;
    for(let k = -2; k <= 2; k++){
      x.beginPath();
      x.moveTo(px + k*2, py + 5);
      x.lineTo(px + k*2.6, py - 4 - Math.random()*3);
      x.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  grassTextureCache = tex;
  return tex;
}

// --- marbre du palais ------------------------------------------------------
// Le sol du Palais était un gris-sable uniforme : on jouait sur une plage, pas
// dans un palais. Des dalles avec joints, quelques veines et un damier très
// léger suffisent à dire "marbre" — et les joints donnent en prime un repère
// de vitesse quand le chat court.
let marbleTextureCache = null;
function createMarbleTexture(){
  if(marbleTextureCache) return marbleTextureCache;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#F0E7D2';
  x.fillRect(0, 0, S, S);

  // damier discret : deux tons très proches, sinon le sol clignote au défilement
  const tile = S/4;
  for(let i = 0; i < 4; i++){
    for(let j = 0; j < 4; j++){
      if((i + j) % 2) continue;
      x.fillStyle = '#E7DCC4';
      x.fillRect(i*tile, j*tile, tile, tile);
    }
  }
  // veines
  x.strokeStyle = 'rgba(180,164,134,0.40)';
  for(let i = 0; i < 26; i++){
    x.lineWidth = 0.6 + Math.random()*1.4;
    x.beginPath();
    let px = Math.random()*S, py = Math.random()*S;
    x.moveTo(px, py);
    for(let k = 0; k < 4; k++){
      px += (Math.random()-0.5)*70;
      py += (Math.random()-0.5)*70;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  // joints des dalles, par-dessus tout le reste
  x.strokeStyle = 'rgba(150,133,104,0.55)';
  x.lineWidth = 2;
  for(let i = 0; i <= 4; i++){
    x.beginPath(); x.moveTo(i*tile, 0); x.lineTo(i*tile, S); x.stroke();
    x.beginPath(); x.moveTo(0, i*tile); x.lineTo(S, i*tile); x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  marbleTextureCache = tex;
  return tex;
}

// --- ombres de contact -----------------------------------------------------
// Un simple disque en dégradé posé au sol sous chaque objet. Ce n'est PAS une
// ombre calculée : c'est le petit assombrissement qu'on voit sous un objet
// posé, celui que les ombres portées ne rendent pas parce qu'elles sont
// projetées de biais et diffusées. C'est lui qui dit "posé" plutôt que
// "flottant", et c'est le détail le moins cher du lot.
let contactShadowTexCache = null;
function contactShadowTexture(){
  if(contactShadowTexCache) return contactShadowTexCache;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S/2, S/2, 0, S/2, S/2, S/2);
  g.addColorStop(0,    'rgba(40,32,22,0.55)');
  g.addColorStop(0.45, 'rgba(40,32,22,0.30)');
  g.addColorStop(1,    'rgba(40,32,22,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  contactShadowTexCache = new THREE.CanvasTexture(c);
  return contactShadowTexCache;
}

let contactShadowGeo = null, contactShadowMat = null;
function contactShadowMaterial(){
  if(!contactShadowMat){
    contactShadowGeo = new THREE.PlaneGeometry(1, 1);
    contactShadowMat = new THREE.MeshBasicMaterial({
      map: contactShadowTexture(), transparent:true, depthWrite:false
    });
  }
  return contactShadowMat;
}

// Ombre attachée à UN objet mobile (chat, chien, coffre qui tourne). Elle est
// enfant du groupe, donc elle le suit sans aucun code de synchronisation.
function addContactShadow(group, radius, yOffset){
  contactShadowMaterial();
  const m = new THREE.Mesh(contactShadowGeo, contactShadowMat);
  m.rotation.x = -Math.PI/2;
  m.scale.set(radius*2, radius*2, 1);
  m.position.y = yOffset === undefined ? 0.02 : yOffset;
  m.renderOrder = -1; // sous tout le reste, jamais par-dessus une pastille
  group.add(m);
  return m;
}

// Ombres du décor FIXE, toutes en un seul InstancedMesh. Un arbre isolé coûte
// un appel de dessin ; une forêt en coûterait cinquante, pour un détail qu'on
// remarque à peine individuellement. Ici c'est un appel pour tout le décor.
function buildContactShadowField(spots){
  if(!spots.length) return null;
  contactShadowMaterial();
  const mesh = new THREE.InstancedMesh(contactShadowGeo, contactShadowMat, spots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), -Math.PI/2);
  const pos = new THREE.Vector3(), scl = new THREE.Vector3();
  spots.forEach(([x, z, r], i)=>{
    pos.set(x, 0.02, z);
    scl.set(r*2, r*2, 1);
    m4.compose(pos, q, scl);
    mesh.setMatrixAt(i, m4);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.renderOrder = -1;
  // La géométrie ET le matériau sont PARTAGÉS par toutes les ombres du jeu.
  // Le Palais reconstruit sa scène à chaque niveau et libère ce qu'elle
  // contient : sans ce drapeau, il détruirait ces deux ressources communes et
  // ferait disparaître les ombres des quatre jeux d'un coup.
  mesh.userData.sharedResource = true;
  return mesh;
}

// --- horizon boisé ---------------------------------------------------------
// En portrait, le Chatteau Fort et la Scierie laissaient un quart de l'écran
// en ciel vide : beaucoup de hauteur disponible pour un jeu qui se lit en
// largeur. Plutôt que de bouger la caméra (ce qui déréglerait tout le cadrage
// mesuré des chemins et des dalles), on remplit ce vide par une ligne
// d'horizon. Elle transforme une bande morte en profondeur, et referme le
// terrain au lieu de le laisser se terminer dans le néant.
//
// Deux plans superposés, du plus loin au plus près, chacun d'une seule
// géométrie : deux appels de dessin pour tout l'arrière-plan.
function buildTreeline(width, height, colorHex, seed){
  let r = seed;
  const rand = ()=>{ r = (r*9301 + 49297) % 233280; return r/233280; };

  const positions = [];
  // 1. UNE MASSE PLEINE À LA BASE. Sans elle, on ne voyait qu'une rangée de
  //    pointes détachées — un peigne, pas une forêt (constaté en capture).
  //    C'est ce socle qui fait lire l'ensemble comme un massif continu.
  const base = height * 0.28; // socle discret : il ferme la ligne sans faire mur
  positions.push(-width/2, 0, 0,   width/2, 0, 0,   width/2, base, 0);
  positions.push(-width/2, 0, 0,   width/2, base, 0, -width/2, base, 0);

  // 2. DES CIMES LARGES QUI SE CHEVAUCHENT. Des triangles étroits et
  //    régulièrement espacés donnaient une dentelure mécanique ; ici chaque
  //    arbre est plus large que le pas, donc ils se recouvrent et la
  //    silhouette devient irrégulière comme une vraie ligne d'horizon.
  const pas = width / 46;
  for(let x = -width/2; x < width/2; x += pas * (0.75 + rand()*0.7)){
    const demi = pas * (1.1 + rand()*1.1);
    const h = base + height * (0.35 + rand()*0.75);
    positions.push(x - demi, base*0.55, 0,  x + demi, base*0.55, 0,  x + (rand()-0.5)*demi*0.4, h, 0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: colorHex, fog: false, side: THREE.DoubleSide
  }));
}

// Pose les deux rangs derrière une scène. `z` est la profondeur du rang le
// plus lointain ; le second vient un peu devant, plus foncé et plus haut, ce
// qui donne la perspective atmosphérique sans aucun brouillard à régler.
function addHorizonTreelines(scene, z, width, loinHex, presHex){
  // Le rang lointain est plus CLAIR et plus bas (perspective atmosphérique :
  // au loin, l'air délave), le rang proche plus sombre et plus haut. C'est ce
  // contraste entre les deux qui donne la profondeur — deux rangs de la même
  // teinte se seraient lus comme une seule découpe en carton.
  // Les deux rangs sont posés à y = 0 et JUSTE EN DEÇÀ du bord du terrain.
  // Placés plus loin, leur socle apparaissait sous la ligne d'horizon comme
  // une bande sombre flottante détachée du sol (constaté en capture) : le
  // terrain s'arrêtait avant eux, il n'y avait plus rien pour les cacher.
  const loin = buildTreeline(width, 2.8, loinHex, 12345);
  loin.position.set(0, 0, z);
  scene.add(loin);
  const pres = buildTreeline(width * 0.9, 3.6, presHex, 67890);
  pres.position.set(0, 0, z + 6);
  scene.add(pres);
  return [loin, pres];
}
