import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseInitialData, loadScene, serializeScene } from "./sceneUtils";

const rectangle = {
  id: "rect-1",
  type: "rectangle",
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  angle: 0,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  groupIds: [],
  frameId: null,
  roundness: null,
  seed: 1,
  version: 3,
  versionNonce: 123,
  isDeleted: false,
  boundElements: null,
  updated: 1,
  link: null,
  locked: false,
};

const imageFile = {
  mimeType: "image/png",
  dataURL: "data:image/png;base64,iVBORw0KGgo=",
  created: 1,
};

const createExcalidrawAPI = (files = {}) => ({
  updateScene: vi.fn(),
  addFiles: vi.fn(),
  getFiles: vi.fn(() => files),
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseInitialData", () => {
  it.each([
    ["malformed JSON", "{ not json"],
    ["an empty string", ""],
    ["truncated JSON", '{"type":"excalidraw","elements":['],
  ])("returns null and logs for %s", (_label, content) => {
    expect(parseInitialData(content)).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      "[sceneUtils] Likely malformed content in file, failed to parse scene data:",
      expect.any(SyntaxError),
    );
  });

  it("keeps the saved viewport and does not request scrollToContent", () => {
    const content = JSON.stringify({
      elements: [rectangle],
      appState: { scrollX: 100, scrollY: -50, zoom: { value: 2 }, viewBackgroundColor: "#fff" },
      files: { f1: imageFile },
    });
    expect(parseInitialData(content)).toEqual({
      elements: [rectangle],
      appState: { scrollX: 100, scrollY: -50, zoom: { value: 2 }, viewBackgroundColor: "#fff" },
      files: { f1: imageFile },
    });
  });

  it("treats a zero viewport as present", () => {
    const data = parseInitialData(
      JSON.stringify({ elements: [], appState: { scrollX: 0, scrollY: 0 } }),
    );
    expect(data).not.toHaveProperty("scrollToContent");
  });

  it.each([
    ["no viewport fields", { viewBackgroundColor: "#fff" }],
    ["only scrollX", { scrollX: 10 }],
    ["only scrollY", { scrollY: 10 }],
    ["null scroll values", { scrollX: null, scrollY: null }],
  ])("requests scrollToContent when appState has %s", (_label, appState) => {
    const data = parseInitialData(JSON.stringify({ elements: [], appState }));
    expect(data.scrollToContent).toBe(true);
    expect(data.appState).toEqual(appState);
  });

  it("defaults appState to {} and requests scrollToContent when appState is missing", () => {
    const data = parseInitialData(JSON.stringify({ type: "excalidraw", elements: [rectangle] }));
    expect(data).toEqual({
      elements: [rectangle],
      appState: {},
      files: {},
      scrollToContent: true,
    });
  });

  it("defaults appState to {} when appState is null", () => {
    const data = parseInitialData(JSON.stringify({ elements: [], appState: null }));
    expect(data.appState).toEqual({});
  });

  it.each([
    ["missing", {}],
    ["null", { files: null }],
  ])("defaults files to {} when files is %s", (_label, extra) => {
    const data = parseInitialData(JSON.stringify({ elements: [], ...extra }));
    expect(data.files).toEqual({});
  });

  it("passes elements through as-is, including when missing", () => {
    expect(parseInitialData(JSON.stringify({})).elements).toBeUndefined();
    expect(parseInitialData(JSON.stringify({ elements: [] })).elements).toEqual([]);
  });

  it("parses a file exported from excalidraw.com (no viewport)", () => {
    const content = JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw.com",
      elements: [rectangle],
      appState: { gridSize: 20, viewBackgroundColor: "#ffffff" },
      files: {},
    });
    const data = parseInitialData(content);
    expect(data.scrollToContent).toBe(true);
    expect(data.elements).toEqual([rectangle]);
  });
});

describe("loadScene", () => {
  it("updates the scene with elements and appState", () => {
    const api = createExcalidrawAPI();
    loadScene(api, { elements: [rectangle], appState: { scrollX: 1 }, files: {} });
    expect(api.updateScene).toHaveBeenCalledTimes(1);
    expect(api.updateScene).toHaveBeenCalledWith({
      elements: [rectangle],
      appState: { scrollX: 1 },
    });
  });

  it("defaults missing elements and appState", () => {
    const api = createExcalidrawAPI();
    loadScene(api, {});
    expect(api.updateScene).toHaveBeenCalledWith({ elements: [], appState: {} });
  });

  it.each([
    ["empty", {}],
    ["missing", undefined],
    ["null", null],
  ])("does not call addFiles when files is %s", (_label, files) => {
    const api = createExcalidrawAPI();
    loadScene(api, { elements: [], appState: {}, files });
    expect(api.addFiles).not.toHaveBeenCalled();
  });

  it("adds files with their ids taken from the files map keys", () => {
    const api = createExcalidrawAPI();
    const other = { ...imageFile, mimeType: "image/jpeg" };
    loadScene(api, { elements: [], appState: {}, files: { f1: imageFile, f2: other } });
    expect(api.addFiles).toHaveBeenCalledTimes(1);
    expect(api.addFiles).toHaveBeenCalledWith([
      { ...imageFile, id: "f1" },
      { ...other, id: "f2" },
    ]);
  });

  it("uses the map key as the id even if the file object has a different id", () => {
    const api = createExcalidrawAPI();
    loadScene(api, { files: { f1: { ...imageFile, id: "stale" } } });
    expect(api.addFiles).toHaveBeenCalledWith([{ ...imageFile, id: "f1" }]);
  });

  it("works with the output of parseInitialData", () => {
    const api = createExcalidrawAPI();
    const data = parseInitialData(
      JSON.stringify({ elements: [rectangle], appState: {}, files: { f1: imageFile } }),
    );
    loadScene(api, data);
    expect(api.updateScene).toHaveBeenCalledWith({ elements: [rectangle], appState: {} });
    expect(api.addFiles).toHaveBeenCalledWith([{ ...imageFile, id: "f1" }]);
  });
});

