# sls-budgetbudget-releases

read latest releases from github feed and provide redirect or info without cors pita

## Release Format

```ts
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
```

## API

Hosted: `https://pk7uo1n3r0.execute-api.eu-west-1.amazonaws.com/prod`

#### `/latest`

Returns `{ [channel: string]: Release }` for all channels

#### `/latest?channels={channel},{channel}`

Returns `{ [channel: string]: Release | undefined }` for given channels

#### `/latest/{channel}`

Returns `Release` for given channel

#### `/download/{channel}`

302 redirects to `Release.download` for given channel
