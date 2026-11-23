import { config } from "../config";

export class CouchbaseError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "CouchbaseError";
  }
}

export class DuplicateKeyError extends CouchbaseError {
  constructor(public readonly key: string) {
    super(`Document with key '${key}' already exists`, 12009);
    this.name = "DuplicateKeyError";
  }
}

export class DocumentNotFoundError extends CouchbaseError {
  constructor(public readonly key: string) {
    super(`Document with key '${key}' was not found`, 404);
    this.name = "DocumentNotFoundError";
  }
}

export interface N1QLQueryResult<T = unknown> {
  results: T[];
  status: "success" | "errors" | "fatal";
  metrics?: {
    elapsedTime: string;
    executionTime: string;
    resultCount: number;
    resultSize: number;
  };
  errors?: Array<{ code: number; msg: string }>;
}

export class CouchbaseClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly bucket: string;
  private readonly scope: string;

  constructor() {
    this.baseUrl = `http://${config.couchbase.host}:${config.couchbase.queryPort}/query/service`;
    const credentials = Buffer.from(
      `${config.couchbase.user}:${config.couchbase.pass}`
    ).toString("base64");
    this.authHeader = `Basic ${credentials}`;
    this.bucket = config.couchbase.bucket;
    this.scope = config.couchbase.scope;
  }

  private getCollectionPath(collection: string): string {
    return `\`${this.bucket}\`.\`${this.scope}\`.\`${collection}\``;
  }

  /**
   * Executes a N1QL query with parameters.
   */
  async query<T = unknown>(
    statement: string,
    namedArgs: Record<string, unknown> = {}
  ): Promise<T[]> {
    const payload: Record<string, unknown> = {
      statement,
      ...Object.fromEntries(
        Object.entries(namedArgs).map(([k, v]) => [`$${k}`, v])
      ),
    };

    let response: Response;
    try {
      response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.authHeader,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      throw new CouchbaseError(
        `Failed to reach Couchbase service at ${this.baseUrl}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    const data = (await response.json()) as N1QLQueryResult<T>;

    if (data.status !== "success") {
      const err = data.errors?.[0];
      const code = err?.code;
      const msg = err?.msg || "Query execution failed";

      // Couchbase error code 12009 / 4300 indicates duplicate key / key already exists
      if (code === 12009 || code === 4300 || msg.toLowerCase().includes("duplicate key") || msg.toLowerCase().includes("key already exists")) {
        throw new DuplicateKeyError(String(namedArgs.key || "unknown"));
      }

      throw new CouchbaseError(msg, code, data.errors);
    }

    return data.results || [];
  }

  /**
   * Atomically inserts a new document. Fails with DuplicateKeyError if key already exists.
   */
  async insert<T extends Record<string, unknown>>(
    collection: string,
    key: string,
    document: T
  ): Promise<T> {
    const target = this.getCollectionPath(collection);
    const statement = `INSERT INTO ${target} (KEY, VALUE) VALUES ($key, $doc)`;

    await this.query(statement, { key, doc: document });
    return document;
  }

  /**
   * Retrieves a document by primary key using the USE KEYS directive.
   */
  async get<T = unknown>(
    collection: string,
    key: string
  ): Promise<T | null> {
    const target = this.getCollectionPath(collection);
    const statement = `SELECT d.* FROM ${target} d USE KEYS $key`;

    const results = await this.query<T>(statement, { key });
    if (!results || results.length === 0) {
      return null;
    }
    return results[0];
  }

  /**
   * Atomically upserts a document (replaces if exists, creates if not).
   */
  async upsert<T extends Record<string, unknown>>(
    collection: string,
    key: string,
    document: T
  ): Promise<T> {
    const target = this.getCollectionPath(collection);
    const statement = `UPSERT INTO ${target} (KEY, VALUE) VALUES ($key, $doc)`;

    await this.query(statement, { key, doc: document });
    return document;
  }

  /**
   * Deletes a document by primary key using USE KEYS.
   */
  async delete(collection: string, key: string): Promise<boolean> {
    const target = this.getCollectionPath(collection);
    const statement = `DELETE FROM ${target} USE KEYS $key`;

    await this.query(statement, { key });
    return true;
  }

  /**
   * Health check ping.
   */
  async ping(): Promise<{ ok: boolean; message: string; elapsedMs: number }> {
    const start = performance.now();
    try {
      await this.query("SELECT 1 AS status");
      const elapsedMs = Math.round(performance.now() - start);
      return { ok: true, message: "Couchbase connection healthy", elapsedMs };
    } catch (err) {
      const elapsedMs = Math.round(performance.now() - start);
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        elapsedMs,
      };
    }
  }
}

export const couchbase = new CouchbaseClient();
