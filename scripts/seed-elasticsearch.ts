import { setupAndSeedSyntheticPortfolio } from "../src/server/elasticsearch/setup";

async function main() {
  console.log(
    "Creating missing versioned indices and idempotently upserting the synthetic portfolio...",
  );
  const result = await setupAndSeedSyntheticPortfolio();
  console.log(
    `Elasticsearch seed complete: ${result.accountCount} accounts, ${result.memoryCount} memories.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
