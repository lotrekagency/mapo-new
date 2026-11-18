import { describe, expect, it } from "vitest";

import {
  MEDIA_DRAG_TYPE,
  isMediaDrag,
  startMediaDrag,
} from "../runtime/utils/mediaDrag";

// A DragEvent's data transfer as the handlers use it: types and data.
function dragEvent(types: string[] = []) {
  const data: Record<string, string> = {};
  const dataTransfer = {
    types: [...types],
    effectAllowed: "all",
    setData(type: string, value: string) {
      data[type] = value;
      dataTransfer.types.push(type);
    },
  };
  return { event: { dataTransfer } as unknown as DragEvent, data };
}

describe("media drags", () => {
  it("marks a drag started in the manager, and only that", () => {
    const { event, data } = dragEvent();

    startMediaDrag(event, { kind: "media", ids: [7, 8] });

    expect(isMediaDrag(event)).toBe(true);
    expect(JSON.parse(data[MEDIA_DRAG_TYPE] ?? "")).toEqual({
      kind: "media",
      ids: [7, 8],
    });
    expect(event.dataTransfer?.effectAllowed).toBe("move");
  });

  // Chrome reports an image dragged from the page as "Files" too.
  it("does not take files from the computer for a manager drag", () => {
    expect(isMediaDrag(dragEvent(["Files"]).event)).toBe(false);
    expect(isMediaDrag(dragEvent(["Files", MEDIA_DRAG_TYPE]).event)).toBe(true);
  });
});
