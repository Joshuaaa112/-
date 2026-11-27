const MAX_PER_CHANNEL = 25;
const SNIPE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class ReactionSnipeStore {
    constructor() {
        this.channels = new Map();
    }

    pruneExpired(list, now = Date.now()) {
        return list.filter((entry) => now - entry.timestamp <= SNIPE_TTL_MS);
    }

    recordRemoval(entry) {
        if (!entry?.channelId) return;

        const now = Date.now();
        const existing = this.pruneExpired(this.channels.get(entry.channelId) || [], now);

        const updated = [
            {
                ...entry,
                timestamp: entry.timestamp || now,
            },
            ...existing,
        ].slice(0, MAX_PER_CHANNEL);

        this.channels.set(entry.channelId, updated);
    }

    getChannelSnipes(channelId) {
        if (!channelId) return [];
        const list = this.pruneExpired(this.channels.get(channelId) || []);
        if (list.length > 0) {
            this.channels.set(channelId, list);
        } else {
            this.channels.delete(channelId);
        }
        return list;
    }
}

export const reactionSnipeStore = new ReactionSnipeStore();
export default reactionSnipeStore;
