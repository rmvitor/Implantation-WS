# Portal opcional do cliente — 1.17.0

O cliente pode confirmar pessoalmente os pontos do **Aceite da implantação**, por módulo e entidade. O preenchimento interno durante a reunião continua funcionando, inclusive sem convite. A conferência anterior dos dados migrados permanece independente.

## Ativar no Supabase já utilizado pela equipe

Não é necessário contratar outro serviço de envio, instalar um servidor ou informar senhas no aplicativo. O portal usa o **Supabase Auth com o SMTP já configurado**. A publicação do site não executa SQL nem altera os modelos de e-mail do seu Supabase.

1. Guarde um backup administrativo em local protegido. A base precisa estar usando os registros separados dos aceites e as flags da versão 1.16. Se ainda não ativou, siga antes o [guia da homologação](homologacao-implantacao.md). Não reaplique os arquivos antigos sobre uma base atualizada.
2. Abra **Supabase → SQL Editor → New query**, cole **todo** o arquivo [202610260003_customer_portal.sql](../supabase/migrations/202610260003_customer_portal.sql) e clique em **Run**. Não há campos para substituir. O arquivo é transacional e pode ser reaplicado; preserva municípios, respostas, responsáveis, termos e permissões. Instala convites, auditoria e operações restritas ao portal, sem ativar clientes como colegas da plataforma.
3. Em **Authentication → URL Configuration**, mantenha Site URL `https://rmvitor.github.io/Implantation-WS/` e acrescente às **Redirect URLs**:

   ```text
   https://rmvitor.github.io/Implantation-WS/**
   ```

   Essa regra permite voltar ao formulário identificado por `?aceite=...`. Para outro domínio, use o endereço real desse aplicativo.
4. Em **Authentication → Email Templates**, ajuste os dois modelos abaixo, preservando sua configuração de SMTP. Conforme a versão do painel, os modelos podem estar dentro de **Notifications → Email**:

   | Modelo no painel | Assunto sugerido | Conteúdo para copiar |
   | --- | --- | --- |
   | Magic Link | Implanta · Código de acesso | [customer-magic-link.html](../supabase/templates/customer-magic-link.html) |
   | Confirm signup | Implanta · Confirmação de acesso | [customer-confirm-signup.html](../supabase/templates/customer-confirm-signup.html) |

   Copie o HTML inteiro no corpo de cada modelo e salve. **Não substitua o modelo “Invite user”**: este fluxo utiliza login por código, não a API administrativa de convites. O modelo de primeiro cadastro tem uma condição que mantém o link de confirmação e o aviso de aprovação pelo Master para colegas que se cadastram normalmente. Mantenha essa condição.
5. Mantenha o provedor **Email**, a confirmação de e-mail, o login por código e a criação de contas Auth habilitados. Um cliente novo recebe o primeiro código pelo modelo **Confirm signup**; clientes já cadastrados recebem pelo **Magic Link**. Se houver CAPTCHA obrigatório no Auth, ele precisará de integração adicional antes de usar este fluxo. Não desative proteções sem avaliar a configuração da sua equipe.
6. Atualize o aplicativo e faça o teste abaixo com um endereço de cliente autorizado para teste. Os limites de SMTP, a validade do código e as restrições de envio continuam sendo os configurados no Supabase. **O convite dura 7 dias; o código de login tem validade própria e pode vencer antes.**

O sistema não armazena senhas do SMTP, chave administrativa nem o código enviado. Somente a conexão pública já existente fica no navegador. Não coloque `service_role`, chaves secretas ou senhas nos arquivos publicados.

## Preparar e enviar

1. Entre no município e em **Aceite da implantação**. Escolha a entidade e o módulo.
2. Em **Responsáveis**, cadastre nome, cargo e e-mail. O e-mail continua opcional para a conferência interna, mas é obrigatório para um convite.
3. Para cada ponto apresentado, marque **Aceite técnico: Sim**. Com vários responsáveis, use **Responsáveis do ponto** para definir quem precisa validar aquele item. Esse botão **não registra aceite do cliente**. Com um único responsável, a atribuição ocorre automaticamente; ao emitir seu convite, pontos positivos antigos ainda sem atribuição também recebem esse responsável.
4. Na aba da pessoa, clique em **Link e código para o cliente**, depois em **Gerar acesso e enviar código**. O cadastro é salvo antes de gerar o convite. O Supabase envia o nome, o e-mail de acesso, o código e o botão para abrir o formulário, conforme os modelos acima.
5. Você também pode copiar o link. Ele só contém o identificador do convite: o cliente ainda precisa confirmar a posse do e-mail pelo código. O código não é mostrado ao técnico.

