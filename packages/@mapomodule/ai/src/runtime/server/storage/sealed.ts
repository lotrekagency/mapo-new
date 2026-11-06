/**
 * The module's state, sealed. Every record the gateway keeps is encrypted
 * with AES-256-GCM before it reaches the storage driver, with a key derived
 * from the app's secret for the record's purpose, and bound to its place: a
 * record copied to another key or another user, or whose expiry was edited,
 * no longer opens.
 *
 * Pure: the storage, the secret and the clock come from the caller, and the
 * cryptography is WebCrypto, so it runs on any server runtime Nitro targets.
 * `nitro.ts` wires it to the app's mount and runtime config.
 */

import { isRecord } from "../../shared/guards";

/**
 * What a record is kept for. Each purpose seals with a key of its own, so a
 * route that reads one purpose cannot be led to open another's records.
 */
export const STORAGE_PURPOSES = [
  /** The audit log: who asked the AI, when, with which model; never contents. */
  "audit",
  /** The provider keys admins assign. */
  "keys",
  /** The operators' own provider tokens. */
  "tokens",
  /** What admins set in the AI settings. */
  "settings",
  /** The catalog of entities, generated from the app's pages. */
  "catalog",
  /** Import AI batches and their drafts. */
  "staging",
] as const;

/** One of `STORAGE_PURPOSES`. */
export type StoragePurpose = (typeof STORAGE_PURPOSES)[number];

/**
 * The part of an unstorage `Storage` the sealed storage uses: Nitro's
 * `useStorage()` gives one, and so does `createStorage()` in the tests.
 */
export interface KeyValueStorage {
  getItem(key: string): Promise<unknown>;
  /** `options.ttl`, in seconds, is the driver's own expiry: Redis applies it, the file system ignores it. */
  setItem(
    key: string,
    value: unknown,
    options?: { ttl?: number },
  ): Promise<void>;
  removeItem(key: string): Promise<void>;
  /** The keys under `base`, with `:` between their segments. */
  getKeys(base?: string): Promise<string[]>;
}

/**
 * Why a stored record cannot be read. It stays where it is: a secret changed
 * by mistake must not wipe the state, so only its expiry or a new value
 * removes it.
 */
export type UnreadableReason =
  /** Not a record this module sealed. */
  | "foreign"
  /** Sealed with another secret, or for another purpose. */
  | "other-key"
  /** The key is right, but the record does not open: changed, or moved from another key or user. */
  | "tampered";

/** Options of `createSealedStorage()`. */
export interface SealedStorageOptions {
  /** The mount the records live in, such as `useStorage("mapo-ai")`. */
  storage: KeyValueStorage;
  /** The app's secret, at least `MIN_SECRET_LENGTH` characters (`secret.ts` reads it). */
  secret: string;
  /** The clock, in milliseconds. Default `Date.now`. */
  now?: () => number;
  /** Told about each record that cannot be read, with its key in the mount. */
  onUnreadable?: (key: string, reason: UnreadableReason) => void;
}

/** Options of `SealedStore.set()`. */
export interface SealOptions {
  /**
   * When the record expires, in epoch milliseconds, later than now. An
   * expired record is never returned, and the sweep removes it. Without it
   * the record stays until it is replaced or removed.
   */
  expiresAt?: number;
}

/** The records of one purpose, or of one user within it. */
export interface SealedStore {
  /**
   * The value at `key`, passed through `read`, the caller's validator: a
   * stored value is outside data. `undefined` when there is none, when it
   * has expired (it is then removed), when it cannot be read, or when `read`
   * refuses it.
   */
  get<T>(
    key: string,
    read: (value: unknown) => T | undefined,
  ): Promise<T | undefined>;
  /**
   * Seals `value`, a JSON value, at `key`: what `JSON.stringify` writes is
   * what `get` reads back. Replaces what the key held. A key can hold a
   * record and have records under it, such as a batch `b1` and its drafts
   * `b1:d1`.
   * @throws TypeError when the value has no JSON form, or when a purpose's
   * own store is asked to write in its users' spaces (`u:…`), which only
   * `forUser()` writes; RangeError when `expiresAt` is not a time in the
   * future
   */
  set(key: string, value: unknown, options?: SealOptions): Promise<void>;
  /** Removes the record at `key`, if there is one. */
  remove(key: string): Promise<void>;
  /**
   * Whether a record is stored at `key`, without opening it: one that is
   * there and does not open, or has expired, counts. One read of the key,
   * never a listing: what tells a record no admin saved from one that does
   * not open, at every request.
   */
  has(key: string): Promise<boolean>;
  /**
   * The keys of this store's records, under `prefix` when given (`b1` lists
   * `b1:…`, not `b1` itself or `b10`). They may include records that have
   * expired since the last sweep: `get` never returns those.
   */
  keys(prefix?: string): Promise<string[]>;
}

