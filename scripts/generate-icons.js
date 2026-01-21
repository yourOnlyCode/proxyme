const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const sourceImage = path.join(__dirname, '../assets/images/reference_logo.png');
const outputDir = path.join(__dirname, '../assets/images');

// Icon sizes to generate
const iconConfigs = [
  { name: 'icon.png', size: 1024 },
  { name: 'favicon.png', size: 64 },
  { name: 'splash-icon.png', size: 200 }, // width 200 as per app.json
  { name: 'android-icon-foreground.png', size: 512 },
  { name: 'android-icon-background.png', size: 512 }, // This might need a solid color, but we'll use the logo for now
  { name: 'android-icon-monochrome.png', size: 512 },
  { name: 'adaptive-icon.png', size: 512 },
  { name: 'react-logo.png', size: 512 },
  { name: 'react-logo@2x.png', size: 1024 },
  { name: 'react-logo@3x.png', size: 1536 },
  { name: 'partial-react-logo.png', size: 512 },
];

async function generateIcons() {
  try {
    // Check if source image exists
    if (!fs.existsSync(sourceImage)) {
      console.error(`Source image not found: ${sourceImage}`);
      process.exit(1);
    }

    console.log('Generating icons from reference_logo.png...\n');

    // Generate each icon
    for (const config of iconConfigs) {
      const outputPath = path.join(outputDir, config.name);
      
      try {
        // For splash-icon.png, we maintain the width at 200px but allow height to scale
        if (config.name === 'splash-icon.png') {
          await sharp(sourceImage)
            .resize(200, null, {
              fit: 'inside',
              withoutEnlargement: true,
            })
            .png()
            .toFile(outputPath);
        }
        // For Android background, we might want to create a solid color or use the logo
        // For now, we'll use the logo
        else if (config.name === 'android-icon-background.png') {
          // Create a solid background with the logo in the center
          const logoSize = Math.floor(config.size * 0.8);
          await sharp({
            create: {
              width: config.size,
              height: config.size,
              channels: 4,
              background: { r: 230, g: 244, b: 254, alpha: 1 }, // #E6F4FE from app.json
            },
          })
            .composite([
              {
                input: await sharp(sourceImage)
                  .resize(logoSize, logoSize, {
                    fit: 'inside',
                  })
                  .toBuffer(),
                gravity: 'center',
              },
            ])
            .png()
            .toFile(outputPath);
        }
        // For monochrome, convert to grayscale
        else if (config.name === 'android-icon-monochrome.png') {
          await sharp(sourceImage)
            .resize(config.size, config.size, {
              fit: 'contain',
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .greyscale()
            .png()
            .toFile(outputPath);
        }
        // For partial-react-logo, same as regular react-logo
        else if (config.name === 'partial-react-logo.png') {
          await sharp(sourceImage)
            .resize(config.size, config.size, {
              fit: 'contain',
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .png()
            .toFile(outputPath);
        }
        // For all other icons, resize to square
        else {
          await sharp(sourceImage)
            .resize(config.size, config.size, {
              fit: 'contain',
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .png()
            .toFile(outputPath);
        }

        console.log(`✓ Generated ${config.name} (${config.size}x${config.size})`);
      } catch (error) {
        console.error(`✗ Failed to generate ${config.name}:`, error.message);
      }
    }

    console.log('\n✓ All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
