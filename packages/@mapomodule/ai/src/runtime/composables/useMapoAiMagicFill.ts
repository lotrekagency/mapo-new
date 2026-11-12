import {
  computed,
  effectScope,
  getCurrentScope,
  onScopeDispose,
  shallowRef,
  watch,
} from "vue";
import type { ComputedRef, Ref } from "vue";
import { useNuxtApp } from "nuxt/app";
import { metadataToJsonSchema } from "@mapomodule/utils";
import type { JSONSchema } from "@mapomodule/utils";
import type { AnyFieldDescriptor } from "@mapomodule/form/types";
import { dataOf, mapoAiValueText, proposalOf } from "../shared/fill";
import { effectiveMatch } from "../shared/relations";
import { isRecord } from "../shared/guards";
import type { MapoAiFillEntity } from "../shared/fill";
import type {
  MapoAiLinkBlock,
  MapoAiLinkFailure,
  MapoAiReadLinkResponse,
  MapoAiRunPreviewResponse,
  MapoAiSourcePart,
  MapoAiStatus,
} from "../shared/gateway";
import {
  checkMapoAiSource,
  defaultMapoAiChoice,
  mapoAiPreselected,
  mapoAiProviderChoices,
  mapoAiSourceParts,
  previewMapoAiFill,
  summarizeMapoAiFill,
} from "../shared/magicFill";
import type {
  MapoAiFillSummary,
  MapoAiProposedItem,
  MapoAiProviderChoice,
  MapoAiSourceProblem,
  MapoAiToConfirm,
} from "../shared/magicFill";
import { readMapoAiFile, readMapoAiLink } from "../shared/read";
import { gatewayGetter, gatewayPoster } from "./poster";
import { translatorOf } from "./translate";
import type { Translate } from "./translate";
import { mapoAiFillErrorOf, useMapoAiFill } from "./useMapoAiFill";
import type { MapoAiFill, MapoAiFillTarget } from "./useMapoAiFill";
import { useMapoAiStatus } from "./useMapoAiStatus";

/**
 * The detail Magic Fill works on: what `useMapoAiFill()` fills, and what
 * the page says of its record. The context of `MapoDetail`, from
 * `useMapoDetail()`, is one.
 */
export interface MapoAiMagicFillDetail<
  T extends object = Record<string, unknown>,
> extends MapoAiFillTarget<T> {
  /** The name of the record's model for people ("Article"): the AI reads it as what the record is. */
  modelName?: Readonly<Ref<string | null>>;
  /** The backend model of the permissions (`article`): the gateway checks `add_` or `change_` on it. */
  permissionModel?: Readonly<Ref<string | undefined>>;
  /** How the page reads a schema from the `OPTIONS` response, when it has its own way. */
  schemaFromMetadata?: Readonly<
    Ref<
      | ((metadata: Record<string, unknown>) => JSONSchema | undefined)
      | undefined
    >
  >;
  /**
   * The page's draft, as the context of `MapoDetail` gives it: Magic Fill
   * keeps its session there, as the part `mapo-ai-magic-fill`, on a page
   * that keeps drafts.
   */
  draft?: {
    part(
      key: string,
      part: { save: () => unknown; restore: (data: unknown) => void },
    ): () => void;
    touch(): void;
  };
  /**
   * Takes the operator to a field, as the context of `MapoDetail` does:
   * its tab, group and item open, and its control takes the focus. Without
   * it, Magic Fill offers no "Next to check".
   */
  revealField?: (path: string) => Promise<boolean>;
}

/** The part of the page's draft that holds Magic Fill's session. */
const DRAFT_PART = "mapo-ai-magic-fill";

/** What became of a file the operator attached. */
export type MapoAiMagicFillFileState =
  /** `read` reads it. */
  | "reading"
  /** Its text is part of the source. */
  | "read"
  /** No reader takes its format. */
  | "unsupported"
  /** It has no text. */
  | "empty"
  /** Its text is longer than `run` takes. */
  | "too-long"
  /** It is larger than `maxFileBytes`: not sent. */
  | "too-large"
  /** It could not be read. */
  | "failed";

/** A file the operator attached, and what became of it. */
export interface MapoAiMagicFillFile {
  /** Its place in the list, to remove it. */
  id: number;
  name: string;
  /** Its size, in bytes. */
  size: number;
  state: MapoAiMagicFillFileState;
  /** For `read`: its parts, named after it. */
  parts?: MapoAiSourcePart[];
  /** For `read`, the characters of its text; for `too-long`, those the reader found. */
  chars?: number;
}

/** What became of the page of a link the operator gave. */
export type MapoAiMagicFillLinkState =
  /** `read/link` reads it. */
  | "reading"
  /** Its text is part of the source. */
  | "read"
  /** No reader takes its format. */
  | "unsupported"
  /** It has no text. */
  | "empty"
  /** Its text is longer than `run` takes. */
  | "too-long"
  /** Its reader could not read it. */
  | "failed"
  /** The app reads no link. */
  | "off"
  /** The gateway refused the link, or a redirect: `reason` says why. */
  | "blocked"
  /** The page could not be reached: `reason` says why. */
  | "unreachable"
  /** Its server answered an error: `httpStatus`. */
  | "http-error"
  /** It has more bytes than `maxFileBytes`. */
  | "too-large"
  /** The user read more pages than the limit lets them in a minute. */
  | "limited";