/** The records of one purpose, with a space for each user. */
export interface PurposeStore extends SealedStore {
  /**
   * The records of one user. On disk the user is a keyed hash of `userId`,
   * so file and key names do not say who the users are. The purpose's own
   * store reaches every user's records too, under `u:<hash>:`, to list, read
   * and remove them, as an admin does; it never writes there.
   */
  forUser(userId: string): Promise<SealedStore>;
}

/** The module's sealed state, one store per purpose. */
export interface SealedStorage {
  /** The records kept for `purpose`. */
  store(purpose: StoragePurpose): PurposeStore;
}

/** What one sweep did. */
export interface SweepResult {
  /** Expired records removed. */
  removed: number;
  /** Records that could not be checked or removed: the next sweep tries again. */
  failed: number;
}

/**
 * A sealed record, as the driver stores it. Only `exp` can be read without
 * the key; the record's name, its key, is not encrypted either.
 */
interface Envelope {
  /** The format of the envelope. */
  v: typeof ENVELOPE_VERSION;
  /** Which key sealed it, derived from the key and never the key itself. */
  kid: string;
  /** The nonce, 12 random bytes. */
  iv: string;
  /** The JSON value, encrypted, with its tag. */
  ct: string;
  /** When it expires, in epoch milliseconds; authenticated with the value. */
  exp?: number;
}

/** The keys one purpose seals and names its users with. */
interface PurposeKeys {
  seal: CryptoKey;
  kid: string;
  users: CryptoKey;
}

/** The fewest characters a secret may have: `openssl rand -base64 32` writes 44. */
export const MIN_SECRET_LENGTH = 32;

const ENVELOPE_VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KID_BYTES = 8;
const USER_BYTES = 16;
const ENVELOPE_KEYS = new Set(["v", "kid", "iv", "ct", "exp"]);
const HEX = /^[0-9a-f]+$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
/** Lowercase only: a case-insensitive file system would merge `B1` and `b1`. */
const SEGMENT = /^[a-z0-9_-]{1,64}$/;
const MAX_SEGMENTS = 8;
/** Names Windows keeps for devices, whatever their extension. */
const DEVICE_NAME = /^(?:con|prn|aux|nul|com\d|lpt\d)$/;
/** The segment a purpose files its users' spaces under. */
const USERS_SEGMENT = "u";
/**
 * The ending of every record's name on the driver. A key's segments have no
 * dot, so a record never takes the name of the folder of the records under
 * it: on a file system, `b1` and `b1:d1` are `b1.sealed` and `b1/d1.sealed`.
 */
const RECORD_SUFFIX = ".sealed";
/** Characters per call of `String.fromCharCode`, well under the engines' argument limits. */
const CHUNK = 0x8000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Opens the module's sealed state on `storage`, with keys derived from
 * `secret`. Derived keys are cached for the life of the returned object, so
 * a server makes it once.
 * @throws TypeError when the secret is shorter than `MIN_SECRET_LENGTH`
 */
