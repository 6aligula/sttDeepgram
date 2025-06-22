# STT con Deepgram

Aplicación de conversión de voz a texto (Speech-to-Text) utilizando la API de Deepgram.

## Requisitos previos

- Node.js (v14 o superior)
- npm (v6 o superior) o yarn
- Una cuenta en [Deepgram](https://console.deepgram.com/signup) para obtener una API key

## Instalación

1. Clona el repositorio:
   ```bash
   git clone https://github.com/6aligula/sttDeepgram.git
   cd sttDeepgram
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Crea un archivo `.env` en la raíz del proyecto y agrega tu API key de Deepgram:
   ```
   DEEPGRAM_API_KEY=tu_api_key_aquí
   ```

## Uso

Para ejecutar la aplicación en modo desarrollo:

```bash
npm run dev
```

Para compilar el proyecto:

```bash
npm run build
```

Para ejecutar la versión compilada:

```bash
npm start
```

## Estructura del proyecto

- `src/` - Código fuente TypeScript
  - `index.ts` - Punto de entrada de la aplicación
- `dist/` - Código JavaScript compilado (se genera al compilar)
- `node_modules/` - Dependencias (no se incluye en el control de versiones)

## Licencia

Este proyecto está bajo la Licencia ISC.
