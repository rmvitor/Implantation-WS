export const STAGES = [
  { id: 'homologacao', label: 'Homologação', color: '#9184c8' },
  { id: 'agenda', label: 'Agenda', color: '#6c9fcb' },
  { id: 'pendencia', label: 'Pendências', color: '#dcab58' },
  { id: 'chamado', label: 'Chamados', color: '#db867d' },
  { id: 'concluido', label: 'Concluídos', color: '#70a08a' },
];
export const MODULES = ['Frotas', 'Almoxarifado', 'Patrimônio', 'Compras e contratos', 'Licitações', 'Geral'];
export const uid = () => globalThis.crypto.randomUUID();
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const nextDate = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return localDate(d); };
export function checklistProgress(task) {
  const items = (task.checklists || []).flatMap(c => c.items);
  return { done: items.filter(i => i.done).length, total: items.length };
}
export function moveTask(project, taskId, stage, now = new Date().toISOString()) {
  const task = project.tasks.find(t => t.id === taskId);
  if (!task || task.stage === stage || !STAGES.some(s => s.id === stage)) return project;
  const action = stage === 'concluido' ? 'concluída' : `movida para ${STAGES.find(s => s.id === stage).label}`;
  return { ...project, tasks: project.tasks.map(t => t.id === taskId ? { ...t, stage, completedAt: stage === 'concluido' ? now : null } : t), logs: [{ id: uid(), taskId, title: task.title, action, at: now }, ...project.logs] };
}
export function matchesTask(task, query, module, priority) {
  const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return (!query || normalize([task.title, task.module, task.ticket, task.owner, ...(task.checklists || []).map(c => c.entity)].join(' ')).includes(normalize(query))) && (!module || task.module === module) && (!priority || task.priority === priority);
}
const list = (entity, completed = 0) => ({ entity, items: ['Validar cadastros e dados migrados', 'Executar rotina com o responsável', 'Confirmar aceite da entidade'].map((text, i) => ({ id: uid(), text, done: i < completed })) });
const task = (title, module, stage, extra = {}) => ({ id: uid(), title, module, stage, owner: 'Você', priority: 'normal', date: '', time: '', description: '', ticket: '', checklists: [], ...extra });
export function createDemo() {
  return { version: 1, selectedId: 'quatro-barras', projects: [{
    id: 'quatro-barras', name: 'Quatro Barras', state: 'PR', dream: '1042', fiscal: '', cpf: '', fiscalEmail: '', contact: '', contactEmail: '', entities: ['Prefeitura', 'Fundo de Saúde', 'Câmara Municipal'], demo: true,
    tasks: [
      task('Homologação de Frotas', 'Frotas', 'homologacao', { date: nextDate(2), checklists: [list('Prefeitura', 1), list('Fundo de Saúde')] }),
      task('Homologação do Almoxarifado', 'Almoxarifado', 'homologacao', { checklists: [list('Prefeitura'), list('Fundo de Saúde')] }),
      task('Validar os bens patrimoniais', 'Patrimônio', 'homologacao', { checklists: [list('Prefeitura', 2)] }),
      task('Revisar compras e contratos', 'Compras e contratos', 'homologacao', { checklists: [list('Prefeitura', 3)], priority: 'baixa' }),
      task('Validar migração com a equipe', 'Patrimônio', 'agenda', { date: localDate(), time: '14:00', description: 'Reunião para conferir os dados migrados com a equipe do município.' }),
      task('Acompanhar processo licitatório', 'Licitações', 'agenda', { date: nextDate(1), time: '10:00' }),
      task('Relatório de autorização em duas vias', 'Compras e contratos', 'pendencia', { priority: 'alta', date: nextDate(1), description: 'Ajustar a impressão para que as duas vias fiquem na mesma página.' }),
      task('Conferir entrada com a mesma NF', 'Almoxarifado', 'pendencia', { checklists: [list('Prefeitura', 1)] }),
      task('Bens não baixados e depreciações incorretas', 'Patrimônio', 'chamado', { ticket: '872797', priority: 'alta', ticketStatus: 'Em análise', description: 'Aguardando análise da fábrica sobre os bens migrados.' }),
      task('PE 36/2026 · maior desconto', 'Licitações', 'chamado', { ticket: '871884', ticketStatus: 'Em desenvolvimento' }),
      task('Migração de CATMAT e CATSER', 'Compras e contratos', 'chamado', { ticket: '871886', ticketStatus: 'Aguardando retorno' }),
      task('Roteiro de solicitação e requisição', 'Almoxarifado', 'concluido', { completedAt: new Date().toISOString() }),
      task('Criação dos centros de compras', 'Compras e contratos', 'concluido', { completedAt: new Date().toISOString() }),
    ],
    trainings: [ { id: uid(), title: 'Compras e contratos', entity: 'Prefeitura', date: nextDate(1), time: '09:00', duration: '2h', owner: 'Você', status: 'Agendado', notes: '' }, { id: uid(), title: 'Gestão de patrimônio', entity: 'Prefeitura', date: nextDate(3), time: '14:00', duration: '2h', owner: 'Você', status: 'Agendado', notes: '' } ],
    logs: [{ id: uid(), title: 'Criação dos centros de compras', action: 'concluída', at: new Date().toISOString() }, { id: uid(), title: 'Roteiro de solicitação e requisição', action: 'concluída', at: new Date().toISOString() }],
  }] };
}
export function validateBackup(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.projects) || !value.projects.length) throw new Error('Selecione um backup do Implanta.');
  const ids = new Set();
  for (const p of value.projects) {
    if (typeof p.id !== 'string' || ids.has(p.id) || typeof p.name !== 'string' || !Array.isArray(p.entities) || !p.entities.every(e => typeof e === 'string') || !Array.isArray(p.tasks) || !Array.isArray(p.trainings) || !Array.isArray(p.logs)) throw new Error('Backup inválido: dados do município incompletos.');
    ids.add(p.id);
    for (const t of p.tasks) {
      if (typeof t.id !== 'string' || typeof t.title !== 'string' || typeof t.module !== 'string' || typeof t.date !== 'string' || typeof t.time !== 'string' || typeof t.owner !== 'string' || !STAGES.some(s => s.id === t.stage) || !Array.isArray(t.checklists) || !t.checklists.every(c => typeof c.entity === 'string' && Array.isArray(c.items) && c.items.every(i => typeof i.id === 'string' && typeof i.text === 'string' && typeof i.done === 'boolean'))) throw new Error('Backup inválido: atividades incompletas.');
    }
    if (!p.trainings.every(t => typeof t.id === 'string' && typeof t.title === 'string' && typeof t.date === 'string' && typeof t.time === 'string' && typeof t.status === 'string') || !p.logs.every(l => typeof l.id === 'string' && typeof l.title === 'string' && typeof l.action === 'string' && typeof l.at === 'string' && !Number.isNaN(Date.parse(l.at)))) throw new Error('Backup inválido: agenda ou histórico incompleto.');
  }
  return { ...value, selectedId: ids.has(value.selectedId) ? value.selectedId : value.projects[0].id };
}
