import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { serializeAsJSON } from "@excalidraw/excalidraw";
import {
  stripAppLevelAppState,
  parseInitialData,
  loadScene,
  getSceneSnapshot,
  serializeScene,
  injectViewport,
} from "./sceneUtils";

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
  history: { clear: vi.fn() },
});

// what serializeScene did before the single-pass splice: parse, re-inject, re-stringify
const legacySerializeScene = (elements, appState, files) => {
  const data = JSON.parse(serializeAsJSON(elements, appState, files, "local"));
  data.appState.scrollX = appState.scrollX ?? 0;
  data.appState.scrollY = appState.scrollY ?? 0;
  data.appState.zoom = appState.zoom ?? { value: 1 };
  return data;
};

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

  it("clears undo history so undo can't bring back the previous drawing", () => {
    const api = createExcalidrawAPI();
    loadScene(api, { elements: [rectangle], appState: {}, files: { f1: imageFile } });
    expect(api.history.clear).toHaveBeenCalledTimes(1);
    expect(api.history.clear.mock.invocationCallOrder[0]).toBeGreaterThan(
      api.updateScene.mock.invocationCallOrder[0],
    );
    expect(api.history.clear.mock.invocationCallOrder[0]).toBeGreaterThan(
      api.addFiles.mock.invocationCallOrder[0],
    );
  });

  it("clears undo history even for an empty drawing", () => {
    const api = createExcalidrawAPI();
    loadScene(api, {});
    expect(api.history.clear).toHaveBeenCalledTimes(1);
  });
});

