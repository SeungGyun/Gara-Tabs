# Privacy Policy — Gara — Tab Manager

**Last updated: April 12, 2026**

## Overview

Gara — Tab Manager ("the Extension") is a Chrome extension that helps users organize, save, and restore browser tabs as named profiles. Your privacy is important to us. This policy explains what data the Extension accesses and how it is handled.

## Data Collection

### What we access

The Extension accesses the following browser data solely to provide its core functionality:

- **Tab URLs and titles** — to save and restore tab sessions as profiles
- **Tab group information** — to preserve group names, colors, and collapsed states

### What we store

All data is stored **locally on your device** using Chrome's built-in `chrome.storage.local` API. This includes:

- Saved profiles (tab URLs, titles, and group information)
- User settings and preferences (subdomain rules, auto-group rules, exclude patterns)

### What we do NOT collect

- No personal identification information
- No authentication credentials
- No browsing history beyond what you explicitly save as a profile
- No analytics or usage tracking data
- No financial or health information
- No location data

## Data Sharing

**We do not sell, transfer, or share any user data with third parties.** All data remains on your local device.

## Data Retention

- Profile data persists until you manually delete it
- Profile version history is automatically retained for 2 days, then discarded
- Uninstalling the Extension removes all stored data

## Remote Code

The Extension does not load or execute any remotely hosted code. All code is bundled within the Extension package.

## Permissions

| Permission | Purpose |
|------------|---------|
| `tabs` | Read open tab URLs, titles, and positions to save/restore profiles |
| `tabGroups` | Read and create Chrome tab groups when saving/restoring profiles |
| `storage` | Persist profiles and settings locally on the device |
| `sidePanel` | Display the tab manager UI in Chrome's side panel |
| `activeTab` | Identify the currently active tab for user-initiated actions |

## Changes to This Policy

If this policy is updated, the changes will be posted on this page with an updated revision date.

## Contact

If you have questions about this privacy policy, please open an issue at [https://github.com/SeungGyun/Gara-Tabs/issues](https://github.com/SeungGyun/Gara-Tabs/issues).
