# How to Compile the LTSpice to PDF Desktop App

This project uses Neutralinojs to create a lightweight, standalone desktop executable (.exe). The heavy developer toolchain is intentionally ignored from GitHub via `.gitignore` to keep the repository clean.

Follow these steps any time you clone the repository onto a new machine or need to recompile the `.exe` after making code changes.

### Step 1: Install Node.js
If you don't already have it on your computer, download and install Node.js from https://nodejs.org. This provides the `npm` and `npx` command line tools required to build the app.

### Step 2: Download the Build Tools
Open a terminal (PowerShell or Command Prompt) and set it to the **repo root** folder (the folder containing `package.json`).

Run the following command:
```
npm install
```

### Step 3: Run or Build the App

```
npm run build
```
*What this does:* It triggers `desktop/build_desktop.js` to safely isolate the files and compile the Neutralino bundle.

Your finished, standalone `LTSpice_to_PDF-win_x64.exe` file will be generated and waiting for you inside the `dist/` directory! 

### Step 4: Development Testing

To quickly test without building a full `.exe`:

```
npx @neutralinojs/neu run
```

This opens the desktop window live without compiling.

To test the web version locally in a browser:

```
python -m http.server 8000
```

Then open http://localhost:8000 in your browser.

http://127.0.0.1:8000/index.html