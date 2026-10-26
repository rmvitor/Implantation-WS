# Portal opcional do cliente — 1.17.2

O cliente pode confirmar pessoalmente os pontos do **Aceite da implantação**, por módulo e entidade. O preenchimento interno durante a reunião continua funcionando, inclusive sem convite. A conferência anterior dos dados migrados permanece independente.

## Ativar no Supabase já utilizado pela equipe

Não é necessário contratar outro serviço de envio, instalar um servidor ou informar senhas no aplicativo. O portal usa o **Supabase Auth com o SMTP já configurado**. A publicação do site não executa SQL nem altera os modelos de e-mail do seu Supabase.

1. A base precisa estar usando os registros separados dos aceites e as flags da versão 1.16. Se ainda não ativou, siga antes o [guia da homologação](homologacao-implantacao.md). Faça backup administrativo antes de instalar a estrutura.
2. Se ainda não ativou o portal, abra **Supabase → SQL Editor → New query**, cole **todo** o arquivo [202610260003_customer_portal.sql](../supabase/migrations/202610260003_customer_portal.sql) e clique em **Run**. Não há campos para substituir. O arquivo é transacional e pode ser reaplicado; preserva municípios, respostas, responsáveis, termos e permissões. **Quem já aplicou esse SQL não precisa de outro SQL para usar o e-mail padrão.** Não reaplique os arquivos antigos sobre uma base atualizada.
3. Em **Authentication → URL Configuration**, preencha:

   **Site URL**

   ```text
   https://rmvitor.github.io/Implantation-WS/
   ```

   **Redirect URLs** — adicione estas duas entradas e salve:

   ```text
   https://rmvitor.github.io/Implantation-WS/
   https://rmvitor.github.io/Implantation-WS/**
   ```

   O aplicativo solicita o retorno para `https://rmvitor.github.io/Implantation-WS/?aceite=IDENTIFICADOR`. A regra com `/**` permite o identificador de cada convite. Se o retorno solicitado não estiver permitido, o Supabase pode substituí-lo pelo Site URL. Um Site URL ainda como `localhost:3000` leva a uma página indisponível; voltar somente à raiz do Implanta perde a identificação do formulário. Para outro domínio, use os endereços reais desse aplicativo.
4. **Mantenha os templates padrão do Supabase. Não é obrigatório editá-los.** O botão/link do e-mail confirma o acesso e retorna diretamente ao formulário, sem digitar código. Isso funciona tanto no primeiro acesso (**Confirm signup**) quanto nos seguintes (**Magic Link**). O aplicativo usa um fluxo que pode ser aberto em outro navegador/celular, sem depender do navegador do técnico.
5. Mantenha o provedor **Email**, a confirmação de e-mail e a criação de contas Auth habilitados. Se houver CAPTCHA obrigatório no Auth, ele precisará de integração adicional antes de usar este fluxo. Preserve as restrições e os limites de envio definidos pela equipe.
6. Atualize o aplicativo. Em um convite válido, use **Reenviar e-mail** e abra **o link do novo e-mail**. Se o convite já venceu, use **Renovar por 7 dias e enviar**. As mensagens antigas podem conter o endereço de retorno anterior ou um link consumido/vencido.

**O convite dura 7 dias; o link de autenticação do e-mail tem validade própria, pode vencer antes e normalmente é de uso único.** Reenviar e-mail não prolonga o convite. Não se deve alterar o Site URL para o formulário de um cliente específico: ele deve continuar sendo o endereço geral acima.

O sistema não armazena senhas do SMTP, chave administrativa nem o código enviado. Somente a conexão pública já existente fica no navegador. Não coloque `service_role`, chaves secretas ou senhas nos arquivos publicados.

### Se quiser usar código numérico — opcional

Os templates personalizados continuam disponíveis. Configure-os apenas se tiver permissão para editar os e-mails e quiser enviar código em vez de autenticação direta pelo link. Em **Authentication → Email Templates** (ou **Notifications → Email**, conforme o painel):

| Modelo no painel | Assunto sugerido | Conteúdo para copiar |
| --- | --- | --- |
| Magic Link | Implanta · Código de acesso | [customer-magic-link.html](../supabase/templates/customer-magic-link.html) |
| Confirm signup | Implanta · Confirmação de acesso | [customer-confirm-signup.html](../supabase/templates/customer-confirm-signup.html) |

