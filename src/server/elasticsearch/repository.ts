import type { estypes } from "@elastic/elasticsearch";
import type {
  AccountStatus,
  CollectionMemory,
  CollectionMemoryType,
  RiskTier,
  SyntheticAccount,
} from "@/lib/collections";
import { getElasticsearchClient } from "./client";
import { ACCOUNT_ALIAS, MEMORY_ALIAS } from "./schema";

export interface SearchAccountsInput {
  tenantId?: string;
  query?: string;
  statuses?: AccountStatus[];
  riskTiers?: RiskTier[];
  from?: number;
  size?: number;
}

export interface SearchAccountsResult {
  accounts: SyntheticAccount[];
  total: number;
}

const boundedSize = (value: number | undefined, fallback: number, maximum: number) =>
  Math.min(maximum, Math.max(1, Math.trunc(value ?? fallback)));

export async function searchAccounts(
  input: SearchAccountsInput = {},
): Promise<SearchAccountsResult> {
  const client = getElasticsearchClient();
  const filters: estypes.QueryDslQueryContainer[] = [
    { term: { tenantId: input.tenantId ?? "demo-portfolio" } },
  ];
  if (input.statuses?.length) filters.push({ terms: { status: input.statuses } });
  if (input.riskTiers?.length)
    filters.push({ terms: { riskTier: input.riskTiers } });

  const response = await client.search<SyntheticAccount>({
    index: ACCOUNT_ALIAS,
    from: Math.max(0, Math.trunc(input.from ?? 0)),
    size: boundedSize(input.size, 25, 100),
    query: {
      bool: {
        filter: filters,
        must: input.query?.trim()
          ? [
              {
                multi_match: {
                  query: input.query.trim(),
                  fields: ["displayName^2", "id"],
                  fuzziness: "AUTO",
                },
              },
            ]
          : undefined,
      },
    },
    sort: input.query?.trim()
      ? undefined
      : [{ riskScore: "desc" }, { daysPastDue: "desc" }, { id: "asc" }],
  });
  const total =
    typeof response.hits.total === "number"
      ? response.hits.total
      : (response.hits.total?.value ?? 0);
  return {
    accounts: response.hits.hits.flatMap((hit) =>
      hit._source ? [hit._source] : [],
    ),
    total,
  };
}

export async function getAccountById(
  accountId: string,
  tenantId = "demo-portfolio",
): Promise<SyntheticAccount | null> {
  const client = getElasticsearchClient();
  const response = await client.search<SyntheticAccount>({
    index: ACCOUNT_ALIAS,
    size: 1,
    query: {
      bool: {
        filter: [
          { term: { id: accountId } },
          { term: { tenantId } },
        ],
      },
    },
  });
  return response.hits.hits[0]?._source ?? null;
}

export interface RecallMemoriesInput {
  accountId: string;
  query: string;
  tenantId?: string;
  types?: CollectionMemoryType[];
  durableOnly?: boolean;
  limit?: number;
}

export interface RecalledMemory extends CollectionMemory {
  score?: number;
}

interface MemoryDocument extends CollectionMemory {
  summarySemantic: string;
}

function memoryFilters(
  input: RecallMemoriesInput,
): estypes.QueryDslQueryContainer[] {
  const filters: estypes.QueryDslQueryContainer[] = [
    { term: { tenantId: input.tenantId ?? "demo-portfolio" } },
    { term: { accountId: input.accountId } },
  ];
  if (input.types?.length) filters.push({ terms: { type: input.types } });
  if (input.durableOnly) filters.push({ term: { durable: true } });
  return filters;
}

function toRecalledMemories(
  hits: estypes.SearchHit<MemoryDocument>[],
): RecalledMemory[] {
  return hits.flatMap((hit) => {
    if (!hit._source) return [];
    const { summarySemantic: _semantic, ...memory } = hit._source;
    void _semantic;
    return [{ ...memory, score: hit._score ?? undefined }];
  });
}

async function lexicalRecall(
  input: RecallMemoriesInput,
  limit: number,
): Promise<RecalledMemory[]> {
  const client = getElasticsearchClient();
  const response = await client.search<MemoryDocument>({
    index: MEMORY_ALIAS,
    size: limit,
    query: {
      bool: {
        filter: memoryFilters(input),
        must: input.query.trim()
          ? [{ match: { summary: { query: input.query.trim() } } }]
          : undefined,
      },
    },
    sort: input.query.trim() ? undefined : [{ occurredAt: "desc" }],
  });
  return toRecalledMemories(response.hits.hits);
}

/** Hybrid account-scoped recall with automatic BM25 fallback. */
export async function recallMemories(
  input: RecallMemoriesInput,
): Promise<RecalledMemory[]> {
  const query = input.query.trim();
  const limit = boundedSize(input.limit, 8, 50);
  if (!query) return lexicalRecall(input, limit);

  const filters = memoryFilters(input);
  try {
    const response = await getElasticsearchClient().search<MemoryDocument>({
      index: MEMORY_ALIAS,
      size: limit,
      retriever: {
        rrf: {
          retrievers: [
            {
              standard: {
                query: {
                  bool: {
                    filter: filters,
                    must: [{ match: { summary: { query } } }],
                  },
                },
              },
            },
            {
              standard: {
                query: {
                  bool: {
                    filter: filters,
                    must: [
                      {
                        semantic: {
                          field: "summarySemantic",
                          query,
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
          rank_constant: 60,
          rank_window_size: Math.max(50, limit * 4),
        },
      },
    });
    return toRecalledMemories(response.hits.hits);
  } catch {
    return lexicalRecall(input, limit);
  }
}
