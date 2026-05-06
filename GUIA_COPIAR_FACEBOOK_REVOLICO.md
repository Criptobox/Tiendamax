# Guía: Copiar y Pegar en Facebook y Revolico

## ¿Qué es la función de Copiar?

La función de copiar permite generar automáticamente el texto formateado de cada producto para publicar manualmente en Facebook Marketplace y Revolico. Esto es útil cuando:

- Prefieres revisar el contenido antes de publicar
- Quieres hacer cambios personalizados al texto
- El backend automático no está disponible
- Necesitas publicar en múltiples plataformas rápidamente

## Cómo Usar

### 1. Desde el Panel de Administración

1. Abre el panel admin (⚙️ esquina superior derecha)
2. Ingresa tu contraseña
3. Ve a la pestaña **"📦 Productos"**
4. Busca el producto que deseas publicar
5. Verás dos botones nuevos:
   - **📋 Revolico**: Copia el texto formateado para Revolico
   - **📋 Facebook**: Copia el texto formateado para Facebook Marketplace

### 2. Qué Incluye Cada Formato

#### Formato Revolico
```
Nombre del Producto

Descripción completa

💰 Precio: $XX.XX USD
📦 Stock: X unidades disponibles

📞 Contacto: +53 54320170
```

**Características:**
- Formato simple y directo
- Incluye precio y stock
- Contacto de WhatsApp

#### Formato Facebook
```
🛍️ Nombre del Producto

Descripción completa

💰 Precio: $XX.XX USD
💳 Antes: $XX.XX USD (-X%)
📦 Disponible: X unidades

📞 Interesado? Contáctame por WhatsApp: +53 54320170

#TiendaMax #Productos #Oferta #Cuba
```

**Características:**
- Emojis atractivos para Facebook
- Muestra el precio original si hay descuento
- Incluye hashtags relevantes
- Llamada a la acción clara

## Paso a Paso: Publicar en Facebook

1. Haz clic en **📋 Facebook** en el producto
2. Verás una notificación: "✅ ¡Datos copiados! Ahora pega en Facebook Marketplace."
3. Se abrirá automáticamente Facebook Marketplace
4. En la sección de "Crear un anuncio":
   - Pega el contenido en la descripción
   - Sube la imagen (la tienda no la copia automáticamente)
   - Ajusta el precio si es necesario
   - Publica

## Paso a Paso: Publicar en Revolico

1. Haz clic en **📋 Revolico** en el producto
2. Verás una notificación: "✅ ¡Datos copiados! Ahora pega en Revolico."
3. Se abrirá automáticamente Revolico
4. En la sección de "Publicar Producto":
   - Pega el contenido en los campos correspondientes
   - Sube la imagen
   - Selecciona la categoría
   - Publica

## Validación Automática de Campos

Cuando agregas o editas un producto, el sistema valida automáticamente:

✅ **Nombre**: No puede estar vacío  
✅ **Descripción**: Debe tener contenido  
✅ **Imagen**: Es obligatoria  
✅ **Precio Original**: Debe ser mayor a 0  
✅ **Precio Actual**: Debe ser mayor a 0  
✅ **Precio Actual vs Original**: El actual no puede ser mayor que el original  
✅ **Stock**: Debe ser mayor a 0  
✅ **Categoría**: Debe estar seleccionada  

Si hay un error, verás un mensaje rojo indicando qué campo corregir.

## Descuento Automático

El descuento se calcula automáticamente basado en:

```
Descuento (%) = ((Precio Original - Precio Actual) / Precio Original) × 100
```

**Ejemplo:**
- Precio Original: $100 USD
- Precio Actual: $70 USD
- Descuento: 30%

## Sincronización con GitHub

Cada vez que:
- Agregas un producto
- Editas un producto
- Eliminas un producto
- Cambias una categoría
- Añades una subcategoría

El sistema automáticamente sincroniza los cambios con GitHub (si has configurado tus credenciales).

Para configurar GitHub:
1. Ve a la pestaña **⚙️ Configuración**
2. Ingresa:
   - **Usuario de GitHub**: Tu nombre de usuario
   - **Repositorio**: El nombre del repositorio
   - **Token de Acceso**: Tu token personal (consígue uno en GitHub Settings → Developer Settings → Tokens)
3. Haz clic en **💾 Guardar Configuración**
4. Haz clic en **🔄 ACTUALIZAR TIENDA AHORA** para sincronizar

## Errores Comunes y Soluciones

### "El nombre del producto es requerido"
**Solución**: Asegúrate de escribir un nombre en el campo "Nombre del Producto"

### "La descripción es requerida"
**Solución**: Escribe una descripción detallada del producto

### "La imagen es requerida"
**Solución**: Selecciona una imagen en formato JPG, PNG o GIF

### "El precio actual no puede ser mayor que el precio original"
**Solución**: Verifica que el precio actual sea menor o igual al precio original

### "El stock debe ser mayor a 0"
**Solución**: Ingresa un número positivo en el campo de stock

### "❌ Backend desconectado"
**Solución**: El agente automático no está corriendo. Puedes seguir usando la función de copiar manualmente.

## Consejos para Mejores Resultados

1. **Descripciones Detalladas**: Cuanto más detalle, más ventas. Incluye:
   - Características principales
   - Condición del producto
   - Medidas/Tallas
   - Material
   - Garantía (si aplica)

2. **Imágenes de Calidad**: 
   - Usa imágenes claras y bien iluminadas
   - Muestra el producto desde diferentes ángulos
   - Incluye referencias de tamaño si es relevante

3. **Precios Competitivos**:
   - Investiga precios similares en el mercado
   - Ofrece descuentos atractivos
   - Usa el campo de descuento para destacar ofertas

4. **Stock Realista**:
   - Actualiza el stock después de cada venta
   - Usa números bajos para crear urgencia
   - Marca como "Agotado" cuando sea necesario

5. **Categorías Claras**:
   - Usa categorías y subcategorías apropiadas
   - Facilita que los clientes encuentren tus productos
   - Organiza por tipo, marca o uso

## Contacto y Soporte

Si tienes problemas o preguntas:
- **WhatsApp**: +53 54320170
- **Panel Admin**: Usa el botón ⚙️ para acceder

¡Feliz venta! 🎉
