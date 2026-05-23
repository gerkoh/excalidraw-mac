# Excalidraw Diagram Format Reference

## Color Palette (use consistently across all diagrams)

### Primary Colors
| Name | Hex | Use |
|------|-----|-----|
| Blue | `#4a9eed` | Primary actions, links, data series 1 |
| Amber | `#f59e0b` | Warnings, highlights, data series 2 |
| Green | `#22c55e` | Success, positive, data series 3 |
| Red | `#ef4444` | Errors, negative, data series 4 |
| Purple | `#8b5cf6` | Accents, special items, data series 5 |
| Pink | `#ec4899` | Decorative, data series 6 |
| Cyan | `#06b6d4` | Info, secondary, data series 7 |
| Lime | `#84cc16` | Extra, data series 8 |

### Excalidraw Fills (pastel, for shape backgrounds)
| Color | Hex | Good For |
|-------|-----|----------|
| Light Blue | `#a5d8ff` | Input, sources, primary nodes |
| Light Green | `#b2f2bb` | Success, output, completed |
| Light Orange | `#ffd8a8` | Warning, pending, external |
| Light Purple | `#d0bfff` | Processing, middleware, special |
| Light Red | `#ffc9c9` | Error, critical, alerts |
| Light Yellow | `#fff3bf` | Notes, decisions, planning |
| Light Teal | `#c3fae8` | Storage, data, memory |
| Light Pink | `#eebefa` | Analytics, metrics |

### Background Zones (use with opacity: 30 for layered diagrams)
| Color | Hex | Good For |
|-------|-----|----------|
| Blue zone | `#dbe4ff` | UI / frontend layer |
| Purple zone | `#e5dbff` | Logic / agent layer |
| Green zone | `#d3f9d8` | Data / tool layer |

---

## Excalidraw Elements

### Required Fields (all elements)
`type`, `id` (unique string), `x`, `y`, `width`, `height`

### Defaults (skip these - they are applied automatically)
strokeColor="#1e1e1e", backgroundColor="transparent", fillStyle="solid", strokeWidth=2, roughness=1, opacity=100

### Element Types

**Rectangle**: `{ "type": "rectangle", "id": "r1", "x": 100, "y": 100, "width": 200, "height": 100 }`
- `roundness: { type: 3 }` for rounded corners
- `backgroundColor: "#a5d8ff"`, `fillStyle: "solid"` for filled

**Ellipse**: `{ "type": "ellipse", "id": "e1", "x": 100, "y": 100, "width": 150, "height": 150 }`

**Diamond**: `{ "type": "diamond", "id": "d1", "x": 100, "y": 100, "width": 150, "height": 150 }`

**Labeled shape (PREFERRED)**: Add `label` to any shape for auto-centered text. No separate text element needed.
`{ "type": "rectangle", "id": "r1", "x": 100, "y": 100, "width": 200, "height": 80, "label": { "text": "Hello", "fontSize": 20 } }`
- Works on rectangle, ellipse, diamond
- Text auto-centers and container auto-resizes to fit

**Labeled arrow (ALWAYS use this for connection annotations)**:
`"label": { "text": "connects" }` on the arrow element. NEVER use a standalone text element to label a connection — always use the arrow's label property.
- BAD: separate text element "HTTP Request" placed near an arrow
- GOOD: `{ "type": "arrow", ..., "label": { "text": "HTTP Request" } }`

**Standalone text** (diagram titles ONLY — never for labeling connections or shapes):
`{ "type": "text", "id": "t1", "x": 150, "y": 138, "text": "Hello", "fontSize": 20 }`
- x is the LEFT edge of the text. To center text at position cx: set x = cx - estimatedWidth/2
- estimatedWidth ≈ text.length × fontSize × 0.5
- WARNING: standalone text overlaps shapes easily. Prefer `label` on shapes/arrows instead.

**Arrow**: `{ "type": "arrow", "id": "a1", "x": 300, "y": 150, "width": 200, "height": 0, "points": [[0,0],[200,0]], "endArrowhead": "arrow" }`
- points: array of [dx, dy] offsets from element x,y. First point is always [0,0].
- endArrowhead: null | "arrow" | "bar" | "dot" | "triangle"

