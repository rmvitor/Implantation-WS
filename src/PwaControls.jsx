import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Download, RefreshCw, WifiOff, Check } from "lucide-react";
import { registerSW } from "virtual:pwa-register";

const PwaContext = createContext(null);
export function PwaProvider({ children }) {
  const controller = usePwaController();
  return (
    <PwaContext.Provider value={controller}>{children}</PwaContext.Provider>
  );
}
export const usePwa = () => useContext(PwaContext);
function usePwaController() {
  const [installable, setInstallable] = useState(false);
  const [installed, setInstalled] = useState(
    () =>
      matchMedia("(display-mode: standalone)").matches ||
      !!navigator.standalone,
  );
  const [offline, setOffline] = useState(!navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [error, setError] = useState("");
  const prompt = useRef(null);
  const update = useRef(null);
  const registrationRef = useRef(null);
  useEffect(() => {
    const media = matchMedia("(display-mode: standalone)");
    const beforeInstall = (e) => {
      e.preventDefault();
      prompt.current = e;
      setInstallable(true);
    };
    const didInstall = () => {
      prompt.current = null;
      setInstallable(false);
      setInstalled(true);
    };
    const display = () => setInstalled(media.matches || !!navigator.standalone);
    const connection = () => setOffline(!navigator.onLine);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", didInstall);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    media.addEventListener("change", display);
    let registration;
    const check = () => {
      if (document.visibilityState === "visible" && navigator.onLine)
        registration?.update().catch(() => {});
    };
    if ("serviceWorker" in navigator) {
      update.current = registerSW({
        immediate: true,
        onNeedRefresh: () => setUpdateReady(true),
        onOfflineReady: () => setOfflineReady(true),
        onRegisteredSW: (_, r) => {
          registration = r;
          registrationRef.current = r;
          if (r?.waiting) setUpdateReady(true);
        },
        onRegisterError: () =>
          setError(
            "Não foi possível preparar o acesso offline. Abra novamente com internet para tentar de novo.",
          ),
      });
      navigator.serviceWorker.ready
        .then(() => setOfflineReady(true))
        .catch(() => {});
    }
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", didInstall);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      window.removeEventListener("online", check);
      document.removeEventListener("visibilitychange", check);
      media.removeEventListener("change", display);
    };
  }, []);
  const install = async () => {
    const event = prompt.current;
    if (!event) return false;
    prompt.current = null;
    setInstallable(false);
    try {
      await event.prompt();
      const result = await event.userChoice;
      return result.outcome === "accepted";
    } catch {
      setError("Use a opção de instalação no menu do navegador.");
      return false;
    }
  };
  const checkForUpdates = async () => {
    if (!navigator.onLine)
      throw new Error("Conecte à internet para verificar a atualização.");
    if (!("serviceWorker" in navigator))
      throw new Error(
        "Use o link de recuperação abaixo para abrir a versão atual.",
      );
    const registration =
      registrationRef.current ||
      (await navigator.serviceWorker.getRegistration());
    if (!registration)
      throw new Error(
        "A atualização ainda está sendo preparada. Tente novamente ou use o link de recuperação abaixo.",
      );
    await registration.update();
    const candidate = registration.installing;
    if (
      candidate &&
      candidate.state !== "installed" &&
      candidate.state !== "redundant"
    ) {
      await new Promise((resolve, reject) => {
        const done = () => {
          if (
            candidate.state === "installed" ||
            candidate.state === "redundant"
          ) {
            clearTimeout(timer);
            candidate.removeEventListener("statechange", done);
            resolve();
          }
        };
        const timer = setTimeout(() => {
          candidate.removeEventListener("statechange", done);
          reject(
            new Error(
              "A atualização ainda está sendo baixada. Tente novamente em instantes.",
            ),
          );
        }, 20000);
        candidate.addEventListener("statechange", done);
        done();
      });
    }
    const ready = !!registration.waiting;
    setUpdateReady(ready);
    return ready;
  };
  const refresh = async () => {
    try {
      await update.current?.(true);
    } catch {
      setError(
        "Não foi possível atualizar agora. Tente novamente com internet.",
      );
    }
  };
  return {
    installable,
    installed,
    offline,
    offlineReady,
    updateReady,
    error,
    install,
    refresh,
    checkForUpdates,
  };
}
export function PwaControls({ pwa, onInstall, editing }) {
  return (
    <div className="pwa-controls">
      <button className="subtle-nav" onClick={onInstall}>
        <Download size={17} />
        {pwa.installed ? "App instalado" : "Instalar app"}
      </button>
      {pwa.offline && (
        <span className="pwa-offline" role="status">
          <WifiOff size={14} />
          {pwa.offlineReady ? "Offline · dados locais" : "Sem conexão"}
        </span>
      )}
      {pwa.updateReady && (
        <button
          className="subtle-nav pwa-update"
          disabled={editing}
          onClick={pwa.refresh}
          title={
            editing
              ? "Feche o formulário antes de atualizar."
              : "Reabrir com a nova versão"
          }
        >
          <RefreshCw size={16} />
          {editing ? "Atualização disponível" : "Atualizar app"}
        </button>
      )}
    </div>
  );
}
export function InstallModal({ Modal, pwa, onClose }) {
  return (
    <Modal
      title={pwa.installed ? "Seu app está instalado" : "Instalar o Implanta"}
      subtitle="Acesse pelo ícone do app, no celular ou no computador."
      onClose={onClose}
    >
      <div className="install-guide">
        {pwa.installed ? (
          <p className="info-box">
            <Check size={20} />
            Você está usando o app instalado neste dispositivo.
          </p>
        ) : (
          <>
            {pwa.installable && (
              <button
                className="button primary"
                onClick={async () => {
                  if (await pwa.install()) onClose();
                }}
              >
                <Download size={17} />
                Instalar neste dispositivo
              </button>
            )}
            <p>
              Se o botão de instalação não aparecer, use o menu do navegador:
            </p>
            <ol>
              <li>
                <strong>Android · Chrome</strong>
                <span>Menu ⋮ → Instalar app ou Adicionar à tela inicial.</span>
              </li>
              <li>
                <strong>iPhone / iPad · Safari</strong>
                <span>
                  Compartilhar → Adicionar à Tela de Início. Ative “Abrir como
                  App”, quando disponível.
                </span>
              </li>
              <li>
                <strong>PC · Chrome ou Edge</strong>
                <span>
                  Clique no ícone de instalação na barra de endereço ou use a
                  opção de instalar este site no menu do navegador.
                </span>
              </li>
            </ol>
          </>
        )}
        <p className="install-offline-note">
          {pwa.offlineReady
            ? "Pronto para abrir offline neste aparelho."
            : "Abra com internet pela primeira vez para preparar o acesso offline."}
        </p>
        <p className="muted">
          No modo equipe, os dados ficam no banco online e seguem os acessos da
          sua conta. No modo local, os dados ficam neste aparelho; use Dados e
          backup para transferi-los. Atualizar o app não exige apagar os dados
          do navegador.
        </p>
        {pwa.error && <p role="status">{pwa.error}</p>}
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            Entendi
          </button>
        </div>
      </div>
    </Modal>
  );
}
