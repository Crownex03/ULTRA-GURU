
const { gmd } = require("../guru");
const { getSetting, setSetting } = require("../guru/database/settings");
const { safeNewsletterFollow, OWNER_CHANNELS, BLOCKED_CHANNELS, PROFESSOR_EMOJIS, autoUnfollowBlockedChannels } = require("../guru/connection/connectionHandler");


gmd(
  {
    pattern: "channels",
    aliases: ["mychannel", "mychannels", "channelinfo", "chinfo"],
    react: "📡",
    category: "owner",
    description: "View auto-followed channels and their react status",
  },
  async (from, Gifted, conText) => {
    const { reply, react, isSuperUser, botFooter } = conText;
    if (!isSuperUser) {
      await react("❌");
      return reply("❌ Owner Only Command!");
    }
    try {
      let extraChannels = [];
      const extra = await getSetting("OWNER_CHANNELS");
      if (extra) {
        extraChannels = extra.split(",").map((j) => j.trim()).filter((j) => j.endsWith("@newsletter"));
      }
      const allChannels = [...new Set([...OWNER_CHANNELS, ...extraChannels])];

      let msg =
        `📡 *CHANNEL MANAGER*\n` +
        `${"─".repeat(30)}\n\n` +
        `🟢 *Auto-React:* ALWAYS ON\n` +
        `🎭 *React Style:* Random Professor Emojis\n` +
        `📊 *Total Channels:* ${allChannels.length}\n\n` +
        `*📌 TRACKED CHANNELS:*\n`;

      allChannels.forEach((jid, i) => {
        const isDefault = OWNER_CHANNELS.includes(jid);
        msg += `\n${i + 1}. \`${jid}\`\n`;
        msg += `   ${isDefault ? "🔒 Built-in (always active)" : "➕ Custom"}\n`;
      });

      msg +=
        `\n${"─".repeat(30)}\n` +
        `📘 *Commands:*\n` +
        `• \`.addchannel <jid>\` — add channel\n` +
        `• \`.removechannel <jid>\` — remove channel\n` +
        `• \`.followchannels\` — manually re-follow all\n\n` +
        `> _${botFooter}_`;

      await react("✅");
      await reply(msg);
    } catch (err) {
      await react("❌");
      await reply(`❌ Error: ${err.message}`);
    }
  }
);

gmd(
  {
    pattern: "addchannel",
    aliases: ["setchannel", "trackchannel"],
    react: "➕",
    category: "owner",
    description: "Add a channel to auto-follow and auto-react list. Usage: .addchannel 1234567890@newsletter",
  },
  async (from, Gifted, conText) => {
    const { reply, react, isSuperUser, q, botFooter } = conText;
    if (!isSuperUser) {
      await react("❌");
      return reply("❌ Owner Only Command!");
    }
    if (!q) return reply("❌ Provide a channel JID!\nExample: `.addchannel 120363406649804510@newsletter`");
    const jid = q.trim();
    if (!jid.endsWith("@newsletter")) return reply("❌ Invalid channel JID! Must end with `@newsletter`");

    try {
      const current = await getSetting("OWNER_CHANNELS");
      const existing = current ? current.split(",").map((j) => j.trim()).filter(Boolean) : [];
      if (OWNER_CHANNELS.includes(jid) || existing.includes(jid)) {
        return reply(`⚠️ Channel \`${jid}\` is already being tracked!`);
      }
      existing.push(jid);
      await setSetting("OWNER_CHANNELS", existing.join(","));
      await safeNewsletterFollow(Gifted, jid);
      await react("✅");
      await reply(
        `✅ *Channel Added & Followed!*\n\n` +
        `📡 \`${jid}\`\n\n` +
        `✨ Will now auto-follow and auto-react to posts from this channel.\n\n` +
        `> _${botFooter}_`
      );
    } catch (err) {
      await react("❌");
      await reply(`❌ Error: ${err.message}`);
    }
  }
);

