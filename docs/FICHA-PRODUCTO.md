# 📋 Ficha de producto — esquema propuesto

Basado en la plantilla del **Inversor Tataliken 4000W (12V)**.
Estado: **propuesta**, pendiente de aprobación. Nada implementado todavía.

---

## 1. Los 5 bloques de la plantilla

| # | Bloque | Naturaleza | ¿Existe hoy? |
|---|---|---|---|
| 1 | 📊 Especificaciones Clave | 4 datos, `Etiqueta: Valor` | ✅ es el campo `specs` |
| 2 | ⚙️ Ficha Técnica Detallada | N datos, `Etiqueta: Valor` | ⚠️ está dentro de `descripcion`, en texto |
| 3 | ⚡ Características Principales | `Título: beneficio` (no son números) | ⚠️ mezclado con el bloque 2 |
| 4 | 🎯 Ideal Para | lista de casos de uso | ❌ **no existe en ningún producto** |
| 5 | 📦 ¿Qué incluye la caja? | lista con cantidades | ❌ **no existe en ningún producto** |

---

## 2. Decisión de diseño: `specs` NO se toca

El bloque 1 **ya funciona hoy sin cambiar una línea de código.**

`js/src/tm-product.src.js` (~L604) parte cada spec por el primer `:` y arma
una tabla de dos columnas. O sea que esto:

```json
"specs": [
  "Potencia: 4000W Pico / 2000W Continuos",
  "Voltaje: Entrada 12V DC ➔ Salida 110V / 220V AC",
  "Tipo de Onda: Modificada",
  "Uso: Respaldo y sistemas solares"
]
```

…ya se dibuja como la tabla que pide la plantilla. Hoy el producto tiene
`["⚡ 4000W de Potencia", "🔋 Conversión 12V DC a AC"]`, que cae en la rama
"sin etiqueta" y sale como una fila suelta.

**Conclusión: el bloque 1 es 100% limpieza de datos, cero código.**
Y mantener `specs` con su nombre y su forma es lo que evita romper las otras
7 superficies que lo leen (cards, carteles, cotización, OG, `/p/`, bot, Revolico).

---

## 3. Campos nuevos (aditivos)

Un producto que no los tenga simplemente no dibuja esa sección.

```jsonc
{
  // ... campos actuales sin cambios ...

  "ficha": [                                    // bloque 2
    { "k": "Marca", "v": "Tataliken" },
    { "k": "Potencia Máxima (Pico)", "v": "4000W", "nota": "para arranques" },
    { "k": "Potencia Real (Continua)", "v": "2000W" },
    { "k": "Voltaje de Entrada", "v": "12V DC", "nota": "requiere batería de 12V" },
    { "k": "Voltaje de Salida", "v": "110V / 220V AC", "nota": "según toma seleccionada" },
    { "k": "Tipo de Onda", "v": "Sinusoidal Modificada",
      "nota": "ideal para cargas resistivas y motores estándar; verificar compatibilidad con equipos electrónicos delicados" }
  ],

  "caracteristicas": [                          // bloque 3
    { "t": "Capacidad de respaldo",
      "d": "Mantiene operativos electrodomésticos medianos y esenciales como ventiladores, televisores, bombillos LED y carga de dispositivos." },
    { "t": "Sistema de enfriamiento",
      "d": "Carcasa de aluminio con disipación térmica eficiente y ventilador integrado contra sobrecalentamiento." },
    { "t": "Seguridad",
      "d": "Protecciones incorporadas contra cortocircuitos, bajo voltaje e inversión de polaridad." }
  ],

  "idealPara": [                                // bloque 4
    "Hogares en Cuba que buscan respaldo ante los cortes de electricidad con un banco de baterías de 12V.",
    "Sistemas fotovoltaicos pequeños o medianos que operan bajo este mismo voltaje."
  ],

  "incluye": [                                  // bloque 5
    "1x Inversor Tataliken 4000W (12V)",
    "1x Juego de pinzas de conexión directa a batería",
    "1x Manual de usuario"
  ]
}
```

