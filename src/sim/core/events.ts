/**
 * Typed simulation events.
 *
 * The simulation never talks to the renderer, the store or the sound system
 * directly. It emits events; the view layer subscribes. Events carry world
 * time, not wall-clock time.
 */

export interface SimEventMap {
  'actor:born': { id: number; assetId: string; x: number; y: number; parentIds: number[] };
  'actor:died': { id: number; assetId: string; x: number; y: number; cause: string; killerId?: number };
  'actor:damaged': { id: number; amount: number; x: number; y: number; sourceId?: number };
  'actor:healed': { id: number; amount: number; x: number; y: number };
  'actor:status': { id: number; status: string; added: boolean };
  'actor:level': { id: number; level: number };
  'actor:shot': { fromId: number; toX: number; toY: number; projectile: string };
  'tile:changed': { x: number; y: number };
  'tile:owner': { x: number; y: number; cityId: number };
  'building:placed': { id: number; assetId: string; x: number; y: number };
  'building:removed': { id: number; assetId: string; x: number; y: number };
  'city:founded': { id: number; kingdomId: number; x: number; y: number };
  'city:destroyed': { id: number; x: number; y: number };
  'city:captured': { id: number; fromKingdomId: number; toKingdomId: number };
  'kingdom:created': { id: number };
  'kingdom:destroyed': { id: number };
  'kingdom:king': { id: number; kingId: number | null };
  'war:started': { id: number; attackerId: number; defenderId: number; type: string };
  'war:ended': { id: number; winnerId: number | null };
  'alliance:changed': { id: number; kingdomIds: number[] };
  'plot:changed': { id: number; assetId: string; state: string };
  'meta:created': { kind: string; id: number };
  'meta:removed': { kind: string; id: number };
  'world:log': { id: string; x?: number; y?: number; refs: Record<string, number | string> };
  'world:effect': { kind: string; x: number; y: number; radius?: number };
  'world:shake': { strength: number };
}

export type SimEventName = keyof SimEventMap;
export type SimEvent<K extends SimEventName = SimEventName> = { type: K; time: number; data: SimEventMap[K] };

type Handler<K extends SimEventName> = (data: SimEventMap[K], time: number) => void;

export class SimEvents {
  private readonly handlers = new Map<SimEventName, Set<Handler<never>>>();
  private readonly anyHandlers = new Set<(event: SimEvent) => void>();
  /** Current world time, set by the world before each tick. */
  now = 0;

  on<K extends SimEventName>(type: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => set!.delete(handler as Handler<never>);
  }

  onAny(handler: (event: SimEvent) => void): () => void {
    this.anyHandlers.add(handler);
    return () => this.anyHandlers.delete(handler);
  }

  emit<K extends SimEventName>(type: K, data: SimEventMap[K]): void {
    const set = this.handlers.get(type);
    if (set) for (const h of set) (h as Handler<K>)(data, this.now);
    if (this.anyHandlers.size) {
      const event = { type, time: this.now, data } as SimEvent;
      for (const h of this.anyHandlers) h(event);
    }
  }
}
