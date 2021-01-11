// @ts-check

"use strict";

/** @type {typeof window.fetch} */
const nodeFetch = require("node-fetch");
const mem = require("mem");
const YAML = require("yaml");
const filesize = require("filesize");
const cheerio = require("cheerio");
const { parseStringPromise } = require("xml2js");

/** @typedef {import("./types").ReleaseResponseEntry} ReleaseResponseEntry */
/** @typedef {import("./types").Release} Release */
/** @typedef {import("./types").ReleaseList} ReleaseList */
/** @typedef {import("./types").ReleaseWithPendingFiles} ReleaseWithPendingFiles */
/** @typedef {import("./types").LatestMac} LatestMac */
/** @typedef {import("./types").LatestMacFile} LatestMacFile */

const REPO = "https://github.com/Xiphe/budgetbudget";

/**
 * @param {unknown} thing
 * @returns {thing is { [key: string]: unknown }}
 */
function isPlainObject(thing) {
  return typeof thing === "object" && thing !== null;
}

/**
 * @param {unknown} entry
 * @returns {entry is ReleaseResponseEntry}
 */
function isReleaseEntry(entry) {
  const valid =
    isPlainObject(entry) &&
    /* link */
    Array.isArray(entry.link) &&
    entry.link.length === 1 &&
    isPlainObject(entry.link[0]) &&
    isPlainObject(entry.link[0].$) &&
    typeof entry.link[0].$.href === "string" &&
    /* title */
    Array.isArray(entry.title) &&
    entry.title.length === 1 &&
    typeof entry.title[0] === "string" &&
    /* title */
    Array.isArray(entry.updated) &&
    entry.updated.length === 1 &&
    typeof entry.updated[0] === "string" &&
    /* content */
    Array.isArray(entry.content) &&
    entry.content.length === 1 &&
    isPlainObject(entry.content[0]) &&
    typeof entry.content[0]._ === "string";

  if (!valid) {
    throw new Error(
      `Invalid ReleaseResponseEntry format:${JSON.stringify(entry)}`
    );
  }

  return valid;
}

/**
 * @param {unknown} entry
 * @returns {entry is LatestMacFile}
 */
function isLatestMacFile(entry) {
  const valid =
    isPlainObject(entry) &&
    /* url */
    typeof entry.url === "string" &&
    /* sha512 */
    typeof entry.sha512 === "string" &&
    /* sha512 */
    typeof entry.size === "number";

  return valid;
}

/**
 * @param {unknown} entry
 * @returns {entry is LatestMac}
 */
function isLatestMac(entry) {
  const valid =
    isPlainObject(entry) &&
    /* link */
    Array.isArray(entry.files) &&
    entry.files.length === entry.files.filter(isLatestMacFile).length;

  return valid;
}

/**
 * Cache responses so in case lambda is re-used we are faster
 */
const fetchReleases = mem(
  /**
   * @param after {string}
   * @returns {Promise<ReleaseResponseEntry[]>}
   */
  async (after) => {
    const res = await nodeFetch(
      `${REPO}/releases.atom${after ? `?after=${after}` : ""}`,
      {}
    );
    const text = await res.text();

    /** @type {unknown} */
    const parsed = await parseStringPromise(text);
    if (!isPlainObject(parsed) || !isPlainObject(parsed.feed)) {
      throw new Error("Unable to parse release feed");
    }
    const { entry = [] } = parsed.feed;

    if (!Array.isArray(entry)) {
      throw new Error("Unable to parse release feed entires");
    }

    return entry.filter(isReleaseEntry);
  }
);

/**
 * @param {string} tag
 * @returns {Promise<Release['files']>}
 */
async function getFiles(tag) {
  const latest = `${REPO}/releases/download/${tag}/latest-mac.yml`;
  const res = await nodeFetch(latest);
  const raw = await res.text();
  const data = YAML.parse(raw);

  if (!isLatestMac(data)) {
    throw new Error(`Invalid format of ${tag}/latest-mac.yml`);
  }

  const { files } = data;
  /** @type {Partial<Release['files']>} */
  const init = {};
  const { x64, arm64 } = files.reduce((memo, file) => {
    const m = file.url.match(/(-arm64)?\.dmg$/);

    if (!m) {
      return memo;
    }

    return {
      ...memo,
      [m[1] ? "arm64" : "x64"]: {
        download: `${REPO}/releases/download/${tag}/${file.url}`,
        sha512: file.sha512,
        size: filesize(file.size),
      },
    };
    return memo;
  }, init);

  if (!x64) {
    throw new Error("Missing x64 release");
  }

  return { x64, arm64 };
}

/**
 * @param {string[]} [channels]
 * @param {undefined | string} [after]
 * @param {ReleaseList} [found]
 * @returns {Promise<ReleaseList>}
 */
