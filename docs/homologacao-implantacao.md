# Homologação da implantação

A área **Aceite da implantação** acompanha a apresentação final com o cliente. A **Homologação** anterior continua conferindo os dados migrados, com seus próprios OKs.

## Portal opcional do cliente — 1.17.0

O técnico pode atribuir responsáveis a cada ponto e enviar um acesso externo por e-mail. O cliente vê apenas seus pontos apresentados e confirma com sua própria conta, sem acesso à plataforma interna. O template padrão do Supabase funciona pelo link; modelos com código são opcionais. A conferência na reunião continua funcionando. A ativação adicional e o SMTP estão no [guia do portal](portal-cliente.md).

## Ativar a atualização 1.16.0

Se os aceites da versão 1.15 já funcionam, faça um backup administrativo, atualize o aplicativo para **1.16.0** e execute inteiro o [SQL 202610260001_acceptance_flags.sql](../supabase/migrations/202610260001_acceptance_flags.sql) no **Supabase → SQL Editor → New query → Run**. Não há campos para substituir. Combine uma pausa breve com a equipe; o arquivo aguarda gravações em andamento e usa uma transação única. Erros desfazem a atualização inteira. Pode ser reaplicado.

O SQL preserva perguntas, respostas, justificativas, projetos e acessos. Confirmações anteriores em respostas Não/Não se aplica, incompatíveis com a regra nova, são copiadas para `approvalHistory` no próprio ponto antes de retirar as flags ativas. Os termos já emitidos permanecem intactos e os registros positivos mantêm sua autoria. O protocolo de gravação por registros separados continua o mesmo. Em bases legadas, o SQL também é compatível, mas não elimina seu limite de 4 MB: siga a ativação de registros separados abaixo antes deste complemento.

A publicação do site não executa este SQL na sua conta. Até a ativação, a consulta permanece disponível e a edição mostra o guia. Instalações novas seguem a preparação 1.15 abaixo e **por último** executam este arquivo. Não reaplique os SQLs anteriores depois deste complemento, pois eles contêm as regras antigas.

## Flags e navegação 1.16

- **Aceite técnico: Sim** registra apresentação e resposta Sim. **Aceite do cliente** é a flag seguinte e só pode ser marcada depois do técnico. Com vários responsáveis, abre a escolha; com um, seleciona automaticamente; sem cadastro, avisa.
- Marcar o cliente bloqueia o técnico, a resposta e as observações. Desmarque primeiro o cliente para alterar esses dados. Com vários responsáveis, **Alterar responsáveis do aceite** permite revisar a seleção.
- **Não** e **Não se aplica** abrem a justificativa e impedem os aceites. Não podem coexistir entre si nem com aceites. Desmarque a opção atual antes de selecionar a outra. Enquanto houver aceite técnico, remova-o antes de escolher uma resposta negativa.
- **Não se aplica** com justificativa conclui o ponto sem aceites. **Não** bloqueia perguntas de apresentação, mesmo se houver uma antiga flag de dispensa. Perguntas de impedimento preservam sua semântica: Não indica ausência de impedimento e dispensa aceites; Sim bloqueia o termo. Escolhas de processo do modelo respeitam sua justificativa aplicável.
- Filtros: **Todos**, **Aceite do técnico** (técnico sem cliente), **Aceite do cliente e técnico** e **Em aberto** (pontos ainda não resolvidos, incluindo os parcialmente aceitos). O filtro fica somente no aparelho, por conta e projeto, e não muda o relatório impresso.
- As ações do relatório ficam em uma linha. No celular, deslize a barra de ações lateralmente.
- **Limpar relatório** pede confirmação e remove do banco respostas, justificativas, observações, aceites e responsáveis do módulo/entidade atual. Mantém o módulo ativo e suas perguntas; outros módulos, histórico e termos emitidos são preservados. A limpeza fica registrada no histórico, incluindo a cópia anterior para rastreabilidade. Não há desfazer automático.
- O cabeçalho e o rodapé seguem a referência gráfica IPM, sem as linhas verticais antigas. Relatórios parciais continuam com página final de assinaturas e indicação de que não constituem termo final.

