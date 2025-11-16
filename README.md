# Electron + Svelte 5 + shadcn-svelte + esbuild

Bu proje, Electron, Svelte 5, shadcn-svelte ve esbuild kullanarak oluşturulmuş temel bir masaüstü uygulama yapısıdır.

## Kurulum

```bash
npm install
```

## Geliştirme

```bash
npm run dev
```

Bu komut aynı anda:
- Main process'i (Electron) watch modunda derler
- Renderer process'i (Svelte) watch modunda derler
- Electron uygulamasını başlatır

## Build

```bash
npm run build
```

Bu komut hem main hem de renderer process'lerini production için derler.

## Proje Yapısı

```
advosc/
├── src/
│   ├── main/                   # Electron main process (TypeScript)
│   │   ├── main.ts            # Ana Electron dosyası
│   │   └── preload.ts         # Preload script
│   └── renderer/              # Renderer process (Svelte 5)
│       ├── lib/
│       │   ├── components/
│       │   │   └── ui/       # shadcn-svelte bileşenleri
│       │   └── utils.ts      # Yardımcı fonksiyonlar
│       ├── App.svelte        # Ana Svelte bileşeni
│       ├── main.ts           # Renderer giriş noktası
│       └── app.css           # Global stiller
├── scripts/
│   ├── build-main.js         # Main process build script
│   └── build-renderer.js     # Renderer process build script
├── dist/                     # Build çıktıları
├── index.html                # HTML şablonu
├── package.json
├── tsconfig.json             # Main process TypeScript config
├── tsconfig.renderer.json    # Renderer process TypeScript config
├── tailwind.config.js
└── postcss.config.js
```

## Özellikler

- ⚡ **esbuild**: Hızlı derleme
- 🎨 **Svelte 5**: Modern reaktif framework
- 🎭 **shadcn-svelte**: Hazır UI bileşenleri
- 💅 **Tailwind CSS**: Utility-first CSS framework
- 🔒 **TypeScript**: Tip güvenliği
- 🖥️ **Electron**: Cross-platform masaüstü uygulaması

## shadcn-svelte Bileşenleri Ekleme

Yeni shadcn-svelte bileşenleri eklemek için `src/renderer/lib/components/ui/` dizinine yeni bileşenler ekleyebilirsiniz.
