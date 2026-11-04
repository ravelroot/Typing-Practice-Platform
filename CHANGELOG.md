# Changelog

Todas as mudanças importantes do Pluma ficam registradas aqui.

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
