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
  totals: { battle:0, tower:0, mill:0, puzzle:0 }, // parties jouées, par jeu
  perks: { battlePower:0, towerFish:0, puzzlePower:0, millCrew:0 },
  skins: { owned:['roux'], equipped:'roux' },
  daily: { lastDay:'', streak:0 }
};

// --- progression permanente ------------------------------------------------
// LE manque le plus criant des trois jeux à parties courtes : mourir ne
// laissait RIEN. Un jeu mobile n'accroche que si échouer fait quand même
// avancer quelque chose — sinon la vingtième partie est identique à la
// première et il n'y a aucune raison de relancer. Ces améliorations
// s'achètent en gemmes, se gardent pour toujours, et se voient dès la
// première seconde de la partie suivante.
const PERKS = [
  { id:'battlePower', mode:'battle', max:5, base:30, icon:'\u2694\uFE0F' },
  { id:'towerFish',   mode:'tower',  max:5, base:30, icon:'\uD83D\uDC1F' },
  { id:'puzzlePower', mode:'puzzle', max:5, base:35, icon:'\u26A1' },
  { id:'millCrew',    mode:'mill',   max:5, base:40, icon:'\uD83E\uDE93' }
];
const PERK_COST_GROWTH = 1.7;

function perkLevel(id){ return (meta.perks && meta.perks[id]) || 0; }
function perkCost(def){ return Math.round(def.base * Math.pow(PERK_COST_GROWTH, perkLevel(def.id))); }

// Effets, lus par les jeux au démarrage d'une partie. Ils sont VOLONTAIREMENT
// modestes (12 à 50 % au niveau 5) : une progression permanente qui rendrait
// le jeu facile détruirait ce qu'elle est censée servir.
function perkBattleDamageMult(){ return 1 + perkLevel('battlePower') * 0.12; }
function perkTowerBonusFish(){ return perkLevel('towerFish') * 25; }
function perkPuzzleStartPower(){ return Math.round(PUZZLE_START_POWER * (1 + perkLevel('puzzlePower') * 0.5)); }
function perkMillCrewSpeed(){ return 1 + perkLevel('millCrew') * 0.12; }

function buyPerk(id){
  const def = PERKS.find(p=>p.id === id);
  if(!def || perkLevel(id) >= def.max) return false;
  const cost = perkCost(def);
  if(!spendGems(cost)) { showToast(t('meta_not_enough_gems')); return false; }
  meta.perks[id] = perkLevel(id) + 1;
  metaSave();
  showToast(t('perk_bought', { name: t('perk_' + id), n: meta.perks[id] }));
  return true;
}

// --- collection de chats ---------------------------------------------------
// Le puits de dépense sans fond, et la seule chose qui traverse les quatre
// jeux en étant PUREMENT décorative : le chat qu'on incarne est le même
// partout, donc changer sa robe se voit partout. Trois robes s'obtiennent en
// montant de niveau (elles prouvent au joueur que la collection existe avant
// qu'il ait dépensé quoi que ce soit), les autres s'achètent.
const CAT_SKINS = [
  { id:'roux',     fur:0xD98244, accent:0x2F6BB5, price:0,   need:0 },
  { id:'gris',     fur:0x8C8F9A, accent:0xC94868, price:0,   need:3 },
  { id:'creme',    fur:0xE8D6B4, accent:0x5C8C4A, price:0,   need:6 },
  { id:'noir',     fur:0x3A3A42, accent:0xE3A857, price:40,  need:0 },
  { id:'blanc',    fur:0xF2ECE0, accent:0x53BDD6, price:40,  need:0 },
  { id:'tigre',    fur:0xC98A3B, accent:0x3B3226, price:60,  need:0 },
  { id:'siamois',  fur:0xDCCBB0, accent:0x6B7FC4, price:60,  need:0 },
  { id:'bleu',     fur:0x7C93A8, accent:0xF2ECE0, price:80,  need:0 },
  { id:'rose',     fur:0xE8B4C4, accent:0x8E4A6B, price:80,  need:0 },
  { id:'vert',     fur:0x8FAE7C, accent:0x3B5E2E, price:110, need:0 },
  { id:'lavande',  fur:0xB49AC8, accent:0x4A3A6B, price:110, need:0 },
  { id:'dore',     fur:0xE8B84B, accent:0x8E5A1F, price:150, need:0 }
];

