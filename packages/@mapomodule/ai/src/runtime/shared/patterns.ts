/**
 * How much work a field's pattern may take on a value, known before it runs.
 *
 * The sanitizer tests the AI's values against the patterns of their fields.
 * The patterns come from the schemas the entity was built from, which may
 * come from outside, and JavaScript's matcher backtracks: a pattern written
 * for it, such as `(a+)+$`, can take minutes on a value of thirty
 * characters, and while it runs the process answers nobody, a server's every
 * user. So a pattern runs only when a bound on its work, for the value's
 * length, stays small.
 *
 * The bound follows a matcher that backtracks. For each part of the pattern
 * it counts, on a value of the given length, the ways the part can match and
 * the steps it takes to try them all:
 * - a character, a class or `.` matches one way, in one step;
 * - a sequence tries the rest after each way of its first part;
 * - alternatives add up;
 * - a repeat walks one step per character it repeats, as many as the value
 *   has (or as its upper count allows), and gives them back one by one; a
 *   repeat of something that matches several ways multiplies those ways at
 *   each round, and a repeat of something that can match nothing is not
 *   bounded by the value's length;
 * - a back-reference (`\1`, `\k<name>`) has no bound;
 * - a pattern that does not start with `^` is tried from every position.
 *
 * The bound is rough on purpose: it may call a harmless pattern costly, as
 * `^([a-z]|[0-9])+$`, which then does not run. Pure: no Nuxt, Nitro or Node.
 */

/** The most steps one test of a pattern may take. */
export const MAX_PATTERN_STEPS = 10_000_000;

/** The most steps the tests of one answer may take together. */
export const MAX_ANSWER_PATTERN_STEPS = 50_000_000;

/** Longest pattern read; a longer one is never run. */
const MAX_PATTERN_LENGTH = 5000;

/** Deepest nesting of groups read; a deeper one is never run. */
const MAX_GROUP_DEPTH = 64;

/** A pattern read into its parts, ready to bound on any length. */
export interface PatternCost {
  /** It cannot be read, or holds a back-reference: it never runs. */
  readonly unbounded: boolean;
  /** Every alternative starts with `^`: one starting position only. */
  readonly anchored: boolean;
  /** The parts; absent when the pattern is unbounded. */
  readonly root?: PatternNode;
}

/** One part of a pattern. */
type PatternNode =
  /** Consumes one character: a literal, a class, `.`, an escape such as `\d`. */
  | { type: "char" }
  /** Consumes nothing: `^`, `$`, `\b`. */
  | { type: "empty" }
  /** A back-reference: no bound holds. */
  | { type: "never" }
  /** A lookahead or a lookbehind: its work, consuming nothing, matched once. */
  | { type: "look"; node: PatternNode }
  | { type: "sequence"; parts: PatternNode[] }
  | { type: "choice"; options: PatternNode[] }
  | { type: "repeat"; node: PatternNode; min: number; max: number };

/** What a part costs on a value of a given length. */
interface Bound {
  /** The ways it can match. */
  ways: number;
  /** The steps it takes to try them all. */
  work: number;
  /** It can match without consuming a character. */
  nullable: boolean;
}

const NEVER: PatternCost = { unbounded: true, anchored: false };

/**
 * A pattern read into its parts, as `new RegExp(pattern)` reads it, without
 * the `u` flag. A pattern it cannot read, too long or too deeply nested, or
 * with a back-reference, is `unbounded`.
 */
export function patternCost(pattern: string): PatternCost {
  if (pattern.length > MAX_PATTERN_LENGTH) return NEVER;
  const reader = new PatternReader(pattern);
  try {
    const { node, anchored } = reader.alternatives(0);
    if (!reader.isDone() || hasNever(node)) return NEVER;
    return { unbounded: false, anchored, root: node };
  } catch {
    return NEVER;
  }
}

/**
 * A bound on the steps one test of a pattern takes on a value of `length`
 * characters; `Infinity` when it has none.
 */
