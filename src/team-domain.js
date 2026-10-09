export class CollaborationConflict extends Error {
  constructor(path) {
    super(
      `Outro colega alterou o mesmo campo (${path}). Seu formulário foi mantido; copie o texto antes de fechar e carregar a atualização.`,
    );
    this.name = "CollaborationConflict";
  }
}
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const itemKey = (v) => (object(v) ? (v.id ?? v.entity) : undefined);
// Three-way merge: independent fields and items are combined. A simultaneous
// change to the same field, or deletion of an edited item, stays a conflict.
export function mergeProject(base, local, remote, path = "projeto") {
  if (same(local, base)) return remote;
  if (same(remote, base) || same(local, remote)) return local;
  if (object(base) && object(local) && object(remote)) {
    const merged = {};
    for (const key of new Set([
      ...Object.keys(base),
      ...Object.keys(local),
      ...Object.keys(remote),
    ])) {
      const value = mergeProject(
        base[key],
        local[key],
        remote[key],
        `${path}.${key}`,
      );
      if (value !== undefined)
        Object.defineProperty(merged, key, {
          value,
          enumerable: true,
          configurable: true,
          writable: true,
        });
    }
    return merged;
  }
  if (
    [base, local, remote].every(Array.isArray) &&
    [...base, ...local, ...remote].every((item) => itemKey(item) !== undefined)
  ) {
    const maps = [base, local, remote].map(
      (items) => new Map(items.map((item) => [itemKey(item), item])),
    );
    if ([base, local, remote].some((items, i) => items.length !== maps[i].size))
      throw new CollaborationConflict(path);
    const items = [];
    for (const id of new Set([
      ...maps[2].keys(),
      ...maps[1].keys(),
      ...maps[0].keys(),
    ])) {
      const value = mergeProject(
        maps[0].get(id),
        maps[1].get(id),
        maps[2].get(id),
        `${path}[${id}]`,
      );
      if (value !== undefined) items.push(value);
    }
    return path.endsWith(".logs")
      ? items.sort((a, b) => b.at.localeCompare(a.at))
      : items;
  }
  throw new CollaborationConflict(path);
}

export function validateConnection({ url, key }) {
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error("Informe a URL do projeto Supabase.");
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !(
      parsed.protocol === "https:" ||
      (parsed.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(parsed.hostname))
    )
  )
    throw new Error("Use HTTPS na conexão com o Supabase.");
  const publicKey = key.trim();
  let role = "";
  try {
    role = JSON.parse(
      atob(publicKey.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    ).role;
  } catch {
    /* Publishable keys aren't JWTs. */
  }
  if (publicKey.startsWith("sb_secret_") || role === "service_role")
    throw new Error(
      "Use somente a chave publicável/anon. Chaves administrativas não podem ficar no navegador.",
    );
  if (!(publicKey.startsWith("sb_publishable_") || role === "anon"))
    throw new Error(
      "Informe a chave publicável (publishable ou anon) do Supabase.",
    );
  return { url: parsed.href.replace(/\/$/, ""), key: publicKey };
}

export function workspacePreferences(data) {
  const { projects, version, ...preferences } = data;
  return preferences;
}

// Saved connections explicitly chosen on this device take precedence. The
// published public connection supplies the team default, without changing
// local development or the ability to run the local-only build for PWA tests.
export function resolveConnection({
  stored,
  environment = {},
  production = false,
  defaults,
}) {
  if (stored) {
    try {
      return validateConnection(JSON.parse(stored));
    } catch {
      /* Ignore obsolete/invalid device settings. */
    }
  }
  if (environment.url && environment.key)
    return validateConnection(environment);
  if (production && environment.mode !== "local")
    return validateConnection(defaults);
  return null;
}
