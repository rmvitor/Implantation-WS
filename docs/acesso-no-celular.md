# Recuperar o acesso no app instalado

Se o PC abre normalmente, mas o celular mostra uma versão antiga e um erro sobre SQL, confira primeiro a atualização e a conexão daquele aparelho. A mensagem de erro sozinha não confirma migrações ausentes.

Foi confirmado no código até a v1.19.1: o registro/aviso de atualização do PWA só era iniciado dentro do workspace, depois do login e do carregamento dos projetos. Uma pessoa presa na tela de acesso não recebia esse controle. A v1.19.2 inicia o serviço antes do login, inclui atualização na tela de acesso e um diagnóstico com servidor, conta, etapa e código, sem expor chaves ou tokens.

## Para sair de uma versão antiga

1. No celular, abra [Recuperar atualização deste aparelho](https://rmvitor.github.io/Implantation-WS/assets/atualizar.html) no mesmo navegador/perfil usado pelo app instalado.
2. Salve os rascunhos de outras abas abertas do Implanta.
3. Toque em **Atualizar este aparelho** e aguarde abrir o aplicativo.
4. Feche e reabra o app instalado, caso ele ainda esteja mostrando a tela antiga. Confira **v1.19.2** ou posterior no rodapé.
5. Toque em **Verificar acesso**, se necessário.

Não é preciso reinstalar o app, apagar os dados do navegador ou reaplicar SQL para esta correção. A recuperação atualiza somente o service worker do escopo do Implanta; não remove armazenamento local, senhas/sessões ou configurações de conexão. Ela respeita a conexão já escolhida naquele aparelho.

O arquivo de recuperação fica em `/assets/atualizar.html`, caminho que a v1.18.0 já excluía do redirecionamento offline para o HTML antigo. Assim ele consegue abrir pela rede mesmo quando a tela antiga não carrega o atualizador. O link precisa de internet e não verifica ou altera o banco de dados.

## Se o erro continuar na versão atual

Abra **Diagnóstico do acesso**. Compare o **Servidor** e a **Conta** com o PC. O servidor padrão desta instalação é `hlwtswrgepsmyoghsghv.supabase.co`. Uma conexão personalizada fica salva por aparelho e pode explicar a diferença. Quando houver outra conexão, a tela oferece **Usar conexão padrão do Implanta**, com confirmação, sem apagar cadastros ou as sessões armazenadas.

O diagnóstico identifica a fase `implanta_access` (conta) ou `implanta_read_v2` (projetos). Registre servidor, etapa, versão e código de erro para investigar; não compartilhe senha, chave administrativa ou token de sessão.

- `PGRST202`: função/assinatura não encontrada no cache da API; pode ser conexão, contrato de versão ou estrutura/cache do servidor.
- `PGRST205` / `42P01`: uma relação não foi encontrada pela API/banco; precisa conferir a conexão e o objeto específico.
- `42501`: operação recusada pelo servidor; é preciso verificar a sessão e os acessos, sem desabilitar as permissões do banco.

Checagens anônimas com `limit=0` ou chamadas protegidas recusadas confirmam apenas a presença pública dos objetos consultados. Elas não validam a sessão do celular nem comprovam que todas as funções funcionam para aquela conta. A correção de atualização não substitui essa investigação quando o erro persiste.

Testes automatizados cobrem registro do PWA na tela de falha de acesso, recuperação de uma página antiga sem JavaScript, atualização com formulários abertos, preservação de sessão/cadastros e caches de outros aplicativos. Nenhum dado de produção é alterado pelos testes.

## Erro depois de tocar em Entrar (v1.19.3)

A autenticação acontece antes de consultar os projetos. A mensagem antiga “Não foi possível entrar. Confira e-mail e senha ou tente novamente” encobria também erros de rede, e-mail não confirmado e limites do serviço. A v1.19.3 distingue esses casos e abre o diagnóstico mesmo sem sessão. Informe somente o código e a etapa, nunca a senha ou token.

`invalid_credentials` indica que o serviço recusou a combinação de e-mail/senha; não determina qual dos dois está incorreto. Use a opção de visualizar a senha para conferir o preenchimento no aparelho ou a recuperação de senha pelo próprio usuário. `email_not_confirmed` pede confirmar o e-mail; `network_error` indica conexão ao serviço; HTTP 429 indica limite temporário. `session_lock_timeout` pede fechar outras janelas e repetir a operação. Uma sessão ainda aberta no PC não comprova que a senha digitada no celular é a atual.

Nenhuma senha é modificada ou enviada pela manutenção. Uma redefinição só ocorre quando o próprio usuário a solicita no aplicativo. O diagnóstico exibe códigos controlados, sem reproduzir corpos de requisições, descrições arbitrárias ou credenciais.
