import {
  configureImplantation,
  saveImplantationResponsibles,
  saveImplantationQuestion,
  implantationId,
} from "../../src/implantation.js";
export const technicalActor = {
  id: "00000000-0000-4000-8000-000000000002",
  name: "Consultor teste",
};
export function implantationProject() {
  return {
    id: "implantation-test",
    name: "Município de teste",
    state: "PR",
    dream: "1234",
    fiscal: "Fiscal teste",
    cpf: "123.456.789-00",
    entities: ["Prefeitura", "Fundo de Saúde"],
    tasks: [],
    trainings: [],
    logs: [],
  };
}
export function preparedImplantation() {
  let p = configureImplantation(
    implantationProject(),
    [{ module: "Frota", entity: "Prefeitura" }],
    technicalActor,
  );
  return saveImplantationResponsibles(
    p,
    implantationId("Frota", "Prefeitura"),
    [
      {
        id: "ana",
        name: "Ana",
        role: "Diretora de Frota",
        email: "ana@example.invalid",
      },
      { id: "bruno", name: "Bruno", role: "Coordenador", email: "" },
    ],
    technicalActor,
  );
}
export function completeImplantation(project = preparedImplantation()) {
  let p = structuredClone(project);
  for (const entry of p.implantation.entries.filter((e) => e.included))
    for (const q of entry.questions) {
      p = saveImplantationQuestion(
        p,
        entry.id,
        q.id,
        {
          answer: q.kind === "blocking" ? "no" : "yes",
          notes: "",
          responsibleIds: ["ana", "bruno"],
          technical: true,
          clientIds: ["ana", "bruno"],
        },
        technicalActor,
      );
    }
  return p;
}
