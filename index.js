import { spawnSync } from "node:child_process";

const PREFIX = /^(?:\[w[^\s:\[\]]+:p[^\s:\[\]]+\](?: |$))+/;

export function desiredLabel(pane) {
  const name = (
    pane.label ?? (pane.terminal_title_stripped || pane.agent || "")
  ).replace(PREFIX, "");
  return `[${pane.pane_id}]${name ? ` ${name}` : ""}`;
}

export function desiredTabLabel(tab) {
  const name = tab.label.replace(/^(?:\[w[^\s:\[\]]+:t[^\s:\[\]]+\](?: |$))+/, "");
  return `[${tab.tab_id}]${name ? ` ${name}` : ""}`;
}

export function syncTabs(client = herdr) {
  let changed = 0;
  for (const tab of client("tab", "list").tabs) {
    const label = desiredTabLabel(tab);
    if (tab.label === label) continue;
    client("tab", "rename", tab.tab_id, label);
    changed += 1;
  }
  return changed;
}

export function herdr(...args) {
  const result = spawnSync(process.env.HERDR_BIN_PATH ?? "herdr", args, {
    encoding: "utf8",
    timeout: 15_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim());
  }
  return JSON.parse(result.stdout).result;
}

export function sync(client = herdr) {
  let changed = 0;
  for (let pane of client("pane", "list").panes) {
    let writes = 0;
    while (pane.label !== desiredLabel(pane)) {
      if (writes === 3) {
        throw new Error(`Pane ${pane.pane_id} label is still stale after 3 rename attempts.`);
      }
      // Old IDs can resolve through aliases after a move. Use the returned ID.
      pane = client("pane", "rename", pane.pane_id, desiredLabel(pane)).pane;
      writes += 1;
    }
    if (writes > 0) changed += 1;
  }
  return changed;
}

if (import.meta.main) {
  try {
    if (process.env.HERDR_ENV !== "1") {
      throw new Error("Run through Herdr or inside a Herdr pane.");
    }
    console.log(`Updated ${syncTabs()} tab label(s) and ${sync()} pane label(s).`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}
