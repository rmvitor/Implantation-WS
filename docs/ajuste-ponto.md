# Ajuste de ponto — v1.20.1

Abra **Ajuste de ponto** na área geral da navegação lateral, depois de Agenda geral. Não é necessário selecionar ou cadastrar um município. Cada pessoa tem seu próprio histórico, independente de acesso a projetos.

## Preencher e emitir

1. Clique em **Novo ajuste**. O nome vem da conta logada, o cargo começa como **Técnico de implantação** e as datas da ocorrência/emissão e a hora de emissão começam com o momento atual do aparelho. Nome/cargo são editáveis para adequar a identificação no documento.
2. Em **Adicionar data**, inclua outras ocorrências semelhantes. Horários, justificativa e demais campos serão iguais para todas as datas. Cada data gera uma folha no mesmo PDF e um registro independente no histórico. Datas repetidas no mesmo preenchimento são recusadas. Para horários diferentes, preencha outro ajuste. Marque as batidas necessárias: **Entrada**, **Intervalo**, **Retorno do intervalo** e **Saída**. Cada marcação abre seu horário, inicialmente vazio. Informe-o manualmente conforme o boletim. Não há preenchimento automático dessas horas, nem cálculo ou imposição de ordem da jornada.
3. Digite a justificativa ou escolha um texto de atraso, deslocamento a serviço ou esquecimento de batida e clique em **Inserir sugestão**. A sugestão é acrescentada ao texto atual, sem apagá-lo, e pode ser editada. Confira se o texto corresponde ao que ocorreu.
4. Em **Preencher a partir do projeto**, selecione um município ao qual você tenha acesso: o nome do projeto preenche **Entidade contratante** e o fiscal preenche **Gerente do contrato**. Os dois campos continuam editáveis, e o preenchimento manual continua disponível. Trata-se somente de uma cópia dos textos; não cria vínculo nem altera o projeto.
5. Informe o local. Opcionalmente, clique em **Usar cidade atual**. A data/hora de emissão é separada dos horários de batida e pode ser ajustada; **Usar data e hora atuais** atualiza só a emissão.
6. Em **Responsável pela assinatura**, preencha nome e registro funcional de quem assinará, se desejar. Pode ser coordenador ou responsável no projeto. Deixando em branco, o documento mantém espaço para preencher esses dados e assinar.
7. Use **Baixar PDF** para obter o arquivo pronto para encaminhar à assinatura. **Imprimir / Salvar PDF** oferece a impressão pelo navegador. Emitir o arquivo não salva o ajuste automaticamente: use **Salvar ajuste** se quiser mantê-lo no histórico.

O PDF direto usa o formulário fornecido `justificativaponto (1).pdf`, preservando o timbre IPM, as quatro linhas de ocorrência e a assinatura inferior. Cada data ocupa **uma página A4**, tanto no PDF direto como na impressão. O conteúdo do formulário é organizado no espaço entre o título e o rodapé do modelo; a fonte se ajusta até o mínimo de 7,5 pt. Se um texto excepcionalmente extenso ou com muitas quebras de linha não couber de forma legível, a emissão avisa para reduzi-lo. Nenhum texto é cortado e não são criadas folhas de complemento. Se algum símbolo não for representado pela fonte do PDF direto, a tela orienta usar **Imprimir / Salvar PDF**, que preserva o texto pelo navegador.

O documento fica preparado para assinatura, sem assinatura digital automática, aprovação presumida, envio de e-mail ou protocolo de solicitação. O texto “PREENCHIDO PELO CLIENTE” é mantido no formulário fornecido, como conteúdo do modelo; não impede o preenchimento pelo técnico conforme solicitado. O arquivo deve ser revisado e encaminhado ao responsável pelo usuário.

## Histórico e ativação no Supabase

A emissão do arquivo funciona sem a migração de histórico. Para salvar e consultar os ajustes entre dispositivos, execute todo o arquivo [`202611040001_time_adjustments.sql`](../supabase/migrations/202611040001_time_adjustments.sql) em **Supabase → SQL Editor → New query → Run**. Requer a estrutura inicial de perfis/contas já usada pelo Implanta; não depende de tabelas ou acesso a municípios. Não substitui os SQLs das outras rotinas.

