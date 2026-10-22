/**
 * Reusable API Service Layer
 * 
 * Centralizes all HTTP communication, provides request deduplication (in-flight request merging),
 * short-term read caching, standardized error handling, and separation of concerns from UI components.
 */

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

interface RequestConfig extends RequestInit {
  /** If true (default), deduplicates identical concurrent requests */
  deduplicate?: boolean;
  /** Cache successful GET responses in memory for specified milliseconds */
  cacheTtlMs?: number;
  /** Force network fetch, bypassing cache */
  forceRefresh?: boolean;
}

class ApiClient {
  private inFlight = new Map<string, Promise<unknown>>();
  private cache = new Map<string, { data: unknown; expiry: number }>();

  /**
   * Generates a unique key for deduplicating requests based on URL, method, and body.
   */
  private getRequestKey(endpoint: string, options: RequestConfig = {}): string {
    const method = options.method?.toUpperCase() || "GET";
    const body = options.body ? (typeof options.body === "string" ? options.body : JSON.stringify(options.body)) : "";
    return `${method}:${endpoint}:${body}`;
  }

  /**
   * Executes a typed HTTP request with automatic JSON parsing, deduplication, and error mapping.
   */
  async request<T>(endpoint: string, options: RequestConfig = {}): Promise<T> {
    const method = options.method?.toUpperCase() || "GET";
    const requestKey = this.getRequestKey(endpoint, options);
    const { deduplicate = true, cacheTtlMs = 0, forceRefresh = false, ...fetchOptions } = options;

    // 1. Check in-memory cache for GET requests if TTL is enabled
    if (method === "GET" && cacheTtlMs > 0 && !forceRefresh) {
      const cached = this.cache.get(requestKey);
      if (cached && Date.now() < cached.expiry) {
        return cached.data as T;
      }
    }

    // 2. Check for an in-flight request to prevent duplicate parallel requests
    if (deduplicate && this.inFlight.has(requestKey)) {
      return this.inFlight.get(requestKey) as Promise<T>;
    }

    // 3. Prepare headers
    const headers = new Headers(fetchOptions.headers || {});
    if (fetchOptions.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    // 4. Create request promise
    const requestPromise = (async (): Promise<T> => {
      try {
        const response = await fetch(endpoint, {
          ...fetchOptions,
          headers,
        });

        // Parse JSON response safely
        let data: unknown;
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          data = await response.json();
        } else {
          const text = await response.text();
          data = text ? { message: text } : {};
        }

        if (!response.ok) {
          const errorMsg =
            (data as { error?: string })?.error ||
            (data as { message?: string })?.message ||
            `HTTP ${response.status}: ${response.statusText}`;
          throw new ApiError(errorMsg, response.status, data);
        }

        // Cache response if enabled for GET
        if (method === "GET" && cacheTtlMs > 0) {
          this.cache.set(requestKey, { data, expiry: Date.now() + cacheTtlMs });
        }

        return data as T;
      } finally {
        // Remove from in-flight requests once settled
        this.inFlight.delete(requestKey);
      }
    })();

    if (deduplicate) {
      this.inFlight.set(requestKey, requestPromise);
    }

    return requestPromise;
  }

