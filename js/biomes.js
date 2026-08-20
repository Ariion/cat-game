// Palettes de "biomes" (couleurs + effets de gameplay). Le décor change de
// biome tous les BIOME_PALIER_SPAN paliers, en boucle (voir
// targetBiomeIndex() dans gameplay.js). gameplayMods donne un sens
// mécanique à chaque biome (pas seulement visuel) :
//  - moveLerpMult < 1 : le chat répond moins vite au doigt (sol glissant)
//  - enemySpeedMult > 1 : les ennemis approchent plus vite
//  - fogDensityMult > 1 : brouillard plus dense, moins de temps pour réagir
// Tous interpolés en douceur pendant le fondu, comme les couleurs — voir
// updateBiomeTransition() dans scene3d.js.
const BIOMES = [
  { // 0 — Prairie (biome de départ, neutre)
    name: "prairie",
    skySteps: [0x7FB2E0, 0xBEE0EC, 0xF3E3C4, 0xF6E9CF],
    fog: 0xF6E9CF,
    ground: 0x8FAE6B,
    mountainFar: 0x7E9C9C, mountainNear: 0x5F8778,
    foliageA: 0x6B8F71, foliageB: 0x7FA372,
    grass: 0x6F9A52,
    hemiSky: 0xfff6e0, hemiGround: 0x74926f,
    sun: 0xfff1d8,
    // météo d'ambiance : légers pollens flottants, discrets
    weather: { color: 0xFFF6D8, opacity: 0.3, fallSpeed: 0.005, driftSpeed: 0.004, size: 0.032 },
    gameplayMods: { moveLerpMult: 1, enemySpeedMult: 1, fogDensityMult: 1 }
  },
  { // 1 — Automne
    name: "automne",
    skySteps: [0x8FA8C2, 0xE0C9A6, 0xF3D3A0, 0xF7E2C0],
    fog: 0xF3D8B0,
    ground: 0xB98E5A,
    mountainFar: 0x9C8A7E, mountainNear: 0x7A6151,
    foliageA: 0xC97B3D, foliageB: 0xB6472F,
    grass: 0xAD7A3E,
    hemiSky: 0xffe8c2, hemiGround: 0x8a6b4a,
    sun: 0xffdca8,
    // feuilles mortes qui tombent
    weather: { color: 0xC97B3D, opacity: 0.55, fallSpeed: 0.013, driftSpeed: 0.011, size: 0.07 },
    // brouillard plus dense : moins de temps pour repérer/réagir aux ennemis
    gameplayMods: { moveLerpMult: 1, enemySpeedMult: 1, fogDensityMult: 1.6 }
  },
  { // 2 — Neige
    name: "neige",
    skySteps: [0x9FC3DE, 0xD7E8F0, 0xEDF4F7, 0xF6FAFC],
    fog: 0xEAF3F7,
    ground: 0xE8F0F2,
    mountainFar: 0xADC4CC, mountainNear: 0x8FAAB5,
    foliageA: 0x7FA89B, foliageB: 0xE9F1F2,
    grass: 0xCFE0E2,
    hemiSky: 0xffffff, hemiGround: 0x9fb8c2,
    sun: 0xf0f8ff,
    // chute de neige
    weather: { color: 0xFFFFFF, opacity: 0.7, fallSpeed: 0.02, driftSpeed: 0.006, size: 0.05 },
    // sol glissant : le chat répond moins vite au doigt
    gameplayMods: { moveLerpMult: 0.55, enemySpeedMult: 1, fogDensityMult: 1 }
  },
  { // 3 — Désert
    name: "desert",
    skySteps: [0x7FAAD1, 0xE8C48A, 0xF3D9A6, 0xF7E8C8],
    fog: 0xEFD3A0,
    ground: 0xD9B375,
    mountainFar: 0xC2A06E, mountainNear: 0xA9824F,
    foliageA: 0x8C9B4A, foliageB: 0xB58A4A,
    grass: 0xC0A25E,
    hemiSky: 0xfff2d0, hemiGround: 0xab8752,
    sun: 0xffe6b0,
    // poussière portée par le vent, surtout horizontale
    weather: { color: 0xE8C48A, opacity: 0.4, fallSpeed: 0.003, driftSpeed: 0.022, size: 0.045 },
    // la chaleur les rend plus agressifs : ennemis plus rapides
    gameplayMods: { moveLerpMult: 1, enemySpeedMult: 1.25, fogDensityMult: 1 }
  }
];
