# 3D Models Directory

This directory contains GLTF/GLB 3D models for the Portfolio page Interactive 3D Model Viewer.

## Directory Structure

```
assets/models/
├── README.md (this file)
├── orlando-terminal-c.glb
├── universal-epic.glb
├── tampa-airport.glb
├── kennedy-space-center.glb
└── [your-project-name].glb
```

## How to Add a New 3D Model

### Step 1: Convert Your BIM Model to GLB

Use the conversion guide in the root directory: `BIM_TO_WEB3D_CONVERSION_GUIDE.md`

**Quick conversion options:**
1. **Revit → FBX → Blender → GLB** (Free)
2. **Use online converter:** https://products.aspose.app/3d/conversion/fbx-to-gltf
3. **Revit GLTF Plugin** from Autodesk App Store

**Recommended settings:**
- Format: GLB (binary, single file)
- Compression: Draco enabled
- Target file size: < 50MB (preferably < 20MB for web)
- LOD: 200-300 (balance between detail and performance)

### Step 2: Optimize Your Model (Important!)

```bash
# Install gltf-pipeline (first time only)
npm install -g gltf-pipeline

# Optimize your model
gltf-pipeline -i your-model.glb -o your-model-optimized.glb -d
```

**Optimization checklist:**
- ✅ File size under 50MB
- ✅ Draco compression applied
- ✅ Textures reduced to 2K max resolution
- ✅ Hidden geometry removed
- ✅ Unnecessary materials merged

### Step 3: Copy Model to This Directory

On Windows:
```bash
copy C:\your-path\your-model.glb C:\Users\JordanEhrig\Documents\Github\EBIC-website\assets\models\your-project-name.glb
```

Or just drag and drop the .glb file into this folder.

### Step 4: Add Model to Portfolio Dropdown

Open `pages/portfolio.html` and find the `modelData` object (around line 1456).

Add your model entry:

```javascript
const modelData = {
    // ... existing models ...
    'your-project-id': {
        src: '../assets/models/your-project-name.glb',
        title: 'Your Project Title',
        description: 'Detailed description of the project, scope, and key systems'
    }
};
```

### Step 5: Add Dropdown Option

In the same file, find the `<select id="modelSelect">` (around line 672).

Add your option:

```html
<option value="your-project-id"
        data-description="Your description"
        data-project="Your Project Title">
    Your Project Display Name
</option>
```

**Make sure the `value` matches the key in modelData!**

### Step 6: Test Your Model

1. Open `pages/portfolio.html` in your browser
2. Select your project from the dropdown
3. Verify:
   - ✅ Model loads without errors
   - ✅ Camera controls work (rotate, zoom, pan)
   - ✅ Model displays at correct scale
   - ✅ Textures/materials look correct
   - ✅ Auto-rotate works
   - ✅ Description updates in info panel

## Example: Adding Orlando Terminal C Model

### 1. Export from Revit
```
File → Export → FBX
Settings:
- Geometry: All elements
- LOD: Medium (300)
- Materials: Yes
```

### 2. Convert to GLB
```bash
# Open Blender
File → Import → FBX → Select orlando-terminal.fbx
File → Export → glTF 2.0
Format: GLB
Compression: Draco
Export → orlando-terminal-c.glb
```

### 3. Optimize
```bash
gltf-pipeline -i orlando-terminal-c.glb -o orlando-terminal-c.glb -d
```

### 4. Add to portfolio.html

In modelData object:
```javascript
'orlando-terminal': {
    src: '../assets/models/orlando-terminal-c.glb',
    title: 'Orlando Airport Terminal C',
    description: 'Orlando International Airport Terminal C - $2.8B project with 45 coordinated trade models including concrete, MEP, skylight, and specialty systems'
}
```

In dropdown:
```html
<option value="orlando-terminal"
        data-description="Orlando International Airport Terminal C - $2.8B project"
        data-project="Orlando Airport Terminal C">
    Orlando Airport Terminal C
</option>
```

## Troubleshooting

### Model doesn't load:
- Check file path is correct
- Verify .glb file isn't corrupted
- Check browser console for errors (F12)
- Ensure file size isn't too large (>100MB may fail)

### Model is too large/slow:
- Reduce polygon count in Blender (Decimate modifier)
- Compress textures (use WebP or lower resolution JPG)
- Remove hidden/interior geometry
- Apply Draco compression

### Model displays incorrectly:
- Check unit scale in Revit export
- Adjust `camera-orbit` attribute in model-viewer tag
- Verify materials exported correctly
- Check normal maps orientation

### Textures missing:
- Ensure textures are embedded in GLB (not external files)
- Use Blender "Pack Resources" before export
- Convert texture formats to JPG/PNG

## File Size Guidelines

| Project Type | Target Size | Max Size |
|--------------|-------------|----------|
| Exterior/Shell | 10-20 MB | 50 MB |
| MEP Systems | 5-15 MB | 30 MB |
| Interior Spaces | 15-30 MB | 60 MB |
| Full Building | 20-40 MB | 80 MB |
| Point Cloud Mesh | 30-50 MB | 100 MB |

## Recommended Naming Convention

```
[project-abbreviation]-[system/scope].glb

Examples:
- oia-terminal-c-full.glb
- oia-terminal-c-mep.glb
- oia-terminal-c-structure.glb
- universal-epic-hvac.glb
- tampa-airport-mtce.glb
- ksc-visitor-complex-scan.glb
```

## Quick Reference: Model Viewer Attributes

Current settings in portfolio.html:
```html
<model-viewer
    src="model.glb"
    camera-controls    <!-- Enable user controls -->
    auto-rotate        <!-- Auto spin model -->
    shadow-intensity="1"  <!-- Ground shadow -->
    ar                 <!-- Enable AR on mobile -->
    camera-orbit="45deg 55deg 2.5m"  <!-- Default camera position -->
>
```

**Adjust camera-orbit for different model types:**
- Tall buildings: `"45deg 75deg 3m"`
- Wide structures: `"30deg 60deg 5m"`
- MEP systems: `"60deg 45deg 2m"`
- Point clouds: `"0deg 90deg 4m"`

## Support

For conversion help, see: `BIM_TO_WEB3D_CONVERSION_GUIDE.md` in project root

For model-viewer documentation: https://modelviewer.dev/docs/

---

**Last Updated:** 2025-11-04
**Contact:** jordan@ebic-consulting.com
