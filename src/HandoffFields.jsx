import React, { useState } from "react";
import {
  ArrowUpRight,
  FileCheck2,
  FileText,
  Image,
  Paperclip,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { localDate, uid } from "./domain";
import { handoffGaps } from "./WorkflowViews";

export function HandoffFields({ draft, patch, Field, onBusy }) {
  const [uploadError, setUploadError] = useState("");
  const [busy, setBusy] = useState(false);
  const gaps = handoffGaps(draft);
  const completed = draft.stage === "concluido";
  const validation = draft.validation || {
    by: "",
    at: localDate(),
    evidence: "",
  };
  const patchValidation = (key, value) =>
    patch("validation", { ...validation, [key]: value });
  const attach = async (event) => {
    const files = [...event.target.files];
    event.target.value = "";
    if (!files.length) return;
    setUploadError("");
    if (draft.attachments.length + files.length > 3) {
      setUploadError(
        "Use até 3 anexos por atividade. Para outros arquivos, registre um link nas evidências.",
      );
      return;
    }
    if (files.some((f) => f.size > 1024 * 1024 || f.size === 0)) {
      setUploadError(
        "Cada anexo deve ter conteúdo e no máximo 1 MB. Para arquivos maiores, registre um link.",
      );
      return;
    }
    if (
      files.some(
        (f) =>
          ![
            "image/png",
            "image/jpeg",
            "image/webp",
            "application/pdf",
            "text/plain",
          ].includes(f.type),
      )
    ) {
      setUploadError("Use PNG, JPG, WebP, PDF ou TXT.");
      return;
    }
    onBusy(true);
    setBusy(true);
    try {
      const attachments = await Promise.all(
        files.map(
          (file) =>
            new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({ id: uid(), name: file.name, data: reader.result });
              reader.onerror = () =>
                reject(
                  new Error("Não foi possível ler o arquivo. Tente novamente."),
                );
              reader.readAsDataURL(file);
            }),
        ),
      );
      patch("attachments", [...draft.attachments, ...attachments]);
    } catch (e) {
      setUploadError(e.message);
    } finally {
      onBusy(false);
      setBusy(false);
    }
  };
  const ticketUrl = /^https?:\/\//i.test(draft.ticketUrl)
    ? draft.ticketUrl
    : "";
  return (
    <>
      <div className="handoff-section">
        <div className="section-heading">
          <h3>
            <FileText size={18} /> Contexto para continuar o trabalho
          </h3>
          <span
            className={gaps.length ? "handoff-incomplete" : "handoff-ready"}
          >
            {8 - gaps.length}/8 informações
          </span>
        </div>
        <p className="form-section-note">
          Outro colega deve conseguir entender o problema e saber o próximo
          passo. Preencha conforme as informações forem chegando.
        </p>
        <div className="form-grid">
          <Field label="Problema" full>
            <textarea
              rows="2"
              value={draft.problem}
              onChange={(e) => patch("problem", e.target.value)}
              placeholder="O que está errado? Cite o módulo, a rotina e um exemplo específico."
            />
          </Field>
          <Field label="Impacto" full>
            <textarea
              rows="2"
              value={draft.impact}
              onChange={(e) => patch("impact", e.target.value)}
              placeholder="O que esse problema impede ou atrasa no município?"
            />
          </Field>
          <Field label="Próxima ação" full>
            <textarea
              rows="2"
              value={draft.nextAction}
              onChange={(e) => patch("nextAction", e.target.value)}
              placeholder="Descreva o próximo passo de forma que outro colega consiga executá-lo."
            />
          </Field>
          <Field label="Quem precisa agir agora" full>
            <input
              value={draft.nextOwner}
              onChange={(e) => patch("nextOwner", e.target.value)}
              placeholder="Nome do colega, responsável da prefeitura ou equipe IPM"
            />
          </Field>
          <Field label="Critério de conclusão" full>
            <textarea
              required={completed}
              rows="2"
              value={draft.criterion}
              onChange={(e) => patch("criterion", e.target.value)}
              placeholder="O que precisa ser conferido para considerar a atividade resolvida?"
            />
          </Field>
        </div>
        {gaps.length > 0 && (
          <p className="handoff-gaps">Ainda a registrar: {gaps.join(", ")}.</p>
        )}
      </div>
      <div className="handoff-section">
        <div className="section-heading">
          <h3>
            <Paperclip size={18} /> Evidências e referências
          </h3>
          <span>Exemplos, prints e relatórios</span>
        </div>
        <div className="form-grid">
          <Field label="Evidências / links de relatórios" full>
            <textarea
              rows="3"
              value={draft.evidence}
              onChange={(e) => patch("evidence", e.target.value)}
              placeholder="Informe exemplos, resultados conferidos e links para arquivos ou relatórios."
            />
          </Field>
          {(draft.type === "chamado" || draft.ticket || draft.ticketUrl) && (
            <Field label="Link do chamado" full>
              <input
                type="url"
                pattern="https?://.+"
                value={draft.ticketUrl}
                onChange={(e) => patch("ticketUrl", e.target.value)}
                placeholder="https://..."
              />
            </Field>
          )}
        </div>
        {ticketUrl && (
          <a
            className="ticket-reference"
            href={ticketUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir chamado <ArrowUpRight size={14} />
          </a>
        )}
        <div className="evidence-files">
          {draft.attachments.map((a) => (
            <div className="evidence-file" key={a.id}>
              {a.data.startsWith("data:image/") ? (
                <img src={a.data} alt={`Evidência: ${a.name}`} />
              ) : (
                <span>
                  <FileText size={23} />
                </span>
              )}
              <a href={a.data} download={a.name}>
                {a.name}
                <small>
                  Baixar evidência <ArrowUpRight size={12} />
                </small>
              </a>
              <button
                type="button"
                disabled={busy}
                aria-label={`Remover anexo ${a.name}`}
                onClick={() =>
                  patch(
                    "attachments",
                    draft.attachments.filter((f) => f.id !== a.id),
                  )
                }
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
        <label className="upload-evidence">
          <Upload size={16} />
          <span>Anexar evidência</span>
          <input
            type="file"
            disabled={busy}
            multiple
            accept="image/png,image/jpeg,image/webp,application/pdf,text/plain"
            aria-label="Anexar evidência"
            onChange={attach}
          />
          <small>Até 3 arquivos de 1 MB · PNG, JPG, WebP, PDF ou TXT</small>
        </label>
        {uploadError && (
          <p className="upload-error" role="alert">
            {uploadError}
          </p>
        )}
      </div>
      {completed && (
        <div className="validation-section">
          <h3>
            <ShieldCheck size={19} /> Registrar validação da conclusão
          </h3>
          <p>
            Marcar o checklist não confirma o aceite. Registre o resultado
            conferido e quem validou.
          </p>
          <div className="form-grid">
            <Field label="Validado por *">
              <input
                required
                pattern=".*[^ ].*"
                value={validation.by}
                onChange={(e) => patchValidation("by", e.target.value)}
                placeholder="Nome de quem conferiu"
              />
            </Field>
            <Field label="Data da validação *">
              <input
                type="date"
                required
                value={validation.at?.slice(0, 10)}
                onChange={(e) => patchValidation("at", e.target.value)}
              />
            </Field>
            <Field label="Evidência da validação *" full>
              <textarea
                required
                rows="2"
                value={validation.evidence}
                onChange={(e) => patchValidation("evidence", e.target.value)}
                placeholder="Qual evidência comprova o critério de conclusão? Referencie o relatório, print ou resultado."
              />
            </Field>
          </div>
          <small>
            Registro informado manualmente. Ao salvar, também ficará no
            histórico.
          </small>
        </div>
      )}
    </>
  );
}
