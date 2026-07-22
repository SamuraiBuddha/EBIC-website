# Showcase point-cloud pipeline queue

Compiled 2026-07-22 from a full sweep of OneDrive EBIC_Work, \\adam\DataPool
(X:), and \\403Edge\Public (Z:). Selection rules applied:

- Revit: newest non-backup central per project; where a folder mixes
  consultant/design-firm models with EBIC trade models, ONLY the EBIC
  trade model is featured (standing rule).
- SolidWorks: .sldasm only, max one finalized whole-thing assembly per
  project folder. All SW content lives under Design Work (X: and Z:
  copies of the same tree); zero SW anywhere in EBICArchive or OneDrive.
- X:\EBICArchive and Z:\EBICArchive largely mirror each other; paths
  below prefer X:.

Bake command (after exporting the model to GLB/OBJ):

    python scripts/decimate-pointcloud.py <export.glb> assets/clouds/<slug>.json \
        --name "<Label>" --drop "site,topo,grass,planting"

Export notes: Revit -> GLB/OBJ via auto-claw hub (revit_to_3d_mesh) or
manual FBX->GLB; SolidWorks 2019+ -> File > Save As > Extended Reality
(.glb) to keep appearance colors (STL drops color).

## Baked

| Slug | Source | Status |
|---|---|---|
| homeaddition | assets/models/HomeAddition.glb | LIVE (first colored cloud) |

## Queue: Revit

| Priority | Model | Path | MB | Why |
|---|---|---|---|---|
| 1 | Saipan airport | X:\Projects\2025-002_Saipan\saipan airport.rvt | 152 | Self-contained airport, EBIC-authored |
| 2 | CEP Mule structural steel As-Built | X:\EBICArchive\Dixie Metal Products - CEP-EPG\CEP_Mule_StrucSteel_As-Built.rvt | 431 | Finalized as-built; dense steel frame = striking particle form |
| 3 | Bahamas Residence coordination | X:\EBICArchive\4D Archive\Bahamas-Residence\Rumpf for 3D Coordination Model.rvt | 52 | Clean whole residence |
| 4 | 50m Yacht (BIM) | Z:\EBICArchive\4D Archive\50mYacht - PatH\50mYacht-CCG.rvt | 6 | Replaces the retired incomplete yacht scan |
| 5 | TIA Airside D roofing | X:\Projects\2026-005_TIA_Airside_D_Roofing_ASM\ASD_ROOF_ASM.rvt | 133 | EBIC trade model of the terminal roof form |
| 6 | OIA STC interior drywall+framing | X:\EBICArchive\SimBot\Estimate Files\OIA STC ASC Interior Drywall & Framing\WS112_STC_ASC_Interior Drywall+Framing.rvt | 554 | Largest trade-scope terminal model |
| 7 | Rota / Tinian airports | X:\Projects\2025-001_Rota\rotaShiftback.rvt, X:\Projects\2025-003_Tinian\tinian airport.rvt | 134/145 | Sister airports to Saipan if the first bakes well |

## Queue: SolidWorks

| Priority | Assembly | Path | Why |
|---|---|---|---|
| 1 | Polywell | X:\Design Work\Polywell\Assem4.SLDASM | Fusion-device geometry; unique non-building form |
| 2 | Car Project | X:\Design Work\Car Project\Fiberglass Assembly.SLDASM | Clean standalone object |
| 3 | EM Car Audio bench | X:\Design Work\EM Car Audio System Project\Bench Assembly.SLDASM | Top-level of the audio system project |

## Blocked on a human pick (do not guess)

- Earthrise Space lunar rover: multi-draft archive, no clear final.
  Candidates: Lunar Rover\Assembly\Assem1.SLDASM (largest, aggregates
  wheels/suspension/camera), 1st Draft\System Layout\Systems
  Layout.SLDASM, 2nd Draft - color coded.SLDASM (most recently touched).
- speaker box: multiple root assemblies, no clear final (Assem1 largest,
  Fiber Frame newest, "AlternateAlternate" signals WIP).

## Excluded by rule

Consultant/design-firm centrals in trade folders (HNTB/Arup/EYP/DPA/NASH
models up to 1.9 GB), numbered .NNNN backups, _detached/-DESKTOP-/LOCAL
copies, .rfa families, Revit Full Library.rvt, Kawneer manufacturer
downloads, and the boatscan e57 (incomplete scan, retired 2026-07-22).
