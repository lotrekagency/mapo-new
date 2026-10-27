import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { debounce } from "../debounce.js";

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("delays execution", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("resets the timer on each call", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    vi.advanceTimersByTime(50);
    debounced();
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("passes arguments to the original function", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);
    debounced("a", "b");
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledWith("a", "b");
  });

  it("fires only once for rapid successive calls", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    for (let i = 0; i < 10; i++) debounced();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("drops the pending call on cancel", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });

  it("keeps working after a cancel", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced.cancel(); // nothing pending: a no-op
    debounced("again");
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith("again");
  });
});
