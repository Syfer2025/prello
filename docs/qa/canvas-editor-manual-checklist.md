# Canvas Editor Manual QA Checklist

Use este checklist depois de `npm run dev` e antes de considerar a integração do Canvas Editor pronta para uma rodada de produto.

URL local:

```text
http://localhost:5173/
```

## Ambiente

- [ ] `npm run smoke:canvas` passa.
- [ ] `npm run stress:canvas` passa.
- [ ] `npm test` passa.
- [ ] `npm run lint` passa.
- [ ] `npm run build` passa.
- [ ] Dev server abre sem tela branca.
- [ ] Console do navegador não mostra erro vermelho ao carregar.

## Abertura Do Editor

- [ ] Entrar/abrir um projeto leva ao editor novo (`CanvasEditorShell`), sem laboratório ou editor legado.
- [ ] O documento abre com título de projeto visível.
- [ ] A toolbar aparece em linhas organizadas.
- [ ] Não há texto chinês visível na interface.
- [ ] O contador de páginas aparece.
- [ ] O contador de palavras aparece.
- [ ] Há páginas/canvas visíveis no palco central.

## Edição Básica

- [ ] Clicar dentro da página permite digitar texto.
- [ ] Texto digitado aparece no editor.
- [ ] Status muda para `Não salvo` depois de editar.
- [ ] Botão `Salvar` fica disponível depois de editar.
- [ ] Salvar muda status para `Salvo`.
- [ ] Recarregar a página mantém o conteúdo salvo.

## Texto Longo

- [ ] Colar um texto grande não trava o navegador.
- [ ] O editor cria múltiplas páginas reais.
- [ ] A rolagem entre páginas funciona.
- [ ] O contador de páginas aumenta depois do texto grande.
- [ ] A página não vira um único canvas gigante/infinito.

## Quebra E Capítulos

- [ ] Botão `Quebra` insere uma quebra de página.
- [ ] Depois da quebra, o conteúdo seguinte começa em nova página.
- [ ] O contador de páginas acompanha a mudança.
- [ ] Salvar e recarregar preserva a quebra.

## Formatação

- [ ] Negrito aplica no texto selecionado.
- [ ] Itálico aplica no texto selecionado.
- [ ] Sublinhado aplica no texto selecionado.
- [ ] Tachado aplica no texto selecionado.
- [ ] Tamanho de fonte muda o texto selecionado ou o texto novo.
- [ ] Família de fonte muda o texto selecionado ou o texto novo.
- [ ] Cor do texto muda sem quebrar seleção/edição.
- [ ] Realce muda sem quebrar seleção/edição.
- [ ] Alinhamento esquerda/centro/direita/justificado responde.
- [ ] H1/H2/H3 aplicam estilo de título.

## Inserções

- [ ] Lista numerada funciona.
- [ ] Lista bullet funciona.
- [ ] Tabela pequena 3x3 insere sem quebrar a página atual.
- [ ] Imagem PNG/JPG pequena insere.
- [ ] Link simples insere.
- [ ] Checkbox insere.
- [ ] Radio insere.
- [ ] Data insere.
- [ ] Bloco insere.

## Busca E Substituição

- [ ] Buscar termo existente destaca ou navega para ocorrência.
- [ ] Próximo/anterior navegam sem erro.
- [ ] Substituir troca uma ocorrência esperada.
- [ ] Buscar termo inexistente não quebra a tela.

## Página E Papel

- [ ] Zoom + aumenta visualmente.
- [ ] Zoom - diminui visualmente.
- [ ] `1:1` volta ao tamanho normal.
- [ ] Alternar `Páginas`/`Contínuo` não perde conteúdo.
- [ ] Trocar papel para A5 funciona.
- [ ] Trocar papel para 6x9 funciona.
- [ ] Trocar orientação retrato/paisagem não perde conteúdo.
- [ ] Recarregar depois de salvar mantém o conteúdo.

## PDF

- [ ] Exportar PDF baixa um arquivo.
- [ ] PDF abre no visualizador do sistema.
- [ ] PDF não está vazio.
- [ ] Número de páginas do PDF bate com o contador do editor.
- [ ] Texto visível no PDF bate visualmente com o editor.
- [ ] Quebras de página aparecem no PDF.
- [ ] Nenhuma página sai cortada.
- [ ] Exportação usa captura raster de 300 DPI (`canvasPixelRatioForPrintDpi`).
- [ ] Console informa os avisos conhecidos: raster, não PDF/X, não CMYK.