export function createSealedStorage(
  options: SealedStorageOptions,
): SealedStorage {
  const isText = typeof options.secret === "string";
  if (!isText || options.secret.length < MIN_SECRET_LENGTH) {
    throw new TypeError(
      `The secret must have at least ${MIN_SECRET_LENGTH} characters`,
    );
  }
  const { storage } = options;
  const now = options.now ?? Date.now;
  const report = options.onUnreadable ?? (() => {});
  const keysOf = createKeyring(options.secret);

  /**
   * The store of the records under `base`: `<purpose>`, or a user's space
   * `<purpose>:u:<user>`. A record's path, `<base>:<key>`, is what the seal
   * binds; the driver files it under that path and `RECORD_SUFFIX`.
   */
  function storeAt(purpose: StoragePurpose, base: string): SealedStore {
    const pathOf = (key: string): string => `${base}:${checkedKey(key)}`;
    const isPurposeLevel = base === purpose;

    return {
      async get(key, read) {
        const path = pathOf(key);
        const stored = await storage.getItem(recordAt(path));
        const isMissing = stored === null;
        const isUnset = stored === undefined;
        if (isMissing || isUnset) return undefined;
        if (!isEnvelope(stored)) {
          report(path, "foreign");
          return undefined;
        }
        if (isExpired(stored, now())) {
          // The sweep would remove it too: a failure here only waits for it.
          await storage.removeItem(recordAt(path)).catch(() => undefined);
          return undefined;
        }
        const opened = await open(await keysOf(purpose), path, stored);
        if (typeof opened === "string") {
          report(path, opened);
          return undefined;
        }
        return read(opened.value);
      },

      async set(key, value, sealOptions = {}) {
        const path = pathOf(key);
        const isUsersSpace = key.split(":")[0] === USERS_SEGMENT;
        if (isPurposeLevel && isUsersSpace) {
          throw new TypeError(
            `${path} is in the users' spaces: write there with forUser()`,
          );
        }
        const at = now();
        const { expiresAt } = sealOptions;
        const hasExpiry = expiresAt !== undefined;
        if (hasExpiry && !isFutureTime(expiresAt, at)) {
          throw new RangeError(
            `expiresAt of ${path} must be a time in the future, in epoch milliseconds`,
          );
        }
        // JSON.stringify returns undefined for undefined, functions and symbols.
        const json: unknown = JSON.stringify(value);
        if (typeof json !== "string") {
          throw new TypeError(`The value of ${path} has no JSON form`);
        }
        const keys = await keysOf(purpose);
        const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
        const sealed = await crypto.subtle.encrypt(
          {
            name: "AES-GCM",
            iv,
            additionalData: boundTo(path, ENVELOPE_VERSION, expiresAt),
          },
          keys.seal,
          encoder.encode(json),
        );
        const envelope: Envelope = {
          v: ENVELOPE_VERSION,
          kid: keys.kid,
          iv: toBase64Url(iv),
          ct: toBase64Url(new Uint8Array(sealed)),
        };
        if (!hasExpiry) {
          await storage.setItem(recordAt(path), envelope);
          return;
        }
        envelope.exp = expiresAt;
        await storage.setItem(recordAt(path), envelope, {
          ttl: Math.ceil((expiresAt - at) / 1000),
        });
      },

      async remove(key) {
        await storage.removeItem(recordAt(pathOf(key)));
      },

      async has(key) {
        const stored = await storage.getItem(recordAt(pathOf(key)));
        return stored !== null && stored !== undefined;
      },

      async keys(prefix) {
        const listed = prefix === undefined ? base : pathOf(prefix);
        const start = `${base}:`;
        const keys = await storage.getKeys(listed);
        return keys
          .filter((key) => key.startsWith(start) && isRecordName(key))
          .map((key) => key.slice(start.length, -RECORD_SUFFIX.length));
      },
    };
  }

  return {
    store(purpose) {
      if (!STORAGE_PURPOSES.includes(purpose)) {
        throw new TypeError(`Unknown storage purpose: ${String(purpose)}`);
      }
      return {
        ...storeAt(purpose, purpose),
        async forUser(userId) {
          const isText = typeof userId === "string";
          const isEmpty = userId === "";
          if (!isText || isEmpty) {
            throw new TypeError("A user id is a non-empty string");
          }
          const user = await userSegment(await keysOf(purpose), userId);
          return storeAt(purpose, `${purpose}:${USERS_SEGMENT}:${user}`);
        },
      };
    },
  };
}

/**
 * Removes the expired records of the whole mount, of every purpose and user.
 * It reads only each record's expiry, which is written in clear, so it needs
 * no secret; what is not a sealed record is left alone. A record written
 * again between the read and the removal is removed too: nothing in the
 * driver lets a removal depend on what the record holds.
 * @param now the time to compare with, in epoch milliseconds
 * @throws what the driver throws when it cannot list the keys
 */
export async function sweepExpired(
  storage: KeyValueStorage,
  now: number,
): Promise<SweepResult> {
  const result: SweepResult = { removed: 0, failed: 0 };
  for (const key of await storage.getKeys()) {
    if (!isRecordName(key)) continue;
    try {
      const stored = await storage.getItem(key);
      if (isEnvelope(stored) && isExpired(stored, now)) {
        await storage.removeItem(key);
        result.removed += 1;
      }
    } catch {
      result.failed += 1;
    }
  }
  return result;
}

/** Hexadecimal digits of `bytes`, lowercase. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/**
 * Derives, once per purpose, the key that seals its records, the key's id
 * and the key that names its users, all with HKDF from the secret. The
 * labels leave the envelope's version out: a new format of the envelope must
 * not change the keys, nor move the users to new spaces.
 */
function createKeyring(
  secret: string,
): (purpose: StoragePurpose) => Promise<PurposeKeys> {
  let material: Promise<CryptoKey> | undefined;
  const cache = new Map<StoragePurpose, Promise<PurposeKeys>>();

  const step = (info: string): HkdfParams => ({
    name: "HKDF",
    hash: "SHA-256",
    salt: encoder.encode("mapo-ai"),
    info: encoder.encode(`mapo-ai/${info}`),
  });

  async function derive(purpose: StoragePurpose): Promise<PurposeKeys> {
    material ??= crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      "HKDF",
      false,
      ["deriveKey", "deriveBits"],
    );
    const base = await material;
    const [seal, kid, users] = await Promise.all([
      crypto.subtle.deriveKey(
        step(`seal/${purpose}`),
        base,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      ),
      crypto.subtle.deriveBits(step(`kid/${purpose}`), base, KID_BYTES * 8),
      crypto.subtle.deriveKey(
        step(`users/${purpose}`),
        base,
        { name: "HMAC", hash: "SHA-256", length: 256 },
        false,
        ["sign"],
      ),
    ]);
    return { seal, kid: toHex(new Uint8Array(kid)), users };
  }

  return (purpose) => {
    let keys = cache.get(purpose);
    if (!keys) {
      keys = derive(purpose);
      cache.set(purpose, keys);
    }
    return keys;
  };
}

