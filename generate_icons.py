#!/usr/bin/env python3
"""
Simple script to generate placeholder PWA icons
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

def create_icon(size, output_path):
    """Create a simple icon with gradient background and emoji"""
    # Create image with gradient
    img = Image.new('RGB', (size, size))
    draw = ImageDraw.Draw(img)

    # Draw gradient background (blue)
    for y in range(size):
        # Calculate color based on position
        ratio = y / size
        r = int(74 + (53 - 74) * ratio)
        g = int(144 + (122 - 144) * ratio)
        b = int(226 + (189 - 226) * ratio)
        draw.line([(0, y), (size, y)], fill=(r, g, b))

    # Try to add emoji text
    try:
        # Try different font sizes
        font_size = size // 2
        try:
            # Try to use system font
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", font_size)
        except:
            # Fallback to default font
            font = ImageFont.load_default()

        # Add text (book emoji representation)
        text = "📚"
        # For fallback, use "RJ" for Reading Journal
        try:
            draw.text((size // 4, size // 4), text, fill='white', font=font)
        except:
            # Ultimate fallback - just draw text "RJ"
            text = "RJ"
            bbox = draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            x = (size - text_width) // 2
            y = (size - text_height) // 2
            draw.text((x, y), text, fill='white', font=font)
    except Exception as e:
        print(f"Warning: Could not add text to icon: {e}")

    # Save
    img.save(output_path, 'PNG')
    print(f"Created {output_path}")

if __name__ == '__main__':
    icons_dir = Path('app/static/icons')
    icons_dir.mkdir(parents=True, exist_ok=True)

    # Create icons
    create_icon(192, icons_dir / 'icon-192.png')
    create_icon(512, icons_dir / 'icon-512.png')

    print("\n✓ Icons generated successfully!")
    print("Note: For production, replace these with proper designed icons.")
