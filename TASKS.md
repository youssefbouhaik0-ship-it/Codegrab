# CodeGrab — Ship Checklist

Track every fix so nothing gets lost between sessions.

---

## DONE ✅

- [x] **Accessibility removed completely** — Removed from onboarding UI AND from extraction chain (Layer 2 dropped). App is now OCR-only.
- [x] **Browser extractor removed** — `tell application "Chrome/Safari"` was triggering Automation permission dialogs on macOS Sequoia. OCR-only now.
- [x] **Automation permission dialog fixed** — `getFrontmostApp()` replaced with `NSWorkspace.sharedWorkspace.frontmostApplication` — zero permissions required.
- [x] **Screen Recording registration fixed** — Popover flashes briefly on launch so macOS registers the app for Screen Recording in System Settings.
- [x] **Overlay black window in Mission Control** — Removed `setContentProtection(true)` from overlay.ts.
- [x] **Overlay window removed entirely** — Fullscreen transparent overlay was redundant. Hotkey sends `toggle-grab` directly to popover. Removed `createOverlayWindow`, `destroyOverlay`, and all overlay imports.
- [x] **DMG background** — Replaced dark background with clean light gradient. Added `background@2x.png` (1320×800) for retina. Arrow removed.
- [x] **DMG icon positions** — Fixed `y: 200 → y: 170` and `iconSize: 80 → 160` per sindresorhus/create-dmg spec.
- [x] **DMG skill built** — `/Users/alrarsung/.claude/skills/electron-dmg/skill.md` — learned from sindresorhus/create-dmg.
- [x] **Wrong Info.plist key** — `NSScreenCaptureDescription` is not a real macOS key. Fixed to `NSScreenRecordingUsageDescription`. This was the root cause of permission never registering.
- [x] **Permission check broken on Sequoia** — `desktopCapturer.getSources()` with `1×1` thumbnail always returns empty on Sequoia. Fixed to `320×200` with pixel dimension check.
- [x] **Permission loop on relaunch (Sequoia)** — After granting Screen Recording, Sequoia relaunches the app but `checkScreenRecordingPermission()` still returned false (Sequoia desktopCapturer bug). Fixed: gate now requires BOTH `!screenGranted && !hasSeenOnboarding`. `hasSeenOnboarding` is saved the moment user clicks "Set Up Permissions" — before System Settings is even opened — so it survives the relaunch. Confirmed working after `tccutil reset ScreenCapture com.codegrab.app`.
- [x] **Claude removed from GitHub contributors** — Force-pushed amended commit with no Co-Authored-By.

---

## TO DO 📋

- [ ] **Notify communities** — After release is live.
