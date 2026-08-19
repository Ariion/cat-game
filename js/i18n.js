// Traductions FR/EN/DE/ES. Les textes statiques du HTML sont marqués avec
// data-i18n="clé" et mis à jour par applyTranslations(). Les textes
// construits dynamiquement en JS utilisent t('clé', {variables}).
const translations = {
  fr: {
    menu_title: "Horde de chats",
    menu_desc: "Glisse pour te déplacer : fonce sur les croquettes et les cœurs, évite l'eau. Ta horde tire tout droit sur les chiens — survis le plus longtemps possible !",
    btn_play: "Jouer",
    btn_resume_menu: "Reprendre",
    btn_options: "Options",
    btn_leaderboard: "Classement",
    options_title: "Options",
    options_lang_label: "Langue",
    btn_back: "Retour",
    leaderboard_title: "Classement",
    leaderboard_local_note: "Classement local à cet appareil. Un vrai classement mondial demanderait un serveur.",
    leaderboard_empty: "Aucune partie enregistrée pour l'instant.",
    lose_title: "Trop petite bande...",
    lose_cause_boss: "Le chien du quartier t'a eu",
    lose_cause_enemy: "Un chien t'a rattrapé",
    lose_stats: "{cause} — {horde} {cat}, {time} de survie, {bosses} {boss}.",
    btn_retry: "Recommencer",
    btn_continue_ad: "▶ Continuer (pub)",
    ad_title: "Publicité",
    ad_text: "Reprise dans un instant…",
    pause_title: "Pause",
    pause_stats: "{horde} {cat} · Palier {palier} · {time}",
    btn_pause_resume: "Reprendre",
    btn_save: "Sauvegarder",
    save_toast: "Partie sauvegardée !",
    palier_toast: "Palier {n} !",
    palier_label: "Palier {n}",
    biome_toast: "Nouveau décor !",
    boss_hp_label: "Chien du quartier : {hp} / {max} PV",
    hint_text: "← glisse ou utilise les flèches →",
    record_prefix: "Record",
    cat_s: "chat", cat_p: "chats",
    boss_s: "chien du quartier vaincu", boss_p: "chiens du quartier vaincus"
  },
  en: {
    menu_title: "Cat Horde",
    menu_desc: "Slide to move: grab the kibble and hearts, dodge the water. Your horde fires straight at the dogs — survive as long as you can!",
    btn_play: "Play",
    btn_resume_menu: "Resume",
    btn_options: "Options",
    btn_leaderboard: "Leaderboard",
    options_title: "Options",
    options_lang_label: "Language",
    btn_back: "Back",
    leaderboard_title: "Leaderboard",
    leaderboard_local_note: "Local leaderboard on this device. A true world leaderboard would need a server.",
    leaderboard_empty: "No runs recorded yet.",
    lose_title: "Too small a pack...",
    lose_cause_boss: "The neighborhood dog got you",
    lose_cause_enemy: "A dog caught up with you",
    lose_stats: "{cause} — {horde} {cat}, {time} survived, {bosses} {boss}.",
    btn_retry: "Restart",
    btn_continue_ad: "▶ Continue (ad)",
    ad_title: "Advertisement",
    ad_text: "Resuming in a moment…",
    pause_title: "Paused",
    pause_stats: "{horde} {cat} · Tier {palier} · {time}",
    btn_pause_resume: "Resume",
    btn_save: "Save",
    save_toast: "Game saved!",
    palier_toast: "Tier {n}!",
    palier_label: "Tier {n}",
    biome_toast: "New scenery!",
    boss_hp_label: "Neighborhood dog: {hp} / {max} HP",
    hint_text: "← slide or use the arrow keys →",
    record_prefix: "Best",
    cat_s: "cat", cat_p: "cats",
    boss_s: "neighborhood dog defeated", boss_p: "neighborhood dogs defeated"
  },
  de: {
    menu_title: "Katzenhorde",
    menu_desc: "Wische, um dich zu bewegen: schnapp dir Kroketten und Herzen, weiche dem Wasser aus. Deine Horde schießt geradeaus auf die Hunde — überlebe so lange wie möglich!",
    btn_play: "Spielen",
    btn_resume_menu: "Fortsetzen",
    btn_options: "Optionen",
    btn_leaderboard: "Bestenliste",
    options_title: "Optionen",
    options_lang_label: "Sprache",
    btn_back: "Zurück",
    leaderboard_title: "Bestenliste",
    leaderboard_local_note: "Lokale Bestenliste auf diesem Gerät. Eine echte Weltbestenliste bräuchte einen Server.",
    leaderboard_empty: "Noch keine Partie gespeichert.",
    lose_title: "Zu kleine Bande...",
    lose_cause_boss: "Der Nachbarschaftshund hat dich erwischt",
    lose_cause_enemy: "Ein Hund hat dich eingeholt",
    lose_stats: "{cause} — {horde} {cat}, {time} überlebt, {bosses} {boss}.",
    btn_retry: "Neu starten",
    btn_continue_ad: "▶ Fortsetzen (Werbung)",
    ad_title: "Werbung",
    ad_text: "Geht gleich weiter…",
    pause_title: "Pause",
    pause_stats: "{horde} {cat} · Stufe {palier} · {time}",
    btn_pause_resume: "Fortsetzen",
    btn_save: "Speichern",
    save_toast: "Spiel gespeichert!",
    palier_toast: "Stufe {n}!",
    palier_label: "Stufe {n}",
    biome_toast: "Neue Landschaft!",
    boss_hp_label: "Nachbarschaftshund: {hp} / {max} LP",
    hint_text: "← wischen oder Pfeiltasten benutzen →",
    record_prefix: "Rekord",
    cat_s: "Katze", cat_p: "Katzen",
    boss_s: "Nachbarschaftshund besiegt", boss_p: "Nachbarschaftshunde besiegt"
  },
  es: {
    menu_title: "Horda de gatos",
    menu_desc: "Desliza para moverte: ve a por las croquetas y los corazones, esquiva el agua. Tu horda dispara recto a los perros — ¡sobrevive el mayor tiempo posible!",
    btn_play: "Jugar",
    btn_resume_menu: "Continuar",
    btn_options: "Opciones",
    btn_leaderboard: "Clasificación",
    options_title: "Opciones",
    options_lang_label: "Idioma",
    btn_back: "Atrás",
    leaderboard_title: "Clasificación",
    leaderboard_local_note: "Clasificación local en este dispositivo. Una clasificación mundial real necesitaría un servidor.",
    leaderboard_empty: "Todavía no hay partidas guardadas.",
    lose_title: "Manada demasiado pequeña...",
    lose_cause_boss: "El perro del barrio te atrapó",
    lose_cause_enemy: "Un perro te alcanzó",
    lose_stats: "{cause} — {horde} {cat}, {time} sobrevividos, {bosses} {boss}.",
    btn_retry: "Reiniciar",
    btn_continue_ad: "▶ Continuar (anuncio)",
    ad_title: "Anuncio",
    ad_text: "Continuando en un momento…",
    pause_title: "Pausa",
    pause_stats: "{horde} {cat} · Nivel {palier} · {time}",
    btn_pause_resume: "Continuar",
    btn_save: "Guardar",
    save_toast: "¡Partida guardada!",
    palier_toast: "¡Nivel {n}!",
    palier_label: "Nivel {n}",
    biome_toast: "¡Nuevo paisaje!",
    boss_hp_label: "Perro del barrio: {hp} / {max} PV",
    hint_text: "← desliza o usa las flechas →",
    record_prefix: "Récord",
    cat_s: "gato", cat_p: "gatos",
    boss_s: "perro del barrio derrotado", boss_p: "perros del barrio derrotados"
  }
};

let lang = 'fr';
try{ lang = localStorage.getItem('hordeDeChatsLang') || 'fr'; }catch(e){}
if(!translations[lang]) lang = 'fr';

function t(key, vars){
  let str = (translations[lang] && translations[lang][key]) || translations.fr[key] || key;
  if(vars){
    Object.keys(vars).forEach(k=>{ str = str.split('{'+k+'}').join(vars[k]); });
  }
  return str;
}

function pluralWord(n, sKey, pKey){
  return n > 1 ? t(pKey) : t(sKey);
}
function catWord(n){ return pluralWord(n !== undefined ? n : hordeCount, 'cat_s', 'cat_p'); }
function bossWord(n){ return pluralWord(n !== undefined ? n : bossesDefeated, 'boss_s', 'boss_p'); }

function applyTranslations(){
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('.lang-btn').forEach(el=>{
    el.classList.toggle('active', el.dataset.lang === lang);
  });
}

function setLang(newLang){
  if(!translations[newLang]) return;
  lang = newLang;
  try{ localStorage.setItem('hordeDeChatsLang', lang); }catch(e){}
  applyTranslations();
  if(typeof updateHud === 'function') updateHud();
  if(typeof updateBestScoreDisplays === 'function') updateBestScoreDisplays();
}
