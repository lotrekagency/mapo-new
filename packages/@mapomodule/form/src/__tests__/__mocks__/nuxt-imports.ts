import { vi } from "vitest";

export const useSnackStore = vi.fn(() => ({
  show: vi.fn(),
}));
