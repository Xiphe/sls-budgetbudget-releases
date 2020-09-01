(async () => {
  console.log(
    await require("./handler").getReleases({
      queryStringParameters: null,
    })
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