/** A link the operator gave, and what became of its page. */
export interface MapoAiMagicFillLink {
  /** Its place in the list, to remove it. */
  id: number;
  /** The link, as the operator wrote it. */
  url: string;
  /** For `read`: the page's address, after its redirects. */
  address?: string;
  state: MapoAiMagicFillLinkState;
  /** For `blocked` and `unreachable`: why. */
  reason?: MapoAiLinkBlock | MapoAiLinkFailure;
  /** For `http-error`: the status its server answered. */
  httpStatus?: number;
  /** For `read`: its parts, named after its address. */
  parts?: MapoAiSourcePart[];
  /** For `read`, the characters of its text; for `too-long`, those the reader found. */
  chars?: number;
}

/**
 * Where a call is: `idle`, none; `describing`, the record's description
 * (`OPTIONS`) is read; `waiting`, the AI is asked, until it answers.
 */
export type MapoAiMagicFillPhase = "idle" | "describing" | "waiting";

/** Why Extract cannot run now. */
export type MapoAiMagicFillProblem =
  | MapoAiSourceProblem
  /** A file, or the page of a link, is still being read. */
  | { kind: "reading" }
  /** No provider can be called for the user. */
  | { kind: "no-provider" }
  /** The record loads, saves or deletes, or cannot be edited. */
  | { kind: "busy" };

/** What "What I send to the AI" shows. */
export interface MapoAiMagicFillPreview {
  /** `idle` until asked, then `loading`, `ready` with the answer, or `failed` with why. */
  state: "idle" | "loading" | "ready" | "failed";
  answer?: MapoAiRunPreviewResponse;
  error?: string;
  /**
   * What a call would send changed since the preview was asked: the text,
   * the files, the instructions, the model or the form. It is never asked
   * again by itself, so typing spends nothing: `loadPreview()` asks.
   */
  stale: boolean;
}

/** What `useMapoAiMagicFill()` gives the components of a detail. */
export interface MapoAiMagicFill {
  /** Whether the panel is open. */
  open: Ref<boolean>;
  /** The text the operator pasted. */
  text: Ref<string>;
  /** The files the operator attached, in order, and what became of each. */
  files: Readonly<Ref<readonly MapoAiMagicFillFile[]>>;
  /** Attaches files: each is read through `read` at once. */
  attach(files: readonly File[]): void;
  /** Removes a file, and stops reading it. */
  detach(id: number): void;
  /**
   * The links the operator gave, in order, and what became of each page;
   * empty where the app reads no link (`status.links`).
   */
  links: Readonly<Ref<readonly MapoAiMagicFillLink[]>>;
  /**
   * Reads the page of a link through `read/link`, at once. A link given
   * already, and read or being read, is not read again.
   */
  attachLink(url: string): void;
  /** Removes a link, and stops reading its page. */
  detachLink(id: number): void;
  /** The operator's instructions for this extraction. */
  instructions: Ref<string>;
  /** The provider and model of the next call; the user's default at first. */
  choice: Ref<MapoAiProviderChoice | undefined>;
  /** The providers and models the user may call. */
  choices: ComputedRef<MapoAiProviderChoice[]>;
  /** What the gateway offers the user: `undefined` until it answers. */
  status: Readonly<Ref<MapoAiStatus | undefined>>;
  /** Whether Magic Fill is offered here: the app lets the user use the AI, and the record can be edited. */
  available: ComputedRef<boolean>;
  /** The source as it would be sent: the pasted text, then each file read, then each page. */
  parts: ComputedRef<MapoAiSourcePart[]>;
  /** Why Extract cannot run now; none when it can. */
  problems: ComputedRef<MapoAiMagicFillProblem[]>;
  /** Where the call is. */
  phase: Readonly<Ref<MapoAiMagicFillPhase>>;
  /** When the call started, in milliseconds, for the time it takes. */
  startedAt: Readonly<Ref<number | undefined>>;
  /**
   * Sends the source to the AI, and applies the answer with
   * `useMapoAiFill()`: a value a quote verifies goes into an empty field
   * the form shows, the others wait for the operator. Closes the panel
   * when an answer or a refusal arrives; never rejects.
   */
  extract(): Promise<void>;
  /** Stops the call: the gateway stops the provider's call. */
  cancel(): void;
  /**
   * Puts back every field that still holds a value the AI wrote in the
   * session, newest first, and ends the session: the values the operator
   * kept or changed stay.
   */
  undoAll(): void;
  /**
   * The paths of the marks that wait for the operator, in the order of the
   * form: what "Next to check" goes through.
   */
  toCheck: Readonly<Ref<readonly string[]>>;
  /** The page can take the operator to a field: "Next to check" works. */
  canReveal: boolean;
  /**
   * Takes the operator to the next mark that waits for them, after the one
   * it took them to last, in the order of the form, and from the first
   * again after the last: its tab, group and item open, and its field
   * takes the focus. Resolves whether a field took it.
   */
  nextToCheck(): Promise<boolean>;
  /** What "What I send to the AI" shows, after `loadPreview()`, and whether it is stale. */
  preview: Readonly<Ref<MapoAiMagicFillPreview>>;
  /** Asks the gateway what a call would send now: `run/preview`, which calls no provider. */
  loadPreview(): Promise<void>;
  /** The fill underneath: its answer, its error, the fields and their marks. */
  fill: MapoAiFill;
  /**
   * What became of the session's answers, with the values that wait in the
   * preview's groups (to fill, to replace, without proof); `undefined`
   * before an answer joins it.
   */
  summary: ComputedRef<MapoAiFillSummary | undefined>;
  /**
   * Whether the preview ticks a value that waits, by its path: the
   * operator's tick, else the preview's own, which ticks the values for
   * empty fields the form shows. A hidden field is never ticked. A list is
   * ticked while any of its items is.
   */
  isSelected(path: string): boolean;
  /**
   * Ticks or unticks a value that waits, by its path. The tick holds for
   * that value: a new value at the path starts from the preview's own. For
   * a list, every item it may add.
   */
  select(path: string, selected: boolean): void;
  /**
   * Whether the preview ticks an item of a list that waits, by the list's
   * path and the item's place in the AI's list: the operator's tick, else
   * the preview's own, which ticks the verified items. An item the field
   * holds already, or of a hidden field, is never ticked.
   */
  isItemSelected(path: string, index: number): boolean;
  /** Ticks or unticks an item of a list that waits. */
  selectItem(path: string, index: number, selected: boolean): void;
  /** The paths of the values that wait and are ticked now. */
  selected: ComputedRef<string[]>;
  /**
   * Applies every ticked value, as Apply on its field does: into a field
   * the form shows now, never a hidden one. The others keep waiting. A list
   * adds its ticked items after the field's own, and its proposal is used.
   */
  applySelected(): void;
  /**
   * Ignores every value that waits, as Ignore on its field does: their
   * marks go. The values in the form stay.
   */
  ignoreWaiting(): void;
  /** A field's label, by its key, as the form names it. */
  labelOf(key: string): string;
  /**
   * An item of a list as the preview names it: its template's label, when
   * the items vary, then its first values.
   */
  itemLabelOf(key: string, item: MapoAiProposedItem): string;
  /** Translates a key of the `mapo.*` messages, as the app does. */
  t: Translate;
}

