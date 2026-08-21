// Logique du mode "Chatteau Fort" : pose de tourelles-chats, vagues de
// chiens qui suivent le chemin, tir automatique des tourelles. Séparé du
// mode Bataille (gameplay.js) — aucune variable partagée, seulement des
// fonctions/matériaux de dessin communs (buildCatGroup, buildBossGroup,
// animateLegs, catMaterial/enemyMaterial, disposeProceduralGroup, sfx...).

// --- pose de tourelles ------------------------------------------------

// --- chat joueur : déplacement, construction, butin, bousculade ------------

// Convertit un point de l'écran en position au sol (y=0) de la scène du mode.
// Un raycast sur un PLAN mathématique plutôt que sur le maillage du sol :
// ça marche même là où le sol est masqué par un décor, et ça n'exige aucun
// maillage cible particulier.
const TOWER_GROUND_PLANE = webglSupported ? new THREE.Plane(new THREE.Vector3(0,1,0), 0) : null;
const towerHitPoint = webglSupported ? new THREE.Vector3() : null;

function towerScreenToGround(clientX, clientY){
  if(!webglSupported || !towerRaycaster) return null;
  const rect = canvas.getBoundingClientRect();
  towerPointerNDC.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  towerRaycaster.setFromCamera(towerPointerNDC, towerCamera);
  const hit = towerRaycaster.ray.intersectPlane(TOWER_GROUND_PLANE, towerHitPoint);
  return hit ? { x: hit.x, z: hit.z } : null;
}

// Le tap ne pose plus de tourelle : il indique où le chat doit se rendre.
// C'est en ARRIVANT sur un emplacement qu'il l'érige (voir updateHeroBuild()).
function handleTowerTap(clientX, clientY){
  const p = towerScreenToGround(clientX, clientY);
  if(!p) return;
  hero.tx = Math.max(-6.5, Math.min(6.5, p.x));
  hero.tz = Math.max(-13.5, Math.min(5.5, p.z));
  hero.moving = true;
}

function updateHeroMove(){
  if(hero.stunTimer > 0){
    hero.stunTimer--;
    hero.moving = false;
    return;
  }
  if(hero.invulnTimer > 0) hero.invulnTimer--;

  // La MANETTE prime : tant que le doigt pousse, le chat va dans cette
  // direction. Le déplacement vers une destination (hero.tx/tz) reste en
  // dessous — il ne sert plus au joueur, mais les bots de test s'en servent
  // et il reste utile pour recentrer le chat par code.
  const mag = Math.hypot(hero.stickX, hero.stickZ);
  if(mag > 0.001){
    hero.moving = false;
    hero.x += hero.stickX * HERO_SPEED;
    hero.z += hero.stickZ * HERO_SPEED;
    hero.facing = Math.atan2(hero.stickX, hero.stickZ);
    hero.x = Math.max(-6.5, Math.min(6.5, hero.x));
    hero.z = Math.max(-13.5, Math.min(5.5, hero.z));
    return;
  }

  if(!hero.moving) return;
  const dx = hero.tx - hero.x, dz = hero.tz - hero.z;
  const dist = Math.hypot(dx, dz);
  if(dist < HERO_ARRIVE_RADIUS){ hero.moving = false; return; }
  hero.x += dx/dist * HERO_SPEED;
  hero.z += dz/dist * HERO_SPEED;
  hero.facing = Math.atan2(dx, dz);
}

// Construction : il suffit de rester posté sur un emplacement libre, le temps
// que l'anneau se remplisse. Un délai plutôt qu'une pose instantanée, sinon
// un simple passage au-dessus d'un emplacement dépensait les poissons sans
// que le joueur l'ait voulu.
function turretUpgradeCost(level){
  return Math.round(TOWER_UPGRADE_COST_BASE * Math.pow(TOWER_UPGRADE_COST_GROWTH, level));
}

function turretAt(x, z){
  return towerTurrets.find(tu=>Math.hypot(tu.x - x, tu.z - z) < 0.01) || null;
}

