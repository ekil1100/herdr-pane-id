# Herdr Pane ID

## Purpose

A native Herdr plugin that prefixes all pane labels with their current public IDs:

```text
[w1:p3] pi
[w1:p4] build
```

Covers all workspaces and tabs in each session where the plugin is enabled.
Existing names are preserved, repeated invocations skip unchanged labels, and
pane moves replace the old ID. Herdr runs one-shot commands on server startup,
`pane.created`, and `pane.moved`. There is no polling or background service.

## Installation

Requires Herdr 0.9.3 or later and Bun on Linux or macOS. Bun must be on the
Herdr server's PATH. The plugin uses JavaScript with no third-party dependencies.

From this directory, inside Herdr:

```sh
herdr plugin link "$PWD"
herdr plugin action invoke local.pane-id.sync
```

The action initializes existing panes immediately. Startup hooks run after server
restore, not when linking or enabling a plugin. Plugin registration is user-wide
and available to other Herdr sessions too.

## Configuration

No configuration is required. To sync manually, including after a manual rename:

```sh
herdr plugin action invoke local.pane-id.sync
```

Existing explicit labels take priority. Unlabeled panes use their current plain
terminal title, then their agent name, or just the ID. Captured names become
explicit labels and stay fixed when an application later changes its title.
Leading `[w…:p…]` tokens are reserved for the plugin.

Inspect command results:

```sh
herdr plugin log list --plugin local.pane-id --limit 10
```

If a pane moves during synchronization, an old ID can still resolve through an
alias. The plugin uses the pane returned by each rename to correct a stale ID
prefix, with at most three rename writes per pane per invocation. If repeated
moves exhaust this bound, or a pane closes during synchronization, the invocation
reports failure. A move after the final response still relies on its move event
to trigger another sync; use the sync action to reconcile if necessary.

Disable or remove the plugin:

```sh
herdr plugin disable local.pane-id
herdr plugin unlink local.pane-id
```

Existing labels remain when the plugin is disabled or removed.

Run tests:

```sh
bun test
```
