# BIM to Web 3D Model Conversion Guide

## Overview
This guide explains how to convert BIM models (Revit, Navisworks, etc.) to GLTF/GLB format for use with Google Model Viewer on the web.

## What is GLTF/GLB?
- **GLTF** (GL Transmission Format) - JSON-based 3D file format
- **GLB** - Binary version of GLTF (single file, recommended for web)
- Industry standard for web 3D models
- Supports textures, materials, animations, and PBR rendering

---

## Method 1: Revit Direct Export (Recommended for BIM)

### Option A: Revit to GLTF Plugin
**Plugin: "glTF Exporter for Revit"**
- Download from: Autodesk App Store
- Free/Commercial options available
- Direct export from Revit UI
- Steps:
  1. Open your Revit model
  2. Go to Add-Ins → glTF Exporter
  3. Select elements/views to export
  4. Choose quality settings (LOD)
  5. Export → .glb file ready for web

### Option B: Revit → FBX → GLTF (Free Method)
1. **Export from Revit:**
   - File → Export → FBX
   - Set options (geometry, materials)
   - Save as .fbx

2. **Convert FBX to GLTF using Blender (Free):**
   ```bash
   # Install Blender from blender.org
   ```
   - Open Blender
   - File → Import → FBX
   - File → Export → glTF 2.0 (.glb)
   - Settings:
     - Format: GLB (Binary)
     - Include: Selected Objects
     - Compression: True
     - Export

3. **Online Converters (Quick & Easy):**
   - https://products.aspose.app/3d/conversion/fbx-to-gltf
   - https://imagetostl.com/convert/file/fbx/to/gltf
   - Upload FBX → Download GLB

---

## Method 2: Navisworks to Web 3D

### Option A: Navisworks → OBJ → GLTF
1. Export from Navisworks:
   - File → Export → Wavefront (OBJ)
   - Set geometry detail level

2. Convert OBJ to GLTF using:
   - **obj2gltf CLI Tool** (Free, Node.js)
   ```bash
   npm install -g obj2gltf
   obj2gltf -i model.obj -o model.glb
   ```

   - **Blender** (same process as FBX method)

### Option B: Navisworks → FBX → GLTF
1. File → Export → FBX
2. Follow FBX to GLTF conversion (Method 1B)

---

## Method 3: Point Cloud to Mesh to GLTF

For FARO/Reality Capture projects:

### Workflow:
1. **Process Point Cloud:**
   - FARO Scene
   - ReCap Pro
   - CloudCompare (Free)

2. **Create Mesh:**
   - ReCap Pro → Export as OBJ/FBX
   - CloudCompare:
     - Plugins → Poisson Surface Reconstruction
     - Export as OBJ

3. **Optimize & Convert:**
   - Import to Blender
   - Decimate mesh (reduce polygon count)
   - Export as GLB

---

## Method 4: Cloud Conversion Services

### Commercial Services:
1. **Modelo.io**
   - Upload Revit/Navisworks directly
   - Web-based viewing
   - Export to GLTF option

2. **BIM Track**
   - Converts IFC to web format
   - API available

3. **Autodesk Platform Services (formerly Forge)**
   - Model Derivative API
   - Converts 70+ formats to viewable format
   - Can extract geometry to GLTF

---

## Method 5: IFC to GLTF

For open BIM workflows:

### Tools:
1. **IfcConvert** (Free, Open Source)
   ```bash
   # Part of IfcOpenShell
   IfcConvert model.ifc model.obj
   # Then convert OBJ to GLTF
   ```

2. **BIMData.io**
   - Online IFC to GLTF converter
   - Free tier available

3. **Three.js IFC.js** (Developer Tool)
   - JavaScript library
   - Real-time IFC to Three.js geometry

---

## Optimization Best Practices

### File Size Reduction:
1. **Mesh Optimization:**
   - Use Draco compression (built into GLTF)
   - Reduce polygon count (LOD 300 or lower for web)
   - Remove hidden geometry

2. **Texture Optimization:**
   - Compress textures (JPG/PNG → WebP)
   - Reduce texture resolution (2K max for web)
   - Use texture atlases

3. **Tools:**
   - **gltf-pipeline** (CLI tool)
   ```bash
   npm install -g gltf-pipeline
   gltf-pipeline -i model.glb -o optimized.glb -d
   ```

   - **glTF Transform** (GUI + CLI)
   - **Meshoptimizer** (compression)

### Model Viewer Settings:
```html
<model-viewer
    src="optimized-model.glb"
    camera-controls
    auto-rotate
    shadow-intensity="1"
    loading="lazy"
    reveal="interaction">
</model-viewer>
```

---

## Recommended Workflow for EBIC Projects

### Airport/Commercial Projects:
```
Revit Model → FBX Export → Blender Optimization → GLB Export
                                ↓
                        - Reduce to LOD 200
                        - Remove interior details
                        - Optimize textures
                        - Apply Draco compression
```

### MEP Systems Showcase:
```
Navisworks Coordination → OBJ Export → obj2gltf → Model Viewer
                              ↓
                    Show systems separately
                    (HVAC, Plumbing, Electrical)
```

### Point Cloud / Reality Capture:
```
FARO Scan → ReCap Pro → Mesh → Blender → GLB
                                   ↓
                           - Mesh decimation
                           - Texture baking
                           - Color optimization
```

---

## Testing Checklist

Before deploying models to website:

- [ ] File size < 50MB (preferably < 20MB)
- [ ] Model loads in < 5 seconds on 4G connection
- [ ] Materials display correctly (PBR)
- [ ] Camera controls work smoothly
- [ ] Mobile performance acceptable
- [ ] AR mode functional (iOS/Android)
- [ ] Model scale/orientation correct

---

## Tools Summary

### Free Tools:
✅ Blender (all-in-one solution)
✅ CloudCompare (point cloud)
✅ IfcOpenShell (IFC conversion)
✅ obj2gltf (CLI converter)
✅ gltf-pipeline (optimizer)

### Commercial/Freemium:
💰 Revit GLTF Exporter plugins
💰 Modelo.io
💰 Autodesk Forge API
💰 ReCap Pro (included with AEC Collection)

### Online (No Install):
🌐 Aspose 3D Converter
🌐 ImageToSTL converters
🌐 BIMData.io

---

## Support & Resources

- **Google Model Viewer Docs:** https://modelviewer.dev
- **GLTF Specification:** https://github.com/KhronosGroup/glTF
- **Three.js Forum:** https://discourse.threejs.org
- **Blender Artists Community:** https://blenderartists.org

---

## EBIC Implementation

For EBIC project showcases, we recommend:
1. Export hero projects (Airport Terminal C, Universal EPIC) as optimized GLB
2. Create separate models for major systems (structure, MEP, envelope)
3. Add interactive hotspots for key features
4. Enable AR viewing for mobile clients
5. Provide downloadable IFC/Revit files for serious inquiries

**Contact:** jordan@ebic-consulting.com for model conversion services
