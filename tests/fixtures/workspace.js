import {
  uid,
  localDate,
  nextDate,
  newActivity,
  normalizeModule,
} from "../../src/domain.js";

const list = (entity, completed = 0) => ({
  entity,
  items: [
    "Validar cadastros e dados migrados",
    "Executar rotina com o responsável",
    "Confirmar aceite da entidade",
  ].map((text, i) => ({ id: uid(), text, done: i < completed })),
});
const task = (title, module, stage, extra = {}) => ({
  ...newActivity(stage),
  title,
  module: normalizeModule(module),
  owner: "Você",
  ...extra,
});
export function createDemo() {
  return {
    version: 2,
    selectedId: "quatro-barras",
    projects: [
      {
        id: "quatro-barras",
        name: "Quatro Barras",
        state: "PR",
        dream: "1042",
        fiscal: "",
        cpf: "",
        fiscalEmail: "",
        contact: "",
        contactEmail: "",
        entities: ["Prefeitura", "Fundo de Saúde", "Câmara Municipal"],
        demo: true,
        tasks: [
          task("Homologação de Frotas", "Frotas", "homologacao", {
            date: nextDate(2),
            checklists: [list("Prefeitura", 1), list("Fundo de Saúde")],
          }),
          task("Homologação do Almoxarifado", "Almoxarifado", "homologacao", {
            checklists: [list("Prefeitura"), list("Fundo de Saúde")],
          }),
          task("Validar os bens patrimoniais", "Patrimônio", "homologacao", {
            checklists: [list("Prefeitura", 2)],
          }),
          task(
            "Revisar compras e contratos",
            "Compras e contratos",
            "homologacao",
            { checklists: [list("Prefeitura", 3)], priority: "baixa" },
          ),
          task("Validar migração com a equipe", "Patrimônio", "todo", {
            date: localDate(),
            time: "14:00",
            description:
              "Reunião para conferir os dados migrados com a equipe do município.",
          }),
          task("Acompanhar processo licitatório", "Licitações", "todo", {
            date: nextDate(1),
            time: "10:00",
          }),
          task(
            "Relatório de autorização em duas vias",
            "Compras e contratos",
            "todo",
            {
              priority: "alta",
              date: nextDate(1),
              description:
                "Ajustar a impressão para que as duas vias fiquem na mesma página.",
            },
          ),
          task("Conferir entrada com a mesma NF", "Almoxarifado", "progress", {
            nextAction:
              "Conferir as entradas duplicadas no ambiente de testes e registrar o resultado.",
            nextOwner: "Você",
            checklists: [list("Prefeitura", 1)],
          }),
          task(
            "Corrigir baixas e depreciações dos bens migrados",
            "Patrimônio",
            "waiting",
            {
              type: "chamado",
              ticket: "872797",
              priority: "alta",
              ticketStatus: "Em análise",
              blockedBy: "IPM",
              problem:
                "Bens migrados permanecem ativos após a baixa e apresentam depreciação divergente.",
              impact:
                "Impede o fechamento patrimonial e a conferência dos saldos.",
              nextAction:
                "IPM: analisar a correção das baixas. Consultor: validar os saldos após o retorno.",
              nextOwner: "Fábrica IPM",
              evidence:
                "Exemplo fictício: bem 0042, relatório de depreciação de setembro.",
              criterion:
                "Conferir os bens baixados e comparar os saldos do relatório com os dados migrados.",
            },
          ),
          task("PE 36/2026 · maior desconto", "Licitações", "waiting", {
            type: "chamado",
            ticket: "871884",
            blockedBy: "IPM",
            ticketStatus: "Em desenvolvimento",
          }),
          task(
            "Migração de CATMAT e CATSER",
            "Compras e contratos",
            "waiting",
            {
              type: "chamado",
              ticket: "871886",
              blockedBy: "IPM",
              ticketStatus: "Aguardando retorno",
            },
          ),
          task(
            "Roteiro de solicitação e requisição",
            "Almoxarifado",
            "concluido",
            {
              criterion:
                "Executar o roteiro e confirmar o resultado com a equipe.",
              validation: {
                by: "Consultor (exemplo)",
                at: localDate(),
                evidence:
                  "Registro fictício de demonstração: rotina conferida com a equipe.",
              },
              completedAt: new Date().toISOString(),
            },
          ),
          task(
            "Criação dos centros de compras",
            "Compras e contratos",
            "concluido",
            {
              criterion:
                "Executar o roteiro e confirmar o resultado com a equipe.",
              validation: {
                by: "Consultor (exemplo)",
                at: localDate(),
                evidence:
                  "Registro fictício de demonstração: rotina conferida com a equipe.",
              },
              completedAt: new Date().toISOString(),
            },
          ),
        ],
        trainings: [
          {
            id: uid(),
            title: "Compras e contratos",
            entity: "Prefeitura",
            date: nextDate(1),
            time: "09:00",
            duration: "2h",
            owner: "Você",
            status: "Agendado",
            notes: "",
          },
          {
            id: uid(),
            title: "Gestão de patrimônio",
            entity: "Prefeitura",
            date: nextDate(3),
            time: "14:00",
            duration: "2h",
            owner: "Você",
            status: "Agendado",
            notes: "",
          },
        ],
        logs: [
          {
            id: uid(),
            title: "Criação dos centros de compras",
            action: "concluída",
            at: new Date().toISOString(),
          },
          {
            id: uid(),
            title: "Roteiro de solicitação e requisição",
            action: "concluída",
            at: new Date().toISOString(),
          },
        ],
      },
    ],
  };
}
