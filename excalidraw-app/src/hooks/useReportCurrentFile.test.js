import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import useReportCurrentFile from "./useReportCurrentFile";

let api;

const render = (initialProps) =>
  renderHook((props) => useReportCurrentFile(props), { initialProps });

beforeEach(() => {
  api = { setCurrentFile: vi.fn() };
  window.electronAPI = api;
});

afterEach(() => {
  delete window.electronAPI;
  vi.restoreAllMocks();
});

describe("useReportCurrentFile", () => {
  it("reports nothing until the startup load has finished", () => {
    render({ currentFilePath: null, isReady: false });
    expect(api.setCurrentFile).not.toHaveBeenCalled();
  });

  it("reports the startup file once ready", () => {
    const { rerender } = render({ currentFilePath: null, isReady: false });
    rerender({ currentFilePath: "/a.excalidraw", isReady: true });
    expect(api.setCurrentFile).toHaveBeenCalledTimes(1);
    expect(api.setCurrentFile).toHaveBeenCalledWith("/a.excalidraw");
  });

  it("reports null (untitled) when startup found no file", () => {
    render({ currentFilePath: null, isReady: true });
    expect(api.setCurrentFile).toHaveBeenCalledWith(null);
  });

  it("normalizes undefined to null", () => {
    render({ currentFilePath: undefined, isReady: true });
    expect(api.setCurrentFile).toHaveBeenCalledWith(null);
  });

  it("reports every path change (⌘O, Save As, open-file, ⌘N)", () => {
    const { rerender } = render({ currentFilePath: "/a.excalidraw", isReady: true });
    rerender({ currentFilePath: "/b.excalidraw", isReady: true });
    rerender({ currentFilePath: "/c.excalidraw", isReady: true });
    rerender({ currentFilePath: null, isReady: true });
    expect(api.setCurrentFile.mock.calls).toEqual([
      ["/a.excalidraw"],
      ["/b.excalidraw"],
      ["/c.excalidraw"],
      [null],
    ]);
  });

  it("doesn't re-report on unrelated re-renders", () => {
    const { rerender } = render({ currentFilePath: "/a.excalidraw", isReady: true });
    rerender({ currentFilePath: "/a.excalidraw", isReady: true });
    rerender({ currentFilePath: "/a.excalidraw", isReady: true });
    expect(api.setCurrentFile).toHaveBeenCalledTimes(1);
  });

  it("keeps unicode paths intact", () => {
    render({ currentFilePath: "/Users/me/图表 ☕️.excalidraw", isReady: true });
    expect(api.setCurrentFile).toHaveBeenCalledWith("/Users/me/图表 ☕️.excalidraw");
  });
});