function updateHeroBuild(){
  if(hero.stunTimer > 0){ hero.buildSlot = null; hero.buildTimer = 0; setHeroBuildProgress(0); return; }
  let onSlot = null;
  for(const s of towerSlots){
    if(Math.hypot(hero.x - s.x, hero.z - s.z) < HERO_BUILD_RADIUS){ onSlot = s; break; }
  }
  // Se poster sur une tourelle DÉJÀ bâtie l'améliore d'un grade contre des
  // poissons — même geste que pour la bâtir, et surtout le seul débouché de
  // la monnaie une fois tous les emplacements occupés (voir config.js).
  if(onSlot && onSlot.occupied){
    const tu = turretAt(onSlot.x, onSlot.z);
    const cost = tu ? turretUpgradeCost(tu.level) : Infinity;
    if(!tu || fish < cost){
      if(hero.buildSlot){ hero.buildSlot = null; hero.buildTimer = 0; setHeroBuildProgress(0); }
      return;
    }
    if(hero.buildSlot !== onSlot){ hero.buildSlot = onSlot; hero.buildTimer = 0; }
    hero.buildTimer++;
    setHeroBuildProgress(hero.buildTimer / HERO_UPGRADE_FRAMES);
    if(hero.buildTimer >= HERO_UPGRADE_FRAMES){
      fish -= cost;
      applyTurretLevel(tu, tu.level + 1);
      spawnTowerBurst(tu.x, 0.9, tu.z, turretLevelDef(tu.level).accent, 14);
      sfx.win();
      vibrate(30);
      showToast(t('tower_rank_up', { n: tu.level + 1 }));
      updateTowerHud();
      hero.buildSlot = null; hero.buildTimer = 0; setHeroBuildProgress(0);
    }
    return;
  }
  if(!onSlot || fish < towerNextTurretCost){
    if(hero.buildSlot){ hero.buildSlot = null; hero.buildTimer = 0; setHeroBuildProgress(0); }
    return;
  }
  if(hero.buildSlot !== onSlot){ hero.buildSlot = onSlot; hero.buildTimer = 0; }
  hero.buildTimer++;
  setHeroBuildProgress(hero.buildTimer / HERO_BUILD_FRAMES);
  if(hero.buildTimer >= HERO_BUILD_FRAMES){
    placeTurret(onSlot);
    hero.buildSlot = null;
    hero.buildTimer = 0;
    setHeroBuildProgress(0);
    // Le chat s'écarte de l'emplacement qu'il vient de bâtir : la tourelle
    // occupe exactement la même case, et sans ce pas de côté le chat joueur
    // disparaissait DANS la tourelle — on ne savait plus où était son
    // personnage (repéré en capture).
    const away = Math.atan2(hero.x - onSlot.x, hero.z - onSlot.z);
    const off = HERO_BUILD_RADIUS + 0.45;
    hero.x = onSlot.x + Math.sin(away)*off;
    hero.z = onSlot.z + Math.cos(away)*off;
    hero.tx = hero.x; hero.tz = hero.z;
    hero.moving = false;
  }
}

// --- miaulement : le pouvoir du chat joueur --------------------------------
// Ralentit les chiens autour du chat, avec une recharge. Il faut donc aller
// se placer AU CONTACT de la vague pour que ça serve — c'est ce qui donne au
// joueur une prise sur l'issue au lieu de regarder ses tourelles.
function meowReady(){ return hero.meowCooldown <= 0 && towerState === 'playing' && !towerPaused; }

function triggerMeow(){
  if(!meowReady() || hero.stunTimer > 0) return;
  hero.meowCooldown = MEOW_COOLDOWN_FRAMES;
  let touched = 0;
  towerDogs.forEach(d=>{
    if(Math.hypot(hero.x - d.x, hero.z - d.z) > MEOW_RADIUS) return;
    d.slowTimer = MEOW_DURATION_FRAMES;
    touched++;
  });
  spawnMeowRing(hero.x, hero.z);
  spawnTowerBurst(hero.x, 0.8, hero.z, 0xFFF2C8, 10);
  sfx.bossAppear();
  vibrate([25, 20, 25]);
  showToast(touched > 0 ? t('tower_meow_hit', { n: touched }) : t('tower_meow_miss'));
  updateMeowButton();
}

function updateMeowCooldown(){
  if(hero.meowCooldown > 0){
    hero.meowCooldown--;
    if(hero.meowCooldown === 0) updateMeowButton();
    else if(hero.meowCooldown % 15 === 0) updateMeowButton();
  }
}

function updateMeowButton(){
  const btn = document.getElementById('meowBtn');
  if(!btn) return;
  const ready = hero.meowCooldown <= 0;
  btn.classList.toggle('ready', ready);
  btn.textContent = ready ? '🐱' : Math.ceil(hero.meowCooldown/60) + 's';
}

// --- butin ---------------------------------------------------------------

// Valeur d'un poisson à la vague courante — voir LOOT_VALUE_PER_WAVE.
function lootValueForWave(){
  return Math.max(1, Math.round(LOOT_VALUE * (1 + LOOT_VALUE_PER_WAVE*(towerWave-1))));
}

function spawnLoot(x, z, value){
  const l = { x, z, value, life: LOOT_LIFETIME_FRAMES, visual: null };
  if(webglSupported){
    l.visual = buildLootFish();
    l.visual.position.set(x, 0.18, z);
    l.visual.rotation.y = Math.random()*Math.PI*2;
    towerScene.add(l.visual);
  }
  towerLoot.push(l);
}

