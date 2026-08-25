# How to Compile the LTSpice to PDF Desktop App

This project uses Neutralinojs to create a lightweight, standalone desktop executable (.exe). The heavy developer toolchain is intentionally ignored from GitHub via `.gitignore` to keep the repository clean.

Follow these steps any time you clone the repository onto a new machine or need to recompile the `.exe` after making code changes.

### Step 1: Install Node.js
If you don't already have it on your computer, download and install Node.js from https://nodejs.org. This provides the `npm` and `npx` command line tools required to build the app.

### Step 2: Open a terminal at the repo root
Point it at the folder containing `package.json`.

There is nothing to install: the project has no runtime or build dependencies.
The Neutralino CLI is fetched on demand by `npx`, and the test suite uses Node's
built-in runner. (`npm install` is harmless but does nothing.)

### Step 3: Run or Build the App

```
npm run build
```
*What this does:* It triggers `desktop/build_desktop.js` to isolate the files in a
temp folder and compile the Neutralino bundle.

Your standalone `LTSpice_to_PDF-win_x64.exe` (~15 MB) lands in
`dist/LTSpice_to_PDF/`.

**Only the Windows executable is built by default.** `neu build` emits one
executable per runtime binary it finds in `bin/`, so the script copies just the
one you asked for — building all seven produces ~300 MB and is rarely useful.
To widen it:

```
npm run build:all                                            # all 7 platforms
node desktop/build_desktop.js --targets mac_arm64,linux_x64  # specific ones
```

The build also excludes LTSpice simulation artifacts (`.raw`, `.log`) from the
bundle. A stray `Draft2.raw` in the symbols folder was adding ~26 MB to every
executable.

### Step 4: Development Testing

To quickly test without building a full `.exe`:

```
npx @neutralinojs/neu run
```

This opens the desktop window live without compiling.

To test the web version locally in a browser:

```
npm run serve
```

This starts a small static server (`tools/serve.js`, Node only — no Python
needed) and opens http://localhost:8000 automatically.

### Step 5: Before distributing a build

```
npm test
```

Runs the full suite on Node's built-in test runner. Worth doing before handing
an `.exe` to anyone — it renders every schematic in `ASC Examples/` and checks
the bundle ships everything the app needs at runtime.

### Windows shortcut

Double-clicking `LTSpice_to_PDF.bat` in the repo root gives a menu for all of the
above.