#!/usr/bin/env node
// Announces a finished release on Slack: "Mapo <version> released", followed by
// the breaking changes, features and fixes of every package released in the run.
//
// Input: $RELEASE_SUMMARY_FILE, one JSON line per published package, written by
// summary-plugin.cjs during `pnpm release`. The notes are merged across packages
// because multi-semantic-release lists a commit under every package it touches,
// and the "Dependencies" sections are left out: they only repeat version bumps.
//
// Posting needs $SLACK_BOT_TOKEN (a bot with the chat:write scope) and
// $SLACK_RELEASE_CHANNEL; without them the step is skipped with a notice.
//
// Usage: node scripts/release/notify-slack.mjs [--dry-run]   (--dry-run prints the message)
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** The package whose version names a Mapo release: the meta-module apps install. */
const MAIN_PACKAGE = "mapomodule";

/** Slack Block Kit limits: characters in a section's text, blocks in a message. */
const SECTION_TEXT_LIMIT = 3000;
const BLOCK_LIMIT = 50;

/** These sections come first, in this order; any other one keeps its place after them. */
const SECTION_ORDER = [
  "BREAKING CHANGES",
  "Features",
  "Bug Fixes",
  "Performance Improvements",
  "Reverts",
];

const SKIPPED_SECTIONS = new Set(["Dependencies"]);

/**
 * Splits semantic-release notes into `section → bullets`. Level 1-2 headings
 * carry the package and the version, so only level 3+ headings open a section.
 */
export function parseNotes(notes) {
  const sections = new Map();
  let items = null;

  for (const raw of notes.split("\n")) {
    const line = raw.trimEnd();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      // "⚠ BREAKING CHANGES" (conventionalcommits) and "BREAKING CHANGES" (angular) are one section.
      const name =
        heading[1].length >= 3 ? heading[2].replace(/^[^\p{L}]+/u, "") : null;
      items = name ? (sections.get(name) ?? []) : null;
      if (name) sections.set(name, items);
      continue;
    }
    if (!items || !line.trim()) continue;

    const bullet = /^\s*[*-]\s+(.*)$/.exec(line);
    if (bullet) items.push(bullet[1]);
    else if (items.length) items[items.length - 1] += `\n${line.trim()}`;
    else items.push(line.trim());
  }

  return sections;
}

/** GitHub-flavoured markdown → Slack mrkdwn, for the subset semantic-release emits. */
export function toMrkdwn(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "<$2|$1>")
    .replace(/\*\*([^*]+)\*\*/g, "*$1*");
}

function sectionRank(name) {
  const index = SECTION_ORDER.indexOf(name);
  return index === -1 ? SECTION_ORDER.length : index;
}

/** One section block, cut before Slack's limit with a line that says how much is left out. */
function sectionBlock(name, items) {
  const lines = [`*${toMrkdwn(name)}*`];
  let length = lines[0].length;

  for (const [index, item] of items.entries()) {
    const line = `• ${toMrkdwn(item).replace(/\n/g, "\n    ")}`;
    // Room for the closing "…and N more" line.
    if (length + line.length + 1 > SECTION_TEXT_LIMIT - 80) {
      lines.push(`• …and ${items.length - index} more in the release notes`);
      break;
    }
    lines.push(line);
    length += line.length + 1;
  }

  return { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } };
}

/** The released packages and versions, each linked to its GitHub release when the repository is known. */
function packagesBlock(releases, repoUrl) {
  const ordered = [...releases].sort((a, b) =>
    a.name === MAIN_PACKAGE
      ? -1
      : b.name === MAIN_PACKAGE
        ? 1
        : a.name.localeCompare(b.name),
  );
  const labels = ordered.map(({ name, version, gitTag }) => {
    const label = `${name} ${version}`;
    return repoUrl && gitTag
      ? `<${repoUrl}/releases/tag/${encodeURIComponent(gitTag)}|${label}>`
      : label;
  });

  return {
    type: "context",
    elements: [{ type: "mrkdwn", text: `Released: ${labels.join(" · ")}` }],
  };
}

/** The chat.postMessage payload, without the channel. */
export function buildSlackMessage(releases, { repoUrl } = {}) {
  const unique = [
    ...new Map(
      releases.map((release) => [
        `${release.name}@${release.version}`,
        release,
      ]),
    ).values(),
  ];
  const main = unique.find((release) => release.name === MAIN_PACKAGE);
  const title = main
    ? `Mapo ${main.version} released`
    : "Mapo packages released";

  const merged = new Map();
  for (const release of unique) {
    for (const [name, items] of parseNotes(release.notes ?? "")) {
      if (SKIPPED_SECTIONS.has(name)) continue;
      const set = merged.get(name) ?? new Set();
      for (const item of items) set.add(item);
      merged.set(name, set);
    }
  }
  const sections = [...merged]
    .filter(([, items]) => items.size)
    .sort(([a], [b]) => sectionRank(a) - sectionRank(b));

  const changes = sections.length
    ? sections.map(([name, items]) => sectionBlock(name, [...items]))
    : [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "No breaking changes, features or fixes: this release only updates dependencies.",
          },
        },
      ];

  const header = {
    type: "header",
    text: { type: "plain_text", text: title, emoji: true },
  };
  // The header and the package list always fit; long releases lose their last sections.
  const blocks = [
    header,
    ...changes.slice(0, BLOCK_LIMIT - 2),
    packagesBlock(unique, repoUrl),
  ];

  return { text: title, blocks };
}

function readSummary(file) {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/** Returns the process exit code. */
export async function run({
  env = process.env,
  argv = process.argv.slice(2),
  fetchImpl = globalThis.fetch,
  logger = console,
} = {}) {
  const file = env.RELEASE_SUMMARY_FILE;
  const releases = file && existsSync(file) ? readSummary(file) : [];
  if (!releases.length) {
    logger.log("Nothing was released: no Slack message to send.");
    return 0;
  }

  const repoUrl =
    env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`
      : undefined;
  const message = buildSlackMessage(releases, { repoUrl });

  if (argv.includes("--dry-run")) {
    logger.log(JSON.stringify(message, null, 2));
    return 0;
  }

  const token = env.SLACK_BOT_TOKEN;
  const channel = env.SLACK_RELEASE_CHANNEL;
  if (!token || !channel) {
    logger.log(
      "::notice::SLACK_BOT_TOKEN or SLACK_RELEASE_CHANNEL is not set: the release was not announced on Slack.",
    );
    return 0;
  }

  const response = await fetchImpl("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel,
      ...message,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });
  const result = await response
    .json()
    .catch(() => ({ ok: false, error: `HTTP ${response.status}` }));

  if (!result.ok) {
    logger.error(
      `::error::Slack rejected the release announcement: ${result.error}`,
    );
    return 1;
  }

  logger.log(`Announced "${message.text}" on Slack.`);
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await run();
}