function updateTowerLoot(){
  for(let i=towerLoot.length-1; i>=0; i--){
    const l = towerLoot[i];
    l.life--;
    if(l.visual){
      l.visual.position.y = 0.18 + Math.sin((towerFrame + i*11)*0.09)*0.05;
      l.visual.rotation.y += 0.03;
      // clignote sur la fin, pour prévenir qu'il va disparaître
      l.visual.visible = l.life > LOOT_BLINK_FRAMES || Math.floor(l.life/6) % 2 === 0;
    }
    const caught = Math.hypot(hero.x - l.x, hero.z - l.z) < HERO_PICKUP_RADIUS;
    if(caught || l.life <= 0){
      if(caught){
        fish += l.value;
        sfx.croquette();
        spawnTowerBurst(l.x, 0.4, l.z, 0x7FB8D9, 4);
        updateTowerHud();
      }
      if(l.visual){ towerScene.remove(l.visual); disposeProceduralGroup(l.visual); }
      towerLoot.splice(i, 1);
    }
  }
}

// --- bousculade -----------------------------------------------------------
// Un chien qui percute le chat l'étourdit et lui fait lâcher une part de ses
// poissons au sol (récupérables). Ça ne coûte JAMAIS de vie : les vies restent
// adossées à la gamelle, sinon une mauvaise trajectoire pourrait finir la
// partie sans rapport avec la défense elle-même.
function updateHeroHits(){
  if(hero.stunTimer > 0 || hero.invulnTimer > 0) return;
  for(const d of towerDogs){
    if(Math.hypot(hero.x - d.x, hero.z - d.z) > HERO_HIT_RADIUS) continue;
    hero.stunTimer = HERO_STUN_FRAMES;
    hero.invulnTimer = HERO_STUN_FRAMES + HERO_INVULN_FRAMES;
    hero.moving = false;
    hero.buildSlot = null; hero.buildTimer = 0; setHeroBuildProgress(0);
    const lost = Math.floor(fish * HERO_STUN_FISH_LOSS);
    if(lost > 0){
      fish -= lost;
      // éparpillé en plusieurs poissons autour du chat, à aller re-ramasser
      const drops = Math.min(5, Math.max(1, Math.round(lost / LOOT_VALUE)));
      const per = Math.max(1, Math.floor(lost / drops));
      for(let i=0;i<drops;i++){
        const ang = Math.random()*Math.PI*2, rad = 0.5 + Math.random()*0.6;
        spawnLoot(hero.x + Math.cos(ang)*rad, hero.z + Math.sin(ang)*rad, per);
      }
    }
    spawnTowerBurst(hero.x, 0.5, hero.z, 0xC94868, 8);
    sfx.hurt();
    vibrate([20,15,20]);
    updateTowerHud();
    showToast(t('tower_hero_bumped'));
    break;
  }
}

function updateHero(){
  updateHeroMove();
  updateHeroHits();
  updateHeroBuild();
  if(!hero.visual) return;
  hero.visual.position.set(hero.x, 0, hero.z);
  hero.visual.rotation.y = hero.facing;
  // clignote pendant le répit qui suit une bousculade
  hero.visual.visible = hero.invulnTimer <= 0 || towerFrame % 8 < 5;
  if(hero.stunTimer > 0){
    // sonné : il tourne sur lui-même au lieu de trotter
    hero.visual.rotation.y += 0.25;
  } else if(hero.moving || Math.hypot(hero.stickX, hero.stickZ) > 0.001){
    animateLegs(hero.visual.userData.legs, towerFrame*0.42, 0.5);
  } else {
    animateLegs(hero.visual.userData.legs, 0, 0);
  }
}

function placeTurret(slot){
  if(!slot || slot.occupied) return;
  if(fish < towerNextTurretCost){
    showToast(t('tower_not_enough_fish'));
    return;
  }
  fish -= towerNextTurretCost;
  towerNextTurretCost += TOWER_TURRET_COST_INCREMENT;
  slot.occupied = true;
  slot.marker.visible = false;

  // Chat ASSIS taillé pour ce mode (buildTurretCat(), towerScene3d.js), et
  // non le chat du runner : celui-ci est un quadrupède debout pensé pour
  // être vu de dos et de loin, illisible en vue plongeante. Il regarde
  // aussi vers +Z, ce qu'attend lookAt() — le chat du runner a la tête en
  // -Z et se retrouvait donc dos au chemin.
  const visual = buildTurretCat();
  visual.position.set(slot.x, 0.26, slot.z);
  const facing = nearestPathPointTo(slot.x, slot.z);
  visual.lookAt(facing.x, 0, facing.z);
  visual.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
  towerScene.add(visual);

  const turret = {
    x: slot.x, z: slot.z,
    level: 0,
    kills: 0,
    fireTimer: 0,
    visual,
    insignia: null, // casque/couronne ajouté à la montée en grade
    aura: null,
    rankLabel: buildTurretRankLabel()
  };
  visual.add(turret.rankLabel);
  applyTurretLevel(turret, 0);
  towerTurrets.push(turret);

  sfx.croquette();
  vibrate(15);
  updateTowerHud();
}

// --- montée en grade des tourelles --------------------------------------
// Une tourelle accumule ses propres éliminations et gagne un rang quand elle
// atteint les seuils de TOWER_TURRET_LEVELS (config.js) : plus grosse, plus
// de dégâts/portée/cadence, et un insigne visible (casque puis couronne) +
// une aura au sol de la couleur du rang. C'est la progression individuelle
// de la défense, en plus de la montée d'ambiance par vague.

