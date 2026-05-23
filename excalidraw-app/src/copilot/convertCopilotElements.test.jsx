import { beforeEach, describe, expect, it, vi } from "vitest";

const convertToExcalidrawElements = vi.fn((elements) =>
  elements.flatMap((element) =>
    element.label
      ? [
          element,
          {
            id: `${element.id}-label`,
            type: "text",
            text: element.label.text,
            containerId: element.id,
            textAlign: element.label.textAlign,
            verticalAlign: element.label.verticalAlign,
          },
        ]
      : [element],
  ),
);
const restore = vi.fn((scene) => ({ elements: scene.elements }));

vi.mock("@excalidraw/excalidraw", () => ({
  FONT_FAMILY: { Excalifont: 1 },
  convertToExcalidrawElements,
  restore,
}));

const { convertCopilotElements } = await import("./convertCopilotElements");

beforeEach(() => {
  convertToExcalidrawElements.mockClear();
  restore.mockClear();
});

describe("convertCopilotElements", () => {
  it("skips dagre when applyDagreLayout is false (streaming partial diagram)", () => {
    const elements = convertCopilotElements(
      [
        {
          id: "client",
          type: "rectangle",
          x: 10,
          y: 20,
          width: 140,
          height: 70,
        },
        {
          id: "server",
          type: "rectangle",
          x: 400,
          y: 500,
          width: 140,
          height: 70,
        },
        { id: "a", type: "arrow", from: "client", to: "server" },
      ],
      { applyDagreLayout: false },
    );
    const client = elements.find((e) => e.id === "client");
    const server = elements.find((e) => e.id === "server");
    expect(client).toMatchObject({ x: 10, y: 20 });
    expect(server).toMatchObject({ x: 400, y: 500 });
  });

  it("does not pull background zone rectangles into dagre", () => {
    const elements = convertCopilotElements([
      {
        id: "zone",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 800,
        height: 400,
        opacity: 35,
        backgroundColor: "#dbe4ff",
      },
      {
        id: "a",
        type: "rectangle",
        x: 50,
        y: 50,
        width: 100,
        height: 50,
      },
      {
        id: "b",
        type: "rectangle",
        x: 600,
        y: 300,
        width: 100,
        height: 50,
      },
      { id: "e", type: "arrow", from: "a", to: "b" },
      { id: "bad", type: "arrow", from: "a", to: "zone" },
    ]);
    const zone = elements.find((e) => e.id === "zone");
    expect(zone).toMatchObject({ x: 0, y: 0, width: 800, height: 400 });
    const a = elements.find((e) => e.id === "a");
    const b = elements.find((e) => e.id === "b");
    expect(a.x).toBeLessThan(b.x);
  });

  it("uses Excalidraw's native label conversion for labeled shapes", () => {
    const elements = convertCopilotElements([
      {
        id: "client",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 140,
        height: 70,
        label: { text: "Client" },
      },
    ]);

    const rectangle = elements.find((element) => element.id === "client");
    const label = elements.find((element) => element.type === "text");

    expect(rectangle).toMatchObject({
      type: "rectangle",
      id: "client",
    });
    expect(label).toMatchObject({
      type: "text",
      text: "Client",
      containerId: "client",
      textAlign: "center",
      verticalAlign: "middle",
    });
    expect(convertToExcalidrawElements).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          label: { textAlign: "center", verticalAlign: "middle", text: "Client" },
        }),
      ],
      { regenerateIds: false },
    );
    expect(restore).toHaveBeenCalledWith(
      { elements: expect.any(Array) },
      null,
      null,
      { refreshDimensions: true },
    );
  });

  it("preserves explicit arrow bindings", () => {
    const elements = convertCopilotElements([
      {
        id: "client",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 140,
        height: 70,
        label: { text: "Client" },
      },
      {
        id: "server",
        type: "rectangle",
        x: 320,
        y: 0,
        width: 140,
        height: 70,
        label: { text: "Server" },
      },
      {
        id: "syn",
        type: "arrow",
        x: 999,
        y: 999,
        width: 1,
        height: 1,
        points: [
          [0, 0],
          [1, 1],
        ],
        startBinding: { elementId: "client", fixedPoint: [1, 0.5] },
        endBinding: { elementId: "server", fixedPoint: [0, 0.5] },
        endArrowhead: "arrow",
        label: { text: "SYN" },
      },
    ]);

    expect(elements.find((element) => element.id === "syn")).toMatchObject({
      type: "arrow",
      x: 172,
      y: 67,
      width: 88,
      height: 0,
      points: [
        [0, 0],
        [88, 0],
      ],
      startBinding: { elementId: "client", fixedPoint: [1, 0.5] },
      endBinding: { elementId: "server", fixedPoint: [0, 0.5] },
      endArrowhead: "arrow",
    });
  });

  it("accepts semantic arrow endpoints and derives geometry", () => {
    const elements = convertCopilotElements([
      {
        id: "client",
        type: "rectangle",
        x: 10,
        y: 20,
        width: 100,
        height: 50,
      },
      {
        id: "server",
        type: "rectangle",
        x: 250,
        y: 120,
        width: 100,
        height: 50,
      },
      {
        id: "ack",
        type: "arrow",
        from: "server",
        to: "client",
      },
    ]);

    expect(elements.find((element) => element.id === "ack")).toMatchObject({
      x: 132,
      y: 57,
      width: 88,
      height: 0,
      points: [
        [0, 0],
        [88, 0],
      ],
      startBinding: { elementId: "server", fixedPoint: [1, 0.5] },
      endBinding: { elementId: "client", fixedPoint: [0, 0.5] },
      endArrowhead: "arrow",
    });
  });

  it("offsets parallel arrows between the same elements", () => {
    const elements = convertCopilotElements([
      {
        id: "client",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      },
      {
        id: "server",
        type: "rectangle",
        x: 300,
        y: 0,
        width: 100,
        height: 100,
      },
      { id: "syn", type: "arrow", from: "client", to: "server" },
      { id: "synack", type: "arrow", from: "server", to: "client" },
      { id: "ack", type: "arrow", from: "client", to: "server" },
    ]);

    expect(elements.find((element) => element.id === "syn")).toMatchObject({
      startBinding: { fixedPoint: [1, 0.32] },
      endBinding: { fixedPoint: [0, 0.32] },
      y: 64,
    });
    expect(elements.find((element) => element.id === "synack")).toMatchObject({
      startBinding: { fixedPoint: [0, 0.5] },
      endBinding: { fixedPoint: [1, 0.5] },
      y: 82,
    });
    expect(elements.find((element) => element.id === "ack")).toMatchObject({
      startBinding: { fixedPoint: [1, 0.6799999999999999] },
      endBinding: { fixedPoint: [0, 0.6799999999999999] },
      y: 100,
    });
  });

  it("normalizes messy coordinates into a left-to-right client/server flow (protocol-style prompt)", () => {
    const elements = convertCopilotElements([
      {
        id: "client",
        type: "rectangle",
        x: 900,
        y: 400,
        width: 120,
        height: 56,
        label: { text: "Client" },
      },
      {
        id: "server",
        type: "rectangle",
        x: 12,
        y: 3,
        width: 120,
        height: 56,
        label: { text: "Server" },
      },
      { id: "req", type: "arrow", from: "client", to: "server" },
    ]);

    const client = elements.find((e) => e.id === "client");
    const server = elements.find((e) => e.id === "server");
    expect(client).toBeTruthy();
    expect(server).toBeTruthy();
    expect(client.x).toBeLessThan(server.x);
  });

  it("lays out a linear attention-style chain in layer order (teaching prompt)", () => {
    const elements = convertCopilotElements([
      { id: "tokens", type: "rectangle", x: 0, y: 0, width: 100, height: 48 },
      { id: "emb", type: "rectangle", x: 500, y: 200, width: 100, height: 48 },
      { id: "qkv", type: "rectangle", x: 10, y: 300, width: 100, height: 48 },
      { id: "ctx", type: "rectangle", x: 400, y: 50, width: 100, height: 48 },
      { id: "a1", type: "arrow", from: "tokens", to: "emb" },
      { id: "a2", type: "arrow", from: "emb", to: "qkv" },
      { id: "a3", type: "arrow", from: "qkv", to: "ctx" },
    ]);

    const x = (id) => elements.find((e) => e.id === id).x;
    expect(x("tokens")).toBeLessThan(x("emb"));
    expect(x("emb")).toBeLessThan(x("qkv"));
    expect(x("qkv")).toBeLessThan(x("ctx"));
  });

  it("handles a branch (values merge) without throwing (attention-style prompt)", () => {
    const elements = convertCopilotElements([
      { id: "emb", type: "rectangle", x: 200, y: 200, width: 90, height: 44 },
      { id: "qkv", type: "rectangle", x: 50, y: 50, width: 90, height: 44 },
      { id: "vals", type: "rectangle", x: 700, y: 1, width: 90, height: 44 },
      { id: "wsum", type: "rectangle", x: 3, y: 600, width: 96, height: 44 },
      { id: "e1", type: "arrow", from: "emb", to: "qkv" },
      { id: "e2", type: "arrow", from: "emb", to: "vals" },
      { id: "e3", type: "arrow", from: "qkv", to: "wsum" },
      { id: "e4", type: "arrow", from: "vals", to: "wsum" },
    ]);

    const x = (id) => elements.find((e) => e.id === id).x;
    expect(x("emb")).toBeLessThan(x("qkv"));
    expect(x("emb")).toBeLessThan(x("vals"));
    expect(x("qkv")).toBeLessThan(x("wsum"));
    expect(x("vals")).toBeLessThan(x("wsum"));
    expect(elements.length).toBeGreaterThan(4);
  });
});
