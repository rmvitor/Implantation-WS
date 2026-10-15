# E-mail pessoal por ActiveSync

A área **E-mails** fica na navegação geral, independente de município. A interface usa uma Edge Function `mail` no Supabase para falar com o serviço `https://mail.ipm.com.br/Microsoft-Server-ActiveSync` em HTTPS 443. O link do Mailcow fornecido pelo responsável é um guia de configuração de clientes, não uma API de mensagens. O responsável confirmou a autorização do TI e o acesso externo.

O frontend no GitHub Pages e a função no Supabase têm publicações separadas. **Publicar o site não ativa a função.** Sem ela, Conectar mostra que a conexão ainda não está disponível; não há mensagens de exemplo em produção. Abrir e salvar arquivos locais `.eml` funciona independentemente da ponte.

## Ativar a função no projeto existente

Não execute código deste guia no SQL Editor: **não há migração SQL, nova tabela ou alteração em dados existentes**. São necessários acesso de publicação de Edge Functions ao projeto Supabase e a estrutura de usuários do Implanta já instalada.

No computador do administrador ou do TI, dentro do repositório atualizado, execute:

```sh
git pull
npx supabase login
npx supabase functions deploy mail --project-ref hlwtswrgepsmyoghsghv --no-verify-jwt --use-api
```

O login do CLI é feito pelo administrador no próprio terminal/navegador. Não envie token de administração, senha ou chave `service_role` no chat. A função usa apenas as variáveis públicas `SUPABASE_URL` e `SUPABASE_ANON_KEY` que o Supabase disponibiliza automaticamente.

`--no-verify-jwt` corresponde a `supabase/config.toml`: a verificação automática do gateway é substituída por **verificação explícita obrigatória dentro da função**. Cada operação exige Bearer JWT, valida a identidade com `auth.getUser(token)` e consulta `implanta_access` com esse JWT. A conta precisa estar ativa, liberada pelo ADM e corresponder ao usuário retornado pelo Auth. Requisições sem aprovação não chegam ao Mailcow. Não remova essas verificações.

A origem permitida por padrão é `https://rmvitor.github.io`. Se o site mudar de domínio, configure `MAIL_ALLOWED_ORIGINS` com as origens HTTPS autorizadas, separadas por vírgula. Não use `*`. Desenvolvimento local requer adicionar explicitamente a origem local na função de teste; não é necessário alterar a produção.

A publicação administrativa do Supabase não estava disponível no ambiente que implementou a funcionalidade. A função está pronta no repositório, mas sua implantação e a conexão autenticada com o servidor IPM precisam ser concluídas pelo responsável.

## Conectar a caixa e validar

1. Entre no Implanta com uma conta aprovada e abra **E-mails → Conectar sua caixa**.
2. Informe `vitor.machado@ipm.com.br` ou a caixa IPM do próprio colega. Use preferencialmente uma senha de aplicativo com ActiveSync autorizado pelo Mailcow/TI. Se esse recurso não estiver disponível, confirme com o TI o método permitido. Digite a senha somente no formulário do app.
3. Confira a lista real de pastas, abra uma mensagem conhecida e verifique remetente, assunto, texto e anexos. O padrão mostra os últimos 30 dias, com opções de 1 dia, 7 dias ou todas as datas; cada consulta traz até 50 mudanças. **Carregar mais mensagens** usa a paginação do servidor.
4. Confira leitura/não leitura, atualização e movimentação em uma pasta de teste. Exclusão comum move a mensagem à lixeira; não há exclusão permanente de mensagens pelo leitor. Excluir uma pasta personalizada exige seu nome exato e afeta seu conteúdo no servidor. Pastas padrão não são excluídas/renomeadas pelo app.
5. Para validar envio real, o próprio usuário envia uma mensagem de teste a um destinatário combinado e confere o recebimento, a cópia em Enviados, Cc/Cco e um anexo. **Nenhum e-mail real foi enviado pelos testes automatizados.** Confirmação do servidor não comprova a entrega final ao destinatário.
6. Responda e encaminhe uma mensagem de teste, confira a associação à original e o anexo encaminhado. O servidor precisa aceitar `SmartReply`/`SmartForward` do ActiveSync 14.1.
7. Salve uma mensagem em `.eml`, abra-a pelo app e em outro leitor. No Chrome/Edge para computador compatível, **Pasta para salvar** usa a permissão concedida pelo usuário; novas cópias recebem nomes únicos. Outros navegadores e Android usam o download do sistema. O app não obtém acesso arbitrário às pastas do aparelho.
8. Recarregue o app: a senha deve estar vazia e a conexão deve precisar de novo login. Trocar de município/área sem recarregar mantém a sessão de e-mail. **Desconectar** remove a caixa e as mensagens remotas da memória; sair da conta do Implanta também encerra essa memória.