// Petite étiquette de rang au-dessus de la tourelle (I / II / III) — même
// technique canvas que l'étiquette de puissance du mode Bataille.
function buildTurretRankLabel(){
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent:true, depthWrite:false, fog:false
  }));
  // L'étiquette est enfant du groupe de la tourelle, lui-même agrandi à
  // chaque rang (scale jusqu'à 2.1) : on compense ici pour qu'elle garde à
  // peu près la même taille à l'écran quel que soit le rang.
  sprite.scale.set(0.62, 0.31, 1);
  sprite.position.set(0, 1.25, 0);
  sprite.renderOrder = 3;
  sprite.userData = { canvas: c, ctx, tex };
  return sprite;
}

// Pastille pleine (fond coloré du rang + chiffre romain clair) plutôt qu'un
// simple texte contourné : à la taille où l'étiquette apparaît vue de la
// caméra en plongée, un texte fin ne se lisait pas du tout — il ressortait
// comme une petite tache sombre indistincte.
function redrawTurretRankLabel(sprite, level){
  const ud = sprite.userData, c = ud.canvas, ctx = ud.ctx;
  const accent = turretLevelDef(level).accent;
  const hex = '#' + accent.toString(16).padStart(6, '0');
  ctx.clearRect(0, 0, c.width, c.height);

  const w = 96, h = 46, x = (c.width-w)/2, y = (c.height-h)/2, r = h/2;
  ctx.fillStyle = 'rgba(59,50,38,0.9)';
  ctx.beginPath();
  ctx.roundRect(x-4, y-4, w+8, h+8, r+4);
  ctx.fill();
  ctx.fillStyle = hex;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = level === 1 ? '#3B3226' : '#FFF6E2'; // le rang II est argenté : texte sombre pour rester lisible
  // Chiffres romains pour les 3 grades dessinés, puis le NOMBRE au-delà :
  // en infini les grades ne sont plus bornés, et un tableau de 3 entrées
  // renvoyait undefined (la tourelle affichait 'I' à vie).
  const roman = ['I', 'II', 'III'][level];
  const txt = roman || String(level + 1);
  ctx.font = (txt.length > 2 ? '800 24px' : '800 30px') + ' Fredoka, sans-serif';
  ctx.fillText(txt, c.width/2, c.height/2 + 1);
  ud.tex.needsUpdate = true;
}

// Insigne de grade posé sur la tête du chat : rien au rang I, un casque au
// rang II, une couronne au rang III.
function buildTurretInsignia(level, accentHex){
  if(level === 0) return null;
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: accentHex, flatShading:true, roughness:0.45, metalness:0.35 });
  if(level === 1){
    // posé sur la tête du chat ASSIS : centre en (0, 0.78, 0) — l'ancien
    // placement visait la tête du chat du runner, en z = -0.28
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.235, 10, 8, 0, Math.PI*2, 0, Math.PI/2), mat);
    helm.position.set(0, 0.94, 0);
    g.add(helm);
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.3), mat);
    crest.position.set(0, 1.08, 0);
    g.add(crest);
  } else {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.1, 10), mat);
    band.position.set(0, 0.98, 0);
    g.add(band);
    for(let i=0;i<6;i++){
      const ang = (i/6)*Math.PI*2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), mat);
      spike.position.set(Math.sin(ang)*0.2, 1.10, Math.cos(ang)*0.2);
      g.add(spike);
    }
  }
  g.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
  return g;
}

// Définition d'un grade. Au-delà des 3 grades DESSINÉS, les suivants sont
// extrapolés : en mode infini la difficulté monte sans fin, donc la puissance
// du joueur doit pouvoir suivre — un plafond de 3 grades condamnerait la
// partie d'avance quel que soit le talent du joueur.
function turretLevelDef(level){
  const last = TOWER_TURRET_LEVELS.length - 1;
  if(level <= last) return TOWER_TURRET_LEVELS[level];
  const base = TOWER_TURRET_LEVELS[last];
  const extra = level - last;
  return {
    killsNeeded: base.killsNeeded + extra*TURRET_LEVEL_KILLS_STEP,
    damage: base.damage + extra*TURRET_LEVEL_DAMAGE_STEP,
    range: Math.min(TURRET_LEVEL_RANGE_MAX, base.range + extra*TURRET_LEVEL_RANGE_STEP),
    fireInterval: Math.max(TURRET_FIRE_INTERVAL_MIN, base.fireInterval - extra),
    scale: base.scale, // la taille se fige : au-delà, un chat plus gros masquerait le plateau
    accent: base.accent
  };
}

