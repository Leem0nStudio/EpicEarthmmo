export interface PingMessage {
  clientTime: number;
}

export interface PongMessage {
  clientTime: number;
  serverTime: number;
}

export interface PeerPlayerState {
  x: number;
  y: number;
  z: number;
  name: string;
  direction?: string;
  animState?: string;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface TradeOffer {
  zeny: number;
  items: Array<{ id: string; name: string; type: string; amount: number; description: string }>;
  locked: boolean;
  accepted: boolean;
}

export interface PlayerInput {
  dirX: number;
  dirZ: number;
  seq: number;
  timestamp?: number;
}

export interface GridPathStep {
  gx: number;
  gz: number;
  cumTimeMs: number;
}

export interface MoveToTargetData {
  targetX: number;
  targetZ: number;
  interaction?: {
    type: 'npc' | 'chest' | 'warp';
    id: string;
  };
}

export interface MoveAcceptedData {
  path: GridPathStep[];
  startTime: number;
  walkSpeedMs: number;
}

export interface InteractionReadyData {
  type: 'npc';
  npcId: string;
  dialogId: string;
  npcName?: string;
}

export interface SnapshotPlayer {
  x: number; y: number; z: number;
  hp: number; maxHp: number;
  sp: number; maxSp: number;
  lastProcessedSeq?: number;
  lastSeq?: number;
  name?: string;
  direction?: string;
  animState?: string;
  vx?: number;
  vz?: number;
  moving?: boolean;
}

export interface SnapshotEnemy {
  hp: number;
  maxHp: number;
  isDead: boolean;
  position: { x: number; y: number; z: number };
  name?: string;
  level?: number;
}

export interface WorldSnapshot {
  tick: number;
  players: Record<string, SnapshotPlayer>;
  enemies: Record<string, SnapshotEnemy>;
}

export interface WarpInfo {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  targetMapName: string;
  visual: string;
}

export interface MapInitData {
  mapId: string;
  mapName: string;
  mapType: string;
  dimensions: { width: number; height: number };
  spawnPoints: Array<{ id: string; position: { x: number; y: number; z: number }; label?: string }>;
  warps: WarpInfo[];
  safeZones: Array<{ id: string; center: { x: number; z: number }; radius: number; name?: string }>;
  decorations: Array<{ position: [number, number, number]; type: string; scale: number; hasCollision?: boolean; lodNear?: number; lodFar?: number; layer?: string }>;
  tiles?: Array<{ position: [number, number]; terrainType: string; height: number; textureId: string; blendNorth: number; blendSouth: number; blendEast: number; blendWest: number }>;
  navGrid?: { cellSize: number; rows: number; cols: number; cells: Array<{ walkable: boolean; height: number; terrainType: string; moveCost: number; isWater: boolean; isBlocked: boolean; specialProperty?: string }> } | null;
  regions?: Array<{ id: string; bounds: { minX: number; minZ: number; maxX: number; maxZ: number }; chunkSize: number; ambientSound?: string; ambientVolume: number; fogDensity: number; fogColor: string; lightColor: string; lightIntensity: number }>;
  triggers?: Array<{ id: string; type: string; position: { x: number; z: number }; radius: number; target?: string; data?: Record<string, any> }>;
  bakedLighting?: { ambientColor: string; ambientIntensity: number; sunColor: string; sunIntensity: number; sunDirection: [number, number, number]; hemisphereSky: string; hemisphereGround: string; fogColor: string; fogNear: number; fogFar: number; fakeAOIntensity: number };
  colliders?: Array<{ position: [number, number, number]; size: [number, number, number] }>;
  grassTuftCount: number;
  grassTexture: { baseColor: string; repeatX: number; repeatY: number };
  floorColor: string;
}

export interface MapChangeData {
  mapId: string;
  mapName: string;
  mapType: string;
  spawnPosition: { x: number; y: number; z: number };
  initData: MapInitData;
  enemies: Record<string, { id: string; name: string; hp: number; maxHp: number; level: number; position: { x: number; y: number; z: number }; isDead: boolean }>;
  players: Record<string, { id: string; x: number; y: number; z: number; name: string }>;
}

export interface SkillCastRequest {
  skillId: string;
  targetId?: string;
  targetX?: number;
  targetZ?: number;
  directionX?: number;
  directionZ?: number;
  seq: number;
}

export interface SkillCastResult {
  success: boolean;
  error?: string;
  damage?: number;
  heal?: number;
  isCritical?: boolean;
  targetsHit?: string[];
  targetDamages?: Record<string, number>;
  targetHeals?: Record<string, number>;
  targetPositions?: Record<string, { x: number; z: number }>;
  groundEffectId?: string;
  buffApplied?: string[];
  newSp?: number;
  newHp?: number;
  cooldownMs?: number;
  castTimeMs?: number;
  animationId?: string;
  vfxId?: string;
  soundId?: string;
}

export interface ActiveGroundEffectData {
  id: string;
  definitionId: string;
  casterId: string;
  x: number;
  z: number;
  createdAt: number;
  expiresAt: number;
  angle?: number;
  length?: number;
}

export interface ActiveBuffData {
  id: string;
  buffId: string;
  stacks: number;
  expiresAt: number;
  isDebuff: boolean;
  icon?: string;
  color: string;
}

