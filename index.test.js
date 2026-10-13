import { expect, test } from "bun:test";
import { desiredLabel, sync } from "./index.js";

const cases = [
  [{ label: "build" }, "[wX:pT] build"],
  [{ label: "[w1:p3] build" }, "[wX:pT] build"],
  [{ label: "[w1:p3] [w2:p4] pi" }, "[wX:pT] pi"],
  [{ label: "[wX:pT]" }, "[wX:pT]"],
  [{ label: "[debug] build" }, "[wX:pT] [debug] build"],
  [{ terminal_title_stripped: "π - project" }, "[wX:pT] π - project"],
  [{ agent: "pi" }, "[wX:pT] pi"],
  [{}, "[wX:pT]"],
  [{ label: "build", terminal_title_stripped: "shell" }, "[wX:pT] build"],
  [{ label: "", agent: "pi" }, "[wX:pT]"],
];

test.each(cases)("preserves name %j", (fields, expected) => {
  expect(desiredLabel({ pane_id: "wX:pT", ...fields })).toBe(expected);
});

function mockClient(panes, beforeRename = () => {}) {
  const calls = [];
  const aliases = new Map();
  const move = (pane, id) => {
    aliases.set(pane.pane_id, pane);
    pane.pane_id = id;
  };
  const client = (...args) => {
    calls.push(args);
    if (args[1] === "list") return { panes: structuredClone(panes) };
    beforeRename();
    const [, , id, label] = args;
    const pane = panes.find((pane) => pane.pane_id === id) ?? aliases.get(id);
    pane.label = label;
    return { pane: structuredClone(pane) };
  };
  return { client, calls, move };
}

test("syncs all panes, skips unchanged labels, and handles moves and renames", () => {
  const panes = [
    { pane_id: "w1:p3", label: "pi" },
    { pane_id: "w2:p4", label: "build" },
  ];
  const { client, calls } = mockClient(panes);
  expect(sync(client)).toBe(2);
  calls.length = 0;
  expect(sync(client)).toBe(0);
  expect(calls).toEqual([["pane", "list"]]);
  panes[1].pane_id = "wZ:pA";
  expect(sync(client)).toBe(1);
  expect(panes[1].label).toBe("[wZ:pA] build");
  panes[0].label = "renamed by user";
  expect(sync(client)).toBe(1);
  expect(panes[0].label).toBe("[w1:p3] renamed by user");
});

test("corrects stale snapshot A after move event B completes", () => {
  const pane = { pane_id: "w1:p3", label: "build" };
  let moved = false;
  const { client, calls, move } = mockClient([pane], () => {
    if (moved) return;
    moved = true;
    move(pane, "w2:p4");
    expect(sync(client)).toBe(1); // B completes before A's stale rename.
    expect(pane.label).toBe("[w2:p4] build");
  });

  expect(sync(client)).toBe(1); // A counts one pane, including its correction.
  expect(pane.label).toBe("[w2:p4] build");
  expect(calls).toEqual([
    ["pane", "list"],
    ["pane", "rename", "w1:p3", "[w1:p3] build"],
    ["pane", "list"],
    ["pane", "rename", "w2:p4", "[w2:p4] build"],
    ["pane", "rename", "w2:p4", "[w2:p4] build"],
  ]);
  calls.length = 0;
  expect(sync(client)).toBe(0);
  expect(calls).toEqual([["pane", "list"]]);
});

test("counts one changed pane when the third write converges", () => {
  const pane = { pane_id: "w1:p1", label: "build" };
  let writes = 0;
  const { client, move } = mockClient([pane], () => {
    if (++writes < 3) move(pane, `w1:p${writes + 1}`);
  });

  expect(sync(client)).toBe(1);
  expect(writes).toBe(3);
  expect(pane.label).toBe("[w1:p3] build");
  expect(sync(client)).toBe(0);
  expect(writes).toBe(3);
});

test("reports repeated moves after at most three writes per pane", () => {
  const pane = { pane_id: "w1:p1", label: "build" };
  let writes = 0;
  const { client, calls, move } = mockClient([pane], () => {
    move(pane, `w1:p${++writes + 1}`);
  });

  expect(() => sync(client)).toThrow("after 3 rename attempts");
  expect(writes).toBe(3);
  expect(calls).toEqual([
    ["pane", "list"],
    ["pane", "rename", "w1:p1", "[w1:p1] build"],
    ["pane", "rename", "w1:p2", "[w1:p2] build"],
    ["pane", "rename", "w1:p3", "[w1:p3] build"],
  ]);
});

test("requires Herdr context before calling the CLI", () => {
  const result = Bun.spawnSync([process.execPath, "index.js"], {
    cwd: import.meta.dir,
    env: { ...process.env, HERDR_ENV: "0" },
  });
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain("Run through Herdr");
});

test("uses the injected Herdr binary and reports launch failures", () => {
  const result = Bun.spawnSync([process.execPath, "index.js"], {
    cwd: import.meta.dir,
    env: { ...process.env, HERDR_ENV: "1", HERDR_BIN_PATH: "/missing/herdr-test-binary" },
  });
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain("/missing/herdr-test-binary");
});
