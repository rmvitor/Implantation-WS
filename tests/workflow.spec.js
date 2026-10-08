import { test, expect } from '@playwright/test';

test('quadro permite editar checklists, concluir e recuperar os dados salvos', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Quatro Barras', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Homologação de Frotas/ }).click();
  await page.getByRole('checkbox').nth(1).check();
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('button', { name: /Homologação de Frotas/ })).toContainText('2/6');
  await page.getByRole('button', { name: 'Nova atividade', exact: true }).click();
  await page.getByLabel('Título da atividade').fill('Validar fluxo de requisição');
  await page.getByLabel('Etapa', { exact: true }).selectOption('chamado');
  await page.getByLabel('Número do chamado').fill('123456');
  await page.getByRole('button', { name: 'Criar atividade' }).click();
  const card = page.getByRole('button', { name: /Validar fluxo de requisição/ });
  await expect(card).toBeVisible();
  await card.click();
  await page.getByLabel('Etapa', { exact: true }).selectOption('concluido');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.locator('#column-concluido')).toContainText('Validar fluxo de requisição');
  await page.reload();
  await expect(page.locator('#column-concluido')).toContainText('Validar fluxo de requisição');
  await page.locator('.board-tabs').getByRole('button', { name: 'Histórico', exact: true }).click();
  await expect(page.locator('.timeline-item').filter({ hasText: 'Validar fluxo de requisição' }).first()).toContainText('Concluída');
  expect(errors).toEqual([]);
});

test('município, agenda de treinamentos e backup funcionam de ponta a ponta', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Cadastrar meu município' }).click();
  await page.getByLabel('Nome do município').fill('Município de Teste');
  await page.getByLabel('Código no Dream').fill('9999');
  await page.getByLabel('Nome do fiscal').fill('Fiscal de Teste');
  await page.getByLabel('E-mail do fiscal').fill('fiscal@example.com');
  await page.getByLabel('Entidades do projeto').fill('Prefeitura\nCâmara');
  await page.getByRole('button', { name: 'Salvar município' }).click();
  await expect(page.getByRole('heading', { name: 'Município de Teste', exact: true })).toBeVisible();
  await page.locator('nav').getByRole('button', { name: 'Treinamentos' }).click();
  await page.getByRole('button', { name: 'Novo treinamento', exact: true }).first().click();
  await page.getByLabel('Tema / módulo').fill('Treinamento de patrimônio');
  await page.getByRole('button', { name: 'Salvar treinamento' }).click();
  await expect(page.getByRole('heading', { name: 'Treinamento de patrimônio' })).toBeVisible();
  await page.locator('nav').getByRole('button', { name: 'Minha agenda' }).click();
  await expect(page.locator('.agenda-row')).toContainText('Treinamento de patrimônio');
  await page.getByRole('button', { name: 'Dados e backup' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Exportar backup/ }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let body = ''; for await (const chunk of stream) body += chunk.toString();
  const backup = JSON.parse(body);
  expect(backup.projects).toHaveLength(2);
  expect(backup.projects[1].trainings[0].title).toBe('Treinamento de patrimônio');
  await page.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(body) });
  await expect(page.getByRole('heading', { name: 'Restaurar este backup?' })).toBeVisible();
  await page.getByRole('button', { name: 'Restaurar dados', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Município de Teste', exact: true })).toBeVisible();
});

test('layout móvel mantém navegação e não estoura a largura da página', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.locator('nav').getByRole('button', { name: 'Municípios' }).click();
  await expect(page.getByRole('heading', { name: 'Municípios', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Quatro Barras.*Dream/ }).click();
  await page.getByRole('button', { name: 'Nova atividade', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('arrastar, filtrar e excluir mantém o histórico da atividade', async ({ page }) => {
  await page.goto('/');
  const card = page.getByRole('button', { name: /Homologação de Frotas/ });
  await card.dragTo(page.locator('#column-pendencia'));
  await expect(page.locator('#column-pendencia')).toContainText('Homologação de Frotas');
  await page.getByRole('textbox', { name: 'Buscar uma atividade' }).fill('frotas');
  await expect(page.locator('.task-card')).toHaveCount(1);
  await card.click();
  await page.getByRole('button', { name: 'Excluir', exact: true }).click();
  await page.getByRole('button', { name: 'Sim, excluir' }).click();
  await expect(page.locator('.task-card')).toHaveCount(0);
  await page.locator('.board-tabs').getByRole('button', { name: 'Histórico', exact: true }).click();
  await expect(page.locator('.timeline-item').first()).toContainText('Excluída');
});
