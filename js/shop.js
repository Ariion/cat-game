// Boutique commune aux quatre jeux, et emplacement publicitaire unique.
//
// HONNÊTETÉ DU PAIEMENT. Un site web statique ne peut pas encaisser un
// paiement : il n'y a ni SDK de facturation, ni compte marchand, ni serveur.
// Les lots de gemmes sont donc des ACHATS SIMULÉS, et c'est écrit sur le
// bouton — pas caché dans une note de bas de page. Le point de branchement
// d'une vraie facturation (Google Play Billing / StoreKit une fois le jeu
// empaqueté en app) est buyGemPack() : c'est la SEULE fonction à remplacer,
// tout le reste du code n'en sait rien.
//
// La suppression des publicités, elle, s'achète en gemmes gagnées en jouant :
// elle est donc réellement atteignable sans payer, ce qui évite d'exposer une
// promesse que le jeu ne peut pas tenir aujourd'hui.

const GEM_PACKS = [
  { id:'pack_s', gems: 50,  price: '0,99 €' },
  { id:'pack_m', gems: 170, price: '2,99 €', bonus: 13 },
  { id:'pack_l', gems: 600, price: '8,99 €', bonus: 20 }
];

const NOADS_PRICE_ONE = 120;
const NOADS_PRICE_ALL = 320; // moins cher que les quatre séparément (480)

// Emplacement publicitaire : UN SEUL point de décision pour les quatre jeux.
// Avant, chaque mode affichait son bloc lui-même ; centraliser garantit qu'un
// achat "sans pub" est respecté partout, y compris dans un mode ajouté plus
// tard — il suffit d'appeler cette fonction.
function showAdSlot(slotId, mode){
  const el = document.getElementById(slotId);
  if(!el) return;
  el.classList.toggle('hidden', hasNoAds(mode));
}

function openShop(){
  renderShop();
  document.getElementById('screenShop').classList.remove('hidden');
}

function closeShop(){
  document.getElementById('screenShop').classList.add('hidden');
}

function renderShop(){
  updateMetaHud();
  const p = metaLevelProgress();
  const prof = document.getElementById('shopProfile');
  if(prof) prof.textContent = t('shop_profile', { lvl: p.lvl, cur: p.cur, need: p.need });

  // --- lots de gemmes
  const packs = document.getElementById('shopPacks');
  packs.innerHTML = '';
  GEM_PACKS.forEach(pk=>{
    const b = document.createElement('button');
    b.className = 'shop-item';
    b.innerHTML =
      '<span class="shop-item-icon">💎</span>' +
      '<span class="shop-item-main"><span class="shop-item-title">' + pk.gems + ' ' + t('shop_gems') + '</span>' +
      (pk.bonus ? '<span class="shop-item-note">+' + pk.bonus + '% ' + t('shop_bonus') + '</span>' : '') +
      '</span>' +
      '<span class="shop-item-price">' + pk.price + '<small>' + t('shop_simulated') + '</small></span>';
    b.onclick = ()=>buyGemPack(pk.id);
    packs.appendChild(b);
  });

  // --- pub récompensée : la seule source de gemmes qui ne demande ni temps
  // de jeu ni argent. Volontairement plafonnée, sinon elle remplacerait le jeu.
  const rewarded = document.getElementById('shopRewarded');
  rewarded.innerHTML = '';
  const rb = document.createElement('button');
  const ready = rewardedAdReady();
  rb.className = 'shop-item' + (ready ? '' : ' disabled');
  rb.innerHTML =
    '<span class="shop-item-icon">▶️</span>' +
    '<span class="shop-item-main"><span class="shop-item-title">' + t('shop_rewarded_title') + '</span>' +
    '<span class="shop-item-note">' + (ready ? t('shop_rewarded_note') : t('shop_rewarded_wait')) + '</span></span>' +
    '<span class="shop-item-price">+3 💎</span>';
  if(ready) rb.onclick = watchRewardedAd;
  rewarded.appendChild(rb);

  // --- suppression des publicités
  const ads = document.getElementById('shopNoAds');
  ads.innerHTML = '';
  const allDone = hasNoAdsEverywhere();
  const allBtn = document.createElement('button');
  allBtn.className = 'shop-item highlight' + (allDone ? ' owned' : (meta.gems < NOADS_PRICE_ALL ? ' disabled' : ''));
  allBtn.innerHTML =
    '<span class="shop-item-icon">🚫</span>' +
    '<span class="shop-item-main"><span class="shop-item-title">' + t('shop_noads_all') + '</span>' +
    '<span class="shop-item-note">' + t('shop_noads_all_note') + '</span></span>' +
    '<span class="shop-item-price">' + (allDone ? t('shop_owned') : NOADS_PRICE_ALL + ' 💎') + '</span>';
  if(!allDone && meta.gems >= NOADS_PRICE_ALL) allBtn.onclick = buyNoAdsAll;
  ads.appendChild(allBtn);

  META_MODES.forEach(mode=>{
    const owned = hasNoAds(mode);
    const b = document.createElement('button');
    b.className = 'shop-item' + (owned ? ' owned' : (meta.gems < NOADS_PRICE_ONE ? ' disabled' : ''));
    b.innerHTML =
      '<span class="shop-item-icon">' + MODE_ICON[mode] + '</span>' +
      '<span class="shop-item-main"><span class="shop-item-title">' + t('shop_noads_one', { game: t('mode_' + mode + '_title') }) + '</span></span>' +
      '<span class="shop-item-price">' + (owned ? t('shop_owned') : NOADS_PRICE_ONE + ' 💎') + '</span>';
    if(!owned && meta.gems >= NOADS_PRICE_ONE) b.onclick = ()=>buyNoAdsOne(mode);
    ads.appendChild(b);
  });

  renderMissions();
}

