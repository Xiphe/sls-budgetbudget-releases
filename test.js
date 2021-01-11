(async () => {
  console.log(
    await require("./handler").download({
      pathParameters: { channel: "alpha", arch: "arm64" },
    })
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