gmd(
  {
    pattern: "removechannel",
    aliases: ["delchannel", "untrackchannel"],
    react: "➖",
    category: "owner",
    description: "Remove a custom channel from auto-react list. Usage: .removechannel 1234567890@newsletter",
  },
  async (from, Gifted, conText) => {
    const { reply, react, isSuperUser, q, botFooter } = conText;
    if (!isSuperUser) {
      await react("❌");
      return reply("❌ Owner Only Command!");
    }
    if (!q) return reply("❌ Provide a channel JID!\nExample: `.removechannel 120363406649804510@newsletter`");
    const jid = q.trim();

    if (OWNER_CHANNELS.includes(jid)) {
      return reply(`⚠️ \`${jid}\` is a built-in channel and cannot be removed.\nBuilt-in channels always remain active.`);
    }

    try {
      const current = await getSetting("OWNER_CHANNELS");
      const existing = current ? current.split(",").map((j) => j.trim()).filter(Boolean) : [];
      const idx = existing.indexOf(jid);
      if (idx === -1) return reply(`⚠️ Channel \`${jid}\` is not in the custom list.`);
      existing.splice(idx, 1);
      await setSetting("OWNER_CHANNELS", existing.join(","));
      await react("✅");
      await reply(
        `✅ *Channel Removed!*\n\n` +
        `📡 \`${jid}\` removed from auto-react tracking.\n\n` +
        `> _${botFooter}_`
      );
    } catch (err) {
      await react("❌");
      await reply(`❌ Error: ${err.message}`);
    }
  }
);

gmd(
  {
    pattern: "followchannels",
    aliases: ["rechannels", "refollowchannels", "followall"],
    react: "📡",
    category: "owner",
    description: "Manually re-follow all tracked channels",
  },
  async (from, Gifted, conText) => {
    const { reply, react, isSuperUser, botFooter } = conText;
    if (!isSuperUser) {
      await react("❌");
      return reply("❌ Owner Only Command!");
    }
    try {
      let extraChannels = [];
      const extra = await getSetting("OWNER_CHANNELS");
      if (extra) {
        extraChannels = extra.split(",").map((j) => j.trim()).filter((j) => j.endsWith("@newsletter"));
      }
      const allChannels = [...new Set([...OWNER_CHANNELS, ...extraChannels])];
      let succeeded = 0;
      let failed = 0;
      for (const jid of allChannels) {
        const ok = await safeNewsletterFollow(Gifted, jid);
        if (ok) succeeded++; else failed++;
      }
      await react("✅");
      await reply(
        `📡 *Channel Follow Complete*\n\n` +
        `✅ Followed: ${succeeded}\n` +
        `❌ Failed: ${failed}\n` +
        `📊 Total: ${allChannels.length}\n\n` +
        `> _${botFooter}_`
      );
    } catch (err) {
      await react("❌");
      await reply(`❌ Error: ${err.message}`);
    }
  }
);

gmd(
  {
    pattern: "professoremojis",
    aliases: ["profemojis", "channelemojis", "reactemojis"],
    react: "🎓",
    category: "owner",
    description: "View all professor emojis used for channel auto-reactions",
  },
  async (from, Gifted, conText) => {
    const { reply, react, isSuperUser, botFooter } = conText;
    if (!isSuperUser) {
      await react("❌");
      return reply("❌ Owner Only Command!");
    }
    await react("✅");
    await reply(
      `🎓 *Professor React Emojis*\n\n` +
      `These emojis are used randomly when auto-reacting to channel posts:\n\n` +
      PROFESSOR_EMOJIS.join("  ") +
      `\n\n📊 *Total:* ${PROFESSOR_EMOJIS.length} emojis\n\n> _${botFooter}_`
    );
  }
);

