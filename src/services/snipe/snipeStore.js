const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const MAX_SNIPES_PER_CHANNEL = 50;

// Map<channelId, Array<{ type, authorId, authorTag, authorAvatar, content, oldContent, newContent, channelId, timestamp }>>
const deletedSnipes = new Map();
const editedSnipes = new Map();

function pruneExpired(list, now = Date.now()) {
    return list.filter((entry) => now - entry.timestamp < TWENTY_FOUR_HOURS_MS);
}

function getCleanList(map, channelId) {
    const now = Date.now();
    const current = map.get(channelId) || [];
    const cleaned = pruneExpired(current, now);

    if (cleaned.length > 0) {
        map.set(channelId, cleaned);
    } else {
        map.delete(channelId);
    }

    return cleaned;
}

export const SnipeStore = {
    recordDelete(message) {
        if (!message?.guild || !message?.channel || message.author?.bot) return;
        const content = message.content?.trim() || '';
        const attachments = [...(message.attachments?.values() || [])].map((a) => a.url);
        if (!content && attachments.length === 0) return;

        const list = getCleanList(deletedSnipes, message.channel.id);
        list.unshift({
            type: 'delete',
            authorId: message.author?.id || 'Unknown',
            authorTag: message.author?.tag || 'Unknown User',
            authorAvatar: message.author?.displayAvatarURL?.() || null,
            content: content || '[Attachment only]',
            attachments,
            channelId: message.channel.id,
            timestamp: Date.now(),
        });

        if (list.length > MAX_SNIPES_PER_CHANNEL) {
            list.length = MAX_SNIPES_PER_CHANNEL;
        }
        deletedSnipes.set(message.channel.id, list);
    },

    recordEdit(oldMessage, newMessage) {
        const msg = newMessage || oldMessage;
        if (!msg?.guild || !msg?.channel || msg.author?.bot) return;

        const oldContent = oldMessage?.content?.trim() || '';
        const newContent = newMessage?.content?.trim() || '';
        if (!oldContent && !newContent) return;
        if (oldContent === newContent) return;

        const list = getCleanList(editedSnipes, msg.channel.id);
        list.unshift({
            type: 'edit',
            authorId: msg.author?.id || 'Unknown',
            authorTag: msg.author?.tag || 'Unknown User',
            authorAvatar: msg.author?.displayAvatarURL?.() || null,
            oldContent: oldContent || '[Empty / Attachment]',
            newContent: newContent || '[Empty / Attachment]',
            channelId: msg.channel.id,
            timestamp: Date.now(),
        });

        if (list.length > MAX_SNIPES_PER_CHANNEL) {
            list.length = MAX_SNIPES_PER_CHANNEL;
        }
        editedSnipes.set(msg.channel.id, list);
    },

    getDeleted(channelId) {
        return getCleanList(deletedSnipes, channelId);
    },

    getEdited(channelId) {
        return getCleanList(editedSnipes, channelId);
    },

    clearChannel(channelId) {
        const hadDeleted = getCleanList(deletedSnipes, channelId).length > 0;
        const hadEdited = getCleanList(editedSnipes, channelId).length > 0;
        deletedSnipes.delete(channelId);
        editedSnipes.delete(channelId);
        return hadDeleted || hadEdited;
    },
};
