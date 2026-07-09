# Morph Head Studio

Mobile-first Morph + Loomis Head app.

The app now loads a physical GLB stored inside this repository first:

- `models/morph_loomis_head_arkit_oculus.glb`
- backup path: `assets/morph-loomis-head/morph_loomis_head_arkit_oculus.glb`

The bundled GLB is restored from the previously downloaded TalkingHead / MPFB asset report and contains real morph targets. The remote Ready Player Me URL is kept only as a last fallback.

## Local run

```bash
npm install
npm run dev
```