function applyTurretLevel(turret, level){
  const def = turretLevelDef(level);
  turret.level = level;
  turret.damage = def.damage;
  turret.range = def.range;
  turret.fireInterval = def.fireInterval;
  turret.visual.scale.setScalar(def.scale);

  if(turret.insignia){ turret.visual.remove(turret.insignia); disposeProceduralGroup(turret.insignia); }
  turret.insignia = buildTurretInsignia(level, def.accent);
  if(turret.insignia) turret.visual.add(turret.insignia);

  // aura au sol : matérialise la portée ET le rang d'un coup d'œil
  if(turret.aura){ towerScene.remove(turret.aura); turret.aura.geometry.dispose(); turret.aura.material.dispose(); }
  const aura = new THREE.Mesh(
    new THREE.RingGeometry(def.range - 0.06, def.range, 40),
    new THREE.MeshBasicMaterial({ color: def.accent, transparent:true, opacity: 0.16 + level*0.06, side: THREE.DoubleSide, depthWrite:false })
  );
  aura.rotation.x = -Math.PI/2;
  aura.position.set(turret.x, 0.05, turret.z);
  towerScene.add(aura);
  turret.aura = aura;

  // L'étiquette est enfant du groupe, donc sa taille à l'écran = échelle
  // locale × échelle du groupe. On vise donc une taille MONDE constante
  // (~1 unité de large) en divisant par l'échelle du rang : sinon soit elle
  // grossit avec la tourelle jusqu'à la masquer, soit — en compensant trop —
  // le chiffre devient un pâté de quelques pixels illisible.
  const inv = 1 / def.scale;
  turret.rankLabel.scale.set(1.0 * inv, 0.5 * inv, 1);
  // idem pour la hauteur : on veut la pastille juste au-dessus de la tête,
  // pas flottant de plus en plus haut à mesure que le chat grandit
  // au-dessus des oreilles (sommet ~1.15 en local), + un écart constant en
  // MONDE pour ne pas s'éloigner à mesure que le chat grandit
  turret.rankLabel.position.y = 1.28 + 0.42 * inv;
  redrawTurretRankLabel(turret.rankLabel, level);
}

function registerTurretKill(turret){
  turret.kills++;
  const next = turret.level + 1;
  const nextDef = turretLevelDef(next);
  // Les éliminations ne font gagner QUE les grades dessinés (I -> III).
  // Au-delà, il faut payer (voir updateHeroBuild) : sans cette borne, une
  // tourelle bien placée qui rafle toutes les éliminations montait seule à
  // l'infini — mesuré en simulation : grade 107 à la vague 69, une puissance
  // qui distançait définitivement la courbe de difficulté et rendait le mode
  // infini... inperdable.
  if(next < TOWER_TURRET_LEVELS.length && turret.kills >= nextDef.killsNeeded){
    applyTurretLevel(turret, next);
    spawnTowerBurst(turret.x, 0.9, turret.z, nextDef.accent, 14);
    sfx.win();
    vibrate(30);
    showToast(t('tower_rank_up', { n: next + 1 }));
  }
}

// --- vagues de chiens ---------------------------------------------------

// Nombre de chiens de la vague courante — fixe en Histoire, croissant en
// Infini.
function dogsThisWave(){
  if(!towerEndless) return TOWER_DOGS_PER_WAVE;
  return Math.min(ENDLESS_DOGS_MAX, Math.round(ENDLESS_DOGS_BASE + (towerWave-1)*ENDLESS_DOGS_PER_WAVE));
}

function towerSpawnInterval(){
  if(!towerEndless) return TOWER_DOG_SPAWN_INTERVAL_FRAMES;
  // les arrivées se resserrent avec les vagues, jusqu'à un plancher
  return Math.max(ENDLESS_SPAWN_INTERVAL_MIN, TOWER_DOG_SPAWN_INTERVAL_FRAMES - (towerWave-1)*1.5);
}

// PV d'un chien de la vague courante. Les deux modes suivent des courbes
// DIFFÉRENTES, et c'est délibéré : l'exponentielle du mode Histoire (x1.55 par
// vague) donne une montée franche et courte, parfaite sur 5 vagues, mais
// deviendrait absurde en infini (x7000 vers la vague 20). L'infini utilise
// donc une croissance polynomiale, qui monte sans jamais exploser.
function towerDogHp(){
  const growth = towerWave - 1;
  if(!towerEndless) return Math.round(TOWER_DOG_HP_BASE * Math.pow(TOWER_WAVE_HP_GROWTH, growth));
  return Math.round(TOWER_DOG_HP_BASE * Math.pow(1 + ENDLESS_HP_RAMP*growth, ENDLESS_HP_POWER));
}

function towerDogSpeed(){
  const growth = towerWave - 1;
  if(!towerEndless) return TOWER_DOG_SPEED_BASE * Math.pow(TOWER_WAVE_SPEED_GROWTH, growth);
  // plafonnée : au-delà, les chiens traverseraient le plateau plus vite que
  // les tourelles ne peuvent tirer, ce qui ne serait plus une difficulté mais
  // un mur
  return Math.min(ENDLESS_SPEED_CAP, TOWER_DOG_SPEED_BASE * Math.pow(ENDLESS_SPEED_GROWTH, growth));
}

