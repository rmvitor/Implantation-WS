import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@supabase/supabase-js";
import { LogIn, Users, LogOut, LoaderCircle, RefreshCw } from "lucide-react";
import { createTeamService, friendlyTeamError } from "./team-service";
import { validateConnection, resolveConnection, same } from "./team-domain";
import defaultConnection from "./team-config.json";
import { version as appVersion } from "../package.json";
import { validateBackup } from "./domain";
import { BrandLogo } from "./BrandLogo";
import "./team.css";

const CONNECTION = "implanta.team.connection.v1";
const TeamContext = createContext({ online: false });
export const useTeam = () => useContext(TeamContext);
function connection() {
  try {
    return resolveConnection({
      stored: localStorage.getItem(CONNECTION),
      environment: {
        url: import.meta.env.VITE_SUPABASE_URL,
        key: import.meta.env.VITE_SUPABASE_ANON_KEY,
        mode: import.meta.env.VITE_TEAM_MODE,
      },
      production: import.meta.env.PROD,
      defaults: defaultConnection,
    });
  } catch {
    return null;
  }
}
function ConnectForm({ onCancel }) {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className="team-form"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          localStorage.setItem(
            CONNECTION,
            JSON.stringify(validateConnection({ url, key })),
          );
          location.reload();
        } catch (err) {
          setError(err.message);
        }
      }}
    >
      <p>
        Conecte ao projeto Supabase da equipe. Todos os colegas devem usar a
        mesma conexão.
      </p>
      <p>
        Aplique primeiro o arquivo de estrutura do banco e configure o primeiro
        administrador conforme o{" "}
        <a
          href="https://github.com/rmvitor/Implantation-WS/blob/main/supabase/README.md"
          target="_blank"
          rel="noreferrer"
        >
          guia de ativação
        </a>
        .
      </p>
      <label>
        URL do Supabase
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://seu-projeto.supabase.co"
        />
      </label>
      <label>
        Chave publicável / anon
        <input
          required
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoComplete="off"
          placeholder="sb_publishable_…"
        />
      </label>
      {error && (
        <p role="alert" className="team-error">
          {error}
        </p>
      )}
      <div className="team-actions">
        <button type="button" className="button secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button className="button primary">Conectar equipe</button>
      </div>
    </form>
  );
}

