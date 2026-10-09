// This limits accidental export, not arbitrary free-text anonymization.
export function publicBackup(data) {
  const scrub = (value, key = "") => {
    if (key === "cpf") return "";
    if (key === "attachments") return [];
    if (typeof value === "string")
      return value.replace(
        /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
        "***.***.***-**",
      );
    if (Array.isArray(value)) return value.map((v) => scrub(v));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, scrub(v, k)]),
      );
    return value;
  };
  return {
    ...scrub(data),
    privacy: { cpfOmitted: true, attachmentsOmitted: true },
  };
}
export function preserveOmittedData(imported, existing) {
  if (!imported.privacy?.cpfOmitted && !imported.privacy?.attachmentsOmitted)
    return imported;
  const { privacy, ...content } = imported;
  return {
    ...content,
    projects: imported.projects.map((p) => {
      const previous = existing.projects.find((old) => old.id === p.id);
      return {
        ...p,
        ...(imported.privacy.cpfOmitted ? { cpf: previous?.cpf || "" } : {}),
        tasks: p.tasks.map((t) => ({
          ...t,
          ...(imported.privacy.attachmentsOmitted
            ? {
                attachments:
                  previous?.tasks.find((old) => old.id === t.id)?.attachments ||
                  [],
              }
            : {}),
        })),
      };
    }),
  };
}
