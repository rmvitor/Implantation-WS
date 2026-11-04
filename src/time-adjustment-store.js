import { validateTimeAdjustment } from "./time-adjustments.js";
export const timeAdjustmentStorageKey = (user) =>
  `implanta.time-adjustments.v1:${user || "local"}`;
export function readLocalTimeAdjustments(storage, key) {
  const raw = storage.getItem(key);
  if (!raw) return [];
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows))
    throw new Error(
      "Não foi possível ler os ajustes deste aparelho. Os dados foram preservados.",
    );
  for (const row of rows) {
    if (!row.id || !Number.isInteger(row.revision) || row.revision < 1)
      throw new Error(
        "Registro de ponto local inválido. Os dados foram preservados.",
      );
    validateTimeAdjustment(row.data);
  }
  return rows;
}
export function saveLocalTimeAdjustment(storage, key, id, revision, data) {
  validateTimeAdjustment(data);
  const rows = readLocalTimeAdjustments(storage, key),
    old = rows.find((r) => r.id === id);
  if (revision !== (old?.revision || 0))
    throw Object.assign(new Error("O ajuste foi alterado em outra janela."), {
      code: "40001",
    });
  const now = new Date().toISOString(),
    row = {
      id,
      data,
      revision: revision + 1,
      created_at: old?.created_at || now,
      updated_at: now,
    };
  storage.setItem(
    key,
    JSON.stringify([row, ...rows.filter((r) => r.id !== id)]),
  );
  return row;
}
export function deleteLocalTimeAdjustment(storage, key, id, revision) {
  const rows = readLocalTimeAdjustments(storage, key),
    old = rows.find((r) => r.id === id);
  if (!old || old.revision !== revision)
    throw Object.assign(new Error("O ajuste foi alterado em outra janela."), {
      code: "40001",
    });
  storage.setItem(key, JSON.stringify(rows.filter((r) => r.id !== id)));
}
