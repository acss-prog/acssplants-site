# Favicon ACSS — ficheiros prontos

Gerados a partir do SVG que já existia embutido no `<link rel="icon">` do site
(marca redonda, `#89C946` + `#CBE28E`), agora em canvas **quadrado 512×512**
com o verde-escuro da marca (`#092E25`) como fundo — o Google renderiza o
favicon sobre branco, e sem fundo a folha clara desapareceria.

## Ficheiros

| Ficheiro | Uso |
|---|---|
| `favicon.ico` | 16/32/48 px multi-resolução — o fallback que o Google procura sozinho |
| `favicon.svg` | vetorial, cantos arredondados (browsers modernos) |
| `favicon-square.svg` | vetorial, fundo a sangrar (fonte dos PNG) |
| `apple-touch-icon.png` | 180×180, iOS/Android |
| `icon-32.png` `icon-48.png` `icon-96.png` `icon-512.png` | tamanhos avulso |
| `preview.png` | pré-visualização (não fazer deploy) |

## Instalação

1. Copiar `favicon.ico`, `favicon.svg` e `apple-touch-icon.png` para a **raiz** do site
2. No `<head>` da **homepage**, substituir o `<link rel="icon" href="data:image/svg+xml;base64,...">` atual por:

```html
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

3. Search Console → Inspeção de URL na homepage → Pedir indexação

O Google só atualiza no próximo rastreio: de vários dias a várias semanas.

## Como foram gerados (para repetir no futuro)

```bash
pip install cairosvg pillow

python3 - <<'PY'
import cairosvg
from PIL import Image
for s in (32, 48, 96, 180, 512):
    cairosvg.svg2png(url='favicon-square.svg', write_to=f'icon-{s}.png',
                     output_width=s, output_height=s)
Image.open('icon-512.png').convert('RGBA').save(
    'favicon.ico', format='ICO', sizes=[(16,16), (32,32), (48,48)])
Image.open('icon-180.png').convert('RGB').save('apple-touch-icon.png')
PY
```

Alternativa sem Python: `rsvg-convert -w 512 -h 512 favicon-square.svg -o icon-512.png`
e `magick icon-16.png icon-32.png icon-48.png favicon.ico`.

> Não usar `convert favicon.svg ...` do ImageMagick sozinho — o rasterizador de
> SVG interno é fraco e produz bordas serrilhadas. Usar cairosvg, resvg,
> rsvg-convert ou Inkscape.
