# Excalidraw Mac

A desktop application for [Excalidraw](https://excalidraw.com/), which auto-saves your drawings to local files.

## Architecture

```mermaid
sequenceDiagram
    participant App as Renderer (excalidraw-app)
    participant Preload as preload.js (Bridge)
    participant Main as main.js (Main Process)
    participant FS as Filesystem
    participant Store as electron-store

    Note over Main: app.whenReady()

    Note over App: Startup (index.html)
    App->>Preload: getConfig()
    Preload->>Main: invoke "get-config"
    Main->>FS: read config.json
    Main-->>App: config

    App->>Preload: getPendingFile() / getLastPath()
    Preload->>Main: IPC
    Main->>Store: get lastOpenedPath
    Main-->>App: file path (or null)

    App->>Preload: readFile(path)
    Preload->>Main: invoke "read-file"
    Main->>FS: read .excalidraw file
    Main-->>App: file content

    Note over App: User draws…
    App->>Preload: writeFile(path, JSON)
    Preload->>Main: invoke "write-file"
    Main->>FS: write .excalidraw file

    Note over App: ⌘N (New)
    Main->>App: menu-new event
    App->>App: resetScene(), clear state
    Main->>Store: set lastOpenedPath = null

    Note over App: ⌘O / ⌘S / ⇧⌘S
    Main->>App: menu event
    App->>Preload: openFileDialog() / saveFileDialog()
    Preload->>Main: IPC
    Main->>Store: set lastOpenedPath = selected path

```

## Design Considerations

### #1 Why CommonJS?

Electron's sandboxed preload scripts [don't support ESM](https://www.electronjs.org/docs/latest/tutorial/esm#sandboxed-preload-scripts-cant-use-esm-imports), so `preload.js` and `main.js` must use `require()`. This is why `package.json` sets `"type": "commonjs"`. The renderer files under `excalidraw-app/src/` still use ESM `import`/`export` — Vite handles those, not Node.js.

[`electron-store`](https://github.com/sindresorhus/electron-store) moved to ESM-only in recent versions, and dynamic `import()` breaks inside packaged asar archives. To stay compatible, this project pins **v8** (the last CJS release).

### #2 Why is fs.writeFileSync used instead of fileHandle.createWritable()?

- `fileHandle.createWritable()` is a browser [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemWritableFileStream) — it runs in the renderer, which is sandboxed and shouldn't own filesystem operations
- `FileSystemFileHandle` objects can't be sent across the IPC boundary (not serializable)
- `fs.writeFileSync` runs in the **main process** (privileged), following Electron's security model: renderer requests → main process executes
- Content is serialized via Excalidraw's `serializeAsJSON()` which outputs the standard `.excalidraw` JSON format

## Getting Started

1. Set your preferences in `config.json` (window size, auto-save timing, default open directory).
2. Run `npm run compile` — this lints, formats, builds, and packages the DMG in one step.

```bash
npm install
npm run compile   # lint → format → build → package DMG
```

### Configuration (`config.json`)

| Option                    | Type   | Default | Description                                       |
| ------------------------- | ------ | ------- | ------------------------------------------------- |
| `windowWidth`             | number | 1512    | Window width in pixels                            |
| `windowHeight`            | number | 982     | Window height in pixels                           |
| `autoSaveDebounceMs`      | number | 2000    | Debounce delay in milliseconds before auto-saving |
| `autoSaveCheckIntervalMs` | number | 500     | Interval in milliseconds to check for changes     |
| `defaultOpenDir`          | string | (none)  | Default directory for file open/save dialogs      |

### Scripts

| Command           | Description                                       |
| ----------------- | ------------------------------------------------- |
| `npm start`       | Launch the Electron app (requires a prior build)  |
| `npm run dev`     | Start the Vite dev server (renderer only)         |
| `npm run build`   | Build the renderer app for production             |
| `npm run dmg`     | Package the app into a DMG using electron-builder |
| `npm run compile` | Lint → Format → Build → Package DMG               |
| `npm run lint`    | Run ESLint                                        |
| `npm run format`  | Run Prettier                                      |

### Menu Shortcuts

| Shortcut | Action      |
| -------- | ----------- |
| ⌘N       | New drawing |
| ⌘O       | Open file   |
| ⌘S       | Save        |
| ⌘⇧S      | Save As     |

The app also supports **file association** — double-clicking a `.excalidraw` file or using "Open With" will launch the app and load that file.

## Known Limitations

### Drag-and-drop + undo can lose images

If you drag and drop images onto the canvas and then undo, the embedded image data will be lost. To be safe, keep a backup of your `.excalidraw` file before drag-and-drop operations involving images.

## Auto-Save

The app automatically saves your drawing to the last opened file. Changes are debounced (default 2 seconds) to avoid excessive disk writes. The auto-save behavior can be configured via `config.json`:

- `autoSaveDebounceMs` — delay before saving after changes (default: 2000ms)
- `autoSaveCheckIntervalMs` — how often to check for changes (default: 500ms)

If no file is open, the app will prompt you to save when you make changes.

## Updating Excalidraw Fonts

After upgrading the `@excalidraw/excalidraw` package, re-copy the font assets:

```bash
npm install @excalidraw/excalidraw@latest
cp -r node_modules/@excalidraw/excalidraw/dist/prod/fonts excalidraw-app/public/
```

## References

- [Excalidraw GitHub Repository](https://github.com/excalidraw/excalidraw)
- [Excalidraw Documentation](https://docs.excalidraw.com/)
- [Electron Documentation](https://www.electronjs.org/)
- [electron-builder](https://www.electron.build/)
- [electron-store](https://github.com/sindresorhus/electron-store)
