// Display choices belong to a browser/device, never to the shared workspace.
export const devicePreferencesKey = (account = "local") =>
  `implanta.display.v1:${account}`;

// Remove only identifiers owned by the discontinued integration. The same
// origin also hosts other applications; never clear storage wholesale.
export function clearRetiredDeviceData(storage) {
  try {
    storage ??= globalThis.localStorage;
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    for (const key of keys)
      if (key?.startsWith("implanta.mail.device.v1:")) storage.removeItem(key);
  } catch {
    // Restricted storage must not prevent opening the application.
  }
}

export function withoutDevicePreferences(data) {
  const { boardViews, boardCollapsed, boardOrders, boardOnlyMine, ...workspace } = data;
  return workspace;
}

export function displayPreferences(data = {}) {
  const validMap = (map, valid) =>
    Object.fromEntries(
      Object.entries(map && typeof map === "object" ? map : {}).filter(
        ([, value]) => valid(value),
      ),
    );
  return {
    boardOnlyMine: validMap(data.boardOnlyMine, (v) => typeof v === "boolean"),
    boardViews: validMap(data.boardViews, (v) =>
      ["kanban", "list", "table", "calendar"].includes(v),
    ),
    boardOrders: validMap(data.boardOrders, (v) =>
      ["manual", "priority"].includes(v),
    ),
    boardCollapsed: Object.fromEntries(
      Object.entries(validMap(data.boardCollapsed, Array.isArray)).map(
        ([id, stages]) => [
          id,
          [...new Set(stages)].filter((s) =>
            ["todo", "progress", "waiting", "homologacao", "concluido"].includes(s),
          ),
        ],
      ),
    ),
  };
}

export function readDevicePreferences(storage, key, legacy = {}) {
  try {
    const saved = storage.getItem(key);
    return displayPreferences(saved ? JSON.parse(saved) : legacy);
  } catch {
    return displayPreferences(legacy);
  }
}