Se o servidor recusar a senha, devolver 403 ou exigir provisionamento/política de dispositivo, confirme a configuração com o TI. O app não segue redirecionamentos com credenciais nem aceita gerenciamento remoto/apagamento do dispositivo. A primeira verificação sem autenticação neste ambiente retornou HTTP 403; não houve validação autenticada contra a caixa real.

## Funcionalidades e limites

- Caixa por conta, pastas e subpastas (criar/renomear/excluir com confirmação), busca nas mensagens já carregadas, filtro de não lidas, atualização manual e consulta da entrada a cada 60 segundos enquanto o app está visível. Não há serviço de notificações/push com o app fechado.
- Leitura em texto, incluindo conversão de HTML em arquivos locais. Scripts, links ativos e imagens remotas não são exibidos pelo leitor. Anexos são baixados somente por ação do usuário.
- Escrever, responder, encaminhar, Cc/Cco, anexar/remover arquivos, enviar e solicitar cópia em Enviados. O remetente é sempre a caixa autenticada, não um campo arbitrário do cliente.
- Correção ortográfica nativa em português no assunto/texto, conforme teclado e dicionário habilitados no aparelho. Não envia o conteúdo a um serviço externo de revisão.
- Exportação do MIME original como `.eml` com anexos; importação de cópias `.eml`; rascunho local com `X-Unsent: 1`. Rascunhos são arquivos locais, não sincronizados à pasta Rascunhos do servidor.
- Até 20 anexos, somando 5 MB por envio. Leitura/exportação de arquivos e respostas limitada a 16 MB; texto de composição até 200 mil caracteres e leitura remota até 200 mil bytes. Mensagens maiores devem ser abertas pelo webmail. Limites adicionais do servidor se aplicam.
- Cada envio usa um `ClientId` do ActiveSync. Não há reenvio automático. Em perda de confirmação, o formulário mantém o texto e bloqueia novo envio até o usuário conferir Enviados e liberar explicitamente outra tentativa. Não existe fila offline de envio.
- Apenas o dispositivo identificador fica no armazenamento local, separado por usuário. Senha, mensagens, anexos, SyncKeys e arquivos abertos ficam na memória; não entram em projetos, preferências compartilhadas, histórico de navegação, cache de API do PWA ou backups do Implanta. `.eml`/anexos baixados são cópias pessoais persistentes criadas por ação do usuário.
- A senha passa em HTTPS pelo servidor da função durante as operações e segue por HTTPS Basic ao Mailcow. Não é persistida no banco, em cookies, em `localStorage`/`sessionStorage` ou no código. A função não registra corpos, MIME, senha ou respostas privadas em logs.

## Validação de desenvolvimento

```sh
npm test
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test tests/mail.spec.js
npx deno check supabase/functions/mail/index.ts
```

Os testes usam credenciais fictícias, o handler real da ponte e respostas WBXML de um servidor simulado, além de um parser MIME independente. Cobrem autorização, origens, injeção em cabeçalhos, texto/acentos/anexos, sincronização/paginação, pastas, leitura, envio e falhas, não persistência da senha, visualização móvel e arquivos locais sem scripts/rastreamento. Isso não substitui a homologação da versão/configuração real do SOGo/Mailcow com o TI.

Referências: [Mailcow: clientes](https://docs.mailcow.email/client/client/), [Microsoft: MS-ASWBXML](https://learn.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-aswbxml/), [Microsoft: MS-ASCMD](https://learn.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-ascmd/).
