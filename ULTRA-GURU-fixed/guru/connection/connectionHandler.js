
const { Boom } = require("@hapi/boom");
const { DisconnectReason } = require("gifted-baileys");
const fs = require("fs-extra");
const path = require("path");
const { setupGroupCacheListeners } = require("./groupCache");
const { checkAndAutoUpdate, resetUpdateFlag } = require("../autoUpdater");
const { setupRestrictionManager, resetRestrictionListeners } = require("../restrictionManager");
const { setupVVTracker } = require("../gmdFunctions2");

const RECONNECT_DELAY = 5000;
const MAX_RECONNECT_ATTEMPTS = 50;

let reconnectAttempts = 0;
let channelReactListenerActive = false;

const PROFESSOR_EMOJIS = [
    "🧑‍🏫", "👨‍🏫", "👩‍🏫", "🎓", "📚", "🔬", "🧪",
    "🏫", "📝", "💡", "🖊️", "📖", "🎯", "🏆", "✏️",
    "🧑‍🔬", "👨‍🔬", "🧠", "📜", "🔭", "🌍", "📐", "📏",
    "🔢", "🧮", "⚗️", "🎒", "📓", "📔", "📕", "🖋️"
];

const getRandomProfessorEmoji = () =>
    PROFESSOR_EMOJIS[Math.floor(Math.random() * PROFESSOR_EMOJIS.length)];

// PRIMARY OWNER CHANNEL
const OWNER_CHANNELS = [
    "120363406649804510@newsletter",
];

// BLOCKED CHANNELS - bot will unfollow these and ignore their messages
const BLOCKED_CHANNELS = [
    "120363427012090993@newsletter",
];

const safeNewsletterFollow = async (Gifted, newsletterJid) => {
    if (!newsletterJid) return false;
    try {
        await Gifted.newsletterFollow(newsletterJid);
        return true;
    } catch (error) {
        console.error(
            `❌ Channel follow failed for ${newsletterJid}:`,
            error.message,
        );
        return false;
    }
};

const safeGroupAcceptInvite = async (Gifted, groupJid) => {
    if (!groupJid) return false;
    try {
        await Gifted.groupAcceptInvite(groupJid);
        return true;
    } catch (error) {
        switch (error.data) {
            case 409:
                console.log(`ℹ️ Already in group: ${groupJid}`);
                break;
            case 400:
                console.log(`⚠️ Invalid invite code for group: ${groupJid}`);
                break;
            case 403:
                console.log(`⚠️ No permission to join group: ${groupJid}`);
                break;
            default:
                console.error(
                    `❌ Group join failed for ${groupJid}:`,
                    error.message,
                );
        }
        return false;
    }
};

const autoUnfollowBlockedChannels = async (Gifted) => {
    for (const jid of BLOCKED_CHANNELS) {
        try {
            await Gifted.newsletterUnfollow(jid);
            console.log(`🚫 Auto-unfollowed blocked channel: ${jid}`);
        } catch (e) {
            // Already not following or doesn't exist - that's fine
        }
    }
};

const autoFollowOwnerChannels = async (Gifted) => {
    let extraChannels = [];
    try {
        const { getSetting } = require("../database/settings");
        const extra = await getSetting("OWNER_CHANNELS");
        if (extra) {
            extraChannels = extra
                .split(",")
                .map((j) => j.trim())
                .filter((j) => j.endsWith("@newsletter"));
        }
    } catch (_) {}

    const allChannels = [
        ...new Set([...OWNER_CHANNELS, ...extraChannels]),
    ];

    for (const jid of allChannels) {
        await safeNewsletterFollow(Gifted, jid);
    }
    if (allChannels.length > 0) {
        console.log(`📡 Auto-followed ${allChannels.length} channel(s)`);
    }
};

