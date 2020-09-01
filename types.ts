export type Release = {
  title: string;
  version: string;
  channel: string;
  link: string;
  download: string;
  changelog: string;
};

export type ReleaseList = { [key: string]: Release | undefined };

export type ReleaseResponseEntry = {
  link: [{ $: { href: string } }];
  title: [string];
  content: [{ _: string }];
};
