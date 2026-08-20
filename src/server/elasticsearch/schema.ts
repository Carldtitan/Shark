import type { estypes } from "@elastic/elasticsearch";

export const ACCOUNT_INDEX = "shark-collection-accounts-v1";
export const ACCOUNT_ALIAS = "shark-collection-accounts";
export const MEMORY_INDEX = "shark-collection-memories-v1";
export const MEMORY_ALIAS = "shark-collection-memories";

const keyword = { type: "keyword" } as const;
const boolean = { type: "boolean" } as const;
const date = { type: "date" } as const;
const integer = { type: "integer" } as const;
const short = { type: "short" } as const;
const long = { type: "long" } as const;

export const accountMapping: estypes.MappingTypeMapping = {
  dynamic: "strict",
  properties: {
    id: keyword,
    tenantId: keyword,
    synthetic: boolean,
    displayName: {
      type: "text",
      fields: { keyword: { type: "keyword", ignore_above: 256 } },
    },
    segment: keyword,
    phoneNumber: { type: "keyword", index: false },
    email: { type: "keyword", index: false },
    preferredChannel: keyword,
    phoneConsent: boolean,
    balanceCents: long,
    originalBalanceCents: long,
    currency: keyword,
    daysPastDue: integer,
    delinquencyStage: keyword,
    contactabilityScore: short,
    contactabilityBand: keyword,
    riskScore: short,
    riskTier: keyword,
    disputeOpen: boolean,
    hardshipReported: boolean,
    doNotContact: boolean,
    promiseBehavior: keyword,
    status: keyword,
    attempts: short,
    successfulContacts: short,
    amountRecoveredCents: long,
    openedAt: date,
    lastContactAt: date,
    nextActionAt: date,
  },
};

const semanticSummary: estypes.MappingSemanticTextProperty = {
  type: "semantic_text",
  ...(process.env.ELASTICSEARCH_INFERENCE_ID?.trim()
    ? { inference_id: process.env.ELASTICSEARCH_INFERENCE_ID.trim() }
    : {}),
  chunking_settings: {
    strategy: "sentence",
    max_chunk_size: 120,
    sentence_overlap: 1,
  },
};

export const memoryMapping: estypes.MappingTypeMapping = {
  dynamic: "strict",
  properties: {
    id: keyword,
    tenantId: keyword,
    synthetic: boolean,
    accountId: keyword,
    type: keyword,
    outcome: keyword,
    channel: keyword,
    summary: { type: "text" },
    summarySemantic: semanticSummary,
    occurredAt: date,
    durable: boolean,
    amountCents: long,
  },
};