export function patternSteps(cost: PatternCost, length: number): number {
  if (cost.unbounded || !cost.root) return Infinity;
  const size = Math.max(0, length);
  const starts = cost.anchored ? 1 : size + 1;
  const steps = starts * bound(cost.root, size).work;
  return Number.isFinite(steps) ? steps : Infinity;
}

/** The ways and the steps of a part, on a value of `length` characters. */
function bound(node: PatternNode, length: number): Bound {
  switch (node.type) {
    case "char":
      return { ways: 1, work: 1, nullable: false };
    case "empty":
      return { ways: 1, work: 1, nullable: true };
    case "never":
      return { ways: Infinity, work: Infinity, nullable: true };
    case "look":
      // Matched once: the matcher never backtracks into a lookaround.
      return { ways: 1, work: bound(node.node, length).work, nullable: true };
    case "sequence": {
      let rest: Bound = { ways: 1, work: 0, nullable: true };
      for (const part of [...node.parts].reverse()) {
        const first = bound(part, length);
        rest = {
          ways: first.ways * rest.ways,
          work: first.work + first.ways * rest.work,
          nullable: first.nullable && rest.nullable,
        };
      }
      return rest;
    }
    case "choice":
      return node.options.reduce<Bound>(
        (all, option) => {
          const one = bound(option, length);
          return {
            ways: all.ways + one.ways,
            work: all.work + one.work,
            nullable: all.nullable || one.nullable,
          };
        },
        { ways: 0, work: 0, nullable: false },
      );
    case "repeat":
      return repeatBound(node.min, node.max, bound(node.node, length), length);
  }
}

/**
 * A part repeated from `min` to `max` times (`max` is `Infinity` for no
 * limit). A part that consumes a character each round repeats at most as
 * many times as the value has characters; one that can match nothing may
 * repeat as often as its count allows.
 */
function repeatBound(
  min: number,
  max: number,
  part: Bound,
  length: number,
): Bound {
  const rounds = part.nullable
    ? Number.isFinite(max)
      ? max
      : min + length + 1
    : Math.min(max, length);
  const counts = Math.max(1, rounds - min + 1);
  const nullable = min === 0 || part.nullable;
  if (part.ways === 1) {
    // One way each round: the matcher walks the rounds, then gives them back.
    return { ways: counts, work: (rounds + 1) * part.work, nullable };
  }
  // Several ways each round: their number multiplies with every round.
  const ways = counts * part.ways ** rounds;
  return { ways, work: ways * (rounds * part.work + 1), nullable };
}

function hasNever(node: PatternNode): boolean {
  switch (node.type) {
    case "never":
      return true;
    case "look":
    case "repeat":
      return hasNever(node.node);
    case "sequence":
      return node.parts.some(hasNever);
    case "choice":
      return node.options.some(hasNever);
    default:
      return false;
  }
}

/** A part, and whether it is the `^` that starts a sequence. */
interface Read {
  node: PatternNode;
  start?: boolean;
}

/** Reads a pattern, part by part. */
class PatternReader {
  private at = 0;

  constructor(private readonly pattern: string) {}

  isDone(): boolean {
    return this.at >= this.pattern.length;
  }

  /** Alternatives up to the end or to the `)` that closes the group. */
  alternatives(depth: number): { node: PatternNode; anchored: boolean } {
    if (depth > MAX_GROUP_DEPTH) throw new RangeError("Too deeply nested");
    const branches = [this.sequence(depth)];
    while (this.peek() === "|") {
      this.at++;
      branches.push(this.sequence(depth));
    }
    const anchored = branches.every((branch) => branch.start === true);
    const [only] = branches;
    const node: PatternNode =
      branches.length === 1 && only
        ? only.node
        : { type: "choice", options: branches.map((branch) => branch.node) };
    return { node, anchored };
  }

