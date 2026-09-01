export enum MultipartPolicyEnum {
  Auto = "auto",
  Force = "force",
  Disable = "disable",
}

export type MultipartPolicy = `${MultipartPolicyEnum}`;

export enum CoreCookieEnum {
  Session = "__mapo_session",
}

export interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  ordering?: string;
  [key: string]: unknown;
}

export interface PaginatedResponse<T> {
  results: T[];
  count: number;
  next?: string | null;
  previous?: string | null;
}

export type ApiResponse<T> = T;

export interface CrudConfig {
  baseURL?: string;
  headers?: Record<string, string>;
  [key: string]: unknown;
}

export interface CrudOptions {
  multipart?: MultipartPolicy;
}

/**
 * What an endpoint returns from OPTIONS. Deliberately loose: backends extend it
 * (Camomilla adds `lang_info`), and clients read only the keys they know.
 */
export interface ResourceMetadata {
  name?: string;
  description?: string;
  renders?: string[];
  parses?: string[];
  actions?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CrudRepository<T> {
  list(params?: ListParams, config?: CrudConfig): Promise<PaginatedResponse<T>>;
  detail(id: string | number, config?: CrudConfig): Promise<T>;
  create(data: Partial<T>, config?: CrudConfig, opts?: CrudOptions): Promise<T>;
  update(
    id: string | number,
    data: Partial<T>,
    config?: CrudConfig,
    opts?: CrudOptions,
  ): Promise<T>;
  partialUpdate(
    id: string | number,
    diff: Partial<T>,
    config?: CrudConfig,
    opts?: CrudOptions,
  ): Promise<T>;
  delete(id: string | number, config?: CrudConfig): Promise<void>;
  options(config?: CrudConfig): Promise<ResourceMetadata>;
  updateOrCreate(
    data: Partial<T> & { id?: string | number },
    config?: CrudConfig,
    opts?: CrudOptions,
  ): Promise<T>;
  updateOrder(
    startId: string | number,
    endId: string | number,
    config?: CrudConfig,
  ): Promise<void>;
}

export interface Credentials {
  username: string;
  password: string;
}

export interface AuthToken {
  token: string;
  [key: string]: unknown;
}

/**
 * Shape of `runtimeConfig.public.mapoCore` as written by the module setup.
 * All entries are guaranteed by the module `defaults`.
 */
export interface MapoCoreRuntimeConfig {
  authLoginUrl: string;
  userInfoApi: string;
  logoutUrl: string;
  loginUrl: string;
}