As seções seguintes detalham a preparação da base, os modelos e os documentos.

## Ativar a atualização 1.15.0

Para quem já executou `202610240001_implantation_acceptance.sql` e já usa os níveis Master/gestor, a atualização recomendada é o **SQL único de ativação**:

1. Guarde um backup administrativo do banco e o backup completo do aplicativo em local protegido.
2. Atualize o aplicativo para **1.15.0** antes de executar a migração e combine uma pausa breve no preenchimento com a equipe.
3. Abra **Supabase → SQL Editor → New query**. Copie todo o conteúdo de [202610240003_activate_acceptance_records.sql](../supabase/migrations/202610240003_activate_acceptance_records.sql) e clique em **Run**. Não há campos para substituir.
4. Reabra o aplicativo, entre em **Aceite da implantação** e teste uma resposta. A tela também oferece **Verificar novamente**.

O SQL único ativa os registros separados que já estavam preparados no projeto, copia os dados existentes e instala o complemento dos aceites. Cada pergunta passa a ser gravada separadamente, com controle de versão. Os projetos, responsáveis, respostas, termos, CPF, Master, gestores e liberações existentes são preservados. Modelos globais já alterados pelo Master também são mantidos em uma reaplicação.

**Por que ativar os registros separados:** o banco legado limita cada município a 4 MB. Uma simulação de conclusão dos quatro módulos em 15 entidades, incluindo histórico e termos, ultrapassou esse limite. Ativar apenas os modelos novos não resolve esse limite. O SQL único evita copiar todo o município a cada resposta e mantém o histórico completo.

**Proteção durante a migração:** as etapas estão em uma única transação. Um erro desfaz a atualização; o SQL pode ser reaplicado. A cópia aguarda as gravações em andamento e bloqueia brevemente novas gravações de projetos. Se não conseguir o bloqueio em 15 segundos, cancela sem aplicar parcialmente: tente novamente durante a pausa combinada. Os snapshots antigos são mantidos como origem de recuperação, sem acesso direto por usuários comuns; os clientes antigos passam a receber orientação para atualizar, em vez de alterar a cópia antiga. CPF fica nos registros privados, disponível apenas ao Master e editores com acesso ao projeto. Não restaure o aplicativo antigo após o corte; uma recuperação deve partir do backup e de uma análise das gravações posteriores. Consulte também [migração de registros](migracao-registros.md).

Para instalação nova, siga primeiro a estrutura inicial, os níveis Master/gestor e `202610240001_implantation_acceptance.sql`; depois execute o SQL único acima. Ambientes que já usam registros separados podem aplicar somente [202610240002_acceptance_workflow.sql](../supabase/migrations/202610240002_acceptance_workflow.sql). O complemento isolado também é compatível com o legado, mas mantém o limite de 4 MB; não é a opção recomendada para projetos com muitas entidades.

Publicar o site não executa SQL no Supabase. Sem a atualização, os dados existentes podem ser consultados; o novo preenchimento fica desabilitado e mostra o guia de ativação.

## Abas e visão geral

- **Visão geral** mostra uma matriz de entidades e módulos, os pontos com os dois OKs, impedimentos e o total de conferências da migração.
- Cada **entidade** tem uma aba, com contador de validação. A interface foi validada com 15 entidades.
- Dentro da entidade, cada **módulo contratado** tem sua própria aba e relatório.
- Os grupos de entidades e módulos podem ser recolhidos. A última entidade, o último módulo de cada entidade e o recolhimento ficam apenas neste navegador, separados por conta e projeto. Trocar de aba não grava no Supabase.

## Módulos contratados

Escolha os módulos de cada entidade em **Módulos contratados**. Os botões permitem selecionar todos da entidade aberta ou todos os módulos disponíveis em todas as entidades do projeto.

Os padrões IPM 2026-3 incluem 94 perguntas:

