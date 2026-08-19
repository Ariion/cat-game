// Palettes de "biomes" (couleurs uniquement — aucune géométrie propre à un
// biome, pour rester léger et permettre un fondu simple entre deux jeux de
// couleurs). Le décor change de biome tous les BIOME_PALIER_SPAN paliers,
// en boucle (voir targetBiomeIndex() dans gameplay.js).
const BIOMES = [
  { // 0 — Prairie (biome de départ)
    name: "prairie",
    skySteps: [0x7FB2E0, 0xBEE0EC, 0xF3E3C4, 0xF6E9CF],
    fog: 0xF6E9CF,
    ground: 0x8FAE6B,
    mountainFar: 0x7E9C9C, mountainNear: 0x5F8778,
    foliageA: 0x6B8F71, foliageB: 0x7FA372,
    grass: 0x6F9A52,
    hemiSky: 0xfff6e0, hemiGround: 0x74926f,
    sun: 0xfff1d8
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
    sun: 0xffdca8
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
    sun: 0xf0f8ff
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
    sun: 0xffe6b0
  }
];