// Tire un type de chien pour la vague courante, parmi ceux déjà débloqués et
// selon leur fréquence. Un chien-boss remplace le tirage une vague sur cinq,
// et seulement pour le premier chien de la vague — sinon on aurait six boss
// d'un coup.
function pickDogType(indexInWave){
  if(towerEndless && towerWave % TOWER_BOSS_EVERY === 0 && indexInWave === 0){
    return { id:'boss', hp:TOWER_BOSS_HP, speed:TOWER_BOSS_SPEED, scale:TOWER_BOSS_SCALE,
             tint:TOWER_BOSS_TINT, loot:TOWER_BOSS_LOOT };
  }
  // Types spéciaux réservés à l'INFINI. Le mode Histoire est l'entrée en
  // matière : sa courbe de PV est déjà exponentielle (x1,55 par vague), et y
  // ajouter des brutes à 2,6x PV le rendait tout simplement imperdable dans
  // l'autre sens — mesuré : défaite systématique à la vague 5, alors qu'il
  // était réglé pour une victoire en ~53 s.
  const pool = towerEndless
    ? TOWER_DOG_TYPES.filter(t=>towerWave >= t.from)
    : TOWER_DOG_TYPES.filter(t=>t.id === 'normal');
  const total = pool.reduce((n,t)=>n+t.weight, 0);
  let r = Math.random()*total;
  for(const t of pool){ r -= t.weight; if(r <= 0) return t; }
  return pool[0];
}

function spawnTowerDog(indexInWave){
  const type = pickDogType(indexInWave);
  const hp = Math.max(1, Math.round(towerDogHp() * type.hp));
  const speed = towerDogSpeed() * type.speed;

  // VRAIS modèles 3D (les mêmes GLB que le mode Bataille) dès qu'ils sont
  // chargés, chien procédural en attendant : même schéma d'amélioration
  // progressive que dans l'autre mode, jamais bloquant si le chargement
  // échoue. buildRealDogGroup() teinte déjà le pelage en clonant les
  // matériaux par instance.
  const gltf = pickDogGltf(towerDogs.length);
  // type.scale a été réglé pour le chien PROCÉDURAL (0.68 = chien normal) ;
  // appliqué tel quel à une hauteur cible, il rapetissait tout le monde. On
  // le ramène donc autour de 1 pour le chien normal.
  const dogHeight = TOWER_DOG_HEIGHT * (type.scale / 0.68);
  let visual;
  if(gltf){
    visual = buildRealDogGroup(gltf, dogHeight, false,
                               type.tint !== null && type.tint !== undefined ? type.tint : randomFurColor());
  } else {
    visual = buildBossGroup(enemyMaterial);
    visual.scale.setScalar(type.scale);
    // Teinte propre au type : le matériau procédural est PARTAGÉ par tous les
    // chiens, donc il faut cloner avant de colorer, sinon teinter un chien les
    // teint tous.
    if(type.tint !== null && type.tint !== undefined){
      visual.traverse(o=>{
        if(o.isMesh && o.material === enemyMaterial){
          o.material = enemyMaterial.clone();
          o.material.color.setHex(type.tint);
        }
      });
    }
  }
  visual.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
  const start = TOWER_PATH[0];
  visual.position.set(start.x, 0, start.z);
  towerScene.add(visual);

  const hpSprite = buildTowerDogHpBar();
  // La taille du sprite était calibrée en supposant que le groupe parent est
  // réduit (0.68 pour le procédural). Sur un vrai modèle, c'est le root
  // INTERNE qui porte l'échelle et le groupe reste à 1 : sans correction, la
  // barre s'affichait à sa taille brute, énorme et détachée loin au-dessus du
  // chien (vu en capture).
  if(gltf){
    hpSprite.scale.set(0.62, 0.105, 1);
    hpSprite.position.y = dogHeight + 0.28;
  }
  visual.add(hpSprite);

  towerDogs.push({
    active: true, hp, maxHp: hp, speed,
    type: type.id, lootMult: type.loot,
    slowTimer: 0,
    wp: 0, x: start.x, z: start.z,
    visual, hpSprite
  });
  if(type.id === 'boss'){ showToast(t('tower_boss_wave')); sfx.bossAppear(); vibrate([30,20,30]); }
}

function dogProgress(d){
  const target = TOWER_PATH[d.wp+1] || TOWER_PATH[TOWER_PATH.length-1];
  const distToNext = Math.hypot(target.x - d.x, target.z - d.z);
  return d.wp * 1000 - distToNext; // plus grand = plus avancé sur le chemin
}

