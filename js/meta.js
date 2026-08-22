// ===========================================================================
// Couche META : ce qui relie les quatre mini-jeux
// ===========================================================================
// Jusqu'ici les jeux ne partageaient QUE le menu. C'est le fichier qui les
// relie vraiment, sans mélanger leurs états de partie (chacun garde ses
// variables : state.js, towerState.js, millState.js, puzzleState.js) :
//
//   - les GEMMES sont la monnaie commune. On en gagne dans les quatre jeux,
//     on les dépense dans une boutique unique.
//   - le PROFIL (niveau, expérience) monte quel que soit le jeu joué : une
//     partie de Scierie fait progresser le compte, pas juste la Scierie.
//   - les MISSIONS du jour piochent dans les quatre jeux : c'est ce qui donne
//     une raison de passer de l'un à l'autre au lieu d'en jouer un seul.
//   - la SUPPRESSION DES PUBS s'achète par jeu ou pour tous.
//
// Tout est stocké en local (localStorage). Un vrai compte joueur synchronisé
// entre appareils demanderait un serveur ; le point de branchement est
// metaSave()/metaLoad(), et rien d'autre dans le code ne touche au stockage.

const META_KEY = 'hordeDeChatsMeta';
const META_MODES = ['battle', 'tower', 'mill', 'puzzle'];

let meta = {
  gems: 0,
  xp: 0,
  noAds: { battle:false, tower:false, mill:false, puzzle:false },
  missions: [],
  missionDay: '',
  totals: { battle:0, tower:0, mill:0, puzzle:0 } // parties jouées, par jeu
};

function metaLoad(){
  try{
    const raw = localStorage.getItem(META_KEY);
    if(!raw) return;
    const saved = JSON.parse(raw);
    // fusion champ par champ : une sauvegarde d'une version antérieure ne doit
    // pas faire disparaître les champs ajoutés depuis
    meta.gems = saved.gems || 0;
    meta.xp = saved.xp || 0;
    META_MODES.forEach(m=>{ meta.noAds[m] = !!(saved.noAds && saved.noAds[m]); });
    META_MODES.forEach(m=>{ meta.totals[m] = (saved.totals && saved.totals[m]) || 0; });
    meta.missions = Array.isArray(saved.missions) ? saved.missions : [];
    meta.missionDay = saved.missionDay || '';
  }catch(e){}
}

function metaSave(){
  try{ localStorage.setItem(META_KEY, JSON.stringify(meta)); }catch(e){}
}

// --- gemmes ----------------------------------------------------------------
function addGems(n, silent){
  if(n <= 0) return;
  meta.gems += n;
  metaSave();
  updateMetaHud();
  if(!silent) showToast(t('meta_gems_won', { n }));
}

function spendGems(n){
  if(meta.gems < n) return false;
  meta.gems -= n;
  metaSave();
  updateMetaHud();
  return true;
}

// --- profil ----------------------------------------------------------------
// Palier d'expérience volontairement simple (croissance quadratique douce) :
// le niveau de profil n'ouvre aucun pouvoir, il ne fait que MESURER le temps
// passé sur l'ensemble des jeux. Lui donner un effet mécanique aurait obligé
// à équilibrer les quatre jeux les uns par rapport aux autres.
function xpForLevel(lvl){ return Math.round(60 * lvl * Math.pow(lvl, 0.35)); }
function metaLevel(){
  let lvl = 1, need = xpForLevel(1);
  while(meta.xp >= need && lvl < 200){ lvl++; need += xpForLevel(lvl); }
  return lvl;
}
function metaLevelProgress(){
  let lvl = 1, spent = 0, need = xpForLevel(1);
  while(meta.xp >= spent + need && lvl < 200){ spent += need; lvl++; need = xpForLevel(lvl); }
  return { lvl, cur: meta.xp - spent, need };
}

function addXp(n){
  if(n <= 0) return;
  const before = metaLevel();
  meta.xp += n;
  const after = metaLevel();
  metaSave();
  updateMetaHud();
  if(after > before){
    // la montée de niveau paie en gemmes : c'est ce qui fait que jouer
    // n'importe lequel des quatre jeux alimente la boutique
    addGems(after - before, true);
    showToast(t('meta_level_up', { n: after }));
  }
}

