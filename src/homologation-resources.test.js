import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HOMOLOGATION_FILE_LIMIT,
  validateHomologationFile,
} from "./homologation-resources.js";
test("anexo aceita o limite de 15 MB e recusa excesso/vazio antes de transmitir", () => {
  assert.equal(
    validateHomologationFile({
      name: "saldos.pdf",
      size: HOMOLOGATION_FILE_LIMIT,
    }).size,
    HOMOLOGATION_FILE_LIMIT,
  );
  assert.throws(
    () =>
      validateHomologationFile({
        name: "grande.pdf",
        size: HOMOLOGATION_FILE_LIMIT + 1,
      }),
    /15 MB/,
  );
  assert.throws(
    () => validateHomologationFile({ name: "vazio.pdf", size: 0 }),
    /não vazio/,
  );
  assert.throws(
    () => validateHomologationFile({ name: "x".repeat(256), size: 1 }),
    /255/,
  );
});