Para **salvar várias datas em uma única operação**, execute também [`202611040002_time_adjustment_batches.sql`](../supabase/migrations/202611040002_time_adjustment_batches.sql) no SQL Editor, depois do SQL anterior. Não precisa reaplicar o primeiro se ele já estiver ativo. O segundo adiciona somente uma função transacional: não altera tabelas nem registros existentes. Se alguma data falhar por validação ou conflito de versão, nenhum registro do lote é salvo. O rascunho permanece disponível para nova tentativa. Há um limite técnico de 100 registros por salvamento; para mais datas, divida em novos preenchimentos.

Sem o segundo SQL, salvar uma data continua funcionando e o PDF de várias datas também pode ser emitido sem salvar.

A migração é aditiva, pode ser reaplicada e não modifica projetos, presença, agenda ou usuários existentes. Cria `implanta_private.time_adjustments` e `time_adjustment_audit`, sem acesso direto por anônimos/contas comuns. As funções verificam conta ativa e proprietário autenticado; não recebem um usuário-alvo do navegador. Somente o próprio usuário consulta, altera ou exclui seus ajustes, inclusive quando outro colega é Master. A autoria do histórico vem da sessão autenticada; nome e cargo impressos são os dados preenchidos, não uma certificação de identidade.

**Salvar ajuste** atualiza imediatamente a lista pela confirmação do banco. O histórico também é consultado ao voltar à janela e periodicamente enquanto a tela está visível. Uma edição concorrente do mesmo registro é recusada, preservando o rascunho para revisão. Excluir pede confirmação e remove apenas o registro pessoal, sem apagar os PDFs que já foram baixados. Não há status de aprovação criado pelo aplicativo.

No modo local, o histórico fica em uma chave própria deste navegador, separado dos municípios. No modo equipe, falhas de conexão não criam cópia local silenciosa nem substituem o banco. Os dados em edição ficam na tela para nova tentativa. Fechar uma edição alterada pede confirmação; durante salvamento, a navegação e o botão Voltar aguardam sua conclusão.

## Localização e dados pessoais

A localização não é consultada ao abrir a rotina. O botão solicita a permissão do navegador e usa coordenadas arredondadas a duas casas decimais para consultar a cidade no OpenStreetMap/Nominatim, sem chave ou sessão do Supabase. O pedido externo é feito sem cookies e sem cache local. A cidade/UF sugerida é editável. Negar a permissão ou indisponibilidade da consulta mantém o preenchimento manual disponível.

O Implanta armazena somente o texto do local informado; não grava coordenadas, trilhas de deslocamento ou localização contínua. Nome, horários, justificativa e local no documento são dados pessoais: compartilhe o arquivo apenas com os destinatários da solicitação.

O JSON de **Dados e backup** não inclui o histórico desta rotina. Os PDFs são cópias documentais, não um backup restaurável. Para recuperação completa no modo equipe, o backup administrado do Supabase deve incluir o esquema `implanta_private`. No modo local, guarde os PDFs que precisar conservar; excluir municípios ou limpar o workspace de projetos não apaga esse histórico pessoal separado.

## Conferência

- Crie um ajuste sem nenhum município cadastrado; confira nome/cargo e data/hora de emissão.
- Marque Entrada e Saída e preencha manualmente. As outras batidas devem permanecer em branco no relatório.
- Insira uma sugestão após um texto digitado e confira que ambos foram mantidos.
- Adicione duas datas, escolha um projeto, edite o gerente e emita: confira uma folha por data, com os mesmos horários e dados. Salvar deve mostrar os dois registros imediatamente, e editar um deles não pode alterar o outro.
- Baixe o PDF antes de salvar: ele deve conter os dados atuais do formulário. Salve e depois abra pelo histórico para editar ou reemitir.
- Teste a cidade com permissão concedida e negada; confira que o local continua editável.
- Com outro usuário, confira que os ajustes pessoais anteriores não aparecem.

Testes usam contas fictícias, respostas HTTP simuladas e PostgreSQL descartável; não cadastram ajustes reais, não enviam mensagens e não aplicam a migração no banco de produção.
