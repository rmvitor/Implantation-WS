// Assignment is an account identity. Names remain labels, never identifiers.
export const isMyActivity = (task, actor) =>
  !!actor?.id && task.ownerId === actor.id;

export function assignActivity(task, person) {
  if (!person?.id || !person.name?.trim())
    throw new Error(
      "Selecione um responsável com permissão de edição no projeto.",
    );
  return { ...task, ownerId: person.id, owner: person.name };
}