**Envio solicitado ao Supabase** significa que a API aceitou a solicitação; não é confirmação de entrega na caixa postal. Se houver falha de SMTP, o convite continua disponível para copiar ou reenviar, sem precisar gerar outro. Confira a pasta de spam, os limites de envio e os logs do Auth/SMTP. **Reenviar código** mantém a validade original do convite; **Renovar por 7 dias e enviar** cria outro link e revoga o anterior.

## Acesso do cliente

- O cliente abre o link, informa o **mesmo e-mail cadastrado** e o código mais recente recebido. **Solicitar novo código** permite reenviar para uma conta Auth já criada. Não substitui a emissão inicial pela equipe.
- Cada convite vale somente para **um responsável, em um módulo de uma entidade de um projeto**. O cliente vê apenas seus pontos atribuídos, com resposta Sim e apresentação confirmada pelo técnico. Pontos Não, Não se aplica e ainda não apresentados não são disponibilizados para aceite.
- A página consulta as atualizações a cada cinco segundos enquanto está visível e ao voltar à janela ou reconectar. Os OKs entram diretamente no banco; falhas não aparecem como confirmações salvas. Conflitos exigem conferir a versão atual antes de repetir o aceite.
- O cliente registra ou retira **somente seu próprio aceite**. Não altera perguntas, técnico, justificativas, atribuições ou aceites de outras pessoas. A seleção dos responsáveis continua sendo feita pelo técnico; não exige todos os convidados em todos os pontos.
- Aceites informados internamente durante a reunião continuam válidos na rotina atual. O portal os identifica separadamente e permite que a própria pessoa confirme. A autoria do registro externo é o usuário Auth que confirmou o e-mail, com nome/cargo do responsável e data/hora do servidor.
- Com todos os requisitos do módulo atendidos, **Gerar relatório final** oferece **Imprimir / salvar PDF** e **Baixar documento**, usando o timbre, as assinaturas e as regras atuais. O documento é do módulo/entidade do convite. O cliente que solicita o documento não aparece como consultor técnico.
- Um projeto encerrado permite consulta e uso de um termo já emitido para o estado atual, mas não novas confirmações nem novas emissões. O convite continua sujeito à expiração/revogação.

O portal não funciona offline. A sessão do cliente é separada da sessão da equipe e fica no armazenamento da aba, por convite. Os dados consultados não são guardados em backups locais nem no cache do service worker. **Sair do portal** não encerra a sessão interna de um técnico no mesmo navegador.

## Revogação, cadastro e rastreabilidade

**Revogar acesso** impede novas consultas e confirmações naquele link, preservando os aceites e documentos já emitidos. Alterar nome, cargo ou e-mail do responsável, excluí-lo, limpar o relatório ou desativar seu módulo invalida o convite associado; emita outro após revisar o cadastro. Em uma tela já aberta, a revogação é identificada na próxima consulta; toda gravação valida o acesso novamente no banco.

Contas criadas para clientes começam **inativas para a plataforma**, sem acesso a projetos. O portal possui operações próprias que verificam o e-mail confirmado e o convite. Não é necessário aprovação do Master para esse acesso limitado. Em **Equipe e acessos**, o Master pode filtrar **Clientes externos**. Ativar uma dessas contas como colaborador libera a plataforma e só deve ser feito quando a pessoa também for integrar a equipe.

Convites e ações de emissão/reenvio/revogação ficam registrados em `implanta_customer_access_audit`, com consulta restrita a quem pode ler o projeto. As confirmações e retiradas também entram em `implanta_record_audit`, com autor e horário do servidor. As tabelas privadas de convites não são acessíveis diretamente pelo cliente. Não há acesso ao CPF, tarefas ou demais municípios pelo portal.

## Testar após ativar

1. Em um módulo de teste com dois responsáveis, apresente um ponto, atribua-o a apenas um deles e envie os convites. Confirme que apenas a pessoa atribuída vê esse ponto e que nenhum convite abre o restante da plataforma.
2. Abra o formulário em outro navegador/celular, entre pelo código e marque o aceite. Confira no aplicativo interno o nome, a origem **Confirmado pelo cliente no portal** e o horário. Dê outro OK técnico e confira sua aparição no portal sem recarregar.
3. Confira que o fluxo interno de aceite durante reunião continua disponível. Atribuir um responsável deve manter a flag do cliente desmarcada até haver confirmação.
4. Revogue um convite e teste novamente seu link. Renove e confirme que o link antigo continua bloqueado. Confirme também que os aceites anteriores foram preservados.
5. Complete um módulo de teste e confira o PDF, os nomes/cargos e as assinaturas. Apresentações respondidas Não continuam bloqueando o termo; Não se aplica justificado segue dispensando o ponto, sem aceites.

Os testes automatizados usam um PostgreSQL descartável e respostas de Auth simuladas no navegador. A entrega real de e-mail e os ajustes do painel precisam ser verificados nesta ativação; não são comprovados pela publicação do site.
