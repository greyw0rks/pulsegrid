import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// Public, read-only evidence retrieval. No X login, posting, or account changes.
const profile = "Greyw0rks";
const ids = ["2120488726468190656", "2119320148867710984", "2117555947757535458", "2117323746600161676", "2115714709961822572"];
const checkedAt = new Date();
const mainnetProof = JSON.parse(await readFile("docs/evidence/bot-review-2026-11-11.json", "utf8"));
assert.equal(mainnetProof.chainId, 677);
assert(mainnetProof.deploymentVerified);
await mkdir("docs/evidence/bot-social", { recursive: true });
const posts = await Promise.all(ids.map(async id => {
  const token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0\.|[^a-z0-9])/g, "");
  const sourceUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${token}`;
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(30000) });
  assert(response.ok, `Public X evidence unavailable for ${id}: HTTP ${response.status}`);
  const post = await response.json();
  assert.equal(post.id_str, id);
  assert.equal(post.user?.screen_name?.toLowerCase(), profile.toLowerCase());
  assert.equal(typeof post.text, "string");
  const date = new Date(post.created_at);
  assert(Number.isFinite(date.getTime()));
  const snowflakeDate = Number((BigInt(id) >> 22n) + 1288834974657n);
  assert(Math.abs(date.getTime() - snowflakeDate) < 1000, "Post date differs from the X identifier timestamp");
  const ageDays = (checkedAt.getTime() - date.getTime()) / 86400000;
  const reply = !!(post.in_reply_to_status_id_str || post.in_reply_to_status_id || post.parent);
  const repost = !!(post.retweeted_status || post.retweeted_tweet || /^RT @/.test(post.text));
  const expandedLinks = (post.entities?.urls ?? []).map((url: { expanded_url?: string }) => url.expanded_url ?? "");
  const content = [post.text, ...expandedLinks].join("\n");
  const linkedMainnetApplication = expandedLinks.some((link: string) => {
    try { const url = new URL(link); return url.origin === "https://pulsegrid-psi.vercel.app" && /^\/bot\/?$/.test(url.pathname); }
    catch { return false; }
  });
  const launch = /pulsegrid is live/i.test(content) && /BOT ?Chain(?:_ai)?/i.test(content) && linkedMainnetApplication;
  await writeFile(`docs/evidence/bot-social/${id}.json`, JSON.stringify(post, null, 2) + "\n");
  return { id, url: `https://x.com/${profile}/status/${id}`, author: post.user.screen_name, createdAt: date.toISOString(),
    ageDays: Math.round(ageDays * 1000) / 1000, within30Days: ageDays >= 0 && ageDays <= 30, reply, repost,
    originalAuthoredPost: !reply && !repost, pulsegridBotMainnetAnnouncement: launch,
    explicitMainnetWording: /mainnet/i.test(post.text), linkedMainnetApplicationVerified: linkedMainnetApplication,
    text: post.text, expandedLinks, sourceUrl, retainedSource: `bot-social/${id}.json` };
}));
const qualifying = posts.filter(post => post.within30Days && post.originalAuthoredPost);
const launch = posts.find(post => post.pulsegridBotMainnetAnnouncement && post.originalAuthoredPost);
const report = { schema: "pulsegrid.bot-social.v1", checkedAt: checkedAt.toISOString(), readOnly: true,
  profile: `https://x.com/${profile}`, posts, originalPostsWithin30Days: qualifying.length,
  fiveOriginalPostsRequirementMet: qualifying.length >= 5, launchAnnouncement: launch?.url ?? null,
  launchAnnouncementVerified: !!launch,
  note: "The five-original-post requirement is assessed for the personal profile. The launch says Pulsegrid is live on @BOTChain_ai and links its verified mainnet app, without using the word mainnet. Other-project posts are not described as Pulsegrid announcements." };
await writeFile("docs/evidence/bot-social-2026-11-11.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