function updateTowerDogs(){
  for(let i=towerDogs.length-1; i>=0; i--){
    const d = towerDogs[i];
    const target = TOWER_PATH[d.wp+1];
    if(!target){ resolveTowerDog(i, 'arrived'); continue; }
    // vitesse EFFECTIVE : le ralentissement du miaulement s'applique au
    // déplacement, il ne modifie jamais d.speed — sinon le chien resterait
    // lent pour toujours
    if(d.slowTimer > 0) d.slowTimer--;
    const spd = d.slowTimer > 0 ? d.speed * MEOW_SLOW_FACTOR : d.speed;
    const dx = target.x - d.x, dz = target.z - d.z;
    const dist = Math.hypot(dx, dz);
    if(dist < spd){
      d.x = target.x; d.z = target.z; d.wp++;
      if(d.wp >= TOWER_PATH.length - 1){ resolveTowerDog(i, 'arrived'); continue; }
    } else {
      d.x += dx/dist * spd;
      d.z += dz/dist * spd;
    }
    d.visual.position.set(d.x, 0, d.z);
    // oriente le chien dans son sens de marche (le modèle procédural n'en
    // avait pas besoin, il courait toujours vers la caméra)
    if(dist > 0.0001) d.visual.rotation.y = Math.atan2(dx, dz);
    if(d.visual.userData.mixer){
      // vrai modèle : animation par mixer, ralentie quand le chien l'est
      d.visual.userData.mixer.update((d.slowTimer > 0 ? MEOW_SLOW_FACTOR : 1) / 60);
    } else {
      animateLegs(d.visual.userData.legs, towerFrame*0.3 + i*1.3, 0.4);
    }
  }
}

// Retire proprement le visuel d'un chien. ATTENTION : SkeletonUtils.clone()
// PARTAGE la géométrie entre tous les clones d'un même modèle. Appeler
// disposeProceduralGroup() dessus détruirait la géométrie commune et ferait
// disparaître TOUS les autres chiens. On ne libère donc que les matériaux,
// qui eux sont clonés par instance.
function disposeTowerDogVisual(g){
  if(g.userData.isRealModel){
    g.traverse(o=>{
      if(!o.isMesh || !o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m=>m && m.dispose());
    });
    return;
  }
  disposeProceduralGroup(g);
}

function resolveTowerDog(i, reason){
  const d = towerDogs[i];
  towerScene.remove(d.visual);
  disposeTowerDogVisual(d.visual);
  towerDogs.splice(i, 1);
  towerWaveDogsLeft--;

  if(reason === 'arrived'){
    towerLives = Math.max(0, towerLives - 1);
    sfx.hurt();
    vibrate([20,15,20]);
    updateTowerHud();
    if(towerLives <= 0){ showTowerLose(); return; }
  } else if(reason === 'killed'){
    // le butin tombe AU SOL : c'est au chat joueur d'aller le chercher, ce qui
    // l'oblige à s'aventurer près du chemin plutôt qu'à encaisser de loin
    spawnLoot(d.x, d.z, Math.round(lootValueForWave() * (d.lootMult || 1)));
    sfx.enemyDown();
  }
  checkTowerWaveEnd();
}

// --- tourelles : ciblage + tir ------------------------------------------

function findFurthestDogInRange(tu){
  // bestProgress DOIT démarrer à -Infinity, pas à une petite valeur négative :
  // dogProgress() vaut wp*1000 - distanceAuProchainPoint, qui est largement
  // négatif pour un chien qui vient d'entrer sur un segment (loin du point
  // suivant) — avec un seuil de départ à -1, ces chiens ne battaient jamais
  // le seuil et étaient ignorés comme cible jusqu'à être presque arrivés au
  // virage suivant, réduisant une tourelle isolée à 1-2 tirs au lieu de
  // toute la fenêtre de portée (repéré : un chien traversant restait à 60
  // PV pendant l'essentiel de son passage en portée, touché seulement dans
  // les derniers instants).
  let best = null, bestProgress = -Infinity;
  towerDogs.forEach(d=>{
    const dist = Math.hypot(d.x - tu.x, d.z - tu.z);
    if(dist > tu.range) return;
    const progress = dogProgress(d);
    if(progress > bestProgress){ bestProgress = progress; best = d; }
  });
  return best;
}

function spawnTowerBurst(x, y, z, color, count){
  if(!webglSupported) return;
  for(let i=0; i<(count||6); i++){
    const mat = new THREE.MeshBasicMaterial({ color, transparent:true, opacity:1 });
    const mesh = new THREE.Mesh(particleGeometry, mat);
    mesh.position.set(x, y, z);
    towerScene.add(mesh);
    towerParticles.push({
      mesh,
      vx: (Math.random()-0.5)*0.1,
      vy: Math.random()*0.09 + 0.02,
      vz: (Math.random()-0.5)*0.1,
      life: 22
    });
  }
}

function updateTowerParticles(){
  towerParticles.forEach(p=>{
    p.mesh.position.x += p.vx;
    p.mesh.position.y += p.vy;
    p.mesh.position.z += p.vz;
    p.vy -= 0.005;
    p.life--;
    p.mesh.material.opacity = Math.max(p.life/22, 0);
  });
  const expired = towerParticles.filter(p=>p.life<=0);
  expired.forEach(p=>{ towerScene.remove(p.mesh); p.mesh.material.dispose(); });
  towerParticles = towerParticles.filter(p=>p.life>0);
}