function skinDef(id){ return CAT_SKINS.find(s=>s.id === id) || CAT_SKINS[0]; }
function currentSkin(){ return skinDef(meta.skins && meta.skins.equipped); }
function skinOwned(id){
  const def = skinDef(id);
  if(def.need > 0 && metaLevel() >= def.need) return true;
  return meta.skins.owned.indexOf(id) >= 0;
}

function buySkin(id){
  const def = skinDef(id);
  if(skinOwned(id)) return false;
  if(!spendGems(def.price)){ showToast(t('meta_not_enough_gems')); return false; }
  meta.skins.owned.push(id);
  metaSave();
  equipSkin(id);
  return true;
}

function equipSkin(id){
  if(!skinOwned(id)) return;
  meta.skins.equipped = id;
  metaSave();
  applySkinEverywhere();
  showToast(t('skin_equipped', { name: t('skin_' + id) }));
}

// Applique la robe choisie aux QUATRE chats du joueur d'un coup. Chaque mode
// garde son personnage en mémoire une fois construit, donc il ne suffit pas
// de changer une constante : il faut aller repeindre ce qui existe déjà.
function applySkinEverywhere(){
  if(!webglSupported) return;
  const sk = currentSkin();
  // Chatteau Fort, Scierie, Palais : même fonction de construction, donc même
  // méthode de recoloration
  [typeof hero !== 'undefined' && hero.visual,
   typeof millHero !== 'undefined' && millHero.visual,
   typeof puzzleHero !== 'undefined' && puzzleHero.visual]
    .forEach(v=>{ if(v) recolorHeroCat(v, sk.fur, sk.accent); });
  // Bataille : le chat meneur partage un matériau de module (catMaterial) et
  // peut avoir été remplacé par un vrai modèle 3D — recolorLeaderCat() gère
  // les deux cas.
  if(typeof recolorLeaderCat === 'function') recolorLeaderCat(sk.fur);
}

// --- récompense quotidienne ------------------------------------------------
// Ce qui manquait pour donner une raison de REVENIR, et non seulement de
// continuer. La série se remet à zéro si un jour est sauté : c'est ce qui
// transforme une habitude en rendez-vous.
const DAILY_REWARDS = [3, 4, 5, 8, 10, 12, 25];

function dailyDayIndex(){ return Math.floor(Date.now() / 86400000); }

function dailyStatus(){
  const today = dailyDayIndex();
  const last = meta.daily.lastDay === '' ? -999 : parseInt(meta.daily.lastDay, 10);
  if(last === today) return { claimable:false, streak: meta.daily.streak };
  // un jour sauté remet la série à zéro ; deux jours de suite l'enchaînent
  const streak = (today - last === 1) ? meta.daily.streak : 0;
  return { claimable:true, streak };
}

function claimDaily(){
  const st = dailyStatus();
  if(!st.claimable) return 0;
  const day = st.streak % DAILY_REWARDS.length;
  const gain = DAILY_REWARDS[day];
  meta.daily.lastDay = String(dailyDayIndex());
  meta.daily.streak = st.streak + 1;
  metaSave();
  addGems(gain, true);
  return gain;
}

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
    if(saved.perks) Object.keys(meta.perks).forEach(k=>{ meta.perks[k] = saved.perks[k] || 0; });
    if(saved.skins){
      meta.skins.owned = Array.isArray(saved.skins.owned) && saved.skins.owned.length
        ? saved.skins.owned : ['roux'];
      meta.skins.equipped = saved.skins.equipped || 'roux';
    }
    if(saved.daily){
      meta.daily.lastDay = saved.daily.lastDay || '';
      meta.daily.streak = saved.daily.streak || 0;
    }
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
  // pastille sur le bouton boutique quand la récompense du jour attend
  const dot = document.getElementById('dailyDot');
  if(dot) dot.classList.toggle('hidden', !dailyStatus().claimable);
}

metaLoad();
rollMissions();
