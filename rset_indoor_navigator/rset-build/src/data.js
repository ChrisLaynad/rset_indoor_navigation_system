import mapData from './rset-map-data.json';

export const MAP_SIZE = 76;
export const WORLD_SIZE_X = 49.62108662109358;
export const WORLD_SIZE_Z = 50;
export const WORLD_SIZE = WORLD_SIZE_Z;
export const MAP_TO_WORLD_SCALE_X = WORLD_SIZE_X / MAP_SIZE;
export const MAP_TO_WORLD_SCALE_Z = WORLD_SIZE_Z / MAP_SIZE;

// These dimensions come from the supplied FBX after the app's 50 m normalization.
// Keeping X and Z separate removes the small horizontal stretch introduced by forcing
// the FBX's 49.621 m width into the full 50 m square.
export function mapToWorld(x, y) {
  return { x: (x - MAP_SIZE / 2) * MAP_TO_WORLD_SCALE_X, z: (MAP_SIZE / 2 - y) * MAP_TO_WORLD_SCALE_Z };
}

export function worldToMap(x, z) {
  return { x: x / MAP_TO_WORLD_SCALE_X + MAP_SIZE / 2, y: MAP_SIZE / 2 - z / MAP_TO_WORLD_SCALE_Z };
}

export const floors = mapData.floors.map((f) => ({
  id: ({ G: 'ground', F1: 'first', F2: 'second', F3: 'third' })[f.floorId],
  mapId: f.floorId,
  label: f.name,
  short: f.short,
  level: f.floorNumber,
  elevation: f.elevation,
  image: ({ G: '/ground-plan.jpg', F1: '/first-plan.jpg', F2: '/second-plan.jpg', F3: '/third-plan.jpg' })[f.floorId],
}));

const floorByMap = Object.fromEntries(floors.map((f) => [f.mapId, f]));

export const places = mapData.rooms.map((r) => {
  const floor = floorByMap[r.floorId];
  const world = mapToWorld(r.x, r.y);
  const doorWorld = r.door ? mapToWorld(r.door[0], r.door[1]) : world;
  return {
    id: r.id,
    name: r.name,
    label: r.name,
    type: r.type,
    category: r.type,
    floor: floor?.id,
    mapFloor: r.floorId,
    floorLabel: floor?.label ?? r.floorId,
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    world,
    door: r.door,
    doorWorld,
    doorNode: r.doorNode,
    aliases: r.aliases ?? [],
    searchable: r.searchable !== false,
    accessible: r.accessible !== false,
    doorRef: r.doorRef,
  };
});

export const navigationNodes = mapData.navigationNodes;
export const navigationEdges = mapData.navigationEdges;
export const qrCheckpoints = mapData.qrCheckpoints;
export const campusBoundary = mapData.campusBoundary;
export const mapConfig = mapData.config;
export const mapWarnings = mapData.meta?.warnings ?? [];

export const locationMarkers = places.map((p) => ({
  id: p.id,
  name: p.name,
  floor: p.floor,
  mapFloor: p.mapFloor,
  position: p.doorWorld,
  category: p.category,
}));

const reception = places.find((p) => /reception/i.test(p.name)) ?? places[0];
export const DEFAULT_CURRENT_LOCATION = {
  floor: reception?.floor ?? 'ground',
  mapFloor: reception?.mapFloor ?? 'G',
  nodeId: reception?.doorNode ?? null,
  x: reception?.doorWorld?.x ?? 0,
  z: reception?.doorWorld?.z ?? 0,
  accuracy: 2,
  source: 'Demo simulation',
  timestamp: Date.now(),
};

export function findPlace(query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return null;
  return places.find((p) => [p.name, p.label, ...(p.aliases || []), p.doorRef || ''].some((v) => String(v).toLowerCase() === q))
    ?? places.find((p) => [p.name, p.label, ...(p.aliases || []), p.doorRef || ''].some((v) => String(v).toLowerCase().includes(q)))
    ?? null;
}

export { mapData };