/** The parts of a detail's Magic Fill: its button, its banner, its panel. */
export type MapoAiMagicFillPart = "action" | "banner" | "panel";

/** How a component takes part in a detail's Magic Fill. */
export interface MapoAiMagicFillOptions {
  /**
   * The part of Magic Fill the calling component is, when it replaces one
   * with MapoOverride: `action`, the button; `banner`, the banner above the
   * form; `panel`, the panel. The other parts then know it is there: the
   * banner shows no button of its own beside a button that says it is
   * one. Leave it out in any other component.
   */
  part?: MapoAiMagicFillPart;
}

/** One component that takes part, and whether it may render the panel. */
interface Member {
  id: symbol;
  role: MapoAiMagicFillPart;
  /** One of Magic Fill's own parts, which renders the panel when it comes first. */
  hosts: boolean;
}

/** What the components of one detail share besides the public state. */
interface Presence {
  /** The components mounted, in order, each with its role. */
  members: Ref<readonly Member[]>;
}

interface Shared {
  state: MapoAiMagicFill;
  presence: Presence;
  stop: () => void;
  users: number;
}

const shared = new WeakMap<object, Shared>();
/** The presence of each state's detail, for `joinMagicFill()`. */
const presences = new WeakMap<MapoAiMagicFill, Presence>();

/**
 * Magic Fill on a detail page: the panel's source (a pasted text, files
 * read through `read`, the pages of links through `read/link`), the
 * operator's instructions, the provider and the
 * model, the call through `useMapoAiFill()`, where it is, and its summary.
 * One state per detail: the button in the sidebar card, the panel and the
 * banner above the form share it, and it lives while one of them is
 * mounted, so closing the panel neither stops nor loses a call; when the
 * last goes, it stops at the end of that update, so a component replaced
 * keeps it. Call it in a component's setup, with the detail's context. A
 * component that replaces a part of Magic Fill passes `part`.
 *
 * @param detail  The detail's context, from `useMapoDetail()`.
 * @param options Which part of Magic Fill the calling component is, if any.
 *
 * @example
 * // A component inside a MapoDetail
 * const detail = useMapoDetail();
 * if (detail) {
 *   const magic = useMapoAiMagicFill(detail);
 *   magic.text.value = "Title: About us";
 *   await magic.extract();
 * }
 *
 * @example
 * // app/mapooverride/MapoAiMagicFillAction.vue: a button of the app's own
 * const props = defineProps<{ detail: MapoAiMagicFillDetail }>();
 * const magic = useMapoAiMagicFill(props.detail, { part: "action" });
 */
export function useMapoAiMagicFill<T extends object>(
  detail: MapoAiMagicFillDetail<T>,
  options: MapoAiMagicFillOptions = {},
): MapoAiMagicFill {
  let entry = shared.get(detail);
  if (!entry) {
    const scope = effectScope(true);
    const presence: Presence = {
      members: shallowRef<readonly Member[]>([]),
    };
    const state = scope.run(() => magicFillState(detail))!;
    presences.set(state, presence);
    const created: Shared = {
      state,
      presence,
      stop: () => {
        state.cancel();
        scope.stop();
      },
      users: 0,
    };
    shared.set(detail, created);
    entry = created;
  }
  const own = entry;
  own.users += 1;
  if (getCurrentScope()) {
    // A part the app replaced tells the others it is there; it never
    // renders the panel, which Magic Fill's own parts keep rendering.
    const part = options.part;
    if (part) {
      const presence = joinMagicFill(own.state, part, { hosts: false });
      onScopeDispose(presence.leave);
    }
    onScopeDispose(() => {
      own.users -= 1;
      // A component replaced in one update goes before the new one comes:
      // the state waits for the update to end, so a swap keeps the call.
      queueMicrotask(() => {
        const isUsed = own.users > 0 || shared.get(detail) !== own;
        if (isUsed) return;
        own.stop();
        shared.delete(detail);
      });
    });
  }
  return own.state;
}

