type File = {
  download: string;
  sha512: string;
  size: string;
};
export type Release = {
  title: string;
  version: string;
  channel: string;
  link: string;
  updated: string;
  /** @deprecated use Release['files']['x64']['download'] instead */
  download: string;
  files: {
    x64: File;
    arm64?: File;
  };
  changelog: {
    [kind: string]: {
      [scope: string]: {
        message: string;
        link: string;
        commit: string;
      }[];
    };
  };
};

type ReleaseWithPendingFiles = Omit<Release, "files"> & {
  files: () => Promise<Release["files"]>;
};

export type ReleaseList = {
  [key: string]: ReleaseWithPendingFiles | undefined;
};

export type ReleaseResponseEntry = {
  link: [{ $: { href: string } }];
  title: [string];
  updated: [string];
  content: [{ _: string }];
};

export type LatestMacFile = { url: string; sha512: string; size: number };

export type LatestMac = {
  files: LatestMacFile[];
};
