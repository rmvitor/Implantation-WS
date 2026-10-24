# Homologação da implantação

A área **Aceite da implantação** acompanha o checklist final com o cliente. A área **Homologação** existente continua conferindo dados migrados; as duas rotinas têm escopos e OKs independentes.

## Ativar no Supabase já utilizado pela equipe

1. Guarde um backup antes da alteração. O Master pode exportar o backup completo do aplicativo; mantenha-o em local protegido, pois pode conter CPF e anexos. Para recuperação do banco, preserve também o backup administrativo conforme o [guia de migração](migracao-registros.md).
2. No Supabase, abra **SQL Editor → New query**.
3. Copie **todo** o conteúdo de [202610240001_implantation_acceptance.sql](../supabase/migrations/202610240001_implantation_acceptance.sql) e clique em **Run**. Este arquivo não pede e-mail, senha ou substituição de campos.
4. Atualize o aplicativo, entre no município e abra **Aceite da implantação**. Se a tela já estiver aberta, use **Verificar novamente**.

O SQL requer a estrutura inicial e os níveis Master/gestor já ativados nesta plataforma. **Não execute novamente a estrutura inicial. Não é necessário ativar a migração antiga de registros/CPF para usar esta rotina.** O arquivo funciona com o banco atual e com o formato de registros separados.

A publicação do site não executa SQL no Supabase. Até a ativação, a nova área permite consultar registros existentes e mostra o guia; a gravação fica bloqueada. Uma falha de conexão é mostrada separadamente da ausência da migração.

A migração roda em uma transação, preserva projetos, autoria, permissões e a homologação da migração. Pode ser reaplicada. Se futuramente executar `202610090002_records.sql`, reaplique a migração de níveis de acesso e depois este novo arquivo, nessa ordem. Isso registra as novas tabelas no protocolo v2 e copia a rotina preservada no projeto, mantendo seus registros e datas.

## Conferência dos modelos fornecidos

As perguntas foram extraídas dos quatro arquivos Word **Versão 2026-3**, mantendo a redação e as orientações de navegação do sistema.

| Módulo | Perguntas | Tratamento relevante |
| --- | ---: | --- |
| Frota | 11 | A última pergunta verifica a existência de impedimentos: **Não** é favorável. |
| Compras e Contratos | 48 | As escolhas de layouts e de processo digital não equivalem a capacitação reprovada. |
| Almoxarifado | 17 | A opção de contabilização é uma escolha. A orientação seguinte depende de a entidade utilizar a integração. |
| Patrimônio | 18 | Mantém as perguntas sobre bens, transferências, depreciação, balancete e virada mensal. |

São **94 perguntas**. Não foram inventados modelos para Elicita ou Fiscalização de contrato: esses módulos ficam disponíveis para perguntas personalizadas.

O material original mistura três tipos de pergunta, que agora ficam explícitos:

- **Capacitação / apresentação:** responder **Não** impede a emissão do termo até resolver.
- **Escolha do cliente:** Sim e Não são válidos; a justificativa segue a exigência do modelo. Não escolher um layout padrão não reprova automaticamente a implantação.
- **Existência de impedimento:** responder **Sim** impede a emissão até resolver.

Foi acrescentado **Não se aplica**, sempre com justificativa e com os dois OKs. Serve, por exemplo, para a pergunta condicional da contabilização quando a entidade não utilizar a integração. Não há dispensa ou aprovação automática de perguntas condicionais.

## Preencher

1. Em **Definir módulos contratados**, marque os módulos de cada entidade. Isso não reutiliza nem altera o escopo da migração de dados. Desmarcar conserva as respostas para uma retomada, mas retira o módulo do termo.
2. Selecione a entidade e cadastre os **Responsáveis** de cada módulo, com nome, cargo e e-mail opcional. É possível cadastrar várias pessoas no mesmo módulo.
3. Abra cada ponto, escolha Sim/Não/Não se aplica e registre justificativa quando exigida.
4. Selecione quem responde por aquele ponto. Pode ser uma pessoa ou várias.
5. O técnico confirma que apresentou o ponto. O sistema usa sua conta autenticada e o horário do servidor; não há campo para digitar outro técnico.
6. Após a confirmação verbal do cliente na reunião, registre o aceite de cada responsável selecionado. O sistema também registra qual técnico lançou esse aceite e quando. O cliente não precisa de uma conta na plataforma.
7. Salve no topo ou no fim do formulário. A confirmação do banco atualiza o aplicativo imediatamente. Em falha, o formulário é preservado.

Para emitir o termo, **todos os pontos do escopo da entidade** precisam estar respondidos, sem impedimentos, com OK técnico e aceite de **todos** os responsáveis selecionados. Módulo sem perguntas ou ponto sem responsável mantém a emissão bloqueada. Esta regra de bloquear até resolver foi confirmada pelo responsável da plataforma.