**Por qué `ficha` es `[{k,v}]` y no un objeto `{k: v}`:** el orden importa
(Potencia antes que Voltaje) y JSON no garantiza orden de claves. Además el
array permite `nota`, que la plantilla usa y que es justo donde vive el
descargo de responsabilidad de la onda modificada.

**Por qué `nota` está separada del valor:** para que el valor siga siendo
comparable entre productos. `"Sinusoidal Modificada"` se puede filtrar y
comparar; `"Sinusoidal Modificada (ideal para cargas resistivas…)"` no.

---

## 4. Impacto por archivo

| Archivo | Cambio |
|---|---|
| `js/src/tm-product.src.js` | render de los 4 bloques nuevos en el modal |
| `css/modal-v4.css` | estilos de las secciones nuevas |
| `admin.html` | editor por bloques (hoy es un `<textarea>` libre) |
| `scripts/regenerate_artifacts.py` | mismos bloques en las páginas `/p/` + JSON-LD |
| `js/admin-copilot.js` → `_cFeatures` | leer `ficha` antes de parsear `descripcion` |
| `tests/` | test nuevo: forma válida + que `specs` viejo siga funcionando |

`specs`, `descripcion`, `seoTitle`, `seoDescription`, `imagen` → **sin cambios.**

---

## 5. Cuánto se puede autocompletar

Medido sobre los 132 productos:

| Bloque | Autocompletable | De dónde |
|---|---|---|
| 1 `specs` (reformatear) | **~92** | de las specs actuales + descripción |
| 2 `ficha` | **72** | ya hay bloque "Ficha Técnica" en `descripcion` (557 líneas `Etiqueta: valor`) |
| 3 `caracteristicas` | **~70** | mismo bloque, separando los que no son números |
| 4 `idealPara` | **0** | no existe en ningún producto |
| 5 `incluye` | **0** | no existe en ningún producto |

Los bloques 4 y 5 hay que escribirlos. **No los voy a inventar**: si digo que
la caja trae pinzas y no las trae, el cliente reclama con razón.

---

## 6. ⚠️ Contradicciones detectadas en este producto

La plantilla **corrige** datos que hoy están mal en el catálogo. Antes de
migrar hay que confirmar cuál manda.

| Dato | Catálogo hoy | Plantilla | Comentario |
|---|---|---|---|
| Potencia | "Potencia **nominal** de 4000W" | "4000W **Pico** / 2000W Continuos" | Se contradicen. La plantilla es la correcta: en estos equipos los 4000W son pico. |
| Electrodomésticos | `seoDescription`: "un **refrigerador**, ventiladores, televisores" | ventiladores, TV, LED, carga de dispositivos — **sin refrigerador** | Un refrigerador es motor inductivo con pico de arranque. Con 2000W continuos y **onda modificada** es justo lo que no conviene prometer. |
| Tipo de onda | no está | Sinusoidal Modificada | Dato ausente y decisivo: el catálogo tiene otros inversores de **onda pura** (Unizuki 3000W, POWMR 5000W) y hoy el cliente no puede distinguirlos. |
| Salida | no está | 110V / 220V AC | dato nuevo |
| Nombre | `⚡ Inversor  Tataliken 4000W ( 12V )` (doble espacio) | `Inversor de Corriente Tataliken 4000W (12V a 110V/220V)` | |

---

## 7. Plan sugerido

1. **Piloto: ENERGIA (30 productos).** Es la categoría con mejores datos y la
   que más se beneficia de fichas comparables (voltaje, potencia, onda).
2. Migrar `specs` al formato `Etiqueta: Valor` en toda la categoría → mejora
   visible sin tocar código.
3. Extraer `ficha` + `caracteristicas` desde `descripcion` con un script
   idempotente (mismo criterio que `fill_specs.py`).
4. Renderizar los bloques nuevos en el modal y en `/p/`.
5. `idealPara` e `incluye` a mano, empezando por los más vendidos.
6. Recién entonces las otras 12 categorías.
