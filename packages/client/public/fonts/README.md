# Self-hosted fonts

Both families are licensed under the SIL Open Font License 1.1 (`OFL.txt` from the same source directory, copied to `LICENSE-*.txt`; the Atkinson Hyperlegible file is the Braille Institute of America OFL 1.1 text that ships in google/fonts).

## Sources

Repository `https://github.com/google/fonts`, raw files from `main`, fetched 2026-09-30. Last commit touching each directory at that time:

- `ofl/bricolagegrotesque/BricolageGrotesque[opsz,wdth,wght].ttf` at `6ce172f74aa355ea43eb964fa4a91570a4d3064d`
- `ofl/atkinsonhyperlegible/AtkinsonHyperlegible-Regular.ttf` and `-Bold.ttf` at `95f4904fc8bcf26d3420fe315560c96417c6dec7`

## Commands (work in /tmp/fonts)

```sh
B=https://raw.githubusercontent.com/google/fonts/main/ofl
curl -fsSL -o bric.ttf "$B/bricolagegrotesque/BricolageGrotesque%5Bopsz,wdth,wght%5D.ttf"
curl -fsSL -o bric-OFL.txt $B/bricolagegrotesque/OFL.txt
curl -fsSL -o atk-R.ttf $B/atkinsonhyperlegible/AtkinsonHyperlegible-Regular.ttf
curl -fsSL -o atk-B.ttf $B/atkinsonhyperlegible/AtkinsonHyperlegible-Bold.ttf
curl -fsSL -o atk-OFL.txt $B/atkinsonhyperlegible/OFL.txt

# Pin width, keep opsz and wght 500-700
uvx --from fonttools fonttools varLib.instancer bric.ttf wdth=100 wght=500:700 -o bric-inst.ttf

# Latin subset, WOFF2
U="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
sub() { uvx --from 'fonttools[woff]' pyftsubset "$1" --flavor=woff2 --layout-features='*' --unicodes="$U" --output-file="$2"; }
sub bric-inst.ttf "BricolageGrotesque[opsz,wght].woff2"
sub atk-R.ttf AtkinsonHyperlegible-Regular.woff2
sub atk-B.ttf AtkinsonHyperlegible-Bold.woff2
```