**Bent/routed arrows** (use waypoints to route arrows around shapes and avoid overlap):
| Shape | points |
|-------|--------|
| Straight | `[[0,0],[200,0]]` |
| L-bend (right then down) | `[[0,0],[150,0],[150,100]]` |
| Z-bend (right, down, right) | `[[0,0],[100,0],[100,80],[200,80]]` |
| U-bend (down, right, up) | `[[0,0],[0,80],[150,80],[150,0]]` |

- Add `"roundness": { "type": 2 }` for smooth curved bends instead of sharp corners.
- Width/height should match the bounding box of all points (max dx × max dy), or use 0 — Excalidraw auto-computes.
- **Use bent arrows to route around shapes** — never draw a straight arrow that crosses through another element.

### Arrow Bindings
Arrow: `"startBinding": { "elementId": "r1", "fixedPoint": [1, 0.5] }`
fixedPoint: top=[0.5,0], bottom=[0.5,1], left=[0,0.5], right=[1,0.5]
Shortcut: for arrows between boxes, prefer `{ "type": "arrow", "id": "a1", "from": "sourceId", "to": "targetId", "label": { "text": "SYN" } }`. The app will derive exact arrow coordinates and bindings from the two element boxes.
- **CRITICAL**: `from` and `to` values MUST exactly match the `id` of a shape element in the same array. If the ID doesn't match, the arrow will not render.
- Use explicit points only for decorative/freeform arrows with no shape endpoints.
Bindings still work on bent arrows — Excalidraw adjusts entry/exit angles automatically.

### Protocol / Sequence Diagrams (TCP, TLS, OAuth, request/response)
Use actor boxes/columns plus labeled arrows. Messages are arrow labels, NOT separate rectangles.
- GOOD: Client box, Server box, then `{"type":"arrow","id":"syn","from":"client","to":"server","label":{"text":"1. SYN Seq=x"}}`
- GOOD: reverse message: `{"type":"arrow","id":"synack","from":"server","to":"client","label":{"text":"2. SYN-ACK Seq=y Ack=x+1"}}`
- BAD: drawing "SYN" as a rectangle between Client and Server, then adding manual arrows around it.
- BAD: manual `points` for actor-to-actor messages. Prefer `from` and `to` so the app can route and offset arrows.
- Keep labels short. Put details in the written explanation, not on the canvas.

### cameraUpdate (pseudo-element - controls the viewport, not drawn)
`{ "type": "cameraUpdate", "width": 800, "height": 600, "x": 0, "y": 0 }`
- x, y: top-left corner of the visible area (scene coordinates)
- width, height: size of the visible area - MUST be 4:3 ratio (400×300, 600×450, 800×600, 1200×900, 1600×1200)
- Animates smoothly between positions - use multiple cameraUpdates to guide attention as you draw
- No `id` needed - this is not a drawn element

### Drawing Order (CRITICAL for streaming)
- Array order = z-order (first = back, last = front)
- Elements stream to the canvas one by one - emit progressively:
  background zone → shape → its label → its arrows → next shape
- BAD: all rectangles → all texts → all arrows
- GOOD: bg_shape → shape1 → text1 → arrow1 → shape2 → text2 → ...
- For large diagrams, do NOT send one huge render_diagram call. Call render_diagram in small chunks of 3-8 elements: first title/background/main actors, then each section. This lets the user see the diagram being built while you think.

