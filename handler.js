// @ts-check

"use strict";

/** @type any */
const nodeFetch = require("node-fetch");
/** @type {typeof window.fetch} */
const fetch = nodeFetch;
const mem = require("mem");
const { parseStringPromise } = require("xml2js");

/** @typedef {import("./types").ReleaseResponseEntry} ReleaseResponseEntry */
/** @typedef {import("./types").Release} Release */
/** @typedef {import("./types").ReleaseList} ReleaseList */

/**
 * @param {unknown} thing
 * @returns {thing is { [key: string]: unknown }}
 */
function isPlainObject(thing) {
  return typeof thing === "object" && thing !== null;
}

/**
 * @param {unknown} entry
 * @returns {thing is ReleaseResponseEntry}
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
 * Cache responses so in case lambda is re-used we are faster
 */
const fetchReleases = mem(
  /**
   * @param after {string}
   * @returns {Promise<ReleaseResponseEntry[]>}
   */
  async (after) => {
    const res = await fetch(
      `https://github.com/Xiphe/budgetbudget/releases.atom${
        after ? `?after=${after}` : ""
      }`,
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
 * @param {string} channel
 * @param {string=} after
 * @param {ReleaseList=} found
 * @returns {Promise<Release | ReleaseList>}
 */
async function findLatest(channel, after, found = {}) {
  const releaseEntries = await fetchReleases(after);
  if (!releaseEntries.length) {
    if (channel) {
      const err = new Error(
        `Could not find any release on channel "${channel}"`
      );
      /* @ts-ignore */
      err.code = 404;
      throw err;
    } else {
      return found;
    }
  }

  let last = "";
  releaseEntries.forEach((release) => {
    const tag = release.link[0].$.href.split("/").pop();
    const channelMatch = tag.match(/^v[0-9.]+-([a-zA-Z]+)\.[0-9]+$/);
    const channel = channelMatch ? channelMatch[1] : "stable";
    last = tag;
    if (!found[channel]) {
      found[channel] = {
        title: release.title[0],
        version: tag,
        channel,
        link: `https://github.com/Xiphe/budgetbudget/releases/tag/${tag}`,
        download: `https://github.com/Xiphe/budgetbudget/releases/download/${tag}/BudgetBudget-${tag.replace(
          /^v/,
          ""
        )}.dmg`,
        changelog: release.content[0]._,
      };
    }
  });

  if (channel && found[channel]) {
    return found[channel];
  }

  return findLatest(channel, last, found);
}

module.exports.findLatest = findLatest;
module.exports.getRelease = async (event) => {
  const channel = event.pathParameters
    ? event.pathParameters.channel
    : undefined;

  try {
    return {
      statusCode: 200,
      body: JSON.stringify(await findLatest(channel), null, 2),
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
module.exports.download = async (event) => {
  try {
    if (!event.pathParameters || !event.pathParameters.channel) {
      throw new Error("Missing channel parameter");
    }
    const latest = await findLatest(event.pathParameters.channel);
    return {
      statusCode: 302,
      headers: {
        Location: latest.download,
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