/**
 * How a component of the detail takes part. The first of Magic Fill's own
 * buttons and banners mounted renders the panel, and the first of its
 * panels renders the slideover: an override that renders the panel itself,
 * or a part the app replaced, still leaves one. The banner knows whether a
 * button is there, the app's own included (`part` of
 * `useMapoAiMagicFill()`). Not public: the components of Magic Fill share
 * it. Call `leave()` when it unmounts.
 */
export function joinMagicFill(
  magic: MapoAiMagicFill,
  role: MapoAiMagicFillPart,
  { hosts = true }: { hosts?: boolean } = {},
): {
  isFirst: ComputedRef<boolean>;
  hasAction: ComputedRef<boolean>;
  leave: () => void;
} {
  const presence = presences.get(magic);
  const id = Symbol(role);
  if (!presence) {
    return {
      isFirst: computed(() => false),
      hasAction: computed(() => false),
      leave: () => undefined,
    };
  }
  const isPanel = role === "panel";
  presence.members.value = [...presence.members.value, { id, role, hosts }];
  return {
    isFirst: computed(() => {
      if (!hosts) return false;
      const kin = presence.members.value.filter(
        (one) => one.hosts && (one.role === "panel") === isPanel,
      );
      return kin[0]?.id === id;
    }),
    hasAction: computed(() =>
      presence.members.value.some((one) => one.role === "action"),
    ),
    leave: () => {
      presence.members.value = presence.members.value.filter(
        (one) => one.id !== id,
      );
    },
  };
}

