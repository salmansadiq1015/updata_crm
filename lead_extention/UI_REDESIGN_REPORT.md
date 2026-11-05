# Lead Finder interface audit and redesign

## Architecture and scope

The release uses Manifest V3, a React 18 side panel (`sidepanel.html`), a background service worker, a classic Google Maps content script, an IndexedDB repository layer, Chrome storage for preferences, and a processing worker. The browser action opens the side panel; there is no separate popup UI. The same extension document can be opened in a larger tab/window.

Graphify query and reverse-dependency inspection were followed by source inspection. Changes are confined to side-panel presentation, accessibility, and browser regression coverage. Manifest permissions, content scripts, background orchestration, authentication messages, repositories, request parameters, exports, CRM API integration, and enrichment permissions retain their existing contracts.

The extension discovers businesses in the user's actual Google Maps tab. Its geographic contract supports a radius and a captured Maps center. Embedded map rendering, rectangle/polygon geometry, marker selection synchronization, location autocomplete, recent-location storage, and search-keyword/attribute API filters do not exist in this extension. They were not represented by nonfunctional controls. These require a separately implemented engine contract and integration testing. The CRM application's separate map module is not the extension UI.

## Audit and implementation

| Area | Finding | Result |
| --- | --- | --- |
| Header/navigation | Small metadata, weak account indication, excessive surrounding space | Sticky navigation, original Updata logo, connected-account dot, labeled logout/theme actions, count badges, active underline |
| Discovery | Large decorative hero and equal emphasis on every option | Compact introduction with custom SVG location artwork; essential fields first; expandable coverage/contact/query options |
| Categories | Text-only selection with inconsistent emphasis | Reusable category icons, searchable keyboard-operated multiselect, removable chips, outside-click dismissal, Escape focus restoration |
| Location/area | Map relationship was unclear | Maps handoff panel, explicit selected-center confirmation, existing radius/custom-radius controls retained |
| Results | Dense columns at narrow sizes; selected rows unclear | Wide table and narrow stacked rows, custom category symbols, visible selection treatment, preserved virtualization, correct empty-filter state |
| Virtualization | Filtering a scrolled list could leave matching rows outside the rendered slice | Reset viewport and virtual offset when the result set changes |
| CRM | Large status panel dominated the page; text glyphs carried status | Compact sync header, distinct confirmed states, progress semantics, added/existing/failed counts, cancellation and retry actions retained |
| History | Saved campaigns hidden when no archived businesses existed | Campaign timeline remains visible independently; archive-only tools hidden when inapplicable; status and discovery counts shown |
| Settings | Account/Maps context missing | Separate connection section plus discovery defaults, appearance, optional permissions and confirmed deletion |
| Authentication | Visual system differed from the workspace | Shared surfaces, typography, original Updata logo, password visibility control, local font assets, theme preference |
| Details/dialogs | Keyboard could leave dialogs and Escape was unavailable | Focus containment, Escape dismissal, trigger restoration, background scroll locking, scrollable short-viewport dialogs |
| Motion | Several decorative hover effects and inconsistent surfaces | Restrained transitions, lightweight SVG entrance, active sync animation, complete reduced-motion override |

## Visual system

- Midnight canvas `#090f1d`; navy panels `#101a2b`; raised controls `#162237`.
- Borders `#223049`; stronger input borders `#344562`.
- Primary text `#edf2ff`; secondary `#a6b4cc`; muted `#8b9bb6`.
- Blue action `#4265dd`; accent text/icon `#93b3ff`; semantic success/warning/error tokens retained.
- Existing locally bundled Museo Sans, with 12–13px working copy, 11px supporting copy, 18px section titles, and responsive 24–34px hero type.
- 9px controls and 14px panel radii; compact 8/12/16/24px spacing rhythm.
- A single geometric SVG icon component, category mapping and reusable map/lead/history illustrations. No added dependencies or remotely loaded assets.
- Dark is the default for new sessions; saved light/dark preferences remain respected.

## Validation

Run from `lead_extention/`:

```sh
npm run typecheck
npm test
npm run build
npm run test:ui-browser
node tests/maps-browser-regression.mjs
```

The UI browser suite loads the built unpacked extension into an isolated headless Chrome profile and replaces runtime responses with deterministic fixtures. It checks all four navigation destinations at 320, 390, 600 and 1280 pixels; category keyboard selection; advanced options; current Maps center; business selection; detail focus and Escape; filtering after virtual scrolling; discovery and CRM request contracts; processing/completed/partial/failed/cancelled import states; theme switching; authentication controls; and uncaught browser exceptions. Optional screenshots: `UI_SCREENSHOT_DIR=/tmp/updata-ui-review node tests/ui-browser-regression.mjs`.

The existing Maps browser suite exercises the release content-script bundle in actual Chrome against a recycled feed, validates collection of 50 records, bounded scrolling, localized end markers and explicit category extraction. Existing unit tests cover campaigns, resume/checkpoints, pacing, geographic validation, CRM mapping/fallback, authentication handoff and exports.

These checks do not replace a live release smoke test against Google Maps and an authenticated CRM account. No real leads were imported, no production authentication was attempted, and no live discovery campaign was run during this redesign. Native side-panel sizing, real account expiry, network failures and production import responses still need that final environment-specific verification. The automated UI tests cover the same side-panel document in emulated viewport dimensions.

Final local results: 138 tests across 16 test files passed; TypeScript checking passed; 40 browser UI assertions passed; Maps browser regression passed with 50 collected records; production build and ZIP packaging passed. Browser UI checks reported no uncaught runtime exceptions. Source formatting passed `git diff --check`.

Brand correction: the shared BrandMark component uses the original bundled `icons/icon128.png`, matching the Chrome extension icon, across loading, authentication and workspace screens.
