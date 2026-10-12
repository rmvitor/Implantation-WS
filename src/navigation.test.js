import test from "node:test";
import assert from "node:assert/strict";
import { NAVIGATION_KEY, availableRoute, createNavigation, screenRoute } from "./navigation.js";

function browserHistory() {
  const entries = [{ external: true }], pending = [];
  let position = 0, listener, serial = 0;
  const browser = {
    crypto: { randomUUID: () => `test-${++serial}` },
    addEventListener: (_, fn) => { listener = fn; },
    removeEventListener: () => { listener = null; },
    history: {
      get state() { return entries[position]; },
      replaceState(state) { entries[position] = structuredClone(state); },
      pushState(state) { entries.splice(++position); entries.push(structuredClone(state)); },
      go(delta) {
        const target = position + delta;
        if (target < 0 || target >= entries.length) return;
        position = target;
        pending.push(() => listener?.({ state: entries[position] }));
      },
    },
    flush() {
      for (let count = 0; pending.length; count++) {
        assert.ok(count < 50, "Back must not enter a history loop");
        pending.shift()();
      }
    },
    entries,
    get position() { return position; },
  };
  return browser;
}
function setup() {
  const browser = browserHistory();
  const nav = createNavigation(browser, "user-a");
  const restored = [];
  nav.restore = (route) => { restored.push(route); nav.renderedRoute = route; };
  nav.resolve = (route) => availableRoute(route, [{ id: "a" }, { id: "b" }]);
  nav.start();
  const navigate = (view, id = "a") => { nav.renderedRoute = screenRoute(view, id); nav.syncRoute(); };
  const back = (delta = -1) => { browser.history.go(delta); browser.flush(); };
  return { browser, nav, restored, navigate, back };
}

test("Back percorre áreas e projetos; Forward restaura telas sem chamar operações de dados", () => {
  const { nav, navigate, back, restored } = setup();
  navigate("board"); navigate("agenda"); navigate("agenda", "b");
  back(); assert.deepEqual(restored.at(-1), screenRoute("agenda", "a"));
  back(); assert.deepEqual(restored.at(-1), screenRoute("board", "a"));
  back(1); assert.deepEqual(restored.at(-1), screenRoute("agenda", "a"));
  nav.stop();
});
test("Back fecha janela na tela inicial sem consumir outra etapa; salvamento/cancelamento não deixam telas duplicadas", () => {
  const { browser, nav, navigate, back, restored } = setup();
  let closed = 0;
  nav.addLayer(() => { closed++; });
  back(); assert.equal(closed, 1); assert.equal(browser.position, 0);
  navigate("board");
  for (let i = 0; i < 100; i++) { const id = nav.addLayer(() => {}); nav.removeLayer(id); }
  assert.equal(browser.entries.length, 3, "Repeated dialogs must reuse a dismissed slot");
  back(); assert.deepEqual(restored.at(-1), screenRoute("municipalities"));
  assert.equal(browser.position, 0);
});
test("camadas aninhadas fecham em ordem, inclusive após fechamento manual e saltos de histórico", () => {
  const { nav, navigate, back } = setup();
  navigate("board");
  const closed = [];
  nav.addLayer(() => { closed.push("sidebar"); });
  const picker = nav.addLayer(() => { closed.push("picker"); });
  nav.removeLayer(picker);
  back(); assert.deepEqual(closed, ["sidebar"]);
  nav.addLayer(() => { closed.push("dialog"); });
  nav.addLayer(() => { closed.push("confirm"); });
  back(-2); assert.deepEqual(closed, ["sidebar", "confirm", "dialog"]);
});
test("salvamento e troca de senha bloqueiam Back, preservam a posição e liberam retorno ao terminar", () => {
  const { browser, nav, navigate, back } = setup();
  navigate("board");
  let busy = true, closed = 0;
  nav.addLayer(() => { if (busy) return false; closed++; });
  const position = browser.position;
  back(); assert.equal(browser.position, position); assert.equal(closed, 0);
  busy = false;
  nav.blocked = () => true;
  back(); assert.equal(browser.position, position); assert.equal(closed, 0);
  nav.blocked = () => false;
  back(); assert.equal(closed, 1); assert.equal(browser.position, position - 1);
});
test("histórico não reconstrói diálogos encerrados e descarta projetos removidos ou outra conta", () => {
  const { browser, nav, navigate, back, restored } = setup();
  navigate("board", "b");
  nav.addLayer(() => {}); back(); back(1);
  assert.equal(browser.history.state[NAVIGATION_KEY].kind, "screen");
  nav.resolve = (route) => availableRoute(route, []);
  back(); assert.deepEqual(restored.at(-1), screenRoute("municipalities"));
  nav.stop();
  const other = createNavigation(browser, "user-b");
  other.start();
  assert.equal(browser.history.state[NAVIGATION_KEY].scope, "user-b");
  assert.deepEqual(browser.history.state[NAVIGATION_KEY].route, screenRoute("municipalities"));
});