## Personalizar sem perder o padrão

**Editar perguntas** permite alterar texto, orientação, tipo, justificativa, ordem e incluir ou excluir pontos. A alteração vale somente para aquele módulo daquela entidade. Os modelos distribuídos continuam intactos, assim como os outros municípios.

Perguntas cujo conteúdo foi alterado perdem suas respostas e aceites. Alterar uma resposta, observação ou a seleção de responsáveis exige confirmar novamente o ponto. Alterar o cadastro de uma pessoa retira os aceites correspondentes. O histórico registra essas operações com autor e data.

**Carregar perguntas padrão** prepara a reposição do modelo no editor; a gravação só ocorre em **Salvar perguntas**. Essa ação preserva respostas dos pontos cuja definição não mudou e reinicia os alterados. A edição exige permissão de escrita no município; visualizadores apenas consultam.

## Termo e assinatura

**Gerar termo da entidade** grava uma cópia das perguntas, respostas, OKs, consultores, nomes e cargos do cliente, dados do município e fiscal, além do identificador e da data de emissão. Cada entidade tem seu documento, reunindo os módulos selecionados.

O documento mantém o formato de perguntas e respostas dos modelos, acrescenta os cargos dos responsáveis e identifica quem apresentou e registrou os aceites. O timbre de cabeçalho e rodapé foi extraído do modelo de Frota, igual ao dos demais documentos. A informação institucional foi mantida conforme o arquivo fornecido.

- **Imprimir / salvar PDF** abre a impressão do navegador com papel A4 e áreas reservadas para o timbre. Selecione **Salvar como PDF** para guardar o arquivo. Desative cabeçalhos e rodapés adicionais do navegador, se estiverem habilitados.
- **Baixar documento** guarda uma cópia HTML independente do site, com o timbre incorporado. Pode ser aberta e impressa depois, inclusive sem conexão. Esse arquivo contém nomes, cargos e e-mails dos participantes; compartilhe apenas com os destinatários do projeto.
- Os nomes e cargos dos responsáveis selecionados nos pontos vão para as assinaturas. Os consultores são identificados pelos OKs técnicos. O fiscal é preenchido com o cadastro do município; o espaço do coordenador segue o modelo e pode ser completado na assinatura.
- O aceite lançado durante a reunião **não é uma assinatura digital do cliente**. A assinatura ocorre no documento impresso ou no fluxo de assinatura adotado pela empresa. Não há assinatura automática, envio por e-mail nem integração com certificado digital.

Termos emitidos mantêm sua cópia original em **Termos emitidos**. Alterações no projeto não reescrevem o documento: ele passa a aparecer como versão anterior, e uma nova emissão exige todos os OKs aplicáveis. O histórico de termos não pode ser apagado ou editado isoladamente; excluir o projeto, dentro das permissões existentes, também exclui seus registros.

## Banco, backups e rastreabilidade

No banco atual, a rotina usa os controles de versão e combinação de edições por município já existentes. Um recibo da mesma transação devolve as identidades e datas canônicas. No protocolo v2, os dados ficam em registros separados de escopo, módulo, pergunta e termo, com versão própria. Alterar um ponto não envia todas as perguntas ou tarefas.

As permissões continuam por projeto: Master, gestor e editores podem preencher; visualizadores consultam. Os novos registros têm políticas de leitura por projeto e não aceitam escrita direta pelas tabelas. As funções e gatilhos validam as confirmações e a emissão no servidor, mesmo que alguém altere o JavaScript do navegador.

Os backups do aplicativo passam a incluir a rotina. A exportação comum continua omitindo CPF e anexos. Restaurar um arquivo não transforma confirmações copiadas em novos OKs autenticados: os pontos importados precisam de reconferência. Termos importados ficam identificados como cópias não reconfirmadas; termos já existentes no banco são preservados. Restaurar um backup antigo sem essa rotina conserva a homologação da implantação existente.

No modo local, é possível preparar perguntas, responsáveis e respostas, mas os OKs e a emissão exigem login no banco da equipe.

## Validação

- `npm test`: interpretação das perguntas, múltiplos responsáveis, bloqueios, invalidação de OKs, preservação de termos, backup e combinação de edições.
- `npm run test:db`: PostgreSQL descartável nos protocolos legado e v2, tentativa de falsificar autor, emissão prematura, termos imutáveis, permissões, conflito de versão, reaplicação e transição segura para v2. Não utiliza produção.
- `npx playwright test tests/implantation.spec.js`: preenchimento em celular/computador, dois responsáveis, documento com timbre, falha de gravação, Voltar, ausência de SQL e consulta como visualizador.

Antes de usar o documento como padrão oficial da empresa, confira visualmente um termo de teste com a coordenação para validar a apresentação gráfica e as adaptações de perguntas feitas no projeto.
