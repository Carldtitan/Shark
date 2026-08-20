import { Client } from "@elastic/elasticsearch";

let elasticsearchClient: Client | undefined;

function requireServerEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required to connect to Elasticsearch.`);
  }
  return value;
}

/** Lazily creates the server-side Elasticsearch client without exposing credentials. */
export function getElasticsearchClient(): Client {
  if (typeof window !== "undefined") {
    throw new Error("The Elasticsearch client can only be used on the server.");
  }
  if (!elasticsearchClient) {
    elasticsearchClient = new Client({
      node: requireServerEnvironment("ELASTICSEARCH_URL"),
      auth: {
        apiKey: requireServerEnvironment("ELASTICSEARCH_API_KEY"),
      },
      requestTimeout: 120_000,
      maxRetries: 3,
    });
  }
  return elasticsearchClient;
}