const MODE_ICON = { battle:'🐱', tower:'🏰', mill:'🪵', puzzle:'🏛️' };

function renderMissions(){
  const list = document.getElementById('shopMissions');
  if(!list) return;
  list.innerHTML = '';
  meta.missions.forEach(m=>{
    const row = document.createElement('div');
    row.className = 'mission-row' + (m.done ? ' done' : '');
    const pct = Math.round(100 * m.progress / m.target);
    row.innerHTML =
      '<span class="mission-icon">' + MODE_ICON[m.mode] + '</span>' +
      '<span class="mission-main"><span class="mission-title">' + missionLabel(m) + '</span>' +
      '<span class="mission-bar"><span class="mission-bar-fill" style="width:' + pct + '%"></span></span></span>' +
      '<span class="mission-reward">' + (m.done ? '✓' : '+' + m.gems + ' 💎') + '</span>';
    list.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// C'EST ICI qu'une vraie facturation se branche (Google Play Billing via
// Capacitor, StoreKit sur iOS) : lancer l'achat, puis n'appeler addGems() que
// dans le callback de succès, après vérification du reçu côté serveur. Tant
// que le jeu tourne dans un navigateur, l'achat est simulé et annoncé comme
// tel au joueur — on ne fait jamais semblant d'encaisser.
function buyGemPack(id){
  const pack = GEM_PACKS.find(p=>p.id === id);
  if(!pack) return;
  addGems(pack.gems, true);
  showToast(t('shop_simulated_done', { n: pack.gems }));
  renderShop();
}

// Pub récompensée simulée, une fois toutes les 3 minutes. Dans un navigateur,
// la pub récompensée n'existe pas (les régies interdisent l'incitation) : ce
// délai tient la place du chargement et du visionnage réels.
let rewardedAdAt = 0;
const REWARDED_COOLDOWN_MS = 3 * 60 * 1000;
function rewardedAdReady(){ return Date.now() - rewardedAdAt >= REWARDED_COOLDOWN_MS; }

function watchRewardedAd(){
  if(!rewardedAdReady()) return;
  rewardedAdAt = Date.now();
  document.getElementById('screenAd').classList.remove('hidden');
  setTimeout(()=>{
    document.getElementById('screenAd').classList.add('hidden');
    addGems(3, true);
    showToast(t('meta_gems_won', { n: 3 }));
    renderShop();
  }, 2200);
}

function buyNoAdsOne(mode){
  if(!spendGems(NOADS_PRICE_ONE)){ showToast(t('meta_not_enough_gems')); return; }
  meta.noAds[mode] = true;
  metaSave();
  showToast(t('shop_noads_done', { game: t('mode_' + mode + '_title') }));
  renderShop();
}

function buyNoAdsAll(){
  if(!spendGems(NOADS_PRICE_ALL)){ showToast(t('meta_not_enough_gems')); return; }
  META_MODES.forEach(m=>{ meta.noAds[m] = true; });
  metaSave();
  showToast(t('shop_noads_all_done'));
  renderShop();
}
