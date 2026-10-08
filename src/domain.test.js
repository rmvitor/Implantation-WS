import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, moveTask, checklistProgress, matchesTask, validateBackup } from './domain.js';

test('movimentação permite etapas em paralelo e mantém histórico de conclusão e reabertura', () => {
  const initial = createDemo().projects[0];
  const task = initial.tasks[0];
  const completed = moveTask(initial, task.id, 'concluido', '2026-10-08T12:00:00.000Z');
  assert.equal(completed.tasks[0].stage, 'concluido');
  assert.equal(completed.tasks[0].completedAt, '2026-10-08T12:00:00.000Z');
  assert.equal(completed.logs[0].action, 'concluída');
  assert.equal(initial.tasks[0].stage, 'homologacao');
  const reopened = moveTask(completed, task.id, 'pendencia');
  assert.equal(reopened.tasks[0].completedAt, null);
  assert.equal(reopened.logs.length, initial.logs.length + 2);
  assert.equal(moveTask(reopened, task.id, 'pendencia'), reopened);
  assert.equal(moveTask(reopened, task.id, 'invalid'), reopened);
});

test('progresso considera os checklists de todas as entidades', () => {
  const task = createDemo().projects[0].tasks[0];
  assert.deepEqual(checklistProgress(task), { done: 1, total: 6 });
  assert.deepEqual(checklistProgress({}), { done: 0, total: 0 });
});

test('busca encontra módulos, entidades e chamados sem depender de acentos', () => {
  const tasks = createDemo().projects[0].tasks;
  assert.equal(matchesTask(tasks[2], 'patrimonio', '', ''), true);
  assert.equal(matchesTask(tasks[0], 'saude', '', ''), true);
  assert.equal(matchesTask(tasks[8], '872797', 'Patrimônio', 'alta'), true);
  assert.equal(matchesTask(tasks[8], '', 'Frotas', ''), false);
});

test('backup válido preserva dados e rejeita estrutura incompatível', () => {
  const backup = createDemo();
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(backup))), backup);
  assert.throws(() => validateBackup({ projects: [] }));
  const invalid = structuredClone(backup);
  invalid.projects[0].tasks[0].checklists = null;
  assert.throws(() => validateBackup(invalid));
  const duplicate = structuredClone(backup);
  duplicate.projects.push(duplicate.projects[0]);
  assert.throws(() => validateBackup(duplicate));
});
