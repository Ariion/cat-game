// Synchronise les objets Three.js avec l'état de la partie, à chaque frame,
// puis fait le rendu final. La logique de jeu ne touche jamais à Three.js
// directement (sauf création/suppression des visuels de porte/particules/
// projectiles, où mélanger logique et visuel évite un état parallèle inutile).

// Anime un jeu de 4 pattes (voir buildLeg()/g.userData.legs dans scene3d.js)
// en cycle de trot : les diagonales opposées (avant-gauche + arrière-droite,
// avant-droite + arrière-gauche) se balancent en phase inverse.
function animateLegs(legs, phase, amplitude){
  if(!legs) return;
  const a = Math.sin(phase) * amplitude;
  legs[0].rotation.x = a;
  legs[1].rotation.x = -a;
  legs[2].rotation.x = -a;
  legs[3].rotation.x = a;
}

function syncLeader(){
  leaderGroup.position.x = playerX;
  leaderGroup.position.z = PLAYER_Z;
  let bob = Math.sin(frame*0.08) * 0.03;
  if(attackPulse > 0){ bob += (attackPulse/8) * 0.12; } // petit sursaut au tir
  leaderGroup.position.y = bob;
  const targetLean = Math.max(-0.3, Math.min(0.3, (playerTargetX-playerX) * 0.6));
  leaderGroup.rotation.z += (targetLean - leaderGroup.rotation.z) * 0.2;
  // clignote pendant la brève invulnérabilité après un coup, sinon rien ne
  // montre au joueur qu'il vient d'être protégé d'un enchaînement de dégâts
  leaderGroup.visible = invulnTimer <= 0 || frame % 6 < 3;
  animateLegs(leaderGroup.userData.legs, frame*0.35, 0.5);
  const shieldMesh = leaderGroup.userData.shieldMesh;
  if(shieldMesh){
    shieldMesh.visible = shieldTimer > 0;
    if(shieldTimer > 0) shieldMesh.rotation.y += 0.04;
  }
}

function syncFollowers(){
  const n = cats.length;
  for(let i=0;i<n;i++){
    const c = cats[i];
    const ox = Math.cos(c.angle + frame*0.01) * c.radius * 0.6;
    const oz = Math.sin(c.angle + frame*0.013) * c.radius * 0.42 + 0.55;
    const bob = Math.sin((frame + c.bob) * 0.1) * 0.05;
    const x = playerX + ox;
    const z = PLAYER_Z + oz;

    dummy3D.rotation.y = c.angle;

    dummy3D.position.set(x, bob + 0.34*c.size, z);
    dummy3D.scale.setScalar(c.size);
    dummy3D.updateMatrix();
    followerBodyInst.setMatrixAt(i, dummy3D.matrix);

    dummy3D.position.set(x, bob + 0.58*c.size, z - 0.28*c.size);
    dummy3D.scale.setScalar(c.size*0.75);
    dummy3D.updateMatrix();
    followerHeadInst.setMatrixAt(i, dummy3D.matrix);

    dummy3D.rotation.y = 0;
    dummy3D.position.set(x, 0.01, z);
    dummy3D.scale.setScalar(c.size);
    dummy3D.updateMatrix();
    followerShadowInst.setMatrixAt(i, dummy3D.matrix);
  }
  followerBodyInst.count = n;
  followerHeadInst.count = n;
  followerShadowInst.count = n;
  if(n > 0){
    followerBodyInst.instanceMatrix.needsUpdate = true;
    followerHeadInst.instanceMatrix.needsUpdate = true;
    followerShadowInst.instanceMatrix.needsUpdate = true;
  }
}

function syncPickups(){
  // portes DROITES posées au sol (pas d'arche, pas de rotation) : seul un
  // très léger flottement vertical reste, pour ne pas paraître figées
  pickups.forEach(p=>{
    p.visual.position.set(p.x, Math.sin((frame+p.x*10)*0.08)*0.04, p.z);
  });
}

function syncEnemies(){
  for(let i=0;i<enemyPool.length;i++){
    const e = enemyPool[i];
    const v = enemyVisuals[i];
    v.visible = e.active;
    if(!e.active) continue;
    v.position.set(e.x, Math.sin((frame+i*7)*0.09)*0.03, e.z);
    animateLegs(v.userData.legs, frame*0.4 + i*1.3, 0.45);
  }
}

function syncBoss(){
  if(boss){
    bossGroup.visible = true;
    bossGroup.position.x = boss.x;
    bossGroup.position.z = boss.z;
    bossGroup.position.y = Math.sin(frame*0.06) * 0.04;
    animateLegs(bossGroup.userData.legs, frame*0.3, 0.4);
  } else {
    bossGroup.visible = false;
  }
}

function syncLight(){
  // la lumière (et son frustum d'ombre) suit le joueur pour rester utile
  // sur toute la longueur du couloir sans avoir besoin d'un frustum géant
  sunLight.target.position.set(playerX, 0, PLAYER_Z);
  sunLight.position.set(playerX + 4, 8, PLAYER_Z + 4);
}

function syncCamera(){
  const targetX = playerX * 0.3;
  camera.position.x += (targetX - camera.position.x) * 0.05;
  camera.position.y = 4.1 + Math.sin(frame*0.05) * 0.04;
  let lookX = camera.position.x * 0.6;
  let lookY = 0.9;
  if(shakeTimer > 0){
    lookX += (Math.random()-0.5) * shakeIntensity;
    lookY += (Math.random()-0.5) * shakeIntensity * 0.5;
    camera.position.y += (Math.random()-0.5) * shakeIntensity * 0.3;
  }
  camera.lookAt(lookX, lookY, -10);
}

function render(){
  if(!webglSupported) return;
  syncLeader();
  syncFollowers();
  syncPickups();
  syncEnemies();
  syncBoss();
  syncLight();
  syncCamera();
  renderer.render(scene, camera);
}