Copie o HTML inteiro no corpo de cada modelo e salve, preservando o SMTP. Não substitua o modelo **Invite user**: o aplicativo utiliza Supabase Auth por e-mail. Mantenha a condição do modelo Confirm signup, que conserva o link de confirmação e o aviso de aprovação pelo Master para os colegas que se cadastram normalmente.

No formulário do cliente, abra **Recebi um código por e-mail** para usar essa alternativa. O e-mail padrão que contém apenas um link não exige preencher código.

### Se o link não abrir o formulário

- **Localhost/página indisponível:** confira Site URL e Redirect URLs acima; salve e reenvie o e-mail pelo convite atual.
- **Login normal do Implanta:** o destino pode ter perdido `?aceite=...`. Confira a regra `/**` nas Redirect URLs e reenvie. O cliente não precisa entrar pela tela de login da equipe nem ser aprovado como colaborador.
- **Link inválido/vencido:** abra o mais recente, uma única vez. Depois que o link for consumido, a sessão fica na aba do cliente. Se necessário, solicite outro pelo formulário ou use Reenviar e-mail na equipe. Sistemas corporativos que abrem links automaticamente podem consumir links de uso único; se persistir, avalie esse comportamento com o TI.
- **Formulário abriu, mas o acesso foi negado:** confira o e-mail do responsável, a validade/revogação do convite e alterações no cadastro. Verifique também a ativação do SQL do portal. Um link válido de login não substitui a permissão do convite.

## Preparar e enviar

1. Entre no município e em **Aceite da implantação**. Escolha a entidade e o módulo.
2. Em **Responsáveis**, cadastre nome, cargo e e-mail. O e-mail continua opcional para a conferência interna, mas é obrigatório para um convite.
3. Para cada ponto apresentado, marque **Aceite técnico: Sim**. Com vários responsáveis, use **Responsáveis do ponto** para definir quem precisa validar aquele item. Esse botão **não registra aceite do cliente**. Com um único responsável, a atribuição ocorre automaticamente; ao emitir seu convite, pontos positivos antigos ainda sem atribuição também recebem esse responsável.
4. Na aba da pessoa, clique em **Acesso externo do cliente**, depois em **Gerar acesso e enviar e-mail**. O cadastro é salvo antes de gerar o convite. Com o modelo padrão, o Supabase envia o link de autenticação; com um modelo personalizado, também pode mostrar o código.
5. Você também pode copiar o link. Ele só contém o identificador do convite: o cliente ainda precisa confirmar a posse do e-mail pelo link enviado ou, quando disponível, pelo código. O link de autenticação e o código não são mostrados ao técnico.

**Envio solicitado ao Supabase** significa que a API aceitou a solicitação; não é confirmação de entrega na caixa postal. Se houver falha de SMTP, o convite continua disponível para copiar ou reenviar, sem precisar gerar outro. Confira a pasta de spam, os limites de envio e os logs do Auth/SMTP. **Reenviar e-mail** mantém a validade original do convite; **Renovar por 7 dias e enviar** cria outro link e revoga o anterior.

## Acesso do cliente

- No e-mail padrão, o cliente clica no link e entra diretamente no formulário. Se abrir somente o link do formulário copiado pelo técnico, informa o **mesmo e-mail cadastrado** e usa **Enviar link de acesso**. Essa solicitação vale para uma conta Auth já criada e não substitui a emissão inicial pela equipe. Se o modelo de e-mail incluir código, pode usar a opção recolhida **Recebi um código por e-mail**.
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
2. Abra o formulário em outro navegador/celular, entre pelo link do e-mail padrão e marque o aceite. Se usar modelo com código, teste também essa alternativa. Confira no aplicativo interno o nome, a origem **Confirmado pelo cliente no portal** e o horário. Dê outro OK técnico e confira sua aparição no portal sem recarregar.
3. Confira que o fluxo interno de aceite durante reunião continua disponível. Atribuir um responsável deve manter a flag do cliente desmarcada até haver confirmação.
4. Revogue um convite e teste novamente seu link. Renove e confirme que o link antigo continua bloqueado. Confirme também que os aceites anteriores foram preservados.
5. Complete um módulo de teste e confira o PDF, os nomes/cargos e as assinaturas. Apresentações respondidas Não continuam bloqueando o termo; Não se aplica justificado segue dispensando o ponto, sem aceites.

Os testes automatizados usam um PostgreSQL descartável e respostas de Auth simuladas no navegador. A entrega real de e-mail e os ajustes do painel precisam ser verificados nesta ativação; não são comprovados pela publicação do site.