describe("serializeScene", () => {
  const serialize = ({ elements = [rectangle], appState = {}, files = {} } = {}) =>
    JSON.parse(
      serializeScene({ current: elements }, { current: appState }, createExcalidrawAPI(files)),
    );

  it("produces valid .excalidraw JSON", () => {
    const data = serialize();
    expect(data.type).toBe("excalidraw");
    expect(data.version).toEqual(expect.any(Number));
    expect(data.elements).toEqual([expect.objectContaining({ id: "rect-1", type: "rectangle" })]);
    expect(data.appState).toEqual(expect.any(Object));
    expect(data.files).toEqual({});
  });

  it("pretty-prints with two-space indentation", () => {
    const output = serializeScene({ current: [] }, { current: {} }, createExcalidrawAPI());
    expect(output).toBe(JSON.stringify(JSON.parse(output), null, 2));
  });

  it("re-injects scrollX, scrollY and zoom that serializeAsJSON strips", () => {
    const data = serialize({ appState: { scrollX: 120, scrollY: -40, zoom: { value: 1.5 } } });
    expect(data.appState.scrollX).toBe(120);
    expect(data.appState.scrollY).toBe(-40);
    expect(data.appState.zoom).toEqual({ value: 1.5 });
  });

  it("keeps zero scroll values rather than treating them as missing", () => {
    const data = serialize({ appState: { scrollX: 0, scrollY: 0, zoom: { value: 1 } } });
    expect(data.appState.scrollX).toBe(0);
    expect(data.appState.scrollY).toBe(0);
  });

  it("defaults the viewport when appState has no viewport fields", () => {
    const data = serialize({ appState: { viewBackgroundColor: "#123456" } });
    expect(data.appState.scrollX).toBe(0);
    expect(data.appState.scrollY).toBe(0);
    expect(data.appState.zoom).toEqual({ value: 1 });
    expect(data.appState.viewBackgroundColor).toBe("#123456");
  });

  it("defaults elements and viewport when both refs are null", () => {
    const output = serializeScene({ current: null }, { current: null }, createExcalidrawAPI());
    const data = JSON.parse(output);
    expect(data.type).toBe("excalidraw");
    expect(data.elements).toEqual([]);
    expect(data.appState.scrollX).toBe(0);
    expect(data.appState.scrollY).toBe(0);
    expect(data.appState.zoom).toEqual({ value: 1 });
  });

  it("includes files from the Excalidraw API that are referenced by image elements", () => {
    const image = { ...rectangle, id: "img-1", type: "image", fileId: "f1", status: "saved" };
    const data = serialize({ elements: [image], files: { f1: { ...imageFile, id: "f1" } } });
    expect(data.files.f1).toEqual(expect.objectContaining({ mimeType: "image/png", id: "f1" }));
  });

  it("round-trips through parseInitialData with the viewport restored", () => {
    const output = serializeScene(
      { current: [rectangle] },
      { current: { scrollX: 5, scrollY: 6, zoom: { value: 0.5 } } },
      createExcalidrawAPI(),
    );
    const data = parseInitialData(output);
    expect(data).not.toHaveProperty("scrollToContent");
    expect(data.appState).toEqual(
      expect.objectContaining({ scrollX: 5, scrollY: 6, zoom: { value: 0.5 } }),
    );
    expect(data.elements).toEqual([expect.objectContaining({ id: "rect-1" })]);
  });

  it("reads the refs at call time", () => {
    const elementsRef = { current: [] };
    const appStateRef = { current: { scrollX: 1, scrollY: 1 } };
    const api = createExcalidrawAPI();
    elementsRef.current = [rectangle];
    appStateRef.current = { scrollX: 9, scrollY: 9 };
    const data = JSON.parse(serializeScene(elementsRef, appStateRef, api));
    expect(data.elements).toHaveLength(1);
    expect(data.appState.scrollX).toBe(9);
    expect(api.getFiles).toHaveBeenCalledTimes(1);
  });
});
