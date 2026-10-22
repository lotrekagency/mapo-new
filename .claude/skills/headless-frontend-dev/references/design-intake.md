# Reading a design

How to get from a design file to code without losing fidelity, and without writing the
design tool into the repo. Read it when you start a page or a section from a design, or
when the design and the data disagree.

## Contents

1. Where the numbers come from
2. Map to the design, not to the data
3. Breakpoints, states and motion
4. When the design asks for what the data can't give
5. What never goes into the repo
6. Working with a design tool over MCP

---

## 1. Where the numbers come from

- The structured design context is the source of truth: sizes, spacing, type styles,
  colors, variables, exported assets. Screenshots only help you find your way around.
  Reading pixels off a screenshot when the numbers are available is guessing.
- Tokens: read the design variables once, mirror them as project tokens, then use the
  tokens instead of the raw values.
- Declared vs rendered: when a declared value (a 60% black border) disagrees with what
  the design visibly shows (a faint hairline), follow the render and state the constraint
  in a comment.
- When a frame is a screenshot of something that already exists (a legacy banner pasted
  in), rebuild it in code.

## 2. Map to the design, not to the data

- Build as if the data looked like the design: titles as long as the design's, every slot
  filled. Differences in real records are data entry, and you report them instead of
  designing around them.
- Don't survey every locale or record before building. One representative record is
  enough. Survey only when asked, or when a sample shows editor markup that would break
  the styling, and then show the user what you found.
- Map content by the role it plays in the design (heading, claim, eyebrow, label),
  whatever the backend field is called.

## 3. Breakpoints, states and motion

- Desktop and mobile frames are separate specs, and each breakpoint follows its own
  frame. When one frame drops content that the other shows, keep the content and flag
  it instead of hiding it silently.
- Sequential frames of one page often encode scroll states, such as the stages of a
  pinned opening screen. Read them as a timeline.
- Interaction states (hover, an open overlay, a flipped card, an applied filter) may live
  in other frames. Find them by listing the parent's children. If a state isn't drawn,
  borrow the closest existing state in the product and say so in the report.
- Compare motion references (prototype recordings) frame by frame, for the rest states
  and the timing. Don't eyeball them.
- A design choice that only fits one screen size (an element squeezed between others at
  exactly 1440px) needs an adaptation for the other sizes. Record that adaptation as a
  decision.

## 4. When the design asks for what the data can't give

- For a field the design needs and the backend lacks, build the slot, read the field
  optimistically, and mark it in the mapper: `PLANNED (BE)` for a backend field, or
  `PLANNED (BO)` for an input the editors' form lacks.
- For a field the data has and the design dropped, map it if that is cheap, don't render
  it, and mark it `REMOVAL CANDIDATE`. Mention it in the handoff note.
- Mapped but not rendered is a legitimate and reversible state. Record it in the feature
  doc.

## 5. What never goes into the repo

- Design-tool identifiers (node ids, frame or layer names, "as in the mockup") never go
  into code, comments or docs. They rot as soon as the file changes, and they tell the
  reader nothing. Keep the information as a constraint
  (`// Leaves room for the logo: 143px plus its diagonal cut.`), and keep node ids in
  memory or in personal notes.
- Exported content images stay out too: content media come from the data. Only
  decorative system assets live in the repo.

## 6. Working with a design tool over MCP

When the design tool exposes an MCP server (often a local server run by its desktop app):

- Use its design-context call for numbers and assets, its metadata call to list children
  and find sibling frames, and its variables call for tokens. Use screenshots only to
  orient yourself.
- Large metadata responses spill into files. Parse them (`jq`) instead of reading them
  whole.
- Some nodes answer only while their page is open in the desktop app, so "node not
  found" may mean "page not open".
- An MCP connection that failed at session start doesn't mean the server is down. The
  local server may still answer direct JSON-RPC calls: `initialize`, keep the session id,
  then `tools/call`.
- Record the node ids of each page and state in memory, so the next session doesn't have
  to search for them again.
