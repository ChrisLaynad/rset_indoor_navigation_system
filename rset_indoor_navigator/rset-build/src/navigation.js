import { mapData, mapToWorld, places } from './data';

const nodes = new Map((mapData.navigationNodes || []).map((n) => [n.id, n]));
const graph = new Map();
for (const n of mapData.navigationNodes || []) graph.set(n.id, []);
for (const e of mapData.navigationEdges || []) {
  if (e.blocked || !nodes.has(e.from) || !nodes.has(e.to)) continue;
  graph.get(e.from).push({ ...e, to: e.to });
  graph.get(e.to).push({ ...e, to: e.from });
}
const floorLevel = Object.fromEntries((mapData.floors || []).map((f) => [f.floorId, f.floorNumber]));

export function findNode(id) { return nodes.get(id) || null; }

function heuristic(a, b) {
  const na = nodes.get(a), nb = nodes.get(b);
  if (!na || !nb) return Infinity;
  const dz = Math.abs((floorLevel[na.floorId] ?? 0) - (floorLevel[nb.floorId] ?? 0));
  return Math.hypot(na.x - nb.x, na.y - nb.y) + dz * (mapData.config?.floorHeight || 4);
}

export function findNearestNode(x, y, floorId) {
  let best = null, bestD = Infinity;
  for (const n of mapData.navigationNodes || []) {
    if (floorId && n.floorId !== floorId) continue;
    const d = Math.hypot(n.x - x, n.y - y);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

export function findRoomNode(placeOrId) {
  const p = typeof placeOrId === 'string' ? places.find((x) => x.id === placeOrId) : placeOrId;
  if (!p) return null;
  if (p.doorNode && nodes.has(p.doorNode)) return nodes.get(p.doorNode);
  return findNearestNode(p.x, p.y, p.mapFloor);
}

export function astar(startId, goalId) {
  if (!startId || !goalId || !nodes.has(startId) || !nodes.has(goalId)) return [];
  if (startId === goalId) return [startId];
  const open = new Set([startId]);
  const came = new Map();
  const g = new Map([[startId, 0]]);
  const f = new Map([[startId, heuristic(startId, goalId)]]);

  while (open.size) {
    let current = null;
    for (const id of open) if (current === null || (f.get(id) ?? Infinity) < (f.get(current) ?? Infinity)) current = id;
    if (current === goalId) {
      const path = [current];
      while (came.has(current)) { current = came.get(current); path.unshift(current); }
      return path;
    }
    open.delete(current);
    for (const edge of graph.get(current) || []) {
      const tentative = (g.get(current) ?? Infinity) + (Number(edge.distance) || 1);
      if (tentative < (g.get(edge.to) ?? Infinity)) {
        came.set(edge.to, current);
        g.set(edge.to, tentative);
        f.set(edge.to, tentative + heuristic(edge.to, goalId));
        open.add(edge.to);
      }
    }
  }
  return [];
}

export function createRoute(start, destination) {
  const startNode = start?.nodeId ? findNode(start.nodeId) : findRoomNode(start);
  const goalNode = findRoomNode(destination);
  if (!startNode || !goalNode) return { path: [], distance: 0, minutes: 0, startNode: null, goalNode: null };
  const path = astar(startNode.id, goalNode.id);
  let distance = 0;
  for (let i = 1; i < path.length; i++) {
    const a = nodes.get(path[i - 1]), b = nodes.get(path[i]);
    distance += Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0));
    if (a && b && a.floorId !== b.floorId) distance += mapData.config?.floorHeight || 4;
  }
  return {
    path,
    distance,
    minutes: distance / (mapData.config?.walkingSpeed || 1.35) / 60,
    startNode,
    goalNode,
  };
}

const FLOOR_Y = { G: -11.35, F1: -3.82, F2: 3.71, F3: 11.24 };
const APP_FLOOR = { G: 'ground', F1: 'first', F2: 'second', F3: 'third' };

export function pathToPoints(path) {
  return path.map((id) => {
    const n = nodes.get(id);
    const w = mapToWorld(n.x, n.y);
    return { x: w.x, y: FLOOR_Y[n.floorId] ?? 0, z: w.z, floorId: n.floorId, nodeId: id };
  });
}

export function routeFloors(path) { return [...new Set((path || []).map((id) => nodes.get(id)?.floorId).filter(Boolean))]; }

export function routeDistanceRemaining(points, seg, t) {
  let d = 0;
  if (!points?.length) return 0;
  for (let i = Math.max(0, seg); i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    d += i === seg ? len * (1 - t) : len;
  }
  return d;
}

export function pointAt(points, state) {
  if (!points?.length) return null;
  const seg = Math.min(state.seg, Math.max(0, points.length - 2));
  const t = Math.max(0, Math.min(1, state.t));
  const a = points[seg], b = points[Math.min(seg + 1, points.length - 1)];
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    floorId: a.floorId,
    nodeId: a.nodeId,
    heading: Math.atan2(b.x - a.x, b.z - a.z),
  };
}

export function nearestPointOnRoute(point, routePoints) {
  let best = { index: 0, distance: Infinity, t: 0 };
  for (let i = 0; i < routePoints.length - 1; i++) {
    const a = routePoints[i], b = routePoints[i + 1];
    if (a.floorId !== point.floorId || b.floorId !== point.floorId) continue;
    const dx = b.x - a.x, dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / len2));
    const x = a.x + dx * t, z = a.z + dz * t;
    const d = Math.hypot(point.x - x, point.z - z);
    if (d < best.distance) best = { index: i, distance: d, t };
  }
  return best;
}

export function getTurnInstruction(points, index, t = 0) {
  if (!points?.length || index >= points.length - 1) return { type: 'arrive', text: 'You have arrived', distance: 0 };
  const current = points[index], next = points[index + 1];
  if (current.floorId !== next.floorId) {
    const from = APP_FLOOR[current.floorId] || current.floorId;
    const to = APP_FLOOR[next.floorId] || next.floorId;
    return { type: 'floor', text: `Change floor: ${from} → ${to}`, distance: Math.hypot(next.x - current.x, next.z - current.z) * (1 - t) };
  }
  const heading = Math.atan2(next.x - current.x, next.z - current.z);
  if (index === 0) return { type: 'straight', text: 'Continue straight', distance: Math.hypot(next.x - current.x, next.z - current.z) * (1 - t) };
  const prev = points[index - 1];
  const prevHeading = Math.atan2(current.x - prev.x, current.z - prev.z);
  let diff = heading - prevHeading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  let text = 'Continue straight';
  if (Math.abs(diff) > 0.65 && Math.abs(diff) <= 2.35) text = diff > 0 ? 'Turn right' : 'Turn left';
  if (Math.abs(diff) > 2.35) text = 'Make a U-turn';
  return { type: text.toLowerCase().replace(/ /g, '-'), text, distance: Math.hypot(next.x - current.x, next.z - current.z) * (1 - t) };
}
