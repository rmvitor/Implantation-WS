export const HOMOLOGATION_FILE_LIMIT = 15 * 1024 * 1024;
export const HOMOLOGATION_BUCKET = "homologation-attachments";
export const homologationResourcesGuide =
  "https://github.com/rmvitor/Implantation-WS/blob/main/docs/anexos-homologacoes.md";
export function validateHomologationFile(file) {
  if (
    !file ||
    !file.name?.trim() ||
    file.name.length > 255 ||
    !Number.isSafeInteger(file.size) ||
    file.size < 1
  )
    throw new Error(
      "Selecione um arquivo não vazio, com nome de até 255 caracteres.",
    );
  if (file.size > HOMOLOGATION_FILE_LIMIT)
    throw new Error("O anexo ultrapassa o limite de 15 MB por arquivo.");
  return file;
}
export function homologationResourceError(e) {
  if (
    ["PGRST202", "PGRST205", "42883", "42P01"].includes(e?.code) ||
    /bucket.*not found/i.test(e?.message || "")
  )
    return "Ative o SQL dos anexos e responsáveis nas homologações. Os dados existentes foram preservados.";
  if (e?.code === "40001")
    return "O responsável foi alterado em outro aparelho. Atualize para revisar antes de salvar; sua seleção foi mantida.";
  if (e?.code === "42501")
    return "Seu acesso a esta homologação mudou. Confira as permissões do projeto.";
  return (
    e?.message ||
    "Não foi possível concluir. Confira a conexão e tente novamente."
  );
}
