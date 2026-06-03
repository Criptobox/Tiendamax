#!/usr/bin/env python3
"""
Minifica archivos CSS eliminando comentarios, espacios y saltos de línea innecesarios.
Uso: python scripts/minify_css.py
"""

import re
from pathlib import Path

def minify_css(css_content: str) -> str:
    """Minifica CSS eliminando comentarios y espacios innecesarios."""
    
    # Eliminar comentarios /* ... */
    css = re.sub(r'/\*[\s\S]*?\*/', '', css_content)
    
    # Eliminar espacios alrededor de : ; { } ,
    css = re.sub(r'\s*([:;{},])\s*', r'\1', css)
    
    # Eliminar espacios múltiples
    css = re.sub(r'\s+', ' ', css)
    
    # Eliminar espacios al inicio y final de líneas
    css = re.sub(r'^\s+|\s+$', '', css, flags=re.MULTILINE)
    
    # Eliminar última llave vacía
    css = re.sub(r'}\s*}', '}}', css)
    
    # Eliminar punto y coma antes de llave de cierre
    css = re.sub(r';}', '}', css)
    
    return css.strip()

def main():
    css_dir = Path('css')
    css_files = [
        'styles.css',
        'styles.fixes.css',
        'premium-theme.css',
        'light-mode.css',
        'styles.banner.fix.css',
        'animations.css'
    ]
    
    print("Minificando archivos CSS...\n")
    
    total_original = 0
    total_minified = 0
    
    for filename in css_files:
        filepath = css_dir / filename
        if not filepath.exists():
            print(f"  {filename} no encontrado, saltando...")
            continue
        
        # Leer contenido original
        original_content = filepath.read_text(encoding='utf-8')
        original_size = len(original_content)
        total_original += original_size
        
        # Minificar
        minified_content = minify_css(original_content)
        minified_size = len(minified_content)
        total_minified += minified_size
        
        # Calcular ahorro
        savings = original_size - minified_size
        savings_percent = (savings / original_size * 100) if original_size > 0 else 0
        
        # Guardar archivo minificado
        filepath.write_text(minified_content, encoding='utf-8')
        
        print(f"[OK] {filename}:")
        print(f"   Original: {original_size:,} bytes ({original_size/1024:.1f} KB)")
        print(f"   Minificado: {minified_size:,} bytes ({minified_size/1024:.1f} KB)")
        print(f"   Ahorro: {savings:,} bytes ({savings_percent:.1f}%)\n")
    
    # Resumen total
    total_savings = total_original - total_minified
    total_percent = (total_savings / total_original * 100) if total_original > 0 else 0
    
    print("=" * 60)
    print("RESUMEN TOTAL:")
    print(f"   Original: {total_original:,} bytes ({total_original/1024:.1f} KB)")
    print(f"   Minificado: {total_minified:,} bytes ({total_minified/1024:.1f} KB)")
    print(f"   Ahorro total: {total_savings:,} bytes ({total_percent:.1f}%)")
    print("=" * 60)

if __name__ == '__main__':
    main()
