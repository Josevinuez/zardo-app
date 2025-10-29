if (!process.env.ROLLUP_SKIP_NODE_BINARY) {
  process.env.ROLLUP_SKIP_NODE_BINARY = "1";
}

const { build } = await import("vite");

try {
  await build();
} catch (error) {
  console.error("Vite build failed:", error);
  process.exit(1);
}