  private sequence(depth: number): Read {
    const parts: PatternNode[] = [];
    let start = false;
    while (!this.isDone() && this.peek() !== "|" && this.peek() !== ")") {
      const atom = this.atom(depth);
      if (!parts.length && atom.start) start = true;
      const quantifier = this.quantifier();
      parts.push(
        quantifier
          ? { type: "repeat", node: atom.node, ...quantifier }
          : atom.node,
      );
    }
    return { node: { type: "sequence", parts }, start };
  }

  private atom(depth: number): Read {
    const char = this.next();
    switch (char) {
      case "^":
        return { node: { type: "empty" }, start: true };
      case "$":
        return { node: { type: "empty" } };
      case "(":
        return { node: this.group(depth) };
      case "[":
        this.characterClass();
        return { node: { type: "char" } };
      case "\\":
        return { node: this.escape() };
      case "*":
      case "+":
      case "?":
        throw new SyntaxError("Nothing to repeat");
      default:
        return { node: { type: "char" } };
    }
  }

  private group(depth: number): PatternNode {
    let isLook = false;
    if (this.peek() === "?") {
      this.at++;
      const kind = this.next();
      const isNamed = kind === "<" && !["=", "!"].includes(this.peek());
      if (isNamed) this.skipTo(">");
      else if (kind === "<") {
        this.at++;
        isLook = true;
      } else if (kind === "=" || kind === "!") isLook = true;
      else if (kind !== ":") throw new SyntaxError("Unknown group");
    }
    const { node } = this.alternatives(depth + 1);
    if (this.next() !== ")") throw new SyntaxError("Unclosed group");
    return isLook ? { type: "look", node } : node;
  }

  private characterClass(): void {
    while (!this.isDone()) {
      const char = this.next();
      if (char === "\\") this.at++;
      else if (char === "]") return;
    }
    throw new SyntaxError("Unclosed class");
  }

  /**
   * One escaped character. The sanitizer reads patterns without the `u`
   * flag, where `\u{2,}` is a `u` repeated and `\p{L}` a `p`: only the
   * character after the backslash belongs to the escape, and what follows
   * is read as it is, a repeat included.
   */
  private escape(): PatternNode {
    const char = this.next();
    // `\1` to `\9`, and `\k<name>` in a pattern with named groups, refer
    // back to a group: no bound holds for them.
    const isBackReference = /[1-9]/.test(char) || char === "k";
    if (isBackReference) return { type: "never" };
    const isBoundary = char === "b" || char === "B";
    return isBoundary ? { type: "empty" } : { type: "char" };
  }

  /** `*`, `+`, `?` or `{n}`, `{n,}`, `{n,m}`, with an optional lazy `?`. */
  private quantifier(): { min: number; max: number } | undefined {
    const char = this.peek();
    let range: { min: number; max: number } | undefined;
    if (char === "*") range = { min: 0, max: Infinity };
    else if (char === "+") range = { min: 1, max: Infinity };
    else if (char === "?") range = { min: 0, max: 1 };
    if (range) this.at++;
    else if (char === "{") range = this.braces();
    if (!range) return undefined;
    if (this.peek() === "?") this.at++;
    return range;
  }

  /** `{n}`, `{n,}` or `{n,m}`; anything else is a plain `{`. */
  private braces(): { min: number; max: number } | undefined {
    const match = /^\{(\d+)(,(\d*))?\}/.exec(this.pattern.slice(this.at));
    if (!match) return undefined;
    this.at += match[0].length;
    const min = Number(match[1]);
    const hasComma = match[2] !== undefined;
    const upper = match[3];
    const max = !hasComma
      ? min
      : upper === undefined || upper === ""
        ? Infinity
        : Number(upper);
    if (max < min) throw new SyntaxError("Range out of order");
    return { min, max };
  }

  private peek(): string {
    return this.pattern.charAt(this.at);
  }

  private next(): string {
    if (this.isDone()) throw new SyntaxError("Unexpected end");
    return this.pattern.charAt(this.at++);
  }

  private skipTo(end: string): void {
    const found = this.pattern.indexOf(end, this.at);
    if (found === -1) throw new SyntaxError(`No ${end}`);
    this.at = found + 1;
  }
}
