(async () => {
  console.log(await require("./handler").findLatest());
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
