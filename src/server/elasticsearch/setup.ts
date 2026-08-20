import type { Client, estypes } from "@elastic/elasticsearch";
import { generateSyntheticPortfolio } from "@/lib/collections";
import { getElasticsearchClient } from "./client";
import {
  ACCOUNT_ALIAS,
  ACCOUNT_INDEX,
  MEMORY_ALIAS,
  MEMORY_INDEX,
  accountMapping,
  memoryMapping,
} from "./schema";

interface IndexDefinition {
  index: string;
  alias: string;
  mappings: estypes.MappingTypeMapping;
}

const INDEX_DEFINITIONS: IndexDefinition[] = [
  { index: ACCOUNT_INDEX, alias: ACCOUNT_ALIAS, mappings: accountMapping },
  { index: MEMORY_INDEX, alias: MEMORY_ALIAS, mappings: memoryMapping },
];

async function ensureIndexAndAlias(
  client: Client,
  definition: IndexDefinition,
): Promise<void> {
  const exists = await client.indices.exists({ index: definition.index });
  if (!exists) {
    await client.indices.create({
      index: definition.index,
      mappings: definition.mappings,
    });
  }

  const aliasExists = await client.indices.existsAlias({
    name: definition.alias,
  });
  if (aliasExists) {
    const aliasState = await client.indices.getAlias({ name: definition.alias });
    const attachedIndices = Object.keys(aliasState);
    if (
      attachedIndices.length !== 1 ||
      attachedIndices[0] !== definition.index
    ) {
      throw new Error(
        `Refusing to repoint ${definition.alias}; it currently targets ${attachedIndices.join(", ")}. Use an explicit migration and atomic alias swap instead.`,
      );
    }
    return;
  }

  await client.indices.putAlias({
    index: definition.index,
    name: definition.alias,
    is_write_index: true,
  });
}

export async function ensureCollectionIndices(
  client: Client = getElasticsearchClient(),
): Promise<void> {
  for (const definition of INDEX_DEFINITIONS) {
    await ensureIndexAndAlias(client, definition);
  }
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size));
  }
  return result;
}

async function bulkIndex<T extends { id: string }>(
  client: Client,
  alias: string,
  documents: readonly T[],
): Promise<void> {
  for (const batch of chunks(documents, 400)) {
    const operations: estypes.BulkRequest<T>["operations"] = [];
    for (const document of batch) {
      operations.push({ index: { _index: alias, _id: document.id } }, document);
    }
    const response = await client.bulk<T>({ operations, refresh: false });
    if (response.errors) {
      const failures = response.items
        .flatMap((item) => Object.values(item))
        .filter((result) => result?.error)
        .slice(0, 5)
        .map((result) => `${result?._id}: ${result?.error?.reason}`);
      throw new Error(`Bulk indexing into ${alias} failed: ${failures.join("; ")}`);
    }
  }
}

export interface SeedResult {
  accountCount: number;
  memoryCount: number;
}

/**
 * Creates missing v1 resources and upserts the deterministic demo portfolio.
 * Re-running it is idempotent because every document uses a stable _id.
 */
export async function setupAndSeedSyntheticPortfolio(
  client: Client = getElasticsearchClient(),
): Promise<SeedResult> {
  await ensureCollectionIndices(client);
  const portfolio = generateSyntheticPortfolio();
  const memoryDocuments = portfolio.memories.map((memory) => ({
    ...memory,
    summarySemantic: memory.summary,
  }));

  await bulkIndex(client, ACCOUNT_ALIAS, portfolio.accounts);
  await bulkIndex(client, MEMORY_ALIAS, memoryDocuments);
  await client.indices.refresh({ index: [ACCOUNT_ALIAS, MEMORY_ALIAS] });

  return {
    accountCount: portfolio.accounts.length,
    memoryCount: portfolio.memories.length,
  };
}