  /**
   * Clears all or specific cache entries
   */
  clearCache(pattern?: string) {
    if (!pattern) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}

export const apiClient = new ApiClient();

/* -------------------------------------------------------------------------- */
/*                               Domain Services                              */
/* -------------------------------------------------------------------------- */

export interface AuthResponse {
  ok: boolean;
  error?: string;
}

export interface WorkspaceResponse {
  tenantId: string | null;
  tenantName: string;
}

export interface SyncResponse {
  ok: boolean;
  accounts?: number;
  invoices?: number;
  newOrUpdated?: number;
  totalInDb?: number;
  isIncremental?: boolean;
  modifiedSince?: string | null;
  error?: string;
}

export interface XeroCredentialsResponse {
  clientId: string;
  redirectUri: string;
  scopes: string;
  hasSecret: boolean;
  error?: string;
}

export interface TokenConnectResponse {
  ok?: boolean;
  message?: string;
  accounts?: number;
  error?: string;
}

/**
 * Authentication Service
 */
export const authService = {
  /** Authenticate existing administrator */
  async login(email: string, password: string): Promise<AuthResponse> {
    return apiClient.request<AuthResponse>("/api/auth", {
      method: "POST",
      body: JSON.stringify({ email, password, mode: "login" }),
      deduplicate: true,
    });
  },

  /** Register new administrator */
  async setupAdmin(email: string, password: string): Promise<AuthResponse> {
    return apiClient.request<AuthResponse>("/api/auth", {
      method: "POST",
      body: JSON.stringify({ email, password, mode: "setup" }),
      deduplicate: true,
    });
  },

  /** Invalidate current session and destroy authentication cookie */
  async logout(): Promise<AuthResponse> {
    apiClient.clearCache();
    return apiClient.request<AuthResponse>("/api/auth", {
      method: "DELETE",
      cache: "no-store",
      deduplicate: true,
    });
  },
};

/**
 * Workspace / Tenant Service
 */
export const workspaceService = {
  /**
   * Fetches currently connected Xero tenant name & ID.
   * Cached for 10 seconds to avoid duplicate requests across component re-renders.
   */
  async getWorkspace(forceRefresh = false): Promise<WorkspaceResponse> {
    return apiClient.request<WorkspaceResponse>("/api/workspace", {
      method: "GET",
      cache: "no-store",
      cacheTtlMs: 10_000,
      forceRefresh,
      deduplicate: true,
    });
  },

  /** Invalidate workspace cache */
  invalidateCache() {
    apiClient.clearCache("/api/workspace");
  },
};

/**
 * Xero Integration Service
 */
export const xeroService = {
  /**
   * Synchronizes accounts and invoices from live Xero API.
   * Deduplicated so multiple concurrent clicks trigger only one sync operation.
   */
  async sync(type: "accounts" | "invoices" | "all" = "all", fullSync = false): Promise<SyncResponse> {
    const res = await apiClient.request<SyncResponse>("/api/xero/sync", {
      method: "POST",
      body: JSON.stringify({ type, fullSync }),
      deduplicate: true,
    });
    // Invalidate workspace cache as sync may update organization/data
    workspaceService.invalidateCache();
    return res;
  },

  /**
   * Retrieves stored Xero OAuth credentials and scopes from PostgreSQL.
   */
  async getCredentials(forceRefresh = false): Promise<XeroCredentialsResponse> {
    return apiClient.request<XeroCredentialsResponse>("/api/xero/credentials", {
      method: "GET",
      cache: "no-store",
      cacheTtlMs: 5_000,
      forceRefresh,
      deduplicate: true,
    });
  },

  /**
   * Saves encrypted Xero credentials and OAuth scopes into PostgreSQL.
   */
  async saveCredentials(data: {
    clientId: string;
    clientSecret?: string;
    redirectUri: string;
    scopes: string;
  }): Promise<{ ok?: boolean; error?: string }> {
    const res = await apiClient.request<{ ok?: boolean; error?: string }>("/api/xero/credentials", {
      method: "POST",
      body: JSON.stringify(data),
      deduplicate: true,
    });
    apiClient.clearCache("/api/xero/credentials");
    return res;
  },

  /**
   * Direct token connect using Xero API Explorer or Postman Bearer token.
   */
  async tokenConnect(data: {
    accessToken: string;
    tenantId: string;
    tenantName?: string;
  }): Promise<TokenConnectResponse> {
    const res = await apiClient.request<TokenConnectResponse>("/api/xero/token-connect", {
      method: "POST",
      body: JSON.stringify(data),
      deduplicate: true,
    });
    workspaceService.invalidateCache();
    return res;
  },

  /**
   * Returns OAuth 2.0 authorization redirect URL.
   */
  getConnectUrl(): string {
    return "/api/xero/connect";
  },
};
