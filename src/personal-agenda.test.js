import test from "node:test";
import assert from "node:assert/strict";
import {
  validatePersonalEvent,
  validatePersonalAgenda,
  personalEventOccursOn,
  personalEventUpcoming,
} from "./personal-agenda.js";
import {
  validateBackup,
  setProjectClosed,
  deleteProject,
  clearWorkspace,
} from "./domain.js";
import { workspacePreferences } from "./team-domain.js";
import { createDemo } from "../tests/fixtures/workspace.js";
const event = () => ({
  id: "travel",
  title: "Viagem",
  kind: "travel",
  date: "2026-12-30",
  endDate: "2027-01-02",
  allDay: true,
  time: "",
  endTime: "",
  tentative: true,
  place: "Município novo",
  notes: "Visita prevista",
});
test("viagem cobre todo o período e horários à meia-noite não ocupam o dia seguinte", () => {
  const trip = validatePersonalEvent(event());
  for (const day of ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"])
    assert.equal(personalEventOccursOn(trip, day), true);
  assert.equal(personalEventUpcoming(trip, "2027-01-02"), true);
  assert.equal(personalEventUpcoming(trip, "2027-01-03"), false);
  const timed = validatePersonalEvent({
    ...trip,
    allDay: false,
    time: "10:00",
    endTime: "00:00",
  });
  assert.equal(personalEventOccursOn(timed, "2027-01-02"), false);
  assert.equal(personalEventUpcoming(timed, "2027-01-02"), false);
});
test("agenda rejeita datas impossíveis, períodos invertidos, horários e registros duplicados", () => {
  for (const change of [
    { date: "2026-02-30" },
    { endDate: "2026-01-01" },
    { kind: ["travel"] },
    { allDay: false, time: "25:00" },
    { allDay: false, date: "2027-01-02", time: "12:00", endTime: "11:00" },
  ])
    assert.throws(() => validatePersonalEvent({ ...event(), ...change }));
  assert.throws(() => validatePersonalAgenda([event(), event()]), /duplicados/);
  assert.throws(() => validatePersonalAgenda({}), /agenda geral/);
});
test("agenda fica nas preferências pessoais, sobrevive ao backup e ao ciclo dos projetos, inclusive à limpeza", () => {
  const original = createDemo();
  const data = validateBackup({ ...original, personalAgenda: [event()] });
  assert.deepEqual(data.projects, validateBackup(original).projects);
  const backup = validateBackup(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(backup.personalAgenda, [event()]);
  assert.deepEqual(workspacePreferences(backup).personalAgenda, [event()]);
  assert.equal(Object.hasOwn(workspacePreferences(backup), "projects"), false);
  assert.deepEqual(
    deleteProject(
      setProjectClosed(backup, backup.projects[0].id, true),
      backup.projects[0].id,
    ).personalAgenda,
    [event()],
  );
  assert.deepEqual(clearWorkspace(backup).personalAgenda, [event()]);
  assert.deepEqual(clearWorkspace(backup).projects, []);
  assert.equal(
    Object.hasOwn(validateBackup(original), "personalAgenda"),
    false,
  );
});