### Example: Two connected labeled boxes
```json
[
  { "type": "cameraUpdate", "width": 800, "height": 600, "x": 50, "y": 50 },
  { "type": "rectangle", "id": "b1", "x": 100, "y": 100, "width": 200, "height": 100, "roundness": { "type": 3 }, "backgroundColor": "#a5d8ff", "fillStyle": "solid", "label": { "text": "Start", "fontSize": 20 } },
  { "type": "rectangle", "id": "b2", "x": 450, "y": 100, "width": 200, "height": 100, "roundness": { "type": 3 }, "backgroundColor": "#b2f2bb", "fillStyle": "solid", "label": { "text": "End", "fontSize": 20 } },
  { "type": "arrow", "id": "a1", "x": 300, "y": 150, "width": 150, "height": 0, "points": [[0,0],[150,0]], "endArrowhead": "arrow", "startBinding": { "elementId": "b1", "fixedPoint": [1, 0.5] }, "endBinding": { "elementId": "b2", "fixedPoint": [0, 0.5] } }
]
```

### Camera & Sizing (CRITICAL for readability)

**Recommended camera sizes (4:3 aspect ratio ONLY):**
- Camera **S**: width 400, height 300 - close-up on a small group (2-3 elements)
- Camera **M**: width 600, height 450 - medium view, a section of a diagram
- Camera **L**: width 800, height 600 - standard full diagram (DEFAULT)
- Camera **XL**: width 1200, height 900 - large diagram overview. WARNING: font size smaller than 18 is unreadable
- Camera **XXL**: width 1600, height 1200 - panorama of complex diagrams. WARNING: minimum readable font size is 21

ALWAYS use one of these exact sizes. Non-4:3 viewports cause distortion.

**Font size rules:**
- Minimum fontSize: **16** for body text, labels, descriptions
- Minimum fontSize: **20** for titles and headings
- Minimum fontSize: **14** for secondary annotations only (sparingly)
- NEVER use fontSize below 14 - it becomes unreadable

**Element sizing rules:**
- Minimum shape size: 120×60 for labeled rectangles/ellipses
- Prefer fewer, larger elements over many tiny ones

**Spacing & overlap (CRITICAL - diagrams with overlapping elements are REJECTED):**
- Minimum gap between any two shapes: **30px** in both x and y
- Never place a standalone text element inside or overlapping a shape - use `label` instead
- Arrows between shapes need at least **40px** of clear space for their label text
- Before placing each element, mentally verify it does not overlap any previously placed element
- Common mistakes: title text overlapping a background zone, labels extending beyond their shape, shapes packed too tightly with zero margin

ALWAYS start with a `cameraUpdate` as the FIRST element in the array. For example:
`{ "type": "cameraUpdate", "width": 800, "height": 600, "x": 0, "y": 0 }`

Emit the cameraUpdate BEFORE the elements it frames - camera moves first, then content appears.
Leave padding: don't match camera size to content size exactly (e.g., 500px content in 800x600 camera).

## Complete Diagram Example

Example prompt: "Explain how photosynthesis works"

Uses 2 camera positions: start zoomed in (M) for title, then zoom out (L) to reveal the full diagram.