/** Decrypts the envelope of the record at `path`, or says why it does not open. */
async function open(
  keys: PurposeKeys,
  path: string,
  envelope: Envelope,
): Promise<{ value: unknown } | UnreadableReason> {
  if (envelope.kid !== keys.kid) return "other-key";
  const iv = fromBase64Url(envelope.iv);
  const sealed = fromBase64Url(envelope.ct);
  const isIvDecoded = iv !== undefined;
  const isSealedDecoded = sealed !== undefined;
  if (!isIvDecoded || !isSealedDecoded) return "tampered";
  const isNonce = iv.length === IV_BYTES;
  const hasTag = sealed.length >= TAG_BYTES;
  if (!isNonce || !hasTag) return "tampered";
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: boundTo(path, envelope.v, envelope.exp),
      },
      keys.seal,
      sealed,
    );
  } catch {
    return "tampered";
  }
  try {
    const value: unknown = JSON.parse(decoder.decode(plain));
    return { value };
  } catch {
    // Authentic, but not written by this module.
    return "foreign";
  }
}

/**
 * What the seal binds a record to besides its value: its path in the mount,
 * the version of its envelope and its expiry. Moving the record or editing
 * its expiry breaks the seal.
 */
function boundTo(
  path: string,
  version: number,
  expiresAt: number | undefined,
): Uint8Array<ArrayBuffer> {
  return encoder.encode(`mapo-ai/${version}/${path}/${expiresAt ?? ""}`);
}

/** Where the driver files the record at `path`. */
function recordAt(path: string): string {
  return `${path}${RECORD_SUFFIX}`;
}

/** Whether a key of the driver names a record, not a folder or a foreign value. */
function isRecordName(key: string): boolean {
  return key.endsWith(RECORD_SUFFIX);
}

/** The segment that stands for a user: a keyed hash of the id, hexadecimal. */
async function userSegment(keys: PurposeKeys, userId: string): Promise<string> {
  const mac = await crypto.subtle.sign(
    "HMAC",
    keys.users,
    encoder.encode(userId),
  );
  return toHex(new Uint8Array(mac).subarray(0, USER_BYTES));
}

/**
 * `key`, if every segment is lowercase letters, digits, `_` or `-`, up to 64
 * characters, with at most 8 segments between `:`, and none is a name
 * Windows keeps for a device (`con`, `nul`, `com1`…). Keys come from code,
 * and a route checks an id from a request before it makes a key of it.
 * @throws TypeError otherwise
 */
function checkedKey(key: string): string {
  const segments = typeof key === "string" ? key.split(":") : [];
  const hasSegments = segments.length > 0;
  const isShallow = segments.length <= MAX_SEGMENTS;
  const isWellFormed = segments.every((segment) => SEGMENT.test(segment));
  const namesDevice = segments.some((segment) => DEVICE_NAME.test(segment));
  if (!hasSegments || !isShallow || !isWellFormed || namesDevice) {
    throw new TypeError(`Invalid storage key: ${JSON.stringify(key)}`);
  }
  return key;
}

/** A record this module sealed, in the version it writes. */
function isEnvelope(value: unknown): value is Envelope {
  if (!isRecord(value)) return false;
  const hasOnlyEnvelopeKeys = Object.keys(value).every((key) =>
    ENVELOPE_KEYS.has(key),
  );
  const isVersion = value.v === ENVELOPE_VERSION;
  const hasKid = typeof value.kid === "string" && HEX.test(value.kid);
  const hasIv = typeof value.iv === "string" && BASE64URL.test(value.iv);
  const hasSealed = typeof value.ct === "string" && BASE64URL.test(value.ct);
  const isWithoutExpiry = value.exp === undefined;
  const isExpiryTime = Number.isSafeInteger(value.exp);
  const hasValidExpiry = isWithoutExpiry || isExpiryTime;
  return (
    hasOnlyEnvelopeKeys &&
    isVersion &&
    hasKid &&
    hasIv &&
    hasSealed &&
    hasValidExpiry
  );
}

function isExpired(envelope: Envelope, now: number): boolean {
  return envelope.exp !== undefined && envelope.exp <= now;
}

function isFutureTime(value: number, now: number): boolean {
  return Number.isSafeInteger(value) && value > now;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK));
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | undefined {
  let binary: string;
  try {
    binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return undefined;
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
