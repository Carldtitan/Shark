export { getElasticsearchClient } from "./client";
export {
  getAccountById,
  recallMemories,
  searchAccounts,
  type RecalledMemory,
  type RecallMemoriesInput,
  type SearchAccountsInput,
  type SearchAccountsResult,
} from "./repository";
export {
  ACCOUNT_ALIAS,
  ACCOUNT_INDEX,
  MEMORY_ALIAS,
  MEMORY_INDEX,
} from "./schema";
export {
  ensureCollectionIndices,
  setupAndSeedSyntheticPortfolio,
  type SeedResult,
} from "./setup";