```json
[
  {"type":"cameraUpdate","width":400,"height":300,"x":200,"y":-20},
  {"type":"text","id":"ti","x":280,"y":10,"text":"Photosynthesis","fontSize":28,"strokeColor":"#1e1e1e"},
  {"type":"text","id":"fo","x":245,"y":48,"text":"6CO2 + 6H2O --> C6H12O6 + 6O2","fontSize":16,"strokeColor":"#757575"},
  {"type":"cameraUpdate","width":800,"height":600,"x":0,"y":-20},
  {"type":"rectangle","id":"lf","x":150,"y":90,"width":520,"height":380,"backgroundColor":"#d3f9d8","fillStyle":"solid","roundness":{"type":3},"strokeColor":"#22c55e","strokeWidth":1,"opacity":35},
  {"type":"text","id":"lfl","x":170,"y":96,"text":"Inside the Leaf","fontSize":16,"strokeColor":"#15803d"},
  {"type":"rectangle","id":"lr","x":190,"y":190,"width":160,"height":70,"backgroundColor":"#fff3bf","fillStyle":"solid","roundness":{"type":3},"strokeColor":"#f59e0b","label":{"text":"Light Reactions","fontSize":16}},
  {"type":"arrow","id":"a1","x":350,"y":225,"width":120,"height":0,"points":[[0,0],[120,0]],"strokeColor":"#1e1e1e","strokeWidth":2,"endArrowhead":"arrow","label":{"text":"ATP","fontSize":14}},
  {"type":"rectangle","id":"cc","x":470,"y":190,"width":160,"height":70,"backgroundColor":"#d0bfff","fillStyle":"solid","roundness":{"type":3},"strokeColor":"#8b5cf6","label":{"text":"Calvin Cycle","fontSize":16}},
  {"type":"rectangle","id":"sl","x":10,"y":200,"width":120,"height":50,"backgroundColor":"#fff3bf","fillStyle":"solid","roundness":{"type":3},"strokeColor":"#f59e0b","label":{"text":"Sunlight","fontSize":16}},
  {"type":"arrow","id":"a2","x":130,"y":225,"width":60,"height":0,"points":[[0,0],[60,0]],"strokeColor":"#f59e0b","strokeWidth":2,"endArrowhead":"arrow"},
  {"type":"rectangle","id":"wa","x":200,"y":360,"width":140,"height":50,"backgroundColor":"#a5d8ff","fillStyle":"solid","roundness":{"type":3},"strokeColor":"#4a9eed","label":{"text":"Water (H2O)","fontSize":16}},
  {"type":"arrow","id":"a3","x":270,"y":360,"width":0,"height":-100,"points":[[0,0],[0,-100]],"strokeColor":"#4a9eed","strokeWidth":2,"endArrowhead":"arrow"},
  {"type":"rectangle","id":"co","x":480,"y":360,"width":130,"height":50,"backgroundColor":"#ffd8a8","fillStyle":"solid","roundness":{"type":3},"strokeColor":"#f59e0b","label":{"text":"CO2","fontSize":16}},
  {"type":"arrow","id":"a4","x":545,"y":360,"width":0,"height":-100,"points":[[0,0],[0,-100]],"strokeColor":"#f59e0b","strokeWidth":2,"endArrowhead":"arrow"},
  {"type":"rectangle","id":"ox","x":540,"y":100,"width":100,"height":40,"backgroundColor":"#ffc9c9","fillStyle":"solid","roundness":{"type":3},"strokeColor":"#ef4444","label":{"text":"O2","fontSize":16}},
  {"type":"arrow","id":"a5","x":310,"y":190,"width":230,"height":-50,"points":[[0,0],[230,-50]],"strokeColor":"#ef4444","strokeWidth":2,"endArrowhead":"arrow"},
  {"type":"rectangle","id":"gl","x":690,"y":195,"width":120,"height":60,"backgroundColor":"#c3fae8","fillStyle":"solid","roundness":{"type":3},"strokeColor":"#22c55e","label":{"text":"Glucose","fontSize":18}},
  {"type":"arrow","id":"a6","x":630,"y":225,"width":60,"height":0,"points":[[0,0],[60,0]],"strokeColor":"#22c55e","strokeWidth":2,"endArrowhead":"arrow"},
  {"type":"ellipse","id":"sun","x":30,"y":110,"width":50,"height":50,"backgroundColor":"#fff3bf","fillStyle":"solid","strokeColor":"#f59e0b","strokeWidth":2}
]
```

## Tips
- Use the color palette consistently for visual coherence
- **Text contrast is CRITICAL** - never use light gray (#b0b0b0, #999) on white backgrounds. Minimum text color on white: #757575. For colored text on light fills, use dark variants (#15803d not #22c55e, #2563eb not #4a9eed)
- Do NOT use emoji in text - they don't render in Excalidraw's font
- Do NOT use LaTeX/math delimiters in diagram text (no $x$, $y$). Use plain labels like "Seq=x", "Ack=x+1".
- cameraUpdate guides the user's attention as elements stream in - use it liberally, especially for large diagrams
- **Camera size must include padding** - if your content is 500px tall, use an 800×600 camera, not 500px
- **Center titles relative to the diagram** - estimate the diagram's total width and center the title text over it
- **Arrow labels need space** - keep labels short or make arrows wider
- **NEVER overlap elements** - before finalizing coordinates, verify every element has at least 30px clearance from its neighbors in both x and y