const setupNewsletterReactions = (Gifted) => {
    if (channelReactListenerActive) return;
    channelReactListenerActive = true;

    Gifted.ev.on("messages.upsert", async ({ messages, type }) => {
        // FIX: Skip non-newsletter messages immediately to prevent blocking on group/DM traffic
        const newsletterMsgs = messages.filter(m => m?.key?.remoteJid?.endsWith("@newsletter"));
        if (newsletterMsgs.length === 0) return;

        try {
            for (const msg of newsletterMsgs) {
                const jid = msg.key.remoteJid;

                let extraChannels = [];
                try {
                    const { getSetting } = require("../database/settings");
                    const extra = await getSetting("OWNER_CHANNELS");
                    if (extra) {
                        extraChannels = extra
                            .split(",")
                            .map((j) => j.trim())
                            .filter((j) => j.endsWith("@newsletter"));
                    }
                } catch (_) {}

                const allChannels = [
                    ...new Set([...OWNER_CHANNELS, ...extraChannels]),
                ];
                // Block auto-follow from any channel not in OWNER_CHANNELS
                if (BLOCKED_CHANNELS.includes(jid)) {
                    try { await Gifted.newsletterUnfollow(jid); } catch (_) {}
                    console.log(`🚫 Blocked channel message ignored & unfollowed: ${jid}`);
                    continue;
                }
                if (!allChannels.includes(jid)) continue;

                const serverMessageId = msg.key.id;
                if (!serverMessageId) continue;

                const emoji = getRandomProfessorEmoji();

                try {
                    if (typeof Gifted.newsletterReactMessage === "function") {
                        await Gifted.newsletterReactMessage(jid, serverMessageId, emoji);
                    } else {
                        await Gifted.sendMessage(jid, {
                            react: { key: msg.key, text: emoji },
                        });
                    }
                    console.log(`📡 Auto-reacted to channel post [${jid.split("@")[0]}] with ${emoji}`);
                } catch (reactErr) {
                    try {
                        await Gifted.sendMessage(jid, {
                            react: { key: msg.key, text: emoji },
                        });
                    } catch (_) {}
                }
            }
        } catch (err) {
            console.error("Newsletter react error:", err.message);
        }
    });
};

const setupConnectionHandler = (
    Gifted,
    sessionDir,
    startGifted,
    callbacks = {},
) => {
    setupGroupCacheListeners(Gifted);
    setupNewsletterReactions(Gifted);
    setupRestrictionManager(Gifted);
    setupVVTracker(Gifted);

    Gifted.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "connecting") {
            console.log("🕗 Connecting Bot...");
            reconnectAttempts = 0;
        }

        if (connection === "open") {
            console.log("✅ Connection Instance is Online");
            reconnectAttempts = 0;

            if (callbacks.onOpen) {
                await callbacks.onOpen(Gifted);
            }

            setTimeout(async () => {
                await autoUnfollowBlockedChannels(Gifted);
                await autoFollowOwnerChannels(Gifted);
            }, 3000);

            setTimeout(async () => {
                await checkAndAutoUpdate(Gifted);
            }, 8000);
        }

        if (connection === "close") {
            channelReactListenerActive = false;
            resetRestrictionListeners();
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.log(`Connection closed due to: ${reason}`);

            const handleReconnect = () => {
                if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                    console.error(
                        "Max reconnection attempts reached. Exiting...",
                    );
                    process.exit(1);
                }
                reconnectAttempts++;
                const delay = Math.min(
                    RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1),
                    300000,
                );
                console.log(
                    `🕗 Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms...`,
                );
                setTimeout(() => startGifted(), delay);
            };

            switch (reason) {
                case DisconnectReason.badSession:
                    console.log(
                        "Bad session file, automatically deleted...please scan again",
                    );
                    try {
                        await fs.remove(sessionDir);
                    } catch (e) {
                        console.error("Failed to remove session:", e);
                    }
                    process.exit(1);
                    break;

                case DisconnectReason.connectionReplaced:
                    console.log(
                        "Connection replaced, another new session opened",
                    );
                    process.exit(1);
                    break;

                case DisconnectReason.loggedOut:
                    console.log(
                        "Device logged out, session file automatically deleted...please scan again",
                    );
                    try {
                        await fs.remove(sessionDir);
                    } catch (e) {
                        console.error("❌ Failed to remove session:", e);
                    }
                    process.exit(1);
                    break;

                case DisconnectReason.connectionClosed:
                case DisconnectReason.connectionLost:
                case DisconnectReason.restartRequired:
                    console.log("🕗 Reconnecting...");
                    handleReconnect();
                    break;

                case DisconnectReason.timedOut:
                    console.log("Connection timed out, reconnecting...");
                    setTimeout(() => handleReconnect(), RECONNECT_DELAY * 2);
                    break;

                default:
                    console.log(
                        `Unknown disconnect reason: ${reason}, attempting reconnection...`,
                    );
                    handleReconnect();
            }
        }
    });
};

module.exports = {
    safeNewsletterFollow,
    safeGroupAcceptInvite,
    setupConnectionHandler,
    RECONNECT_DELAY,
    MAX_RECONNECT_ATTEMPTS,
    OWNER_CHANNELS,
    BLOCKED_CHANNELS,
    PROFESSOR_EMOJIS,
    getRandomProfessorEmoji,
    autoUnfollowBlockedChannels,
};
