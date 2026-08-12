# MIDIVid

Space-age MIDI synthesizer & visualizer desktop app.

## Downloads

Grab the latest installers from [Releases](https://github.com/drumnunaut/midivid/releases):

- **Windows**: `MIDIVid-Setup-<version>.exe` (NSIS installer, auto-updates)
- **macOS**: `MIDIVid-<version>.dmg` / `-arm64.dmg` (unsigned — right-click → Open on first launch)
- **Linux**: `MIDIVid-<version>.AppImage` (`chmod +x`, run, auto-updates)

## Releasing

Installers are built automatically by GitHub Actions:

```bash
# bump "version" in package.json, commit, then:
git tag v<version>
git push origin main --tags
```

The workflow builds all three platforms and attaches artifacts (plus the
`latest*.yml` update-feed files) to the tagged release.

## Local development

```bash
npm install
npm run build:desktop && npm run build:electron
npx electron dist-electron/main.cjs
```