/** The state of one detail's Magic Fill, in its own effect scope. */
function magicFillState<T extends object>(
  detail: MapoAiMagicFillDetail<T>,
): MapoAiMagicFill {
  const app = useNuxtApp();
  const t = translatorOf(app);
  const post = gatewayPoster(app);
  // The records of the form's relations, with the operator's session.
  const get = gatewayGetter(app);
  const { status, refresh } = useMapoAiStatus();

  /** What the AI knows of the record, read from the page at each call: its props may change. */
  function entityOf(): MapoAiFillEntity {
    const label = detail.modelName?.value;
    const model = detail.permissionModel?.value;
    // `definePageMeta({ magicFill: { evidence: false } })` asks no quotes.
    const isWithoutProofs = pageOptionsOf(app)?.evidence === false;
    return {
      ...(label ? { label } : {}),
      ...(model ? { model } : {}),
      ...(isWithoutProofs ? { evidence: false } : {}),
    };
  }
  /** How the page reads a schema from `OPTIONS`, at each call. */
  function schemaReaderOf() {
    return detail.schemaFromMetadata?.value ?? metadataToJsonSchema;
  }
  // `useMapoAiFill()` reads its options at each call: the getters give it
  // what the page says then.
  const fill = useMapoAiFill(detail, {
    get entity() {
      return entityOf();
    },
    get schemaFromMetadata() {
      return schemaReaderOf();
    },
  });

  // The session goes with the page's draft, where the page keeps one: a
  // reload and Restore bring back the marks, their quotes and Undo all. A
  // draft restored during a call takes its place.
  const draft = detail.draft;
  if (draft) {
    const leave = draft.part(DRAFT_PART, {
      save: () => fill.snapshot(),
      restore: (data) => {
        cancel();
        // A form whose fields come from the record's description (`OPTIONS`)
        // has them once it answers: the session comes back on them.
        const described = detail.metadata?.().catch(() => undefined);
        void Promise.resolve(described).then(() => {
          fill.resume(data);
        });
      },
    });
    onScopeDispose(leave);
    watch([fill.fields, fill.rounds], () => draft.touch());
  }

  const open = shallowRef(false);
  const text = shallowRef("");
  const instructions = shallowRef("");
  const files = shallowRef<readonly MapoAiMagicFillFile[]>([]);
  const links = shallowRef<readonly MapoAiMagicFillLink[]>([]);
  const choice = shallowRef<MapoAiProviderChoice>();
  const phase = shallowRef<MapoAiMagicFillPhase>("idle");
  const startedAt = shallowRef<number>();
  const asked = shallowRef<Omit<MapoAiMagicFillPreview, "stale">>({
    state: "idle",
  });

  // What the user may do can change: an admin assigns a key, the user
  // saves a preference. Ask on every detail, and when the panel opens.
  if (typeof window !== "undefined") void refresh();
  watch(open, (isOpen) => {
    if (isOpen) void refresh();
  });

  const choices = computed(() =>
    status.value ? mapoAiProviderChoices(status.value) : [],
  );
  watch(
    choices,
    (list) => {
      const current = choice.value;
      const isListed =
        current !== undefined &&
        list.some(
          (one) =>
            one.provider === current.provider && one.model === current.model,
        );
      if (isListed) return;
      choice.value = status.value
        ? defaultMapoAiChoice(status.value, "fill")
        : undefined;
    },
    { immediate: true },
  );

  // A call under way stays in view, with its Cancel, whatever `status`
  // says meanwhile.
  const available = computed(() => {
    const isRunning = phase.value !== "idle";
    const isOffered =
      status.value?.allowed === true && detail.readonly?.value !== true;
    return isRunning || isOffered;
  });

  const parts = computed(() =>
    mapoAiSourceParts(text.value, [
      ...files.value
        .filter((file) => file.state === "read")
        .map((file) => file.parts ?? []),
      ...links.value
        .filter((link) => link.state === "read")
        .map((link) => link.parts ?? []),
    ]),
  );

  const problems = computed<MapoAiMagicFillProblem[]>(() => {
    const isBusy =
      detail.readonly?.value === true ||
      detail.isBusy?.value === true ||
      detail.isLoading?.value === true;
    const isReading =
      files.value.some((file) => file.state === "reading") ||
      links.value.some((link) => link.state === "reading");
    return [
      ...checkMapoAiSource(
        parts.value,
        instructions.value,
        status.value?.limits,
      ),
      ...(isReading ? [{ kind: "reading" as const }] : []),
      ...(choice.value ? [] : [{ kind: "no-provider" as const }]),
      ...(isBusy ? [{ kind: "busy" as const }] : []),
    ];
  });

  // ─── Files ────────────────────────────────────────────────────────────────

  let nextFile = 0;
  const readers = new Map<number, AbortController>();

  function setFile(id: number, change: Partial<MapoAiMagicFillFile>): void {
    files.value = files.value.map((file) =>
      file.id === id ? { ...file, ...change } : file,
    );
  }

  function attach(chosen: readonly File[]): void {
    const maxBytes = status.value?.limits?.maxFileBytes;
    for (const file of chosen) {
      const id = nextFile++;
      const isTooLarge = maxBytes !== undefined && file.size > maxBytes;
      files.value = [
        ...files.value,
        {
          id,
          name: file.name,
          size: file.size,
          state: isTooLarge ? "too-large" : "reading",
        },
      ];
      if (!isTooLarge) void readFile(id, file);
    }
  }

  async function readFile(id: number, file: File): Promise<void> {
    const controller = new AbortController();
    readers.set(id, controller);
    try {
      const answer = await readMapoAiFile(
        file,
        { post },
        { signal: controller.signal },
      );
      if (readers.get(id) !== controller) return;
      if (answer.status === "read") {
        const chars = answer.parts.reduce(
          (sum, part) => sum + part.text.length,
          0,
        );
        setFile(id, { state: "read", parts: answer.parts, chars });
      } else if (answer.status === "too-long") {
        setFile(id, { state: "too-long", chars: answer.chars });
      } else {
        setFile(id, { state: answer.status });
      }
    } catch (error) {
      if (readers.get(id) !== controller) return;
      const isTooLarge = mapoAiFillErrorOf(error, t).status === 413;
      setFile(id, { state: isTooLarge ? "too-large" : "failed" });
    } finally {
      if (readers.get(id) === controller) readers.delete(id);
    }
  }

  function detach(id: number): void {
    readers.get(id)?.abort();
    readers.delete(id);
    files.value = files.value.filter((file) => file.id !== id);
  }

  // ─── Links ────────────────────────────────────────────────────────────────

  let nextLink = 0;
  const pageReaders = new Map<number, AbortController>();

  function setLink(id: number, change: Partial<MapoAiMagicFillLink>): void {
    links.value = links.value.map((link) =>
      link.id === id ? { ...link, ...change } : link,
    );
  }

  function attachLink(url: string): void {
    const written = url.trim();
    if (!written) return;
    const isGiven = links.value.some((link) => {
      const isSame = link.url === written;
      const isKept = link.state === "reading" || link.state === "read";
      return isSame && isKept;
    });
    if (isGiven) return;
    const id = nextLink++;
    links.value = [...links.value, { id, url: written, state: "reading" }];
    void readLink(id, written);
  }

  async function readLink(id: number, url: string): Promise<void> {
    const controller = new AbortController();
    pageReaders.set(id, controller);
    try {
      const answer = await readMapoAiLink(
        url,
        { post },
        { signal: controller.signal },
      );
      if (pageReaders.get(id) !== controller) return;
      setLink(id, linkChangeOf(answer));
    } catch (error) {
      if (pageReaders.get(id) !== controller) return;
      const isLimited = mapoAiFillErrorOf(error, t).status === 429;
      setLink(id, { state: isLimited ? "limited" : "failed" });
    } finally {
      if (pageReaders.get(id) === controller) pageReaders.delete(id);
    }
  }

  function detachLink(id: number): void {
    pageReaders.get(id)?.abort();
    pageReaders.delete(id);
    links.value = links.value.filter((link) => link.id !== id);
  }

  // ─── The call ─────────────────────────────────────────────────────────────

  /** Counts the calls: a call that is no longer the last one stops. */
  let call = 0;

  function providerOfChoice(): { id: string; model: string } | undefined {
    const picked = choice.value;
    return picked ? { id: picked.provider, model: picked.model } : undefined;
  }

  async function extract(): Promise<void> {
    if (problems.value.length > 0 || phase.value !== "idle") return;
    const own = ++call;
    const provider = providerOfChoice();
    phase.value = "describing";
    startedAt.value = Date.now();
    try {
      // The record's description first: MapoDetail asks OPTIONS once, and
      // the fill reads the same answer at once.
      await detail.metadata?.().catch(() => undefined);
      if (own !== call) return;
      phase.value = "waiting";
      await fill.fill(parts.value, {
        instructions: instructions.value,
        ...(provider ? { provider } : {}),
      });
      if (own !== call) return;
      // An answer or a refusal: the banner shows it, the panel closes.
      const isAnswered = fill.error.value === undefined;
      if (isAnswered) open.value = false;
      // A key or a model taken away meanwhile: the panel lists what the
      // user may call now.
      if (fill.error.value?.reason) void refresh();
    } finally {
      if (own === call) {
        phase.value = "idle";
        startedAt.value = undefined;
      }
    }
  }

  function cancel(): void {
    call += 1;
    fill.cancel();
    phase.value = "idle";
    startedAt.value = undefined;
  }

  // ─── Next to check ────────────────────────────────────────────────────────

  /**
   * The mark the operator was taken to last: the next one follows it. A
   * new answer, or the end of the session, starts again from the first.
   */
  let lastChecked: string | undefined;
  watch(fill.rounds, () => {
    lastChecked = undefined;
  });

  async function nextToCheck(): Promise<boolean> {
    const path = fill.nextToCheck(lastChecked);
    const reveal = detail.revealField;
    if (path === undefined || !reveal) return false;
    lastChecked = path;
    return reveal(path);
  }

  // ─── What I send to the AI ────────────────────────────────────────────────

  /**
   * What a preview is asked with, as the panel and the form are now. Read
   * one by one by identity: any change marks the preview stale, even one
   * that writes the same text back.
   */
  function previewInputs(): readonly unknown[] {
    return [
      parts.value,
      instructions.value,
      choice.value,
      detail.fields.value,
      detail.sidebarFields?.value,
      detail.currentLang?.value,
      detail.isNew?.value,
      detail.modelName?.value,
      detail.permissionModel?.value,
    ];
  }

  /** The inputs of the preview asked last. */
  const askedWith = shallowRef<readonly unknown[]>();

  const preview = computed<MapoAiMagicFillPreview>(() => {
    const was = askedWith.value;
    const now = previewInputs();
    const isStale =
      was !== undefined && now.some((value, at) => !Object.is(value, was[at]));
    return { ...asked.value, stale: isStale };
  });

  let previewing: AbortController | undefined;

  async function loadPreview(): Promise<void> {
    previewing?.abort();
    const own = new AbortController();
    previewing = own;
    askedWith.value = previewInputs();
    asked.value = { state: "loading" };
    try {
      const metadata = await detail.metadata?.();
      if (previewing !== own) return;
      // The fields may follow the description: what is sent is read now.
      askedWith.value = previewInputs();
      const schema = metadata ? schemaReaderOf()(metadata) : undefined;
      const provider = providerOfChoice();
      // `run` takes one part at least: an empty one stands for the source
      // not written yet.
      const source: MapoAiSourcePart[] = parts.value.length
        ? parts.value
        : [{ kind: "text", text: "" }];
      const answer = await previewMapoAiFill(
        {
          fields: descriptorsOf(detail),
          ...(schema ? { schema } : {}),
          source,
          existing: detail.isNew ? !detail.isNew.value : false,
          language: detail.currentLang?.value ?? "",
          instructions: instructions.value,
          ...(provider ? { provider } : {}),
          entity: entityOf(),
          signal: own.signal,
        },
        { post, get },
      );
      if (previewing !== own) return;
      asked.value = { state: "ready", answer };
    } catch (error) {
      if (previewing !== own) return;
      const failure = mapoAiFillErrorOf(error, t);
      asked.value = { state: "failed", error: failure.message };
      if (failure.reason) void refresh();
    }
  }

  // ─── When the detail goes ─────────────────────────────────────────────────

  // The last component of the detail is gone: the files being read and the
  // preview stop with the call (`cancel()`), and their answers go nowhere.
  onScopeDispose(() => {
    for (const reader of readers.values()) reader.abort();
    readers.clear();
    for (const reader of pageReaders.values()) reader.abort();
    pageReaders.clear();
    previewing?.abort();
    previewing = undefined;
  });

  // ─── The answer ───────────────────────────────────────────────────────────

  // Whether a field is shown is read from the form as it is now, not as it
  // was when the answer came: the operator may have changed what hides it.
  // The session's, once an answer joined it: a later refusal or failure
  // leaves it, with Undo all, beside its message.
  // What a field holds is read now too: the "before" of a replacement, in
  // every language a `synci18n` value would go to.
  const summary = computed(() => {
    if (fill.rounds.value === 0) return undefined;
    return summarizeMapoAiFill(
      fill.fields.value.map((field) => {
        const before = fill.replaced(field.path);
        const adds = fill.recordsToAdd(field.path);
        const held = fill.recordsHeld(field.path);
        return {
          ...field,
          shown: fill.isShown(field.path),
          current: before?.value,
          ...(before?.languages ? { languages: before.languages } : {}),
          ...(adds ? { adds } : {}),
          ...(held ? { held } : {}),
        };
      }),
      { evidence: entityOf().evidence !== false },
    );
  });

  // ─── The preview's ticks ──────────────────────────────────────────────────

  /** The values that wait, as the preview lists them. */
  const waiting = computed(() => {
    const found = summary.value;
    return found
      ? [...found.toFill, ...found.toReplace, ...found.unproven]
      : [];
  });
  const preselected = computed(
    () => new Set(summary.value ? mapoAiPreselected(summary.value) : []),
  );
  /**
   * The operator's ticks, by the value they were given for: its path, its
   * data and whether it would replace a value. A value that stops waiting
   * takes its tick with it, at once, so a value restored or proposed anew
   * starts from the preview's own; and a tick given to fill an empty field
   * never replaces what an `onChange` has written there since.
   */
  const ticks = shallowRef<ReadonlyMap<string, boolean>>(new Map());
  const tickOf = (path: string, value: unknown, replaces: boolean) =>
    `${path}\u0000${replaces ? "replaces" : "fills"}\u0000${dataOf(value) ?? ""}`;
  const tickOfItem = (item: MapoAiToConfirm) =>
    tickOf(item.path, item.value, item.reasons.includes("replaces"));
  /** The tick of an item of a list, by the list's path, its place and its data. */
  const tickOfListItem = (path: string, index: number, value: unknown) =>
    `${path}\u0000item\u0000${index}\u0000${dataOf(value) ?? ""}`;
  watch(
    fill.fields,
    (list) => {
      if (ticks.value.size === 0) return;
      const waitingNow = new Set(
        list.flatMap((field) => {
          const { outcome } = field;
          const isWaiting = !field.applied && field.review === undefined;
          if (!isWaiting || outcome.status !== "filled") return [];
          // The value as the preview lists it: the records found in place
          // of those the AI named.
          const proposal =
            proposalOf(outcome, field.relations) ?? outcome.value;
          const values: readonly unknown[] = Array.isArray(proposal)
            ? proposal
            : [];
          const items = outcome.items
            ? values.map((value, index) =>
                tickOfListItem(field.path, index, value),
              )
            : [];
          return [tickOf(field.path, proposal, field.replaces), ...items];
        }),
      );
      const kept = [...ticks.value].filter(([tick]) => waitingNow.has(tick));
      if (kept.length !== ticks.value.size) ticks.value = new Map(kept);
    },
    { flush: "sync" },
  );

  function waitingAt(path: string): MapoAiToConfirm | undefined {
    const item = waiting.value.find((one) => one.path === path);
    return item && !item.reasons.includes("hidden") ? item : undefined;
  }

  function isSelected(path: string): boolean {
    const item = waitingAt(path);
    if (!item) return false;
    // A list is ticked while any of its items is.
    if (item.list) return selectedItems(path).length > 0;
    const tick = ticks.value.get(tickOfItem(item));
    return tick ?? preselected.value.has(path);
  }

  function select(path: string, on: boolean): void {
    const item = waitingAt(path);
    if (!item) return;
    if (item.list) {
      // Every item the list may add: one the field holds never is.
      const added = item.list
        .filter((one) => !one.held)
        .map(
          (one) => [tickOfListItem(path, one.index, one.value), on] as const,
        );
      ticks.value = new Map([...ticks.value, ...added]);
      return;
    }
    ticks.value = new Map([...ticks.value, [tickOfItem(item), on]]);
  }

  function itemAt(path: string, index: number): MapoAiProposedItem | undefined {
    return waitingAt(path)?.list?.find((one) => one.index === index);
  }

  function isItemSelected(path: string, index: number): boolean {
    const proposed = itemAt(path, index);
    if (!proposed || proposed.held) return false;
    const tick = ticks.value.get(tickOfListItem(path, index, proposed.value));
    return tick ?? proposed.verified;
  }

  function selectItem(path: string, index: number, on: boolean): void {
    const proposed = itemAt(path, index);
    if (!proposed || proposed.held) return;
    const tick = tickOfListItem(path, index, proposed.value);
    ticks.value = new Map([...ticks.value, [tick, on]]);
  }

  /** The ticked items of a list that waits, by their place in the AI's list. */
  function selectedItems(path: string): number[] {
    const list = waitingAt(path)?.list ?? [];
    return list
      .filter((one) => isItemSelected(path, one.index))
      .map((one) => one.index);
  }

  const selected = computed(() =>
    waiting.value.map((item) => item.path).filter((path) => isSelected(path)),
  );

  function applySelected(): void {
    // A write may change what waits: another field's `onChange` can fill a
    // field ticked as empty, whose value would now replace it. Each path is
    // looked at again before it is applied.
    for (const path of [...selected.value]) {
      if (!isSelected(path)) continue;
      const isList = waitingAt(path)?.list !== undefined;
      // A list adds its ticked items, and its proposal is used (R133).
      fill.apply(path, isList ? { items: selectedItems(path) } : {});
    }
  }

  function ignoreWaiting(): void {
    for (const item of [...waiting.value]) fill.dismiss(item.path);
  }

  function labelOf(key: string): string {
    return fieldLabel(descriptorsOf(detail), key);
  }

  function itemLabelOf(key: string, item: MapoAiProposedItem): string {
    const descriptor = descriptorOf(descriptorsOf(detail), key);
    const template =
      item.template && descriptor
        ? templateLabel(descriptor, item.template)
        : (item.template ?? "");
    const values = isRecord(item.value)
      ? Object.entries(item.value)
          .filter(([name]) => name !== "_template")
          .map(([name, value]) => itemValueText(item, name, value))
          .filter(Boolean)
          .slice(0, 2)
      : [];
    const label = [template, ...values].filter(Boolean).join(" · ");
    return label || `#${item.index + 1}`;
  }

  return {
    open,
    text,
    files,
    attach,
    detach,
    links,
    attachLink,
    detachLink,
    instructions,
    choice,
    choices,
    status,
    available,
    parts,
    problems,
    phase,
    startedAt,
    extract,
    cancel,
    undoAll: () => fill.undo(),
    toCheck: fill.toCheck,
    canReveal: detail.revealField !== undefined,
    nextToCheck,
    preview,
    loadPreview,
    fill,
    summary,
    isSelected,
    select,
    isItemSelected,
    selectItem,
    selected,
    applySelected,
    ignoreWaiting,
    labelOf,
    itemLabelOf,
    t,
  };
}