describe("getSceneSnapshot", () => {
  const edited = (element, changes = {}) => ({
    ...element,
    version: element.version + 1,
    versionNonce: element.versionNonce + 1,
    ...changes,
  });

  it("is stable for the same elements and appState", () => {
    const appState = { viewBackgroundColor: "#fff" };
    expect(getSceneSnapshot([rectangle], appState)).toEqual(
      getSceneSnapshot([{ ...rectangle }], { ...appState }),
    );
  });

  it("ignores the theme (it isn't saved into the file, so toggling it must not dirty the drawing)", () => {
    expect(getSceneSnapshot([rectangle], { theme: "dark" })).toEqual(
      getSceneSnapshot([rectangle], { theme: "light" }),
    );
  });

  it("changes when an element is edited (new versionNonce)", () => {
    const before = getSceneSnapshot([rectangle], {});
    const after = getSceneSnapshot([edited(rectangle, { x: 99 })], {});
    expect(after.key).not.toBe(before.key);
  });

  it("changes when an element is deleted (deletion bumps the version)", () => {
    const before = getSceneSnapshot([rectangle], {});
    const after = getSceneSnapshot([edited(rectangle, { isDeleted: true })], {});
    expect(after.key).not.toBe(before.key);
  });

  it("changes when an element is added or removed", () => {
    const one = getSceneSnapshot([rectangle], {});
    const two = getSceneSnapshot([rectangle, { ...rectangle, id: "r2", versionNonce: 7 }], {});
    expect(two.key).not.toBe(one.key);
    expect(getSceneSnapshot([], {}).key).not.toBe(one.key);
  });

  it.each([
    ["viewBackgroundColor", { viewBackgroundColor: "#000" }],
    ["gridSize", { gridSize: 40 }],
    ["gridStep", { gridStep: 10 }],
    ["gridModeEnabled", { gridModeEnabled: true }],
  ])("changes when persisted appState %s changes", (_label, change) => {
    const base = {
      viewBackgroundColor: "#fff",
      gridSize: 20,
      gridStep: 5,
      gridModeEnabled: false,
    };
    expect(getSceneSnapshot([rectangle], { ...base, ...change }).key).not.toBe(
      getSceneSnapshot([rectangle], base).key,
    );
  });

  it.each([
    ["scrolling", { scrollX: 500, scrollY: -200 }],
    ["zooming", { zoom: { value: 3 } }],
    ["selecting", { selectedElementIds: { "rect-1": true } }],
    ["changing tool", { activeTool: { type: "arrow" } }],
    ["changing theme", { theme: "dark" }],
  ])("ignores %s (not an edit to the drawing)", (_label, change) => {
    const base = { scrollX: 0, scrollY: 0, zoom: { value: 1 }, viewBackgroundColor: "#fff" };
    expect(getSceneSnapshot([rectangle], { ...base, ...change }).key).toBe(
      getSceneSnapshot([rectangle], base).key,
    );
  });

  it.each([
    ["no elements", [], false],
    ["only deleted elements", [{ ...rectangle, isDeleted: true }], false],
    ["one live element", [rectangle], true],
    [
      "a mix of deleted and live",
      [
        { ...rectangle, isDeleted: true },
        { ...rectangle, id: "r2" },
      ],
      true,
    ],
  ])("hasContent is right for %s", (_label, elements, hasContent) => {
    expect(getSceneSnapshot(elements, {}).hasContent).toBe(hasContent);
  });

  it("handles null elements and appState", () => {
    expect(getSceneSnapshot(null, null)).toEqual({
      key: getSceneSnapshot([], {}).key,
      hasContent: false,
    });
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

describe("app-level theme is never taken from a file", () => {
  describe("stripAppLevelAppState", () => {
    it.each(["light", "dark", "sepia", null, undefined])("removes theme %j", (theme) => {
      expect(stripAppLevelAppState({ theme, gridSize: 20 })).toEqual({ gridSize: 20 });
    });

    it("leaves appState without a theme unchanged", () => {
      expect(stripAppLevelAppState({ scrollX: 1, viewBackgroundColor: "#fff" })).toEqual({
        scrollX: 1,
        viewBackgroundColor: "#fff",
      });
    });

    it("handles an empty appState", () => {
      expect(stripAppLevelAppState({})).toEqual({});
    });

    it("does not mutate its input", () => {
      const appState = { theme: "dark", scrollX: 1 };
      stripAppLevelAppState(appState);
      expect(appState).toEqual({ theme: "dark", scrollX: 1 });
    });
  });

  it.each(["light", "dark"])("parseInitialData drops a saved %s theme", (theme) => {
    const data = parseInitialData(
      JSON.stringify({
        elements: [rectangle],
        appState: { theme, scrollX: 5, scrollY: 6, viewBackgroundColor: "#fff" },
      }),
    );
    expect(data.appState).toEqual({ scrollX: 5, scrollY: 6, viewBackgroundColor: "#fff" });
    expect(data.appState).not.toHaveProperty("theme");
  });

  it("parseInitialData still restores the viewport when the file had a theme", () => {
    const data = parseInitialData(
      JSON.stringify({ elements: [], appState: { theme: "dark", scrollX: 0, scrollY: 0 } }),
    );
    expect(data).not.toHaveProperty("scrollToContent");
  });

  it("parseInitialData drops the theme from an excalidraw.com export", () => {
    const data = parseInitialData(
      JSON.stringify({
        type: "excalidraw",
        source: "https://excalidraw.com",
        elements: [],
        appState: { theme: "dark", gridSize: 20 },
      }),
    );
    expect(data.appState).toEqual({ gridSize: 20 });
    expect(data.scrollToContent).toBe(true);
  });

  it("loadScene never passes a theme to updateScene for a parsed file", () => {
    const api = createExcalidrawAPI();
    loadScene(
      api,
      parseInitialData(JSON.stringify({ elements: [], appState: { theme: "dark", scrollX: 1 } })),
    );
    const { appState } = api.updateScene.mock.calls[0][0];
    expect(appState).not.toHaveProperty("theme");
  });

  it("serializeScene doesn't write the theme (Excalidraw marks it export: false)", () => {
    const json = JSON.parse(
      serializeScene(
        { current: [rectangle] },
        { current: { theme: "dark", scrollX: 0, scrollY: 0 } },
        createExcalidrawAPI(),
      ),
    );
    expect(json.appState).not.toHaveProperty("theme");
  });

  it("a saved file round-trips without carrying its theme back in", () => {
    const content = serializeScene(
      { current: [rectangle] },
      { current: { theme: "dark", scrollX: 3, scrollY: 4, zoom: { value: 1 } } },
      createExcalidrawAPI(),
    );
    const data = parseInitialData(content);
    expect(data.appState).not.toHaveProperty("theme");
    expect(data.appState.scrollX).toBe(3);
  });
});

describe("serializeScene single pass", () => {
  const image = { ...rectangle, id: "img-1", type: "image", fileId: "f1", status: "saved" };
  const files = { f1: { ...imageFile, id: "f1" } };

  const cases = [
    ["empty scene, empty appState", [], {}, {}],
    ["one element, viewport only", [rectangle], { scrollX: 3, scrollY: 4, zoom: { value: 2 } }, {}],
    [
      "persisted appState and an image",
      [rectangle, image],
      {
        scrollX: -1.5,
        scrollY: 2.25,
        zoom: { value: 0.3 },
        viewBackgroundColor: "#abc",
        gridSize: 20,
      },
      files,
    ],
    ["missing viewport fields", [rectangle], { viewBackgroundColor: "#fff" }, {}],
  ];

  it.each(cases)(
    "matches the old parse/re-stringify output for %s",
    (_l, elements, appState, f) => {
      const output = serializeScene(
        { current: elements },
        { current: appState },
        createExcalidrawAPI(f),
      );
      expect(JSON.parse(output)).toEqual(legacySerializeScene(elements, appState, f));
    },
  );

  it.each(cases)("is canonical 2-space JSON for %s", (_l, elements, appState, f) => {
    const output = serializeScene(
      { current: elements },
      { current: appState },
      createExcalidrawAPI(f),
    );
    expect(output).toBe(JSON.stringify(JSON.parse(output), null, 2));
  });

  it("does not parse the serialized scene", () => {
    const parse = vi.spyOn(JSON, "parse");
    serializeScene(
      { current: [rectangle, image] },
      { current: { scrollX: 1, scrollY: 2, zoom: { value: 1 } } },
      createExcalidrawAPI(files),
    );
    expect(parse).not.toHaveBeenCalled();
  });

  it("is not fooled by element text that looks like the appState key", () => {
    const tricky = ['\n  "appState": {', '"appState": {}', '  "appState": {\n    "scrollX": 999,'];
    const elements = tricky.map((text, i) => ({
      ...rectangle,
      id: `text-${i}`,
      type: "text",
      text,
      originalText: text,
    }));
    const appState = { scrollX: 7, scrollY: 8, zoom: { value: 1.25 }, viewBackgroundColor: "#fff" };

    const data = JSON.parse(
      serializeScene({ current: elements }, { current: appState }, createExcalidrawAPI()),
    );

    expect(data.elements.map((element) => element.text)).toEqual(tricky);
    expect(data.appState).toEqual({
      scrollX: 7,
      scrollY: 8,
      zoom: { value: 1.25 },
      viewBackgroundColor: "#fff",
    });
  });

  it("keeps a valid .excalidraw envelope that excalidraw.com accepts", () => {
    const data = JSON.parse(
      serializeScene({ current: [image] }, { current: { scrollX: 1 } }, createExcalidrawAPI(files)),
    );
    expect(Object.keys(data)).toEqual([
      "type",
      "version",
      "source",
      "elements",
      "appState",
      "files",
    ]);
    expect(data.type).toBe("excalidraw");
    expect(data.version).toBe(2);
    expect(data.files.f1.dataURL).toBe(imageFile.dataURL);
  });

  it("relies on serializeAsJSON still stripping the viewport (library contract)", () => {
    const raw = JSON.parse(
      serializeAsJSON([rectangle], { scrollX: 1, scrollY: 2, zoom: { value: 3 } }, {}, "local"),
    );
    expect(raw.appState).not.toHaveProperty("scrollX");
    expect(raw.appState).not.toHaveProperty("scrollY");
    expect(raw.appState).not.toHaveProperty("zoom");
  });

  it("drops files only referenced by deleted elements, like the deleted elements themselves", () => {
    const deletedImage = { ...image, isDeleted: true };
    const data = JSON.parse(
      serializeScene({ current: [deletedImage] }, { current: {} }, createExcalidrawAPI(files)),
    );
    expect(data.elements).toEqual([]);
    expect(data.files).toEqual({});
  });
});

describe("injectViewport", () => {
  const viewport = { scrollX: 1, scrollY: 2, zoom: { value: 3 } };

  it("adds the viewport to a non-empty appState", () => {
    const serialized = JSON.stringify({ type: "excalidraw", appState: { gridSize: 20 } }, null, 2);
    const output = injectViewport(serialized, viewport);
    expect(JSON.parse(output).appState).toEqual({ ...viewport, gridSize: 20 });
    expect(output).toBe(JSON.stringify(JSON.parse(output), null, 2));
  });

  it("adds the viewport to an empty appState", () => {
    const serialized = JSON.stringify({ type: "excalidraw", appState: {}, files: {} }, null, 2);
    const output = injectViewport(serialized, viewport);
    expect(JSON.parse(output).appState).toEqual(viewport);
    expect(output).toBe(JSON.stringify(JSON.parse(output), null, 2));
  });

  it("falls back to re-parsing (and warns) if the format is not what serializeAsJSON produces", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const compact = JSON.stringify({ type: "excalidraw", appState: { gridSize: 20 } });
    const output = injectViewport(compact, viewport);
    expect(JSON.parse(output).appState).toEqual({ gridSize: 20, ...viewport });
    expect(output).toBe(JSON.stringify(JSON.parse(output), null, 2));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("falls back when there is no appState at all", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const output = injectViewport(JSON.stringify({ type: "excalidraw" }, null, 2), viewport);
    expect(JSON.parse(output).appState).toEqual(viewport);
  });
});