| Módulo | Perguntas |
| --- | ---: |
| Compras e Contratos | 48 |
| Almoxarifado | 17 |
| Patrimônio | 18 |
| Frota | 11 |

Elicita e Fiscalização de contrato começam sem modelo. O nome aparece, mas a contratação fica indisponível até o Master cadastrar suas perguntas. Relatórios anteriores já existentes são mantidos.

## Preencher diretamente no relatório

As perguntas ficam abertas na própria página, sem dropdown. **Aceite técnico: Sim** registra a resposta e o OK do técnico conectado em um clique. **Aceite do cliente** mantém a confirmação separada. **Não** e **Não se aplica** são escolhas exclusivas e abrem o campo de justificativa, sem permitir aceites nessas respostas. Desmarcar a escolha negativa volta o ponto a não respondido.

**Observações** fica recolhido nas demais respostas e pode ser aberto para anotações. O texto existente é preservado ao trocar de resposta: para Não/Não se aplica, ele aparece como justificativa/observações. Perguntas cujo Sim exige justificativa abrem esse campo antes de permitir confirmar o técnico. As regras de impedimento do modelo continuam valendo.

- Seleções e OKs entram imediatamente na fila de gravação. Textos são enviados após uma pequena pausa de digitação ou ao sair do campo.
- As gravações são serializadas para preservar cliques rápidos em pontos diferentes. A tela informa **Salvando**, **Respostas confirmadas no banco** ou **Há respostas não salvas**.
- Um “Não” incompleto pode ser guardado como rascunho. Os OKs e o termo exigem a justificativa aplicável.
- Em falha, os rascunhos ficam na memória desta tela, inclusive ao alternar entidades/módulos. Use **Tentar salvar novamente**, ou descarte explicitamente os rascunhos. A troca de município/área fica bloqueada enquanto houver respostas não salvas.
- As respostas online são gravadas no banco. O cache local contém somente escolhas de navegação; a atualização do aplicativo não depende de gravar essas escolhas no servidor.

### Técnico e cliente

O **OK técnico** registra a conta autenticada e o horário do servidor. A pessoa que seleciona o cliente pode ser outro técnico: o registro original de apresentação é preservado quando só a seleção dos responsáveis muda.

Ao clicar em **OK do cliente**:

- Sem responsáveis cadastrados: a tela avisa que é necessário cadastrar.
- Com um responsável: ele é selecionado automaticamente, sem janela intermediária.
- Com vários: uma janela permite selecionar quem confirmou o ponto. Todos os escolhidos recebem seu registro de aceite informado, com nome, cargo, técnico que registrou e horário do servidor.

O aceite é informado pelo cliente durante a reunião e registrado pela equipe técnica. A assinatura é feita no documento, conforme o fluxo da empresa.

### Respostas negativas e não aplicáveis

Perguntas de apresentação/capacitação respondidas **Não** bloqueiam o termo e não permitem aceites. Quando a rotina não for utilizada, escolha **Não se aplica** e justifique: o ponto fica dispensado sem aceite técnico ou do cliente. A antiga flag de dispensa de uso em Não não é mais utilizada nos novos preenchimentos.

Nas perguntas sobre existência de impedimentos, **Sim** continua bloqueando o termo e **Não** é favorável, sem aceites. Nas escolhas de processo, Sim ou Não seguem a justificativa aplicável do modelo. Não se aplica sempre exige justificativa. As confirmações antigas incompatíveis permanecem arquivadas, com autoria e horário, e não contam como flags ativas.

## Responsáveis por abas

Em **Responsáveis**, cada pessoa tem uma aba com nome, cargo e e-mail opcional. **Adicionar responsável** cria outra aba; **Salvar responsáveis** grava os cadastros. O botão **Excluir responsável** pede confirmação e retira os aceites dessa pessoa dos pontos ativos, preservando os termos já emitidos.

Cada módulo de cada entidade mantém sua própria lista de responsáveis.

## Modelos globais — Master