// killer = la tourelle qui a porté le coup, pour lui créditer l'élimination
// (montée en grade) — absente si les dégâts viennent d'ailleurs.
function applyTowerDogHit(dog, damage, killer){
  dog.hp -= damage;
  redrawTowerHpBar(dog.hpSprite, Math.max(0, dog.hp/dog.maxHp));
  if(dog.hp <= 0){
    const i = towerDogs.indexOf(dog);
    if(i >= 0){
      resolveTowerDog(i, 'killed');
      if(killer) registerTurretKill(killer);
    }
  }
}

function fireTowerTurret(tu, dog){
  sfx.hit();
  const accent = turretLevelDef(tu.level).accent;
  spawnTowerBurst(tu.x, 0.9, tu.z, accent, 3);     // flash au départ, à la couleur du rang
  spawnTowerBurst(dog.x, 0.5, dog.z, 0xCCFF33, 5); // impact, même citron-vert que le tir du mode Bataille
  applyTowerDogHit(dog, tu.damage, tu);
}

function updateTowerTurrets(){
  towerTurrets.forEach(tu=>{
    // léger balancement de l'aura : montre que la tourelle est "en éveil"
    if(tu.aura) tu.aura.rotation.z += 0.004;
    if(tu.fireTimer > 0){ tu.fireTimer--; return; }
    const target = findFurthestDogInRange(tu);
    if(!target) return;
    tu.fireTimer = tu.fireInterval;
    fireTowerTurret(tu, target);
  });
}

// --- vagues : lancement + fin --------------------------------------------

// Ambiance de la vague. En Histoire, une étape par vague (jour -> crépuscule).
// En Infini, le cycle fait l'aller-retour indéfiniment : le jour retombe, se
// relève, et la partie ne se déroule jamais sous un ciel figé.
function towerAmbianceIndexForWave(){
  const n = TOWER_AMBIANCE.length;
  if(!towerEndless) return Math.min(n-1, towerWave);
  const period = (n-1)*2;
  const pos = (towerWave-1) % period;
  return pos < n-1 ? pos : period - pos; // aller puis retour
}

// Chapitre courant du Chatteau Fort (0-indexé).
function towerChapter(){
  return Math.floor((towerWave - 1) / CHAPTER_WAVES);
}

function startNextTowerWave(){
  const chapBefore = towerWave > 0 ? towerChapter() : -1;
  towerWave++;
  towerWaveSpawned = 0;
  towerWaveDogsLeft = dogsThisWave();
  towerWaveSpawnTimer = 0;
  updateTowerHud();
  // le siège s'assombrit et le chatteau se pavoise d'une bannière de plus à
  // chaque vague — la partie ne se joue pas sous le même ciel du début à la fin
  if(webglSupported){
    startTowerAmbianceTransition(towerAmbianceIndexForWave());
    setTowerBannerCount(Math.min(5, towerWave));
  }
  // coupure de chapitre : seulement en infini (l'Histoire ne fait que 5
  // vagues, elle n'atteint jamais de frontière)
  if(towerEndless && towerWave > 1 && towerChapter() > chapBefore){
    showChapterBreak('tower');
  }
  showToast(towerEndless
    ? t('tower_wave_toast_endless', { n: towerWave })
    : t('tower_wave_toast', { n: towerWave, max: TOWER_WAVE_COUNT }));
}

function checkTowerWaveEnd(){
  if(towerState !== 'playing') return; // une défaite peut avoir déjà été déclenchée par ce même appel
  if(towerWaveDogsLeft > 0 || towerWaveSpawned < dogsThisWave()) return;
  // en infini il n'y a pas de victoire : les vagues s'enchaînent tant qu'il
  // reste des vies
  if(!towerEndless && towerWave >= TOWER_WAVE_COUNT){
    if(towerLives > 0) showTowerWin();
    return;
  }
  towerWaveDelayTimer = TOWER_WAVE_DELAY_FRAMES;
}

function updateTowerWaves(){
  const waveFullyResolved = towerWaveSpawned >= dogsThisWave() && towerWaveDogsLeft === 0;
  if(towerWave === 0 || waveFullyResolved){
    if(towerWaveDelayTimer > 0){
      towerWaveDelayTimer--;
      if(towerWaveDelayTimer === 0 && towerState === 'playing') startNextTowerWave();
    }
    return;
  }
  if(towerWaveSpawned < dogsThisWave()){
    towerWaveSpawnTimer++;
    if(towerWaveSpawnTimer >= towerSpawnInterval()){
      towerWaveSpawnTimer = 0;
      spawnTowerDog(towerWaveSpawned);
      towerWaveSpawned++;
    }
  }
}

// --- boucle principale ----------------------------------------------------

function updateTower(){
  if(towerState !== 'playing' || towerPaused || inChapterBreak) return;
  towerFrame++;
  updateTowerWaves();
  updateMeowCooldown();
  updateHero();
  updateTowerTurrets();
  updateTowerDogs();
  updateTowerLoot();
  updateTowerParticles();
  if(webglSupported) updateMeowRings();
  if(webglSupported){
    updateTowerAmbiance();       // fondu d'ambiance entre deux vagues
    animateTowerBanners(towerFrame);
  }
}