async function findLatestChannels(
  channels = [],
  after = undefined,
  found = {}
) {
  const releaseEntries = await fetchReleases(after);
  if (!releaseEntries.length) {
    return found;
  }

  let last = "";
  releaseEntries.forEach((release) => {
    const tag = release.link[0].$.href.split("/").pop();
    const channelMatch = tag.match(/^v[0-9.]+-([a-zA-Z]+)\.[0-9]+$/);
    const channel = channelMatch ? channelMatch[1] : "stable";
    last = tag;
    if ((!channels.length || channels.includes(channel)) && !found[channel]) {
      const $ = cheerio.load(release.content[0]._);
      /** @type {Release['changelog']} */
      const changelog = {};
      $("h3").each((i, typeEl) => {
        const type = $(typeEl).text();
        if (!changelog[type]) {
          changelog[type] = {};
        }

        $(typeEl)
          .next("ul")
          .children()
          .each((i, childEl) => {
            const $commitLink = $(childEl).find("a").last();
            const $scope = $(childEl).find("strong").first();
            const link = $commitLink.attr("href");
            const commit = $commitLink.text();
            const scope = $scope.length ? $scope.text().replace(/:$/, "") : "_";
            $commitLink.remove();
            $scope.remove();
            const message = $(childEl)
              .text()
              .replace(/[\(\)]+$/, "")
              .trim();

            if (!changelog[type][scope]) {
              changelog[type][scope] = [];
            }

            changelog[type][scope].push({ message, link, commit });
          });
      });

      found[channel] = {
        title: release.title[0],
        updated: release.updated[0],
        version: tag,
        channel,
        files: () => getFiles(tag),
        link: `${REPO}/releases/tag/${tag}`,
        download: `${REPO}/releases/download/${tag}/BudgetBudget-${tag.replace(
          /^v/,
          ""
        )}.dmg`,
        changelog,
      };
    }
  });

  if (channels.length && Object.keys(found).length === channels.length) {
    return found;
  }

  return findLatestChannels(channels, last, found);
}

/**
 * @param {ReleaseList[string]} [releaseWithPendingFiles]
 * @returns {Promise<Release>}
 */
async function resolveReleaseFiles(releaseWithPendingFiles) {
  return {
    ...releaseWithPendingFiles,
    files: await releaseWithPendingFiles.files(),
  };
}

/**
 * @param {string} [channel]
 * @returns {Promise<Release>}
 */
async function findLatest(channel) {
  if (typeof channel !== "string") {
    throw new Error("Missing channel parameter");
  }
  const { [channel]: releaseWithPendingFiles } = await findLatestChannels([
    channel,
  ]);
  if (!releaseWithPendingFiles) {
    const err = new Error(`Could not find any release on channel "${channel}"`);
    /* @ts-ignore */
    err.code = 404;
    throw err;
  }

  return resolveReleaseFiles(releaseWithPendingFiles);
}

/** @param {{ [key: string]: any }} res */
function withCors({ headers = {}, ...rest }) {
  return {
    ...rest,
    headers: {
      ...headers,
      "Access-Control-Allow-Origin": "*",
    },
  };
}

/** @param {{ pathParameters?: { channel?: string } }} event */
module.exports.getRelease = async ({ pathParameters: { channel } = {} }) => {
  try {
    return withCors({
      statusCode: 200,
      body: JSON.stringify(await findLatest(channel), null, 2),
    });
  } catch (err) {
    return withCors({
      statusCode: err.code || 500,
      body: err.message,
      headers: {
        ContentType: "text/plain",
      },
    });
  }
};

/** @param {{ queryStringParameters: { channels?: string } | null }} event */
module.exports.getReleases = async ({ queryStringParameters }) => {
  const { channels: channelsParam = "" } = queryStringParameters || {};
  const channels = channelsParam.split(",").filter((p) => p.length);

  try {
    const latest = await findLatestChannels(channels);
    const latestResolved = Object.fromEntries(
      await Promise.all(
        Object.entries(
          latest
        ).map(async ([channel, releaseWithPendingFiles]) => [
          channel,
          await resolveReleaseFiles(releaseWithPendingFiles),
        ])
      )
    );

    return withCors({
      statusCode: 200,
      body: JSON.stringify(latestResolved, null, 2),
    });
  } catch (err) {
    return withCors({
      statusCode: err.code || 500,
      body: err.message,
      headers: {
        ContentType: "text/plain",
      },
    });
  }
};

/** @param {{ pathParameters?: { channel?: string, arch?: 'x64' | 'arm64' } }} event */
module.exports.download = async (event) => {
  try {
    const latest = await findLatest(
      event.pathParameters && event.pathParameters.channel
    );
    const arch = (event.pathParameters && event.pathParameters.arch) || "x64";
    const { download } = latest.files[arch] || {};

    if (!download) {
      const err = new Error("Not Found");
      err.code = 404;
      throw err;
    }

    return {
      statusCode: 302,
      headers: {
        Location: download,
      },
    };
  } catch (err) {
    return {
      statusCode: err.code || 500,
      body: err.message,
      headers: {
        ContentType: "text/plain",
      },
    };
  }
};
