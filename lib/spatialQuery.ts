import type { NavGrid } from '../shared/schemas';

export interface SpatialEntity {
  id: string;
  x: number;
  z: number;
}

export interface SpatialQuery {
  circle(centerX: number, centerZ: number, radius: number): SpatialEntity[];
  rectangle(minX: number, minZ: number, maxX: number, maxZ: number): SpatialEntity[];
  cone(originX: number, originZ: number, directionX: number, directionZ: number, angle: number, range: number): SpatialEntity[];
  line(startX: number, startZ: number, endX: number, endZ: number, width: number): SpatialEntity[];
}

export class GridSpatialIndex implements SpatialQuery {
  private entities = new Map<string, SpatialEntity>();
  private grid = new Map<string, SpatialEntity[]>();
  private cellSize: number;

  constructor(cellSize: number = 5) {
    this.cellSize = cellSize;
  }

  private key(gx: number, gz: number): string {
    return `${gx},${gz}`;
  }

  private toGrid(x: number, z: number): [number, number] {
    return [Math.floor(x / this.cellSize), Math.floor(z / this.cellSize)];
  }

  insert(entity: SpatialEntity): void {
    this.entities.set(entity.id, entity);
    const [gx, gz] = this.toGrid(entity.x, entity.z);
    const k = this.key(gx, gz);
    if (!this.grid.has(k)) this.grid.set(k, []);
    this.grid.get(k)!.push(entity);
  }

  remove(id: string): void {
    const entity = this.entities.get(id);
    if (!entity) return;
    this.entities.delete(id);
    const [gx, gz] = this.toGrid(entity.x, entity.z);
    const k = this.key(gx, gz);
    const cell = this.grid.get(k);
    if (cell) {
      const idx = cell.findIndex(e => e.id === id);
      if (idx !== -1) cell.splice(idx, 1);
    }
  }

  update(entity: SpatialEntity): void {
    this.remove(entity.id);
    this.insert(entity);
  }

  clear(): void {
    this.entities.clear();
    this.grid.clear();
  }

  circle(centerX: number, centerZ: number, radius: number): SpatialEntity[] {
    const results: SpatialEntity[] = [];
    const radiusSq = radius * radius;
    const [minGx, minGz] = this.toGrid(centerX - radius, centerZ - radius);
    const [maxGx, maxGz] = this.toGrid(centerX + radius, centerZ + radius);

    for (let gz = minGz; gz <= maxGz; gz++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        const cell = this.grid.get(this.key(gx, gz));
        if (!cell) continue;
        for (const e of cell) {
          const dx = e.x - centerX;
          const dz = e.z - centerZ;
          if (dx * dx + dz * dz <= radiusSq) results.push(e);
        }
      }
    }
    return results;
  }

  rectangle(minX: number, minZ: number, maxX: number, maxZ: number): SpatialEntity[] {
    const results: SpatialEntity[] = [];
    const [minGx, minGz] = this.toGrid(minX, minZ);
    const [maxGx, maxGz] = this.toGrid(maxX, maxZ);

    for (let gz = minGz; gz <= maxGz; gz++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        const cell = this.grid.get(this.key(gx, gz));
        if (!cell) continue;
        for (const e of cell) {
          if (e.x >= minX && e.x <= maxX && e.z >= minZ && e.z <= maxZ) {
            results.push(e);
          }
        }
      }
    }
    return results;
  }

  cone(originX: number, originZ: number, dirX: number, dirZ: number, angle: number, range: number): SpatialEntity[] {
    const results: SpatialEntity[] = [];
    const dirLen = Math.sqrt(dirX * dirX + dirZ * dirZ);
    if (dirLen === 0) return results;
    const ndx = dirX / dirLen;
    const ndz = dirZ / dirLen;
    const cosHalfAngle = Math.cos(angle / 2);
    const [minGx, minGz] = this.toGrid(originX - range, originZ - range);
    const [maxGx, maxGz] = this.toGrid(originX + range, originZ + range);

    for (let gz = minGz; gz <= maxGz; gz++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        const cell = this.grid.get(this.key(gx, gz));
        if (!cell) continue;
        for (const e of cell) {
          const dx = e.x - originX;
          const dz = e.z - originZ;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist > range) continue;
          const dot = (dx * ndx + dz * ndz) / dist;
          if (dot >= cosHalfAngle) results.push(e);
        }
      }
    }
    return results;
  }

  line(startX: number, startZ: number, endX: number, endZ: number, width: number): SpatialEntity[] {
    const results: SpatialEntity[] = [];
    const dx = endX - startX;
    const dz = endZ - startZ;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len === 0) return results;
    const ndx = dx / len;
    const ndz = dz / len;
    const minX = Math.min(startX, endX) - width;
    const minZ = Math.min(startZ, endZ) - width;
    const maxX = Math.max(startX, endX) + width;
    const maxZ = Math.max(startZ, endZ) + width;
    const [minGx, minGz] = this.toGrid(minX, minZ);
    const [maxGx, maxGz] = this.toGrid(maxX, maxZ);

    for (let gz = minGz; gz <= maxGz; gz++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        const cell = this.grid.get(this.key(gx, gz));
        if (!cell) continue;
        for (const e of cell) {
          const ex = e.x - startX;
          const ez = e.z - startZ;
          const proj = ex * ndx + ez * ndz;
          if (proj < 0 || proj > len) continue;
          const perpDist = Math.abs(ex * ndz - ez * ndx);
          if (perpDist <= width) results.push(e);
        }
      }
    }
    return results;
  }

  rebuild(entities: SpatialEntity[]): void {
    this.clear();
    for (const e of entities) this.insert(e);
  }
}