/**
 * A value of an item as the preview names it: a related record by the name
 * of the record found, else by the AI's; any other value by its text.
 */
function itemValueText(
  item: MapoAiProposedItem,
  name: string,
  value: unknown,
): string {
  const match = item.relations?.find((one) => one.at === name);
  if (!match) return mapoAiValueText(value, 60);
  const current = effectiveMatch(match);
  const isFound = current.status === "found" && current.label !== undefined;
  return mapoAiValueText(isFound ? current.label : match.name, 60);
}

/**
 * The options the page gives Magic Fill, `definePageMeta({ magicFill: {…} })`,
 * read from the route as outside data: `undefined` for `true`, `false` or
 * none.
 */
function pageOptionsOf(app: object): Record<string, unknown> | undefined {
  const router: unknown = Reflect.get(app, "$router");
  const route: unknown = isRecord(router) ? router.currentRoute : undefined;
  const current: unknown = isRecord(route) ? route.value : undefined;
  const meta: unknown = isRecord(current) ? current.meta : undefined;
  const options: unknown = isRecord(meta) ? meta.magicFill : undefined;
  return isRecord(options) ? options : undefined;
}

/** The label of a repeater's template, by its key: its own `label`, else the key. */
function templateLabel<T extends object>(
  descriptor: AnyFieldDescriptor<T>,
  template: string,
): string {
  const attrs: unknown = "attrs" in descriptor ? descriptor.attrs : undefined;
  const templates = isRecord(attrs) ? attrs.templates : undefined;
  const declared: unknown =
    isRecord(templates) && Object.hasOwn(templates, template)
      ? templates[template]
      : undefined;
  const label = isRecord(declared) ? declared.label : undefined;
  return typeof label === "string" && label !== "" ? label : template;
}