O botão **Gerenciar modelos**, ao lado de **Módulos contratados**, aparece somente para o Master. Ele permite gerenciar os modelos de todos os módulos, inclusive criar os que estavam vazios. O banco também bloqueia alterações de perguntas, ordem e modelos por editores/gestores.

Os modelos são globais, têm revisão e controle de concorrência. Novos relatórios usam a versão atual do banco. Salvar um modelo não reescreve relatórios em andamento nem documentos emitidos.

Para atualizar um relatório existente, o Master usa **Aplicar modelo atual** dentro do módulo. A confirmação informa que perguntas alteradas perdem respostas e OKs; pontos cuja definição não mudou são preservados. Os padrões originais dos documentos continuam disponíveis no editor para reposição explícita.

## Excluir/desativar relatório

**Excluir relatório** dentro do módulo pede confirmação, apaga suas perguntas respondidas, justificativas e OKs e desativa o relatório. Para preencher novamente, é necessário reativar o módulo em **Módulos contratados**, usando o modelo global atual. Os cadastros dos responsáveis ficam disponíveis.

Desmarcar um módulo em **Módulos contratados** tem o mesmo efeito e mostra a lista dos relatórios afetados antes da confirmação. A limpeza vale para o formulário ativo: o histórico de execução e os termos emitidos são preservados.

## Relatório e termo por módulo

- **Imprimir relatório** permite imprimir ou salvar PDF de um único módulo, inclusive durante o preenchimento. A cópia parcial informa que não constitui termo final.
- **Gerar termo do módulo** fica disponível quando todos os pontos daquele módulo estão resolvidos conforme a resposta: os apresentados têm os dois aceites, os não aplicáveis têm justificativa e não há impedimentos. Os demais módulos podem continuar pendentes.
- Na **Visão geral**, o termo consolidado da entidade exige todos os módulos contratados concluídos. Termos atuais podem ser impressos ali, e os anteriores continuam em **Termos emitidos**.
- O documento usa o timbre IPM ajustado às referências gráficas fornecidas, com nome e cargo de quem participou dos pontos, identificação dos técnicos, respostas, dispensas e espaços de assinatura.
- A partir de 1.15.1, relatórios parciais também terminam com campos de assinatura para os técnicos identificados (incluindo o emissor) e todos os responsáveis cadastrados nos módulos do relatório, com nome, cargo e e-mail quando informado. Sem cadastro, ficam linhas para preenchimento manual. Isso não substitui os OKs necessários para emitir o termo final.
- O cabeçalho e o rodapé gráfico, incluindo logotipo e dados institucionais, ficam incorporados ao arquivo, sem as linhas verticais antigas.
- **Imprimir / salvar PDF** usa a impressão do navegador em A4; desative seus cabeçalhos e rodapés adicionais. **Baixar documento** guarda uma cópia HTML com o timbre incorporado, que pode ser aberta depois sem conexão.

Cada emissão guarda uma cópia das perguntas, respostas, nomes/cargos e dados do município. Alterações posteriores preservam os documentos anteriores. CPF não é incluído no termo. Nomes, cargos e e-mails dos participantes fazem parte do documento e devem ser compartilhados com os destinatários do projeto.

## Dados e verificação

No protocolo v2, cada pergunta é um registro separado com controle de versão; o banco legado mantém o protocolo por município já existente. As duas formas usam confirmação canônica com identidade/horário do servidor e impedem conflitos silenciosos. A validação de grandes ativações foi ajustada para conferir o estado completo uma vez por transação.

Backups incluem a rotina. A exportação comum continua omitindo CPF e anexos. Confirmações importadas exigem reconferência; documentos históricos mantêm sua identificação original. No modo local é possível preparar o preenchimento, mas os OKs e termos finais exigem autenticação no banco.

Verificações do repositório: `npm test`, `npm run test:db` e `npx playwright test`. Os testes de banco usam bases descartáveis, incluindo 15 entidades/60 relatórios, permissões Master, dispensa, termos por módulo, concorrência e reaplicação da migração; não utilizam produção.
