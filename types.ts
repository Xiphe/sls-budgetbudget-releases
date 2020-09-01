export type Release = {
  title: string;
  version: string;
  channel: string;
  link: string;
  updated: string;
  download: string;
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

export type ReleaseList = { [key: string]: Release | undefined };

export type ReleaseResponseEntry = {
  link: [{ $: { href: string } }];
  title: [string];
  updated: [string];
  content: [{ _: string }];
};