export function TeamHost({ children }) {
  const [config] = useState(connection);
  const client = useMemo(
    () =>
      config
        ? createClient(config.url, config.key, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true,
              flowType: "pkce",
            },
          })
        : null,
    [config],
  );
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(!!client);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const editing = useRef(false);
  const refreshRef = useRef();
  const service = useMemo(
    () =>
      client && session
        ? createTeamService(client, () => refreshRef.current?.())
        : null,
    [client, session?.user.id],
  );
  useEffect(() => {
    if (!client) return;
    let active = true;
    client.auth.getSession().then(({ data, error: e }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
      if (e)
        setError("Não foi possível recuperar sua sessão. Entre novamente.");
    });
    const { data } = client.auth.onAuthStateChange((event, value) => {
      setSession(value);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (!value) {
        setProfile(null);
        setWorkspace(null);
        setPermissions([]);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);
  useEffect(() => {
    if (!service) return;
    let active = true,
      refreshing = false;
    const refresh = async () => {
      if (!active || refreshing || service.committing) return;
      refreshing = true;
      try {
        const access = await client.rpc("implanta_access");
        if (access.error) throw access.error;
        if (!access.data)
          throw new Error(
            "A estrutura do banco ainda precisa ser aplicada. Consulte o guia de ativação.",
          );
        if (!active) return;
        setProfile(access.data);
        if (!access.data.active) {
          setWorkspace(null);
          return;
        }
        const result = await service.read();
        if (!active) return;
        setPermissions(result.access);
        const removed = service.snapshot.projects.some(
          (p) => !result.rows.some((r) => r.id === p.id),
        );
        const changed = !same(
          validateBackup({
            ...result.preferences,
            version: 2,
            projects: result.rows.map((r) => r.data),
          }),
          service.snapshot,
        );
        if (editing.current && !removed) setStale(changed);
        else {
          setWorkspace(service.apply(result));
          setStale(false);
        }
        setError("");
      } catch (e) {
        if (active) setError(friendlyTeamError(e));
      } finally {
        refreshing = false;
        if (active) setLoading(false);
      }
    };
    setLoading(true);
    refreshRef.current = refresh;
    refresh();
    const unsubscribe = service.subscribe(session.user.id);
    const timer = setInterval(() => {
      if (navigator.onLine && document.visibilityState === "visible") refresh();
    }, 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      active = false;
      unsubscribe();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [service]);
  const team = {
    online: !!client,
    client,
    profile,
    workspace,
    stale,
    error,
    canEdit: (id) =>
      !client ||
      !!profile?.admin ||
      permissions.some((p) => p.project_id === id && p.role === "editor"),
    setEditing(value) {
      editing.current = value;
      if (!value && stale) refreshRef.current?.();
    },
    async commit(base, next) {
      const result = await service.commit(base, next);
      setWorkspace(result);
      setPermissions(service.access);
      setStale(false);
      setError(service.warning);
      return result;
    },
    refresh: () => refreshRef.current?.(),
    async signOut() {
      const { error: e } = await client.auth.signOut({ scope: "local" });
      if (e) throw e;
      setProfile(null);
      setWorkspace(null);
      setPermissions([]);
    },
  };
  if (
    client &&
    (loading || !session || !profile?.active || !workspace || recovery)
  )
    return (
      <AuthScreen
        client={client}
        session={session}
        profile={profile}
        error={error}
        loading={loading}
        recovery={recovery}
        onRecovered={() => setRecovery(false)}
        onRetry={() => refreshRef.current?.()}
      />
    );
  return (
    <TeamContext.Provider value={team}>
      {React.cloneElement(children, { key: session?.user.id || "local" })}
    </TeamContext.Provider>
  );
}

function LocalBackup() {
  const [backup] = useState(() => {
    try {
      const data = validateBackup(
        JSON.parse(localStorage.getItem("implanta.workspace.v1")),
      );
      return data.projects.length ? data : null;
    } catch {
      return null;
    }
  });
  if (!backup) return null;
  return (
    <div className="team-note">
      <p>
        Já usava este aparelho? Exporte seus dados locais e importe-os depois de
        liberar sua conta de administrador.
      </p>
      <button
        className="button secondary"
        onClick={() => {
          const url = URL.createObjectURL(
            new Blob([JSON.stringify(backup, null, 2)], {
              type: "application/json",
            }),
          );
          const link = document.createElement("a");
          link.href = url;
          link.download = "implanta-dados-locais.json";
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        Exportar dados deste aparelho
      </button>
    </div>
  );
}

function AuthScreen({
  client,
  session,
  profile,
  error,
  loading,
  recovery,
  onRecovered,
  onRetry,
}) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [setup, setSetup] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setFailure("");
    try {
      const redirectTo = new URL(import.meta.env.BASE_URL, location.href).href;
      const result = recovery
        ? await client.auth.updateUser({ password })
        : mode === "signup"
          ? await client.auth.signUp({
              email,
              password,
              options: {
                data: { display_name: name.trim() },
                emailRedirectTo: redirectTo,
              },
            })
          : mode === "reset"
            ? await client.auth.resetPasswordForEmail(email, { redirectTo })
            : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (recovery) {
        await client.auth.signOut();
        onRecovered();
        setPassword("");
        setMessage("Senha atualizada. Entre novamente.");
      } else if (mode === "signup")
        setMessage(
          "Cadastro solicitado. Confirme seu e-mail, quando solicitado, e aguarde a liberação do administrador.",
        );
      else if (mode === "reset")
        setMessage(
          "Se existir uma conta para esse e-mail, você receberá as instruções de recuperação.",
        );
    } catch (err) {
      setFailure(
        mode === "login" && !recovery
          ? "Não foi possível entrar. Confira e-mail e senha ou tente novamente."
          : "Não foi possível concluir a solicitação. Confira os dados e tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-page">
      <section className="auth-box">
        <a className="auth-brand" href="#">
          <BrandLogo />
        </a>
        <h1>
          {setup
            ? "Conectar sua equipe"
            : loading
              ? "Carregando sua equipe"
              : recovery
                ? "Definir nova senha"
                : session
                  ? "Seu acesso à equipe"
                  : mode === "signup"
                    ? "Criar sua conta"
                    : mode === "reset"
                      ? "Recuperar senha"
                      : "Entrar na equipe"}
        </h1>
        {setup ? (
          <ConnectForm onCancel={() => setSetup(false)} />
        ) : loading ? (
          <p>
            <LoaderCircle className="spin" size={20} /> Conferindo sessão e
            permissões…
          </p>
        ) : session && !recovery ? (
          <div className="team-form">
            <p>
              {profile && !profile.active
                ? "Seu cadastro aguarda liberação por um administrador. Você verá os projetos que forem liberados para sua conta."
                : "Não foi possível carregar o espaço da equipe."}
            </p>
            {error && (
              <>
                <p className="team-error" role="alert">
                  {error}
                </p>
                <a
                  href="https://github.com/rmvitor/Implantation-WS/blob/main/supabase/README.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir guia de ativação do banco
                </a>
              </>
            )}
            <button className="button primary" onClick={onRetry}>
              <RefreshCw size={16} /> Verificar acesso
            </button>
            <button
              className="button secondary"
              onClick={() => client.auth.signOut()}
            >
              Sair da conta
            </button>
          </div>
        ) : (
          <form className="team-form" onSubmit={submit}>
            {!recovery && (
              <label>
                E-mail
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            )}
            {mode === "signup" && !recovery && (
              <label>
                Seu nome
                <input
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </label>
            )}
            {(mode !== "reset" || recovery) && (
              <label>
                {recovery ? "Nova senha" : "Senha"}
                <input
                  type="password"
                  required
                  minLength={mode === "signup" || recovery ? 10 : undefined}
                  autoComplete={
                    mode === "signup" || recovery
                      ? "new-password"
                      : "current-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            {failure && (
              <p role="alert" className="team-error">
                {failure}
              </p>
            )}
            {message && (
              <p role="status" className="team-message">
                {message}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              <LogIn size={17} />
              {busy
                ? "Aguarde…"
                : recovery
                  ? "Salvar nova senha"
                  : mode === "signup"
                    ? "Solicitar cadastro"
                    : mode === "reset"
                      ? "Enviar recuperação"
                      : "Entrar"}
            </button>
            {!recovery && (
              <div className="auth-options">
                {mode !== "login" && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setFailure("");
                    }}
                  >
                    Já tenho uma conta
                  </button>
                )}
                {mode === "login" && (
                  <>
                    <button type="button" onClick={() => setMode("signup")}>
                      Criar conta
                    </button>
                    <button type="button" onClick={() => setMode("reset")}>
                      Esqueci minha senha
                    </button>
                  </>
                )}
              </div>
            )}
          </form>
        )}
        <button className="auth-connection" onClick={() => setSetup(!setup)}>
          Configurar conexão da equipe
        </button>
        <LocalBackup />
        <footer className="auth-version">Implanta · v{appVersion}</footer>
      </section>
    </main>
  );
}

export function TeamSettings({ Modal, onClose, projects, activeProjectId }) {
  const team = useTeam();
  const [users, setUsers] = useState([]);
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState(
    activeProjectId || projects[0]?.id || "",
  );
  const [section, setSection] = useState("users");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    if (!team.profile?.admin) return;
    const [list, access] = await Promise.all([
      team.client.rpc("implanta_admin_users"),
      team.client.from("implanta_members").select("project_id,user_id,role"),
    ]);
    if (list.error || access.error) throw list.error || access.error;
    setUsers(list.data);
    setMembers(access.data);
  };
  const act = async (fn) => {
    setBusy(true);
    setError("");
    try {
      const result = await fn();
      if (result?.error) throw result.error;
      if (fn !== team.signOut) {
        await load();
        team.refresh();
      }
    } catch (err) {
      setError(friendlyTeamError(err));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (team.profile?.admin) act(async () => {});
  }, []);
  return (
    <Modal
      title={team.online ? "Equipe e acessos" : "Trabalho em equipe"}
      subtitle={
        team.online
          ? `${team.profile.name} · ${team.profile.admin ? "Administrador" : "Colaborador"}`
          : "Login, banco online e projetos compartilhados."
      }
      onClose={onClose}
      wide
    >
      {!team.online ? (
        <ConnectForm onCancel={onClose} />
      ) : (
        <>
          <div className="team-account">
            <Users size={20} />
            <div>
              <strong>{team.profile.email}</strong>
              <p>Conectado ao banco da equipe.</p>
            </div>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => act(team.signOut)}
            >
              <LogOut size={16} /> Sair
            </button>
          </div>
          {!team.profile.admin && (
            <p className="team-note">
              O administrador libera usuários e define quais projetos cada
              colega pode visualizar ou editar.
            </p>
          )}
          {error && (
            <p role="alert" className="team-error">
              {error}
            </p>
          )}
          {team.profile.admin && (
            <fieldset disabled={busy} className="team-management">
              <div
                className="team-management-tabs"
                role="tablist"
                aria-label="Gerenciamento da equipe"
                onKeyDown={(event) => {
                  if (
                    busy ||
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  )
                    return;
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? "users"
                      : event.key === "End"
                        ? "access"
                        : section === "users"
                          ? "access"
                          : "users";
                  setSection(next);
                  document
                    .getElementById(
                      next === "users" ? "team-users-tab" : "team-access-tab",
                    )
                    ?.focus();
                }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={section === "users"}
                  tabIndex={section === "users" ? 0 : -1}
                  aria-controls="team-users-panel"
                  id="team-users-tab"
                  onClick={() => setSection("users")}
                >
                  Usuários <span>{users.length}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={section === "access"}
                  tabIndex={section === "access" ? 0 : -1}
                  aria-controls="team-access-panel"
                  id="team-access-tab"
                  onClick={() => setSection("access")}
                >
                  Acessos por projeto
                </button>
              </div>
              <section
                role="tabpanel"
                aria-labelledby="team-users-tab"
                id="team-users-panel"
                hidden={section !== "users"}
              >
                <p>
                  Novos cadastros aguardam sua aprovação. Administradores têm
                  acesso a todos os projetos.
                </p>
                {users.map((user) => (
                  <UserAccess
                    key={user.id}
                    user={user}
                    self={user.id === team.profile.id}
                    onSave={(draft) =>
                      act(() =>
                        team.client.rpc("implanta_set_user", {
                          p_user: user.id,
                          p_name: draft.name,
                          p_active: draft.active,
                          p_admin: draft.admin,
                        }),
                      )
                    }
                  />
                ))}
                {!users.length && <p>Carregando usuários…</p>}
              </section>
              <section
                role="tabpanel"
                aria-labelledby="team-access-tab"
                id="team-access-panel"
                hidden={section !== "access"}
              >
                <label className="team-project-select">
                  Projeto
                  <select
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    <option value="">Selecione um projeto</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                {selected &&
                  users
                    .filter((user) => !user.admin)
                    .map((user) => (
                      <div className="team-project-member" key={user.id}>
                        <div>
                          <strong>{user.name}</strong>
                          <small>
                            {user.email}
                            {!user.active && " · cadastro pendente/inativo"}
                          </small>
                        </div>
                        <select
                          aria-label={`Acesso de ${user.name}`}
                          value={
                            members.find(
                              (m) =>
                                m.project_id === selected &&
                                m.user_id === user.id,
                            )?.role || ""
                          }
                          onChange={(e) =>
                            act(() =>
                              team.client.rpc("implanta_grant_project", {
                                p_project: selected,
                                p_user: user.id,
                                p_role: e.target.value || null,
                              }),
                            )
                          }
                        >
                          <option value="">Sem acesso</option>
                          <option value="viewer">Leitura</option>
                          <option value="editor">Edição</option>
                        </select>
                      </div>
                    ))}
                {!projects.length && (
                  <p>Crie um município para liberar o acesso aos colegas.</p>
                )}
              </section>
            </fieldset>
          )}
        </>
      )}
    </Modal>
  );
}
function UserAccess({ user, self, onSave }) {
  const [draft, setDraft] = useState(user);
  useEffect(() => setDraft(user), [user]);
  return (
    <form
      className="team-user"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <div className="team-user-identity">
        <label>
          Nome
          <input
            required
            aria-label={`Nome de ${user.email}`}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <small>{user.email}</small>
      </div>
      <div className="team-user-permissions">
        <label className="team-checkbox">
          <input
            type="checkbox"
            disabled={self}
            checked={draft.active}
            onChange={(e) =>
              setDraft({
                ...draft,
                active: e.target.checked,
                admin: e.target.checked ? draft.admin : false,
              })
            }
          />{" "}
          Acesso ativo
        </label>
        <label className="team-checkbox">
          <input
            type="checkbox"
            disabled={self}
            checked={draft.admin}
            onChange={(e) =>
              setDraft({
                ...draft,
                admin: e.target.checked,
                active: e.target.checked || draft.active,
              })
            }
          />{" "}
          Administrador
        </label>
      </div>
      <button
        className="button secondary"
        aria-label={`Salvar usuário ${user.name}`}
      >
        Salvar
      </button>
    </form>
  );
}
