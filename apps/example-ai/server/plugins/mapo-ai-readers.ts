// The app's own reading of files for the AI, through @mapomodule/ai
// (docs/modules/ai.md, "Read a file"):
// - `registerMapoAiReader()` adds a format Mapo does not read: a calendar
//   event (`.ics`), written as "Label: value" lines, so an event of a
//   calendar fills an event of the app (public/ai-files/launch.ics). With
//   one of Mapo's ids (`csv`, `html`…) a reader would take the place of
//   Mapo's own.
// - `mapo-ai:read` touches up what any reader read, Mapo's or this one:
//   here it takes out the lines "Internal: …", the notes the editors keep
//   out of the AI (public/ai-files/open-data.md has one). It sees files
//   only: a text pasted in a page goes to `run` as it is.
// `mapo.ai.readers` turns a format off without code (`{ xlsx: false }`).
export default defineNitroPlugin((nitroApp) => {
  registerMapoAiReader({
    id: "ics",
    label: "Calendar event",
    extensions: ["ics"],
    types: ["text/calendar"],
    read(file) {
      const text = eventText(new TextDecoder().decode(file.bytes));
      return text ? [{ kind: "text", text, name: file.name }] : [];
    },
  });

  nitroApp.hooks.hook("mapo-ai:read", (context) => {
    for (const part of context.parts) {
      part.text = part.text
        .split("\n")
        .filter((line) => !/^\s*internal:/i.test(line))
        .join("\n");
    }
  });
});

/** The labels the lines of an event get, by the property of iCalendar. */
const LABELS: Record<string, string> = {
  SUMMARY: "Title",
  DESCRIPTION: "Summary",
  LOCATION: "Venue",
  DTSTART: "Starts",
  DTEND: "Ends",
  URL: "Booking link",
};

/** The first event of an iCalendar file, as "Label: value" lines. */
function eventText(calendar: string): string {
  // A line that starts with a space or a tab continues the one before.
  const lines = calendar.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const start = lines.indexOf("BEGIN:VEVENT");
  const end = lines.indexOf("END:VEVENT");
  if (start < 0 || end < start) return "";
  return lines
    .slice(start + 1, end)
    .flatMap((line) => {
      const colon = line.indexOf(":");
      const name = line.slice(0, colon).split(";")[0] ?? "";
      const label = LABELS[name];
      if (!label) return [];
      const value = unescaped(line.slice(colon + 1));
      const isDate = name.startsWith("DT");
      return [`${label}: ${isDate ? dateOf(value) : value}`];
    })
    .join("\n");
}

/** A date of iCalendar, `20261120T180000`, as `2026-11-20 18:00`. */
function dateOf(value: string): string {
  const parts = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/.exec(value);
  if (!parts) return value;
  const [, year, month, day, hours, minutes] = parts;
  const time = hours ? ` ${hours}:${minutes}` : "";
  return `${year}-${month}-${day}${time}`;
}

/** A text value of iCalendar without its escapes: `\,` `\;` `\n` `\\`. */
function unescaped(value: string): string {
  return value.replace(/\\([,;\\nN])/g, (_, char: string) =>
    char === "n" || char === "N" ? " " : char,
  );
}
