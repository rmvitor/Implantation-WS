# Responsáveis das atividades — 1.18.0

O responsável passa a ser uma **conta com edição no projeto**, identificada pelo ID. O nome continua aparecendo nos cartões, listas, tabela, calendário, relatórios e backups. Master e gestor ativo têm edição efetiva e também podem ser responsáveis.

## Ativar em um banco já em uso

1. Faça backup administrativo e combine uma pausa breve nas alterações de atividades e permissões.
2. Atualize o aplicativo para 1.18.0. A atualização requer os registros separados e os níveis Master/gestor já existentes. Se ainda não os ativou, siga primeiro os guias de [registros](migracao-registros.md) e [níveis de acesso](niveis-acesso.md).
3. No **Supabase → SQL Editor → New query**, execute inteiro [202610270001_activity_responsibility.sql](../supabase/migrations/202610270001_activity_responsibility.sql). Não há campos para substituir. O arquivo é transacional, aguarda gravações em andamento e cancela se não conseguir o bloqueio em 15 segundos. Um erro desfaz a atualização inteira. Pode ser reaplicado.
4. Reabra o aplicativo. Em uma atividade, a lista de responsáveis deve mostrar somente contas ativas com edição no projeto. Se o formulário já estava aberto, use **Consultar novamente**.

A publicação do site não executa esse SQL no seu Supabase. Até a ativação, a consulta das atividades continua disponível; o formulário online informa a atualização necessária e impede salvar uma escolha que não pôde ser validada. O modo local mantém os nomes manuais, pois não possui usuários/autorização de um servidor.

## Atividades existentes

- Uma conta já vinculada e elegível é preservada. Um nome/e-mail antigo pode ser vinculado quando corresponder a **uma única** conta elegível no projeto.
- O criador é recuperado do registro de criação no histórico do banco ou de um log de criação autenticado. O último editor, quem importou uma atualização e o dono do município não são considerados automaticamente o criador da atividade.
- Atividades sem responsável recebem o criador, desde que ele ainda esteja ativo e possa editar o projeto.
- Se o criador não puder ser identificado ou já não tiver edição, o responsável passa a ser o **gestor atual do projeto**, conforme a regra definida para esta atualização. Isso não muda a autoria: criador desconhecido continua desconhecido. O nome e o vínculo anteriores ficam preservados nos metadados `responsibilityRecovery` da atividade e no backup.
- Se o próprio gestor estiver inativo ou não existir mais, é preciso escolher manualmente uma conta com edição. A migração não reativa contas nem concede permissões automaticamente.
- A migração mantém municípios, atividades, evidências, logs, termos, permissões e snapshots anteriores. As alterações de vínculo ficam registradas na auditoria; as revisões avançam para impedir que telas antigas sobrescrevam o resultado.

Para conferir os casos que precisam de revisão, um administrador do Supabase pode executar no SQL Editor:

```sql
select m.data->>'name' as municipio,
       a.data->>'title' as atividade,
       a.data->>'owner' as nome_anterior,
       a.data->>'createdBy' as criador_identificado
from public.implanta_activity_records a
join public.implanta_municipality_records m using (project_id)
where not implanta_private.activity_editor(a.project_id, a.data->>'ownerId')
order by municipio, atividade;
```

## Uso diário

**Apenas meus**, junto aos filtros das atividades, mostra o que está atribuído à conta conectada. Funciona em **Quadro, Lista, Tabela e Calendário** e combina com busca, módulo, categoria e prioridade. A escolha fica somente neste aparelho, por conta e município; não grava no servidor. Não confunde nomes iguais nem considera que o criador continua responsável depois de uma transferência.

**Novas atividades** começam com o usuário conectado. O padrão também vale para atividades geradas por modelos e pendências da homologação. Dentro da atividade, altere **Responsável** para outro editor ativo do projeto e salve. A autoria original não muda. Uma tarefa não pode ser gravada com um visualizador, usuário inativo ou pessoa sem acesso de edição, mesmo se uma requisição for enviada fora da tela.

**Retirar acesso:** transfira primeiro as atividades atribuídas àquela pessoa. O banco impede remover sua edição, desativar sua conta ou transferir a gestão de forma que as atividades fiquem com um responsável sem edição. Se a pessoa continuar com edição por outro vínculo válido, a alteração de acesso é permitida. A regra também inclui atividades concluídas. Se estiverem em um projeto encerrado, reabra-o para transferir o responsável e encerre novamente depois. Excluir um projeto inteiro continua funcionando com a confirmação normal.

**Importação:** atividades recriadas recebem como criador no Implanta a conta que as criou pela importação; atividades já existentes conservam a autoria registrada no servidor. Responsáveis importados por ID precisam ter edição no projeto de destino. Nomes antigos sem vínculo, que não correspondam a uma conta elegível única, recebem a conta que criou o registro pela importação; o nome anterior é preservado nos metadados para revisão. Uma importação inválida é desfeita por inteiro. Ao restaurar em outro projeto, configure primeiro os acessos necessários e revise os responsáveis; não são concedidas permissões automaticamente por um arquivo de backup.

## Conferir após ativar

1. Crie uma atividade e confirme seu usuário como responsável inicial.
2. Troque para um colega com edição, salve e confira a mudança sem recarregar.
3. Ative **Apenas meus** nas quatro visualizações. A atividade transferida deve sair da sua lista e aparecer para o colega.
4. Confira que um visualizador ou usuário de outro projeto não aparece na seleção.
5. Tente retirar edição de uma pessoa com atividades atribuídas. A operação deve pedir que elas sejam transferidas antes. Depois de transferir, a retirada deve funcionar.
6. Confira a atribuição ao criador ou ao gestor nos registros antigos. Revise a consulta acima para resolver os casos em que nem o gestor é elegível.
