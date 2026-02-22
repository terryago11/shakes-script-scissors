import { LRUCache } from "lru-cache";
import type { Play } from "@/types/play";

/** Server-side in-memory cache of parsed plays. 39 plays × ~100KB each = ~4MB max. */
const cache = new LRUCache<string, Play>({
  max: 50,
  ttl: 24 * 60 * 60 * 1000, // 24 hours
});

export function getCachedPlay(playId: string): Play | undefined {
  return cache.get(playId);
}

export function setCachedPlay(playId: string, play: Play): void {
  cache.set(playId, play);
}
