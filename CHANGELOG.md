# Changelog

Todas as mudanças importantes do Pluma ficam registradas aqui.

## [1.1.0] - 2026-11-09

### Adicionado

- **Modo Ritmo**, um jogo musical de digitação: as letras descem por quatro pistas, uma para cada grupo de dedos, ligadas pela ordem da palavra, e você digita cada uma quando ela encosta no círculo, no tempo da música.
- **56 músicas originais** compostas para o Pluma em **18 estilos** (chiptune, synthwave, rock, punk, pop, disco, house, funk, samba, bossa nova, baião, reggae, lo-fi, jazz, drum and bass, metal, frevo e blues), cada uma com andamento, tom, escala, progressão de acordes, bateria, baixo, timbre e melodia próprios, tocadas pelo sintetizador do navegador (Web Audio), sem arquivos de áudio.
- **Escolha de música**: lista com busca por nome, banda ou estilo, filtro por estilo e a nota de cada música; **←** e **→** trocam a faixa e **Tab** sorteia outra.
- **Julgamento por tempo**: PERFEITO (até 45 ms), ÓTIMO (até 90 ms) e BOM (até 140 ms); notas que passam viram erro e teclas erradas quebram o combo.
- **Pontuação** com multiplicador de ×1 a ×4 (sobe a cada 10 acertos seguidos), **notas longas** para segurar a tecla, combo ao fundo do palco, painel de pontos e de música com precisão e progresso, e fila de palavras com a próxima letra sublinhada.
- **Contagem de entrada**, **pausa** com Espaço (e sozinha ao trocar de aba ou abrir um painel) e retomada com contagem de 3 tempos.
- **Resultado do Ritmo** com pontos, nota de S a D, precisão, perfeitos, ótimos, bons, perdidas, teclas erradas, notas longas, letras por minuto, sincronia média e as letras para treinar; **recordes por música** no histórico e no CSV.
- Preferências de **volume da música** e **sincronia** (de −200 a +200 ms) para compensar o atraso de fones e caixas de som.
- O conteúdo, o tamanho e a complexidade também valem no Ritmo: o conteúdo escolhe as palavras, o tamanho a duração (cerca de 45 s, 1 min 30 e 2 min 30) e a complexidade a densidade das notas.

### Corrigido

- O aviso de fim de teste para leitores de tela ficava visível na área de digitação; agora fica só para leitores de tela.
- O CSV do histórico protege células que começam com `=`, `+`, `-` ou `@` contra fórmulas nas planilhas.

## [1.0.0] - 2026-11-04

### Adicionado

- **Modo Livre**, sem cronômetro: os textos vão chegando um atrás do outro e **Ctrl+Enter** encerra a sessão com o diagnóstico de todos os textos. Opção **Avançar só com a tecla certa**, que segura a letra errada até você acertar.
- **Modo Teste**: o tempo começa no primeiro toque e para no último, com o tempo final no diagnóstico.
- **Nove conteúdos**: Texto, Palavras, Sem acentos, Alfabeto, Números, Teclado num., Dados, Misto e Customizado, em três tamanhos (Curto, Médio e Longo) e três complexidades (Fácil, Média e Difícil).
- Acervo com **204 textos originais em português** e **665 palavras e onomatopeias**, todos digitáveis num teclado ABNT2.
- **Misto**: palavras, números, letras soltas, onomatopeias e símbolos no mesmo texto.
- **Customizado** com envio de **PDF, DOCX, DOC, ODT e TXT** (até 25 MB), por botão ou arrastando o arquivo para a página. O texto é adaptado para digitar (aspas curvas, travessões, marcadores, ligaduras, hifenização e símbolos que não existem no teclado) e documentos longos viram partes, com **Próxima parte**, **Parte anterior** e a escolha da parte inicial.
- **Diagnóstico** com tempo, toques brutos, acertos, erros (corrigidos e não corrigidos), precisão, toques líquidos e toques líquidos por minuto, palavras por minuto, consistência, maior sequência, o gráfico do ritmo segundo a segundo e as teclas para treinar.
- **Digitação animada**: cursor que desliza por mola, rolagem suave das linhas, realce da palavra atual, letras que ganham tinta, erros que tremem, sequências comemoradas com faíscas em pixel art e penas caindo no fim do teste.
- **Teclado na tela** ABNT2 e numérico, com a próxima tecla, a cor do dedo certo e a sequência dos acentos (´ ~ ^ `).
- **Histórico e recordes** salvos no navegador, com a evolução dos testes, o recorde de cada categoria e exportação em CSV.
- **Paletas** Pluma, Bento, Sonda e Nexo, cada uma com tema claro e escuro.
- **Tutorial rápido** de oito passos, que pode ser pulado e fica no menu do logo.
- Preferências de cursor (linha, bloco ou sublinhado), tamanho da letra, efeitos e som das teclas.
- `Pluma.html`: o site inteiro num arquivo só, com Content-Security-Policy por hash, que abre com dois cliques e é publicado no GitHub Pages.
- Ferramentas em Java 21 sem dependências: `tools/Servidor.java` (servidor local, inclusive para a rede) e `tools/Acervo.java` (conferência do acervo).
- Testes de unidade, ponta a ponta (Playwright) e CI no GitHub Actions.