/** The descriptor whose key is the longest to hold a key of the answer. */
function descriptorOf<T extends object>(
  descriptors: readonly AnyFieldDescriptor<T>[],
  key: string,
): AnyFieldDescriptor<T> | undefined {
  let found: AnyFieldDescriptor<T> | undefined;
  for (const descriptor of descriptors) {
    const own = String(descriptor.key);
    const holds = key === own || key.startsWith(`${own}.`);
    const isLonger = !found || own.length > String(found.key).length;
    if (holds && isLonger) found = descriptor;
  }
  return found;
}

/** The fields of the detail's body and sidebar. */
function descriptorsOf<T extends object>(
  detail: MapoAiMagicFillDetail<T>,
): AnyFieldDescriptor<T>[] {
  return [...detail.fields.value, ...(detail.sidebarFields?.value ?? [])];
}

/**
 * The label of the field a key belongs to, as `MapoFormField` shows it: its
 * `label`, else its key made readable; a part of a field (`seo.title`) adds
 * its own name.
 */
function fieldLabel<T extends object>(
  descriptors: readonly AnyFieldDescriptor<T>[],
  key: string,
): string {
  const found = descriptorOf(descriptors, key);
  if (!found) return readableKey(key);
  const own = String(found.key);
  const label = found.label ?? readableKey(own);
  const rest = key.slice(own.length + 1);
  return rest ? `${label} · ${readableKey(rest)}` : label;
}

/** A key as `MapoFormField` makes a label of it: `seo_title` → "Seo Title". */
function readableKey(key: string): string {
  return key
    .replace(/^translations\.[^.]+\./, "")
    .replace(/[_.-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** What an answer of `read/link` makes of a link of the panel. */
function linkChangeOf(
  answer: MapoAiReadLinkResponse,
): Partial<MapoAiMagicFillLink> {
  if (answer.status === "read") {
    const chars = answer.parts.reduce((sum, part) => sum + part.text.length, 0);
    return { state: "read", parts: answer.parts, address: answer.url, chars };
  }
  if (answer.status === "too-long") {
    return { state: "too-long", chars: answer.chars };
  }
  if (answer.status === "blocked" || answer.status === "unreachable") {
    return { state: answer.status, reason: answer.reason };
  }
  if (answer.status === "http-error") {
    return { state: "http-error", httpStatus: answer.httpStatus };
  }
  return { state: answer.status };
}
