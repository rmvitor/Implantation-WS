import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appointmentEnd,
  appointmentOccursOn,
  appointmentHasUpcomingDays,
  appointmentDuration,
  appointmentRange,
  appointmentLabel,
  validateAppointment,
} from "./appointments.js";
import { validateBackup } from "./domain.js";
import { createDemo } from "../tests/fixtures/workspace.js";

const support = () => ({
  id: "room",
  title: "Sala de Suprimentos",
  type: "atendimento",
  date: "2026-10-08",
  time: "09:00",
  endDate: "2026-10-11",
  endTime: "18:00",
  status: "Agendado",
  meetingUrl: "https://teams.microsoft.com/l/meetup-join/teste",
  entity: "Prefeitura",
  owner: "Colega",
  notes: "",
});
test("sala atravessa vários dias, inclui o dia intermediário e deixa de aparecer ao acabar", () => {
  const event = support();
  assert.equal(appointmentOccursOn(event, "2026-10-07"), false);
  for (const date of ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"])
    assert.equal(appointmentOccursOn(event, date), true);
  assert.equal(appointmentOccursOn(event, "2026-10-12"), false);
  assert.equal(appointmentHasUpcomingDays(event, "2026-10-09"), true);
  assert.equal(
    appointmentHasUpcomingDays({ ...event, status: "Realizado" }, "2026-10-09"),
    false,
  );
  assert.equal(appointmentDuration(event), "3d 9h");
  assert.equal(
    appointmentRange(event),
    "08/10/2026 · 09:00 → 11/10/2026 · 18:00",
  );
});
test("término à meia-noite não ocupa o dia seguinte e validação bloqueia períodos invertidos e datas impossíveis", () => {
  const event = { ...support(), endDate: "2026-10-10", endTime: "00:00" };
  assert.equal(appointmentOccursOn(event, "2026-10-09"), true);
  assert.equal(appointmentOccursOn(event, "2026-10-10"), false);
  for (const invalid of [
    { ...event, endDate: event.date, endTime: event.time },
    { ...event, endDate: "2026-10-07" },
    { ...event, date: "2026-02-29" },
    { ...event, endTime: "24:00" },
    { ...event, endTime: "" },
  ])
    assert.throws(() => validateAppointment(invalid, true));
});
test("treinamentos antigos mantêm dados e notas; duração reconhecida permite editar atravessando meses e anos", () => {
  const legacy = {
    id: "old",
    title: "Treinamento anterior",
    date: "2026-12-31",
    time: "23:30",
    duration: "1h 30min",
    status: "Agendado",
    notes: "Link recebido anteriormente",
  };
  assert.deepEqual(appointmentEnd(legacy), {
    endDate: "2027-01-01",
    endTime: "01:00",
  });
  assert.equal(appointmentLabel(legacy), "Treinamento");
  const demo = createDemo();
  demo.projects[0].trainings = [legacy];
  assert.deepEqual(validateBackup(demo).projects[0].trainings[0], legacy);
  assert.deepEqual(appointmentEnd({ ...legacy, duration: "Manhã inteira" }), {
    endDate: legacy.date,
    endTime: "",
  });
});
test("backup conserva tipo, período e link; importação rejeita período inválido e links executáveis", () => {
  const demo = createDemo();
  demo.projects[0].trainings = [support()];
  assert.deepEqual(
    validateBackup(JSON.parse(JSON.stringify(demo))).projects[0].trainings[0],
    support(),
  );
  demo.projects[0].trainings[0].endDate = "2026-10-01";
  assert.throws(() => validateBackup(demo), /posterior/);
  assert.throws(
    () =>
      validateAppointment(
        { ...support(), meetingUrl: "javascript:alert(1)" },
        true,
      ),
    /HTTP/,
  );
  assert.throws(
    () => validateAppointment({ ...support(), type: "outro" }, true),
    /Tipo/,
  );
});
