# Mockit

**Mockups 3D de iPhone en el navegador.** Sube una captura, encuadra la escena con el mouse y exporta un PNG listo para redes, portfolios o presentaciones — sin marca de agua.

> *mockup3d* · alpha

---

## Qué hace

| | |
| --- | --- |
| **Pantalla** | Tu imagen mapeada sobre la pantalla del modelo 3D (JPEG, PNG y HEIC vía conversión en cliente). |
| **Dispositivo** | Color del chasis con swatches + selector libre. |
| **Fondo** | Color sólido para el canvas; combina con el tono del mockup. |
| **Cámara** | OrbitControls: arrastra para reencuadrar; zoom con límites suaves. |
| **Animación** | Auto-rotate opcional para previews dinámicos. |
| **Export** | Un clic → `mockup-<timestamp>.png` desde el canvas WebGL. |

Detalle nerd: Dynamic Island, módulo de cámaras, botones laterales, sombras de contacto y entorno HDRI (*apartment*) para que el metal y el cristal se lean bien.

---

## Stack

```
React 19 · Vite 8 · TypeScript
@react-three/fiber · @react-three/drei · three
Zustand · Tailwind CSS v4 · heic2any
```

---

## Arranque rápido

```bash
npm install
npm run dev
```

Abre la URL que imprime Vite (por defecto `http://localhost:5173`).

```bash
npm run build    # producción
npm run preview  # sirve el build local
```

---

## Uso

1. **Upload screenshot** — elige la captura de tu app o diseño.  
2. Ajusta **color del dispositivo** y **fondo** hasta que cierre con tu marca.  
3. Gira la vista con el mouse hasta el encuadre perfecto.  
4. **Export PNG** — sin watermark; el archivo refleja exactamente lo que ves.

*Tip:* si algo falla con HEIC, exporta la captura como JPEG o PNG desde el dispositivo y vuelve a subir.

---

## Créditos de modelos 3D

Los términos completos del código (MIT) y las atribuciones obligatorias de activos CC están en [`LICENSE`](LICENSE).

### MacBook (Sketchfab)

Modelo **«MacBook»** por **M I H** ([@imamulhasan](https://sketchfab.com/imamulhasan)) en Sketchfab:  
[https://sketchfab.com/3d-models/macbook-289c013e6c0541f498d4c6b40045db88](https://sketchfab.com/3d-models/macbook-289c013e6c0541f498d4c6b40045db88)  
Licencia: [**CC Attribution (CC BY)**](https://creativecommons.org/licenses/by/4.0/).  
El texto legal y cuándo aplica la atribución están en [`LICENSE`](LICENSE).

### iPhone 17 Pro (GLB en el repo)

El archivo `public/models/iphone17pro.glb` corresponde al dispositivo **iPhone 17 Pro** incluido en el repositorio abierto [jessekorzan/themockitship](https://github.com/jessekorzan/themockitship) (*Device Mockup Kit* / mockitship).

El modelo 3D original está acreditado allí como:

- **«Iphone 17 pro»** por [Ibrahim.Bhl](https://skfb.ly/pzYOR) en Sketchfab, bajo licencia [**CC BY 4.0**](https://creativecommons.org/licenses/by/4.0/).

Si redistribuyes capturas o builds que incluyan estos activos, respeta las licencias (en particular la atribución a los autores en Sketchfab).

---

## Licencia y estado

Código del proyecto: **MIT** — ver [`LICENSE`](LICENSE).

Proyecto de **código abierto**: cualquiera puede usar el código, abrir issues y enviar pull requests. El estado es **alpha**; la API y los modelos pueden cambiar.

---

<p align="center">
  <strong>Mockit</strong> — de captura a mockup en minutos.
</p>