## Preflight De Exportação

- [ ] O card `Preflight de Exportação` aparece no painel direito.
- [ ] Antes de exportar, `Resolução raster` e `PDF boxes` aparecem como `Pendente`.
- [ ] `PDF/X`, `CMYK`, `OutputIntent ICC` e `Texto vetorial/selecionável` aparecem como `Pendente`.
- [ ] Nenhum desses quatro itens profissionais aparece como `OK` (seria desonesto).
- [ ] Depois de exportar com sucesso, `Resolução raster` e `PDF boxes` viram `OK`.
- [ ] O botão de exportação diz `Exportar PDF 300 DPI (raster)`, não "pronto para gráfica".
- [ ] Passar o mouse em cada item mostra o tooltip explicando o status.

## Exportação Vetorial (Offset / PDF/X-1a)

- [ ] Existe o botão `Exportar PDF/X (offset)`.
- [ ] Clicar baixa `*-pdfx.pdf` quando o dev server local está rodando com Ghostscript disponível.
- [ ] O arquivo `-pdfx.pdf` abre no leitor e não está vazio.
- [ ] O número de páginas do PDF bate com o editor.
- [ ] A mensagem confirma `PDF/X-1a CMYK baixado`.
- [ ] Texto vermelho no editor continua vermelho no `-pdfx.pdf`.
- [ ] Realce amarelo no editor continua amarelo no `-pdfx.pdf`.
- [ ] Sublinhado no editor aparece como linha sob o texto no `-pdfx.pdf`.
- [ ] Tachado no editor aparece como linha no meio do texto no `-pdfx.pdf`.
- [ ] Espaçamento/line-height aplicado no editor não volta ao padrão no `-pdfx.pdf`.
- [ ] Em documento só com texto preto, `gs -q -o - -sDEVICE=inkcov <arquivo>-pdfx.pdf` mostra `0.00000 0.00000 0.00000 K` nas colunas CMY.
- [ ] `pdfinfo -box <arquivo>-pdfx.pdf` mostra `TrimBox` menor que `BleedBox` e `BleedBox` menor que `MediaBox`.
- [ ] As marcas de corte aparecem fora da área de sangria quando o PDF é renderizado.
- [ ] A sangria padrão é 3 mm e a área extra existe no PDF.
- [ ] Se o endpoint local falhar, o app baixa `*-vetorial.pdf` como PDF vetorial sem PDF/X e mostra a mensagem correspondente.
- [ ] Abrir o PDF vetorial sem PDF/X: o texto é **selecionável** (não é imagem) e nítido.
- [ ] Fallback CLI: `npm run pdfx -- <arquivo>-vetorial.pdf` gera `*-vetorial-pdfx.pdf`.
- [ ] (Opcional) Acrobat Preflight reconhece como PDF/X-1a.
- [ ] Lembrar: sem ICC customizado, o perfil é CMYK genérico do Ghostscript, não FOGRA39.
- [ ] Lembrar: marcas e caixas não criam arte sangrada sozinhas; se houver capa/imagem, a arte precisa passar do trim até a sangria.

## Lado A Lado

- [ ] Botão `📄📄` ativa o modo lado a lado.
- [ ] Dois painéis aparecem.
- [ ] Editar no painel principal não quebra o painel secundário.
- [ ] Desativar lado a lado volta para um painel.
- [ ] Salvar ainda funciona após usar lado a lado.

## Critérios De Falha

Marque como falha e pare a rodada se acontecer:

- [ ] Tela branca ao abrir.
- [ ] Erro vermelho no console ao carregar.
- [ ] Digitação trava por mais de 2 segundos em texto normal.
- [ ] Salvar não preserva conteúdo ao recarregar.
- [ ] PDF baixa vazio ou com páginas cortadas.
- [ ] Texto longo vira canvas único gigante.
- [ ] Interface volta a mostrar chinês.

## Riscos Conhecidos Fora Deste Checklist

Estes itens não estão resolvidos pelo MVP:

- Margem espelhada `inside/outside` por página par/ímpar.
- Produção precisa de endpoint servidor/VPS/container para rodar Ghostscript fora do navegador.
- PDF/X usa ICC genérico por padrão; a gráfica deve fornecer o perfil final.
- Tabelas longas quebrando entre páginas.
- Performance real de renderização de 200 páginas no navegador.