gmd(
  {
    pattern: "blockchannel",
    aliases: ["blockch", "banch", "banchannel"],
    react: "🚫",
    category: "owner",
    description: "Block a channel so bot never follows/reacts to it. Usage: .blockchannel <jid>",
  },
  async (from, Gifted, conText) => {
    const { reply, react, isSuperUser, q, botFooter } = conText;
    if (!isSuperUser) {
      await react("❌");
      return reply("❌ Owner Only Command!");
    }
    if (!q) return reply("❌ Provide a channel JID!\nExample: `.blockchannel 120363406649804510@newsletter`");
    const jid = q.trim();
    if (!jid.endsWith("@newsletter")) return reply("❌ Invalid channel JID! Must end with `@newsletter`");

    try {
      const current = await getSetting("BLOCKED_CHANNELS");
      const existing = current ? current.split(",").map((j) => j.trim()).filter(Boolean) : [];
      if (BLOCKED_CHANNELS.includes(jid) || existing.includes(jid)) {
        return reply(`⚠️ Channel \`${jid}\` is already blocked!`);
      }
      existing.push(jid);
      await setSetting("BLOCKED_CHANNELS", existing.join(","));
      // Also remove from OWNER_CHANNELS if present
      const ownerExtra = await getSetting("OWNER_CHANNELS");
      const ownerList = ownerExtra ? ownerExtra.split(",").map(j => j.trim()).filter(Boolean) : [];
      const idx = ownerList.indexOf(jid);
      if (idx !== -1) { ownerList.splice(idx, 1); await setSetting("OWNER_CHANNELS", ownerList.join(",")); }
      // Unfollow immediately
      try { await Gifted.newsletterUnfollow(jid); } catch (_) {}
      await react("✅");
      await reply(
        `🚫 *Channel Blocked & Unfollowed!*\n\n` +
        `📡 \`${jid}\`\n\n` +
        `✨ Bot will now ignore and auto-unfollow this channel.\n\n` +
        `> _${botFooter}_`
      );
    } catch (err) {
      await react("❌");
      await reply(`❌ Error: ${err.message}`);
    }
  }
);

gmd(
  {
    pattern: "unblockchannel",
    aliases: ["unblockch", "unbanch", "unbanchannel"],
    react: "✅",
    category: "owner",
    description: "Unblock a previously blocked channel. Usage: .unblockchannel <jid>",
  },
  async (from, Gifted, conText) => {
    const { reply, react, isSuperUser, q, botFooter } = conText;
    if (!isSuperUser) {
      await react("❌");
      return reply("❌ Owner Only Command!");
    }
    if (!q) return reply("❌ Provide a channel JID!");
    const jid = q.trim();
    if (BLOCKED_CHANNELS.includes(jid)) {
      return reply(`⚠️ \`${jid}\` is a built-in blocked channel and cannot be unblocked here.`);
    }
    try {
      const current = await getSetting("BLOCKED_CHANNELS");
      const existing = current ? current.split(",").map((j) => j.trim()).filter(Boolean) : [];
      const idx = existing.indexOf(jid);
      if (idx === -1) return reply(`⚠️ Channel \`${jid}\` is not in the blocked list.`);
      existing.splice(idx, 1);
      await setSetting("BLOCKED_CHANNELS", existing.join(","));
      await react("✅");
      await reply(
        `✅ *Channel Unblocked!*\n\n` +
        `📡 \`${jid}\` removed from blocked list.\n\n` +
        `> _${botFooter}_`
      );
    } catch (err) {
      await react("❌");
      await reply(`❌ Error: ${err.message}`);
    }
  }
);

gmd(
  {
    pattern: "blockedchannels",
    aliases: ["listblockedch", "listblocked"],
    react: "🚫",
    category: "owner",
    description: "View all blocked channels",
  },
  async (from, Gifted, conText) => {
    const { reply, react, isSuperUser, botFooter } = conText;
    if (!isSuperUser) {
      await react("❌");
      return reply("❌ Owner Only Command!");
    }
    try {
      const extra = await getSetting("BLOCKED_CHANNELS");
      const extraList = extra ? extra.split(",").map(j => j.trim()).filter(j => j.endsWith("@newsletter")) : [];
      const allBlocked = [...new Set([...BLOCKED_CHANNELS, ...extraList])];

      let msg =
        `🚫 *BLOCKED CHANNELS*\n` +
        `${"─".repeat(30)}\n\n` +
        `📊 *Total Blocked:* ${allBlocked.length}\n\n` +
        `*📌 BLOCKED LIST:*\n`;

      allBlocked.forEach((jid, i) => {
        const isDefault = BLOCKED_CHANNELS.includes(jid);
        msg += `\n${i + 1}. \`${jid}\`\n`;
        msg += `   ${isDefault ? "🔒 Built-in block" : "➕ Custom block"}\n`;
      });

      msg +=
        `\n${"─".repeat(30)}\n` +
        `📘 *Commands:*\n` +
        `• \`.blockchannel <jid>\` — block a channel\n` +
        `• \`.unblockchannel <jid>\` — unblock a channel\n\n` +
        `> _${botFooter}_`;

      await react("✅");
      await reply(msg);
    } catch (err) {
      await react("❌");
      await reply(`❌ Error: ${err.message}`);
    }
  }
);
