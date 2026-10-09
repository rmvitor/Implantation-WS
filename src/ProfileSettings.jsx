import React, { useEffect, useState } from "react";

export const DEFAULT_APPEARANCE = { theme: "light", primary: "#2563eb" };
export function safeAppearance(value) {
  return {
    theme: value?.theme === "dark" ? "dark" : "light",
    primary: /^#[0-9a-f]{6}$/i.test(value?.primary || "")
      ? value.primary
      : DEFAULT_APPEARANCE.primary,
  };
}
export function applyAppearance(value) {
  const { theme, primary } = safeAppearance(value);
  const rgb = primary
    .slice(1)
    .match(/../g)
    .map((n) => parseInt(n, 16) / 255)
    .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const root = document.documentElement;
  root.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#000000" : primary);
  root.style.setProperty("--primary", primary);
  root.style.setProperty(
    "--accent-text",
    `color-mix(in srgb, ${primary}, ${theme === "dark" ? "#ffffff 65%" : luminance > 0.179 ? "#000000 65%" : "#000000 15%"})`,
  );
  root.style.setProperty(
    "--on-primary",
    luminance > 0.179 ? "#111111" : "#ffffff",
  );
}
export function ProfileSettings({ Modal, appearance, onClose, onSave }) {
  const [draft, setDraft] = useState(() => safeAppearance(appearance));
  useEffect(() => {
    applyAppearance(draft);
  }, [draft]);
  const close = () => {
    applyAppearance(appearance);
    onClose();
  };
  return (
    <Modal
      title="Configurações do perfil"
      subtitle="Deixe seu workspace com a sua cara."
      onClose={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft);
        }}
      >
        <div className="appearance-settings">
          <label>
            Tema
            <select
              aria-label="Tema"
              value={draft.theme}
              onChange={(e) =>
                setDraft((d) => ({ ...d, theme: e.target.value }))
              }
            >
              <option value="light">Claro</option>
              <option value="dark">Escuro · True Black</option>
            </select>
          </label>
          <label>
            Cor principal
            <div className="color-picker">
              <input
                aria-label="Cor principal"
                type="color"
                value={draft.primary}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, primary: e.target.value }))
                }
              />
              <span>{draft.primary.toUpperCase()}</span>
            </div>
          </label>
          <div className="color-presets" aria-label="Cores sugeridas">
            {["#2563eb", "#7c3aed", "#be185d", "#b45309", "#0e7490"].map(
              (color) => (
                <button
                  type="button"
                  key={color}
                  style={{ background: color }}
                  aria-label={`Usar cor ${color}`}
                  aria-pressed={draft.primary === color}
                  onClick={() => setDraft((d) => ({ ...d, primary: color }))}
                />
              ),
            )}
          </div>
          <p className="muted">
            Veja a prévia enquanto escolhe. Suas preferências ficam salvas neste
            navegador.
          </p>
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="button primary">
            Salvar aparência
          </button>
        </div>
      </form>
    </Modal>
  );
}
