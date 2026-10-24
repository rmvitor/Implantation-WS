// A single queue per open project. Keep the latest draft of each point while
// serializing commits; only the database receipt removes a draft from the queue.
export function createAcceptanceQueue({ save, onState = () => {} }) {
  const tasks = new Map();
  let running = false,
    failed = false,
    closed = false,
    serial = 0,
    timer;
  const state = () => ({
    running,
    failed,
    pending: tasks.size,
    keys: [...tasks.keys()],
  });
  const notify = () => {
    if (!closed) onState(state());
  };
  async function drain() {
    clearTimeout(timer);
    if (running || failed || closed) return;
    running = true;
    notify();
    try {
      while (tasks.size && !failed && !closed) {
        const [key, task] =
          [...tasks].find(([, t]) => t.readyAt <= Date.now()) || [];
        if (!task) break;
        let ok = false;
        try {
          ok = await save(task.action);
        } catch {
          ok = false;
        }
        if (!ok) {
          failed = true;
          break;
        }
        if (tasks.get(key)?.version === task.version) tasks.delete(key);
        notify();
      }
    } finally {
      running = false;
      notify();
      if (tasks.size && !failed && !closed)
        timer = setTimeout(
          drain,
          Math.max(
            0,
            Math.min(...[...tasks.values()].map((t) => t.readyAt)) - Date.now(),
          ),
        );
    }
  }
  return {
    enqueue(key, action, { delay = 0 } = {}) {
      tasks.set(key, {
        action,
        version: ++serial,
        readyAt: Date.now() + delay,
      });
      notify();
      if (!running && !failed) {
        clearTimeout(timer);
        timer = setTimeout(drain, delay);
      }
    },
    flush(key) {
      const task = tasks.get(key);
      if (task) task.readyAt = 0;
      if (!running && !failed) {
        clearTimeout(timer);
        timer = setTimeout(drain, 0);
      }
    },
    retry() {
      failed = false;
      for (const task of tasks.values()) task.readyAt = 0;
      notify();
      drain();
    },
    discard() {
      if (running) return false;
      clearTimeout(timer);
      tasks.clear();
      failed = false;
      notify();
      return true;
    },
    get state() {
      return state();
    },
    dispose() {
      closed = true;
      clearTimeout(timer);
      tasks.clear();
    },
  };
}