// --- publicités ------------------------------------------------------------
// Un seul point de vérité, consulté par les quatre jeux avant d'afficher un
// écran de pub (voir showChapterBreak dans modes.js). "Tous les jeux" est
// stocké comme les quatre drapeaux à vrai plutôt qu'un cinquième drapeau : un
// seul cas à tester partout, donc aucun risque d'en oublier un.
function hasNoAds(mode){ return !!meta.noAds[mode]; }
function hasNoAdsEverywhere(){ return META_MODES.every(m=>meta.noAds[m]); }

// --- missions du jour ------------------------------------------------------
// Trois missions tirées dans des jeux DIFFÉRENTS : c'est le seul mécanisme du
// jeu qui pousse activement à changer de mini-jeu. Elles se renouvellent au
// changement de date locale.
const MISSION_POOL = [
  { id:'battle_horde', mode:'battle', target:25,  gems:3 },
  { id:'battle_time',  mode:'battle', target:60,  gems:3 },
  { id:'tower_wave',   mode:'tower',  target:5,   gems:3 },
  { id:'tower_kills',  mode:'tower',  target:40,  gems:3 },
  { id:'mill_coins',   mode:'mill',   target:300, gems:3 },
  { id:'mill_upgrade', mode:'mill',   target:6,   gems:3 },
  { id:'puzzle_level', mode:'puzzle', target:3,   gems:4 },
  { id:'puzzle_power', mode:'puzzle', target:50000, gems:4 }
];

function todayKey(){
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
}

function rollMissions(){
  const day = todayKey();
  if(meta.missionDay === day && meta.missions.length) return;
  meta.missionDay = day;
  // un tirage par jeu, puis on en garde trois : garantit que les missions ne
  // se concentrent jamais sur un seul mini-jeu
  const byMode = {};
  MISSION_POOL.forEach(m=>{ (byMode[m.mode] = byMode[m.mode] || []).push(m); });
  const modes = META_MODES.slice().sort(()=>Math.random()-0.5).slice(0, 3);
  meta.missions = modes.map(mode=>{
    const pool = byMode[mode];
    const def = pool[Math.floor(Math.random()*pool.length)];
    return { id: def.id, mode: def.mode, target: def.target, gems: def.gems, progress: 0, done: false };
  });
  metaSave();
}

// Appelée par les jeux quand une valeur susceptible d'avancer une mission
// bouge. `value` est une valeur ABSOLUE atteinte (meilleure vague, pièces
// totales…), pas un incrément : les jeux n'ont donc pas à savoir si la
// mission existe ni à quel point elle est avancée.
function reportMission(id, value){
  const m = meta.missions.find(x=>x.id === id);
  if(!m || m.done) return;
  if(value <= m.progress) return;
  m.progress = Math.min(m.target, value);
  if(m.progress >= m.target){
    m.done = true;
    addGems(m.gems, true);
    showToast(t('meta_mission_done', { n: m.gems }));
  }
  metaSave();
  updateMetaHud();
}

function missionLabel(m){
  return t('mission_' + m.id, { n: m.target });
}

// --- affichage -------------------------------------------------------------
function updateMetaHud(){
  // deux compteurs : celui du menu et celui de la boutique elle-même — on
  // doit voir son solde AU MOMENT où l'on compare les prix, pas seulement
  // avant d'entrer
  ['gemCount', 'shopGemCount'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.textContent = meta.gems;
  });
  const p = metaLevelProgress();
  const lvlEl = document.getElementById('metaLevel');
  if(lvlEl) lvlEl.textContent = p.lvl;
  const barEl = document.getElementById('metaXpFill');
  if(barEl) barEl.style.width = Math.round(100 * p.cur / p.need) + '%';
  const noAdsBadge = document.getElementById('menuNoAdsBadge');
  if(noAdsBadge) noAdsBadge.classList.toggle('hidden', !hasNoAdsEverywhere());
}

metaLoad();
rollMissions();
